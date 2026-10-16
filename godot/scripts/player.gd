class_name Player
extends CharacterBody3D
## Third-person on-foot controller driving a Rocketbox avatar with mocap clips.
## Movement speeds come from the baked clip root motion so feet never slide.

const GRAVITY := 14.0
const JUMP_V := 5.0
const TURN_SPEED := 10.0
const CAM_SENS := 0.0045

@export var avatar_name := "Male_Adult_01"

var model: Node3D
var anim: AnimationPlayer
var cam_yaw: Node3D
var cam_pitch: Node3D
var spring: SpringArm3D
var camera: Camera3D
var yaw := 0.0
var pitch := -0.18
var run_toggle := false
var move_input := Vector2.ZERO      # set by HUD joystick (x right, y forward)
var look_delta := Vector2.ZERO      # set by HUD touch look (pixels)
var jump_pressed := false
var walk_speed := 1.4
var run_speed := 3.07
var walk_clip := "m_walk_neutral"
var run_clip := "m_run_neutral"
var idle_clip := "m_idle_breathe_01"
var _state := ""


func _ready() -> void:
	avatar_name = String(Game.profile.get("avatar_name", avatar_name))
	var body_build := clampf(float(Game.profile.get("build", 1.0)), 0.85, 1.2)
	var body_height := clampf(float(Game.profile.get("height", 1.0)), 0.9, 1.1)
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.32 * body_build
	capsule.height = 1.72 * body_height
	shape.shape = capsule
	shape.position = Vector3(0, capsule.height * 0.5 + 0.04, 0)
	add_child(shape)
	floor_snap_length = 0.4
	floor_max_angle = deg_to_rad(50)
	# avatar
	model = Rocketbox.create(avatar_name)
	model.scale = Vector3(body_build, body_height, body_build)
	add_child(model)
	anim = model.get_meta("anim") if model.has_meta("anim") else null
	var sex: String = model.get_meta("sex") if model.has_meta("sex") else "m"
	walk_clip = Rocketbox.pick(sex, "walk_neutral")
	run_clip = Rocketbox.pick(sex, "run_neutral")
	idle_clip = Rocketbox.pick(sex, "idle_breathe")
	walk_speed = maxf(Rocketbox.clip_speed(walk_clip), 1.0)
	run_speed = maxf(Rocketbox.clip_speed(run_clip), 2.5)
	# camera rig
	cam_yaw = Node3D.new()
	cam_yaw.name = "CamYaw"
	cam_yaw.position = Vector3(0, 1.55 * body_height, 0)
	add_child(cam_yaw)
	cam_pitch = Node3D.new()
	cam_yaw.add_child(cam_pitch)
	spring = SpringArm3D.new()
	spring.spring_length = 3.8
	spring.margin = 0.25
	spring.position = Vector3(0.45, 0.0, 0.0)
	spring.add_excluded_object(get_rid())
	cam_pitch.add_child(spring)
	camera = Camera3D.new()
	camera.fov = 70.0
	camera.near = 0.1
	camera.far = float(Game.quality.get("far", 500.0))
	camera.current = true
	spring.add_child(camera)
	Game.quality_changed.connect(func(q): camera.far = float(q.get("far", 500.0)))
	Rocketbox.play(anim, idle_clip, 0.0)
	_state = "idle"


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		look_delta += event.relative
	if event.is_action_pressed("jump"):
		jump_pressed = true
	if event.is_action_pressed("run"):
		run_toggle = not run_toggle


func _physics_process(delta: float) -> void:
	# camera orbit
	yaw -= look_delta.x * CAM_SENS
	pitch = clampf(pitch - look_delta.y * CAM_SENS, -0.9, 0.5)
	look_delta = Vector2.ZERO
	cam_yaw.rotation.y = yaw
	cam_pitch.rotation.x = pitch
	# input: joystick or keyboard
	var inp := move_input
	var kb := Input.get_vector("move_left", "move_right", "move_back", "move_forward")
	if kb.length() > 0.1:
		inp = kb
	var running := run_toggle or Input.is_action_pressed("run")
	var mag := clampf(inp.length(), 0.0, 1.0)
	var fwd := -cam_yaw.global_transform.basis.z
	fwd.y = 0.0
	fwd = fwd.normalized()
	var right := cam_yaw.global_transform.basis.x
	right.y = 0.0
	right = right.normalized()
	var dir := (fwd * inp.y + right * inp.x)
	if dir.length() > 1.0:
		dir = dir.normalized()
	var target_speed := (run_speed if running and mag > 0.6 else walk_speed) * mag
	var vel_h := Vector3(velocity.x, 0, velocity.z)
	var goal := dir.normalized() * target_speed if mag > 0.05 else Vector3.ZERO
	vel_h = vel_h.move_toward(goal, delta * 14.0)
	velocity.x = vel_h.x
	velocity.z = vel_h.z
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	elif jump_pressed:
		velocity.y = JUMP_V
	jump_pressed = false
	var was_on_floor := is_on_floor()
	move_and_slide()
	if was_on_floor and is_on_wall() and goal.length() > 0.1:
		_try_step(goal.normalized())
	# face movement direction
	if vel_h.length() > 0.2:
		var target_yaw := atan2(-vel_h.x, -vel_h.z)
		model.rotation.y = lerp_angle(model.rotation.y, target_yaw, clampf(delta * TURN_SPEED, 0.0, 1.0))
	_animate(vel_h.length(), running)


## Kerbs, steps and low ledges (≤ 0.35 m): if the capsule is blocked by a wall, test whether the
## same move succeeds one step higher and, if so, climb onto it (Godot has no built-in stair stepping).
func _try_step(dir: Vector3) -> void:
	var step_h := 0.35
	var xf := global_transform
	if test_move(xf, Vector3.UP * step_h):
		return
	var up_xf := xf.translated(Vector3.UP * step_h)
	var fwd := dir * 0.3
	if test_move(up_xf, fwd):
		return
	var fwd_xf := up_xf.translated(fwd)
	var col := KinematicCollision3D.new()
	if test_move(fwd_xf, Vector3.DOWN * step_h, col):
		var travel := col.get_travel()
		if step_h - travel.length() > 0.04:      # it is really a step, not flat ground
			global_position = fwd_xf.origin + travel + Vector3.UP * 0.01
			velocity.y = 0.0


func _animate(speed: float, running: bool) -> void:
	if anim == null:
		return
	if speed < 0.15:
		if _state != "idle":
			Rocketbox.play(anim, idle_clip, 0.2)
			_state = "idle"
	elif running and speed > walk_speed * 1.15:
		Rocketbox.play(anim, run_clip, 0.15, speed / run_speed)
		_state = "run"
	else:
		Rocketbox.play(anim, walk_clip, 0.15, clampf(speed / walk_speed, 0.6, 1.4))
		_state = "walk"


func head_position() -> Vector3:
	return global_position + Vector3(0, 1.6 * float(Game.profile.get("height", 1.0)), 0)
