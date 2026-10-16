class_name ShotRunner
extends Node
## Evidence capture: with `-- --shots=<dir>` on the command line the game boots straight into the
## world, teleports the camera through a fixed list of viewpoints / times of day, saves PNGs and a
## report.json with the real renderer counters (draw calls, primitives) for the CI budget gate.

var dir := ""
var world: World
var shots: Array = []
var index := -1
var wait := 0
var report := {"shots": []}


static func requested() -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--shots="):
			return a.substr(8)
	return ""


func _ready() -> void:
	dir = requested()
	DirAccess.make_dir_recursive_absolute(dir)
	# local mansion frame helper
	var M := func(x: float, y: float, z: float) -> Vector3:
		return Vector3(x + MansionBuilder.OX, y + MansionBuilder.OY, z + MansionBuilder.OZ)
	shots = [
		{"name": "01_porch_spawn", "minutes": 17 * 60 + 30, "pos": M.call(26.5, 0.2, 57.0), "yaw": 0.0, "pitch": -0.04},
		{"name": "02_gate_to_house", "minutes": 17 * 60 + 30, "pos": M.call(27.0, 0.2, 73.0), "yaw": 0.15, "pitch": 0.0},
		{"name": "03_street_garden_terrace", "minutes": 16 * 60 + 30, "pos": Vector3(-356.0, 22.3, -333.0), "yaw": -PI * 0.5, "pitch": -0.04},
		{"name": "04_ridge_street_downhill", "minutes": 12 * 60 + 30, "pos": Vector3(-378.5, 0.0, -305.0), "yaw": PI, "pitch": -0.06, "ground": true},
		{"name": "05_mansion_night", "minutes": 21 * 60 + 15, "pos": M.call(44.0, 0.2, 70.0), "yaw": 0.3, "pitch": 0.04},
		{"name": "06_pool_terrace", "minutes": 10 * 60, "pos": M.call(50.0, 0.65, 9.0), "yaw": PI * 0.5 + 0.35, "pitch": -0.08},
		{"name": "07_npc_closeup", "minutes": 17 * 60 + 50, "pos": Vector3(-333.5, 22.3, -332.6), "yaw": PI * 0.5, "pitch": -0.05},
		{"name": "08_sunset_skyline", "minutes": 18 * 60 + 25, "pos": Vector3(-300.0, 0.0, -300.0), "yaw": PI * 0.62, "pitch": 0.06, "ground": true},
	]
	# dev helpers: `--only=<name>` keeps one shot; `--shot=name,x,y,z,yaw,pitch,minutes` adds a custom view
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--only="):
			var keep := arg.substr(7)
			shots = shots.filter(func(sh): return String(sh["name"]).begins_with(keep))
		elif arg.begins_with("--shot="):
			var f := arg.substr(7).split(",")
			if f.size() >= 7:
				shots.append({"name": f[0], "pos": Vector3(float(f[1]), float(f[2]), float(f[3])), "yaw": float(f[4]), "pitch": float(f[5]), "minutes": float(f[6])})
	Game.clock_speed = 0.0


func start(w: World) -> void:
	world = w
	index = -1
	wait = 8
	set_process(true)


func _process(_delta: float) -> void:
	if world == null:
		return
	wait -= 1
	if wait > 0:
		return
	if index >= 0:
		_capture(shots[index])
	index += 1
	if index >= shots.size():
		_finish()
		return
	_apply(shots[index])
	wait = 6   # frames to settle (shadows, fog, skinning)


func _apply(s: Dictionary) -> void:
	Game.minutes = float(s["minutes"])
	var p: Vector3 = s["pos"]
	if s.get("ground", false):
		p.y = world.builder.height_at(p.x, p.z) + 0.2
	world.player.global_position = p
	world.player.velocity = Vector3.ZERO
	world.player.yaw = float(s["yaw"])
	world.player.pitch = float(s["pitch"])
	world.player.look_delta = Vector2.ZERO
	world._update_sun(Game.day_fraction())


func _capture(s: Dictionary) -> void:
	var img := get_viewport().get_texture().get_image()
	var path := dir.path_join("%s_%s.png" % [s["name"], Game.quality_id])
	img.save_png(path)
	var entry := {
		"name": s["name"], "minutes": s["minutes"],
		"draw_calls": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
		"primitives": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME),
		"objects": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME),
		"video_mem_mb": RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED) / 1048576.0,
		"static_mem_mb": OS.get_static_memory_usage() / 1048576.0,
	}
	report["shots"].append(entry)
	print("shot ", s["name"], ": ", entry)


func _finish() -> void:
	report["world"] = world.stats
	report["device"] = Perf.device_lines()
	report["quality"] = Game.quality_id
	report["build"] = Game.build
	var worst_calls := 0
	var worst_prims := 0
	for e in report["shots"]:
		worst_calls = maxi(worst_calls, int(e["draw_calls"]))
		worst_prims = maxi(worst_prims, int(e["primitives"]))
	report["worst_draw_calls"] = worst_calls
	report["worst_primitives"] = worst_prims
	report["budget_ok"] = worst_calls <= Perf.BUDGET["draw_calls"] and worst_prims <= Perf.BUDGET["tris"]
	var f := FileAccess.open(dir.path_join("report_%s.json" % Game.quality_id), FileAccess.WRITE)
	f.store_string(JSON.stringify(report, "\t"))
	f.close()
	print("shots done: worst draw calls %d, worst primitives %d, budget_ok %s" % [worst_calls, worst_prims, str(report["budget_ok"])])
	get_tree().quit(0)
