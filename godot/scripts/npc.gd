class_name NPC
extends CharacterBody3D
## Street NPC: a Rocketbox avatar that either walks sidewalk routes at its mocap speed or stands
## in a spot playing idle / talk / phone clips. Cheap: animation is paused beyond ANIM_RANGE.

const ANIM_RANGE := 70.0
const GRAVITY := 14.0

var avatar_name := ""
var character_name := ""
var role_id := "resident"
var household_priority := false
var mode := "walk"                 # walk | idle | talk
var idle_category := "idle"        # idle | gestic_talk | gestic_listen | cell_phone
var path: PackedVector3Array = PackedVector3Array()
var path_index := 0
var forward := true
var speed := 1.3
var walk_clip := ""
var model: Node3D
var anim: AnimationPlayer
var sex := "m"
var rng := RandomNumberGenerator.new()
var routes: Array = []             # all sidewalk paths (shared) for choosing the next one
var _lod_timer := 0.0
var _animating := true
var _idle_timer := 0.0
var face_target: Vector3 = Vector3.INF


func setup(name: String, seed: int) -> void:
	avatar_name = name
	rng.seed = seed


func role_title() -> String:
	match role_id:
		"housekeeper": return "HOUSEKEEPER"
		"driver": return "DRIVER"
		"gateman": return "GATEMAN"
		"police": return "OFFICER"
		_: return "RESIDENT"


func dialogue_line(profile: Dictionary) -> String:
	var deliveries := int(profile.get("deliveries", 0))
	var wanted := int(profile.get("wanted", 0))
	match role_id:
		"housekeeper":
			if deliveries > 0:
				return "Good work, JAG. The house is proud of its new courier."
			return "Good morning, JAG. Breakfast is warm in the kitchen."
		"driver":
			if wanted > 0:
				return "Police are looking for you, oga. Keep your head down."
			return "The cars are ready, oga. The roads are yours."
		"gateman":
			return "Gate is open, sir. Take care on Ridge Street."
		"police":
			return "Keep the road clear and follow the traffic rules."
		_:
			if deliveries > 0:
				return "I've heard JAG Courier is making a name around North Heights."
			return "Traffic is building up along the ridge today."


func _ready() -> void:
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.3
	capsule.height = 1.7
	shape.shape = capsule
	shape.position = Vector3(0, 0.9, 0)
	add_child(shape)
	collision_layer = 2
	collision_mask = 1
	model = Rocketbox.create(avatar_name)
	add_child(model)
	anim = model.get_meta("anim") if model.has_meta("anim") else null
	sex = model.get_meta("sex") if model.has_meta("sex") else "m"
	var walk_cat: String = ["walk_neutral", "walk_slow", "walk_cool", "walk_stroll"][rng.randi_range(0, 3)]
	walk_clip = Rocketbox.pick(sex, walk_cat, rng)
	if walk_clip == "":
		walk_clip = Rocketbox.pick(sex, "walk", rng)
	speed = maxf(Rocketbox.clip_speed(walk_clip), 0.8)
	if mode == "walk":
		Rocketbox.play(anim, walk_clip, 0.0, 1.0)
		if anim:
			anim.seek(rng.randf() * 1.0, true)
	else:
		_play_idle()
	if face_target != Vector3.INF:
		var d := face_target - global_position
		model.rotation.y = atan2(-d.x, -d.z)


func _play_idle() -> void:
	var clip := Rocketbox.pick(sex, idle_category, rng)
	if clip == "":
		clip = Rocketbox.pick(sex, "idle", rng)
	Rocketbox.play(anim, clip, 0.3)
	if anim:
		anim.seek(rng.randf() * 2.0, true)
	_idle_timer = rng.randf_range(8.0, 20.0)


func _physics_process(delta: float) -> void:
	_lod_timer -= delta
	if _lod_timer <= 0.0:
		_lod_timer = 0.5
		var cam := get_viewport().get_camera_3d()
		var near := cam == null or cam.global_position.distance_to(global_position) < ANIM_RANGE
		if near != _animating and anim:
			_animating = near
			anim.speed_scale = 1.0 if near else 0.0
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = 0.0
	if mode == "walk" and path.size() >= 2:
		var target := path[path_index]
		var to := target - global_position
		to.y = 0.0
		if to.length() < 0.5:
			_advance()
			target = path[path_index]
			to = target - global_position
			to.y = 0.0
		var dir := to.normalized()
		velocity.x = dir.x * speed
		velocity.z = dir.z * speed
		if to.length() > 0.05:
			model.rotation.y = lerp_angle(model.rotation.y, atan2(-dir.x, -dir.z), clampf(delta * 6.0, 0.0, 1.0))
	else:
		velocity.x = 0.0
		velocity.z = 0.0
		_idle_timer -= delta
		if _idle_timer <= 0.0 and _animating:
			_play_idle()
	move_and_slide()


func _advance() -> void:
	if forward:
		path_index += 1
		if path_index >= path.size():
			_pick_next(path[path.size() - 1])
	else:
		path_index -= 1
		if path_index < 0:
			_pick_next(path[0])


## At the end of a route choose another route starting nearby, else turn around.
func _pick_next(end_point: Vector3) -> void:
	var candidates := []
	for r in routes:
		if r == path or r.size() < 2:
			continue
		if r[0].distance_to(end_point) < 9.0:
			candidates.append([r, true])
		elif r[r.size() - 1].distance_to(end_point) < 9.0:
			candidates.append([r, false])
	if candidates.is_empty() or rng.randf() < 0.15:
		forward = not forward
		path_index = clampi(path_index, 0, path.size() - 1)
		return
	var pick: Array = candidates[rng.randi_range(0, candidates.size() - 1)]
	path = pick[0]
	forward = pick[1]
	path_index = 0 if forward else path.size() - 1
