extends SceneTree
## Bakes the fetched Rocketbox mocap clips (assets/ext/rocketbox/anim/*.fbx, imported by Godot)
## into ONE AnimationLibrary resource: res://assets/anim/rocketbox.res  (+ clips_meta.json).
##
## - keeps rotation tracks for all Bip01 bones (same Biped rig as the avatars → no retargeting)
## - keeps only the root (Bip01) position track; locomotion clips ("xy") are made in-place
##   (horizontal root motion removed; its speed is recorded in clips_meta.json so controllers
##   move the body at exactly the mocap speed → no foot sliding)
## - drops MotionExtractionHelper / Footsteps / scale tracks, compresses the result
##
## Run:  godot --headless --path godot --script tools/bake_clips.gd

const INDEX := "res://assets/ext/rocketbox/index.json"
const OUT_LIB := "res://assets/anim/rocketbox.res"
const OUT_META := "res://assets/anim/clips_meta.json"


func _init() -> void:
	var index = JSON.parse_string(FileAccess.get_file_as_string(INDEX))
	if typeof(index) != TYPE_DICTIONARY:
		push_error("bake_clips: cannot read " + INDEX)
		quit(1)
		return
	var lib := AnimationLibrary.new()
	var meta := {}
	var failures := 0
	for c in index["clips"]:
		var path: String = "res://assets/ext/rocketbox/" + c["scene"]
		var ps = load(path)
		if ps == null:
			push_error("bake_clips: missing imported scene " + path)
			failures += 1
			continue
		var inst: Node = ps.instantiate()
		var ap: AnimationPlayer = inst.find_child("AnimationPlayer", true, false)
		if ap == null or not ap.has_animation("Take 001"):
			push_error("bake_clips: no 'Take 001' in " + path)
			inst.free()
			failures += 1
			continue
		var an: Animation = ap.get_animation("Take 001").duplicate(true)
		var info := _filter(an, c["kind"] == "xy")
		an.loop_mode = Animation.LOOP_LINEAR if c["loop"] else Animation.LOOP_NONE
		an.compress()
		lib.add_animation(c["name"], an)
		meta[c["name"]] = {
			"length": an.length, "speed": info["speed"], "forward": info["forward"],
			"loop": c["loop"], "kind": c["kind"], "sex": c["sex"], "tracks": an.get_track_count(),
		}
		print("clip %-28s %5.2fs  %2d tracks  speed %.2f m/s  fwd %s" % [c["name"], an.length, an.get_track_count(), info["speed"], str(info["forward"])])
		inst.free()
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://assets/anim"))
	var err := ResourceSaver.save(lib, OUT_LIB, ResourceSaver.FLAG_COMPRESS)
	if err != OK:
		push_error("bake_clips: save failed %d" % err)
		quit(1)
		return
	var f := FileAccess.open(OUT_META, FileAccess.WRITE)
	f.store_string(JSON.stringify(meta, "\t"))
	f.close()
	print("baked %d clips -> %s (%d KB), failures %d" % [lib.get_animation_list().size(), OUT_LIB, FileAccess.get_file_as_bytes(OUT_LIB).size() / 1024, failures])
	quit(1 if failures > 0 else 0)


## Strips helper tracks; returns {"speed": m/s of horizontal root drift, "forward": Vector3 drift dir}.
func _filter(an: Animation, in_place: bool) -> Dictionary:
	var speed := 0.0
	var forward := Vector3.ZERO
	for t in range(an.get_track_count() - 1, -1, -1):
		var p := str(an.track_get_path(t))
		var ty := an.track_get_type(t)
		if "MotionExtractionHelper" in p or "Footsteps" in p or ty == Animation.TYPE_SCALE_3D:
			an.remove_track(t)
			continue
		if ty == Animation.TYPE_POSITION_3D:
			if not p.ends_with(":Bip01"):
				an.remove_track(t)
				continue
			var n := an.track_get_key_count(t)
			if n >= 2:
				var p0: Vector3 = an.track_get_key_value(t, 0)
				var p1: Vector3 = an.track_get_key_value(t, n - 1)
				var dur := an.track_get_key_time(t, n - 1) - an.track_get_key_time(t, 0)
				var drift := Vector3(p1.x - p0.x, 0.0, p1.z - p0.z)
				if dur > 0.0:
					speed = drift.length() / dur
				forward = drift.normalized() if drift.length() > 0.01 else Vector3.ZERO
				if in_place:
					for k in range(n):
						var v: Vector3 = an.track_get_key_value(t, k)
						an.track_set_key_value(t, k, Vector3(p0.x, v.y, p0.z))
	return {"speed": speed, "forward": forward}
