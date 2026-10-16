extends Node
## Perf telemetry + budget checks. Autoload "Perf".
## Everything the phone tester needs to paste back: fps, frame time, draw calls, triangles, memory, device.

const BUDGET := {
	"tris": 150000,      # primitives per frame
	"draw_calls": 120,
	"ram_mb": 400,
	"fps": 30,
}

var fps: float = 0.0
var frame_ms: float = 0.0
var frame_ms_max: float = 0.0
var draw_calls: int = 0
var primitives: int = 0
var objects: int = 0
var ram_mb: float = 0.0
var vram_mb: float = 0.0
var _accum: float = 0.0
var _samples: Array[float] = []
var _worst_1s: float = 0.0
var low_fps_seconds: float = 0.0
var session_seconds: float = 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS


func _process(delta: float) -> void:
	session_seconds += delta
	var ms := delta * 1000.0
	_worst_1s = maxf(_worst_1s, ms)
	_accum += delta
	if _accum >= 0.5:
		_accum = 0.0
		fps = Engine.get_frames_per_second()
		frame_ms = 1000.0 / maxf(fps, 1.0)
		frame_ms_max = _worst_1s
		_worst_1s = 0.0
		draw_calls = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
		primitives = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
		objects = RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
		ram_mb = float(OS.get_static_memory_usage()) / 1048576.0
		vram_mb = float(RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED)) / 1048576.0
		_samples.append(fps)
		if _samples.size() > 120:
			_samples.pop_front()
		if fps < BUDGET["fps"] and session_seconds > 5.0:
			low_fps_seconds += 0.5


func fps_p10() -> float:
	if _samples.is_empty():
		return 0.0
	var s := _samples.duplicate()
	s.sort()
	return s[int(float(s.size() - 1) * 0.1)]


func over_budget() -> Array[String]:
	var out: Array[String] = []
	if primitives > BUDGET["tris"]:
		out.append("tris %d > %d" % [primitives, BUDGET["tris"]])
	if draw_calls > BUDGET["draw_calls"]:
		out.append("draw calls %d > %d" % [draw_calls, BUDGET["draw_calls"]])
	if ram_mb > BUDGET["ram_mb"]:
		out.append("ram %.0f MB > %d" % [ram_mb, BUDGET["ram_mb"]])
	return out


func short_line() -> String:
	return "%d fps  %.1f ms (max %.0f)  %d calls  %s tris  %.0f MB" % [int(fps), frame_ms, frame_ms_max, draw_calls, _k(primitives), ram_mb]


func device_lines() -> Array[String]:
	var mem := OS.get_memory_info()
	var phys := float(mem.get("physical", 0)) / 1073741824.0
	var lines: Array[String] = []
	lines.append("device: %s (%s %s)" % [OS.get_model_name(), OS.get_name(), OS.get_version()])
	lines.append("cpu: %s x%d" % [OS.get_processor_name(), OS.get_processor_count()])
	lines.append("ram: %.1f GB physical" % phys)
	lines.append("gpu: %s / %s" % [RenderingServer.get_video_adapter_name(), RenderingServer.get_video_adapter_vendor()])
	lines.append("api: %s %s" % [RenderingServer.get_current_rendering_driver_name(), RenderingServer.get_video_adapter_api_version()])
	var win := DisplayServer.window_get_size()
	lines.append("window: %dx%d  render scale %.2f  dpi %d" % [win.x, win.y, get_viewport().scaling_3d_scale, DisplayServer.screen_get_dpi()])
	return lines


func report() -> String:
	var lines: Array[String] = []
	lines.append("VORA CITY perf report")
	lines.append("build: %s  slice %s  %s" % [Game.build.get("commit", "?"), Game.build.get("slice", "?"), Game.build.get("date", "")])
	lines.append("quality: %s  clock %s  session %.0fs" % [Game.quality_id, Game.clock_label(), session_seconds])
	lines.append("fps: %d now, p10 %.0f, below-30 for %.1fs" % [int(fps), fps_p10(), low_fps_seconds])
	lines.append("frame: %.1f ms avg, %.1f ms worst (1s)" % [frame_ms, frame_ms_max])
	lines.append("draw calls: %d  objects: %d  primitives: %s" % [draw_calls, objects, _k(primitives)])
	lines.append("memory: %.0f MB static, %.0f MB video" % [ram_mb, vram_mb])
	lines.append_array(device_lines())
	var ob := over_budget()
	lines.append("budget: " + ("OK" if ob.is_empty() else "OVER — " + ", ".join(ob)))
	return "\n".join(lines)


func copy_report() -> void:
	DisplayServer.clipboard_set(report())


static func _k(n: int) -> String:
	if n >= 1000000:
		return "%.2fM" % (float(n) / 1000000.0)
	if n >= 1000:
		return "%.1fk" % (float(n) / 1000.0)
	return str(n)
