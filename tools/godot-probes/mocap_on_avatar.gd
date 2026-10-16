extends SceneTree

var ap: AnimationPlayer; var skel: Skeleton3D; var frame := 0
var clips := ["walk", "run", "idle", "talk"]; var stats := {}

func _initialize() -> void:
	var avatar: Node3D = (load("res://rb/Male_Adult_01.fbx") as PackedScene).instantiate()
	root.add_child(avatar)
	skel = avatar.find_child("Skeleton3D", true, false); ap = avatar.find_child("AnimationPlayer", true, false)
	var lib := AnimationLibrary.new()
	for pair in [["walk", "res://rb/m_walk_neutral.max.fbx"], ["run", "res://rb/m_run_neutral.max.fbx"], ["idle", "res://rb/m_idle_breathe_01.max.fbx"], ["talk", "res://rb/m_gestic_talk_neutral_01.max.fbx"]]:
		var src: Node = (load(pair[1]) as PackedScene).instantiate()
		var an: Animation = (src.find_child("AnimationPlayer", true, false) as AnimationPlayer).get_animation("Take 001").duplicate()
		for t in range(an.get_track_count() - 1, -1, -1):
			var p := str(an.track_get_path(t))
			if "MotionExtractionHelper" in p or (an.track_get_type(t) == Animation.TYPE_POSITION_3D and not p.ends_with(":Bip01")): an.remove_track(t)
		lib.add_animation(pair[0], an); src.free()
	ap.add_animation_library("rb", lib)

func _process(_delta: float) -> bool:
	frame += 1
	var clipIndex := (frame - 1) / 8; var sub := (frame - 1) % 8
	if clipIndex >= clips.size():
		for c in clips: print(c, ": ", stats[c])
		# explosion check on the last sampled pose
		var pelvis := skel.get_bone_global_pose(skel.find_bone("Bip01 Pelvis")).origin; var worst := 0.0; var wn := ""
		for i in skel.get_bone_count():
			var d := skel.get_bone_global_pose(i).origin.distance_to(pelvis)
			if d > worst: worst = d; wn = skel.get_bone_name(i)
		print("farthest bone from pelvis: %s %.2f m (expect < 1.2)" % [wn, worst])
		return true
	var clip: String = clips[clipIndex]
	if sub == 0:
		ap.play("rb/" + clip); stats[clip] = {"footMinY": 99.0, "footMaxY": 0.0, "headMin": 99.0, "headMax": 0.0, "spread": 0.0, "lThighDeg": 0.0}
	ap.seek(sub / 8.0 * ap.current_animation_length, true)
	skel.force_update_all_bone_transforms()
	var s: Dictionary = stats[clip]
	var lf := skel.get_bone_global_pose(skel.find_bone("Bip01 L Foot")).origin; var rf := skel.get_bone_global_pose(skel.find_bone("Bip01 R Foot")).origin; var hd := skel.get_bone_global_pose(skel.find_bone("Bip01 Head")).origin
	s.footMinY = min(s.footMinY, lf.y, rf.y); s.footMaxY = max(s.footMaxY, lf.y, rf.y); s.headMin = min(s.headMin, hd.y); s.headMax = max(s.headMax, hd.y); s.spread = max(s.spread, lf.distance_to(rf))
	var th := skel.find_bone("Bip01 L Thigh")
	s.lThighDeg = max(s.lThighDeg, rad_to_deg(skel.get_bone_pose_rotation(th).angle_to(skel.get_bone_rest(th).basis.get_rotation_quaternion())))
	if sub == 7:
		for k in s: s[k] = snapped(s[k], 0.001)
	return false
