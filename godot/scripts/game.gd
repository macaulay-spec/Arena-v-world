extends Node
## Global game state: build info, quality preset, clock. Autoload "Game".

signal quality_changed(preset: Dictionary)
signal profile_changed(profile: Dictionary)

const BUILD_INFO_PATH := "res://build_info.json"
const SAVE_PATH := "user://save_v1.json"
const SAVE_SCHEMA := 1
const DEFAULT_PROFILE := {
	"name": "JAG",
	"avatar_name": "Male_Adult_01",
	"build": 1.0,
	"height": 1.0,
	"cash": 25000,
	"health": 100.0,
	"day": 1,
	"wanted": 0,
	"deliveries": 0,
	"job_active": false,
	"job_destination": [],
	"job_reward": 0,
	"mission_id": "",
	"mission_stage": 0,
}

## Quality presets. Lite is the 2 GB-phone preset and the default when memory is unknown or ≤ 3 GB.
const PRESETS := {
	"lite": {"label": "Lite", "scale": 0.75, "shadows": false, "shadow_size": 512, "npcs": 8, "fog_end": 220.0, "far": 400.0, "msaa": 0, "night_lights": 3},
	"standard": {"label": "Standard", "scale": 1.0, "shadows": true, "shadow_size": 1024, "npcs": 14, "fog_end": 320.0, "far": 600.0, "msaa": 0, "night_lights": 5},
	"high": {"label": "High", "scale": 1.0, "shadows": true, "shadow_size": 2048, "npcs": 20, "fog_end": 450.0, "far": 900.0, "msaa": 2, "night_lights": 6},
}

var build: Dictionary = {"commit": "dev", "date": "", "slice": "S0"}
var quality_id: String = "lite"
var quality: Dictionary = PRESETS["lite"]
## in-game clock, minutes since midnight; S0 runs a fast day (1 real second = 1 game minute)
var minutes: float = 8.0 * 60.0
var clock_speed: float = 1.0
var paused: bool = false
var profile: Dictionary = DEFAULT_PROFILE.duplicate(true)
var saved_world: Dictionary = {}
var has_loaded_save := false


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


## Debug switches from the command line: `-- --dbg=noskirt,nofog` (dev / CI diagnosis only).
static func dbg(flag: String) -> bool:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--dbg="):
			return flag in a.substr(6).split(",")
	return false


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


func add_cash(amount: int) -> void:
	profile["cash"] = maxi(0, int(profile.get("cash", 0)) + amount)
	profile_changed.emit(profile.duplicate(true))


func set_wanted(level: int) -> void:
	var next_level := clampi(level, 0, 5)
	if int(profile.get("wanted", 0)) == next_level:
		return
	profile["wanted"] = next_level
	profile_changed.emit(profile.duplicate(true))


func add_wanted(levels: int = 1) -> void:
	set_wanted(int(profile.get("wanted", 0)) + maxi(0, levels))


func has_save() -> bool:
	return FileAccess.file_exists(SAVE_PATH)


func begin_new_game(player_name: String, avatar_name: String, body_build: float, body_height: float) -> void:
	profile = DEFAULT_PROFILE.duplicate(true)
	profile["name"] = player_name.strip_edges().substr(0, 24) if not player_name.strip_edges().is_empty() else "JAG"
	profile["avatar_name"] = avatar_name
	profile["build"] = clampf(body_build, 0.85, 1.2)
	profile["height"] = clampf(body_height, 0.9, 1.1)
	saved_world.clear()
	has_loaded_save = false
	minutes = 8.0 * 60.0
	profile_changed.emit(profile.duplicate(true))


func load_save() -> bool:
	if not has_save():
		return false
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return false
	var parsed: Variant = JSON.parse_string(file.get_as_text())
	if typeof(parsed) != TYPE_DICTIONARY or int(parsed.get("schema", 0)) != SAVE_SCHEMA:
		push_warning("Save file has an unknown or invalid schema")
		return false
	var raw_profile: Variant = parsed.get("profile", {})
	if typeof(raw_profile) != TYPE_DICTIONARY:
		return false
	profile = DEFAULT_PROFILE.duplicate(true)
	for key: String in DEFAULT_PROFILE.keys():
		if raw_profile.has(key):
			profile[key] = raw_profile[key]
	profile["name"] = String(profile.get("name", "JAG")).strip_edges().substr(0, 24)
	profile["avatar_name"] = String(profile.get("avatar_name", "Male_Adult_01"))
	profile["cash"] = maxi(0, int(profile.get("cash", 25000)))
	profile["health"] = clampf(float(profile.get("health", 100.0)), 0.0, 100.0)
	profile["wanted"] = clampi(int(profile.get("wanted", 0)), 0, 5)
	profile["deliveries"] = maxi(0, int(profile.get("deliveries", 0)))
	profile["job_active"] = bool(profile.get("job_active", false))
	profile["job_reward"] = maxi(0, int(profile.get("job_reward", 0)))
	if typeof(profile.get("job_destination", [])) != TYPE_ARRAY:
		profile["job_destination"] = []
	profile["mission_stage"] = maxi(0, int(profile.get("mission_stage", 0)))
	profile["build"] = clampf(float(profile.get("build", 1.0)), 0.85, 1.2)
	profile["height"] = clampf(float(profile.get("height", 1.0)), 0.9, 1.1)
	saved_world = parsed.get("world", {}) if typeof(parsed.get("world", {})) == TYPE_DICTIONARY else {}
	minutes = fposmod(float(saved_world.get("minutes", 8.0 * 60.0)), 24.0 * 60.0)
	has_loaded_save = true
	profile_changed.emit(profile.duplicate(true))
	return true


func save_game(world: Node = null) -> bool:
	var world_state: Dictionary = saved_world.duplicate(true)
	world_state["minutes"] = minutes
	if world != null:
		var player_node: Node = world.get_node_or_null("Player")
		if player_node is Player:
			var player := player_node as Player
			world_state["position"] = [player.global_position.x, player.global_position.y, player.global_position.z]
			world_state["yaw"] = player.yaw
		if world is World:
			var game_world := world as World
			var vehicle_states: Dictionary = {}
			for car: DrivableCar in game_world.owned_vehicles:
				if not is_instance_valid(car):
					continue
				vehicle_states[car.vehicle_id] = {
					"position": [car.global_position.x, car.global_position.y, car.global_position.z],
					"yaw": car.rotation.y,
				}
			world_state["owner_cars"] = vehicle_states
			world_state["active_vehicle_id"] = game_world.active_vehicle.vehicle_id if is_instance_valid(game_world.active_vehicle) else ""
	var payload := {"schema": SAVE_SCHEMA, "profile": profile.duplicate(true), "world": world_state}
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		push_error("Could not open save file: " + SAVE_PATH)
		return false
	file.store_string(JSON.stringify(payload))
	file.flush()
	saved_world = world_state
	return true


func restore_world(world: Node) -> void:
	var player_node: Node = world.get_node_or_null("Player")
	var position_data: Variant = saved_world.get("position", [])
	if typeof(position_data) == TYPE_ARRAY and position_data.size() == 3:
		if player_node is Player:
			var player := player_node as Player
			player.global_position = Vector3(float(position_data[0]), float(position_data[1]), float(position_data[2]))
			player.yaw = float(saved_world.get("yaw", 0.0))
			if player.cam_yaw:
				player.cam_yaw.rotation.y = player.yaw
	if world is World:
		var game_world := world as World
		var vehicle_data: Variant = saved_world.get("owner_cars", {})
		if typeof(vehicle_data) == TYPE_DICTIONARY:
			for car: DrivableCar in game_world.owned_vehicles:
				var state: Variant = vehicle_data.get(car.vehicle_id, {})
				if typeof(state) != TYPE_DICTIONARY:
					continue
				var car_position: Variant = state.get("position", [])
				if typeof(car_position) == TYPE_ARRAY and car_position.size() == 3:
					car.global_position = Vector3(float(car_position[0]), float(car_position[1]), float(car_position[2]))
				car.rotation.y = float(state.get("yaw", car.rotation.y))
		var active_id := String(saved_world.get("active_vehicle_id", ""))
		if active_id != "" and player_node is Player:
			for car: DrivableCar in game_world.owned_vehicles:
				if car.vehicle_id == active_id and car.enter(player_node as Player):
					game_world.active_vehicle = car
					break
	minutes = fposmod(float(saved_world.get("minutes", minutes)), 24.0 * 60.0)


func delete_save() -> void:
	if has_save():
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))
	saved_world.clear()
	has_loaded_save = false


func _apply_quality() -> void:
	var vp := get_viewport()
	if vp:
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_BILINEAR
		vp.scaling_3d_scale = quality["scale"]
		vp.msaa_3d = Viewport.MSAA_2X if int(quality.get("msaa", 0)) >= 2 else Viewport.MSAA_DISABLED
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
