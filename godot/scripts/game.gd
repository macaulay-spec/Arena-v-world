extends Node
## Global game state: build info, quality preset, clock. Autoload "Game".

signal quality_changed(preset: Dictionary)

const BUILD_INFO_PATH := "res://build_info.json"

## Quality presets. Lite is the 2 GB-phone preset and the default when memory is unknown or ≤ 3 GB.
const PRESETS := {
	"lite": {"label": "Lite", "scale": 0.75, "shadows": false, "shadow_size": 512, "npcs": 8, "fog_end": 220.0, "far": 400.0, "fxaa": false, "night_lights": 3},
	"standard": {"label": "Standard", "scale": 1.0, "shadows": true, "shadow_size": 1024, "npcs": 14, "fog_end": 320.0, "far": 600.0, "fxaa": true, "night_lights": 5},
	"high": {"label": "High", "scale": 1.0, "shadows": true, "shadow_size": 2048, "npcs": 20, "fog_end": 450.0, "far": 900.0, "fxaa": true, "night_lights": 6},
}

var build: Dictionary = {"commit": "dev", "date": "", "slice": "S0"}
var quality_id: String = "lite"
var quality: Dictionary = PRESETS["lite"]
## in-game clock, minutes since midnight; S0 runs a fast day (1 real second = 1 game minute)
var minutes: float = 8.0 * 60.0
var clock_speed: float = 1.0
var paused: bool = false


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	_load_build_info()
	var saved := _load_settings()
	quality_id = saved.get("quality", _auto_quality())
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--quality="):
			quality_id = a.substr(10)
	if not PRESETS.has(quality_id):
		quality_id = "lite"
	quality = PRESETS[quality_id]
	_apply_quality()


func _process(delta: float) -> void:
	if not paused:
		minutes = fmod(minutes + delta * clock_speed, 24.0 * 60.0)


func set_quality(id: String) -> void:
	if not PRESETS.has(id):
		return
	quality_id = id
	quality = PRESETS[id]
	_apply_quality()
	_save_settings({"quality": id})
	quality_changed.emit(quality)


func clock_label() -> String:
	var h := int(minutes / 60.0) % 24
	var m := int(minutes) % 60
	return "%02d:%02d" % [h, m]


## 0 = midnight, 0.5 = noon; used by the sky
func day_fraction() -> float:
	return minutes / (24.0 * 60.0)


func _apply_quality() -> void:
	var vp := get_viewport()
	if vp:
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
		vp.scaling_3d_scale = quality["scale"]
		pass
	RenderingServer.directional_shadow_atlas_set_size(quality["shadow_size"], true)


func _auto_quality() -> String:
	var info := OS.get_memory_info()
	var phys: float = float(info.get("physical", 0)) / (1024.0 * 1024.0 * 1024.0)
	if phys <= 0.0:
		return "lite"
	if phys <= 3.2:
		return "lite"
	if phys <= 5.0:
		return "standard"
	return "high"


func _load_build_info() -> void:
	if FileAccess.file_exists(BUILD_INFO_PATH):
		var f := FileAccess.open(BUILD_INFO_PATH, FileAccess.READ)
		var parsed = JSON.parse_string(f.get_as_text())
		if typeof(parsed) == TYPE_DICTIONARY:
			build.merge(parsed, true)


func _load_settings() -> Dictionary:
	var path := "user://settings.json"
	if not FileAccess.file_exists(path):
		return {}
	var f := FileAccess.open(path, FileAccess.READ)
	var parsed = JSON.parse_string(f.get_as_text())
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}


func _save_settings(d: Dictionary) -> void:
	var f := FileAccess.open("user://settings.json", FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(d))
