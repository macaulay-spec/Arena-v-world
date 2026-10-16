class_name Rocketbox
extends RefCounted
## Rocketbox avatar factory: instantiates an imported avatar FBX, wires the downscaled PNG textures
## (the FBX references 4K TGAs we deliberately do not ship), attaches the baked mocap library
## and returns a ready-to-animate Node3D whose -Z is the character's forward.

const EXT := "res://assets/ext/rocketbox/"
const LIB_PATH := "res://assets/anim/rocketbox.res"
const META_PATH := "res://assets/anim/clips_meta.json"
## Rocketbox avatars face +Z in rest; Godot forward is -Z.
const MODEL_YAW := PI

static var _index: Dictionary = {}
static var _lib: AnimationLibrary
static var _meta: Dictionary = {}
static var _mat_cache: Dictionary = {}
static var _scene_cache: Dictionary = {}


static func available() -> bool:
	return FileAccess.file_exists(EXT + "index.json") and ResourceLoader.exists(LIB_PATH)


static func index() -> Dictionary:
	if _index.is_empty() and FileAccess.file_exists(EXT + "index.json"):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(EXT + "index.json"))
		if typeof(parsed) == TYPE_DICTIONARY:
			_index = parsed
	return _index


static func library() -> AnimationLibrary:
	if _lib == null and ResourceLoader.exists(LIB_PATH):
		_lib = load(LIB_PATH)
	return _lib


static func clip_meta(clip: String) -> Dictionary:
	if _meta.is_empty() and FileAccess.file_exists(META_PATH):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(META_PATH))
		if typeof(parsed) == TYPE_DICTIONARY:
			_meta = parsed
	return _meta.get(clip, {})


## Speed in m/s baked from the mocap root motion (0 for static clips).
static func clip_speed(clip: String) -> float:
	return float(clip_meta(clip).get("speed", 0.0))


static func avatar_entries(role: String = "") -> Array:
	var out := []
	for a in index().get("avatars", []):
		if role == "" or a.get("role", "civ") == role:
			out.append(a)
	return out


static func entry(name: String) -> Dictionary:
	for a in index().get("avatars", []):
		if a["name"] == name:
			return a
	return {}


## Returns a Node3D ("Model") containing the avatar; metadata "skeleton", "anim" (AnimationPlayer).
static func create(name: String) -> Node3D:
	var e := entry(name)
	var holder := Node3D.new()
	holder.name = "Model"
	if e.is_empty():
		push_warning("Rocketbox: unknown avatar " + name)
		return holder
	var path: String = EXT + e["scene"]
	var ps: PackedScene = _scene_cache.get(path)
	if ps == null:
		ps = load(path)
		if ps == null:
			push_warning("Rocketbox: scene not imported " + path)
			return holder
		_scene_cache[path] = ps
	var inst: Node3D = ps.instantiate()
	inst.rotation.y = MODEL_YAW
	holder.add_child(inst)
	var skel: Skeleton3D = inst.find_child("Skeleton3D", true, false)
	var ap: AnimationPlayer = inst.find_child("AnimationPlayer", true, false)
	_apply_textures(inst, e)
	if ap and library():
		if not ap.has_animation_library("rb"):
			ap.add_animation_library("rb", library())
		ap.playback_default_blend_time = 0.25
	holder.set_meta("skeleton", skel)
	holder.set_meta("anim", ap)
	holder.set_meta("sex", e.get("sex", "m"))
	holder.set_meta("avatar", name)
	return holder


static func _apply_textures(inst: Node3D, e: Dictionary) -> void:
	var tex_map: Dictionary = e.get("textures", {})
	var base: String = EXT + "avatars/" + e["name"] + "/"
	for mi in inst.find_children("*", "MeshInstance3D", true, false):
		var mesh: Mesh = mi.mesh
		if mesh == null:
			continue
		for s in range(mesh.get_surface_count()):
			var src := mesh.surface_get_material(s)
			var mat_name := src.resource_name if src else ""
			var key: String = e["name"] + "/" + mat_name
			var mat: StandardMaterial3D = _mat_cache.get(key)
			if mat == null:
				mat = StandardMaterial3D.new()
				mat.resource_name = mat_name
				mat.roughness = 0.85
				mat.metallic = 0.0
				mat.specular_mode = BaseMaterial3D.SPECULAR_SCHLICK_GGX
				var rel = tex_map.get(mat_name, "")
				if rel != "" and ResourceLoader.exists(base + rel):
					mat.albedo_texture = load(base + rel)
				elif src is BaseMaterial3D and (src as BaseMaterial3D).albedo_texture:
					mat.albedo_texture = (src as BaseMaterial3D).albedo_texture
				else:
					mat.albedo_color = Color(0.6, 0.55, 0.5)
				if mat_name.ends_with("opacity"):
					# hair / eyelashes cards: alpha scissor keeps them in the opaque pass (cheap on mobile)
					mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
					mat.alpha_scissor_threshold = 0.35
					mat.cull_mode = BaseMaterial3D.CULL_DISABLED
				_mat_cache[key] = mat
			mi.set_surface_override_material(s, mat)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		mi.lod_bias = 1.0


## Plays a clip (library "rb") if the player has it; returns true on success.
static func play(ap: AnimationPlayer, clip: String, blend: float = 0.25, speed: float = 1.0) -> bool:
	if ap == null:
		return false
	var full := "rb/" + clip
	if not ap.has_animation(full):
		return false
	if ap.current_animation != full:
		ap.play(full, blend, speed)
	else:
		ap.speed_scale = speed
	return true


## Picks a clip name for a sex ('m'/'f') + category among the baked ones; falls back to the other sex.
static func pick(sex: String, category: String, rng: RandomNumberGenerator = null) -> String:
	var lib := library()
	if lib == null:
		return ""
	var same: Array[String] = []
	var other: Array[String] = []
	for n in lib.get_animation_list():
		var s := String(n)
		if not s.substr(2).begins_with(category):
			continue
		if s.begins_with(sex + "_"):
			same.append(s)
		else:
			other.append(s)
	var pool := same if not same.is_empty() else other
	if pool.is_empty():
		return ""
	if rng:
		return pool[rng.randi_range(0, pool.size() - 1)]
	return pool[0]
