class_name DrivableCar
extends CharacterBody3D
## Lightweight arcade controller for the two player-owned JAG House cars.
## Uses CharacterBody3D/Jolt rather than costly wheel suspension; the imported CC0 mesh is visual only.

const GRAVITY := 14.0
const MAX_FORWARD_SPEED := 20.0
const MAX_REVERSE_SPEED := 6.0
const ACCELERATION := 8.5
const BRAKE_RATE := 19.0
const COAST_RATE := 1.8
const TURN_RATE := 0.78

var vehicle_id := ""
var vehicle_kind := "owner_suv"
var vehicle_length := 4.8
var visual: Node3D
var driver: Player
var driving := false
var throttle_input := 0.0
var brake_input := 0.0
var steering_input := 0.0
var speed_mps := 0.0
var _camera: Camera3D
var _driver_shape: CollisionShape3D


func configure(id: String, kind: String, imported_visual: Node3D, visual_scale: float, model_bounds: AABB, target_length: float) -> void:
	vehicle_id = id
	vehicle_kind = kind
	vehicle_length = target_length
	visual = imported_visual
	visual.scale = Vector3.ONE * visual_scale
	visual.position = Vector3(0.0, -model_bounds.position.y * visual_scale, 0.0)


func _ready() -> void:
	collision_layer = 1
	collision_mask = 3
	floor_snap_length = 0.35
	floor_max_angle = deg_to_rad(48.0)
	var collision := CollisionShape3D.new()
	collision.name = "VehicleCollision"
	var box := BoxShape3D.new()
	box.size = Vector3(1.95, 1.45, vehicle_length + 0.45)
	collision.shape = box
	collision.position = Vector3(0.0, 0.72, 0.0)
	add_child(collision)
	if visual:
		add_child(visual)
	var camera_pivot := Node3D.new()
	camera_pivot.name = "VehicleCameraPivot"
	camera_pivot.position = Vector3(0.0, 2.15, 0.0)
	add_child(camera_pivot)
	var arm := SpringArm3D.new()
	arm.spring_length = 6.2
	arm.margin = 0.35
	camera_pivot.add_child(arm)
	_camera = Camera3D.new()
	_camera.fov = 74.0
	_camera.near = 0.15
	_camera.far = float(Game.quality.get("far", 400.0))
	_camera.current = false
	arm.add_child(_camera)
	Game.quality_changed.connect(func(q): _camera.far = float(q.get("far", 400.0)))
	set_physics_process(false)


func enter(player: Player) -> bool:
	if driving or not is_instance_valid(player):
		return false
	driver = player
	driving = true
	throttle_input = 0.0
	brake_input = 0.0
	steering_input = 0.0
	speed_mps = 0.0
	player.run_toggle = false
	player.jump_pressed = false
	player.global_position = global_position
	player.yaw = rotation.y
	player.model.visible = false
	_driver_shape = player.get_node_or_null("CollisionShape3D") as CollisionShape3D
	if _driver_shape:
		_driver_shape.disabled = true
	player.set_physics_process(false)
	player.camera.current = false
	_camera.current = true
	set_physics_process(true)
	return true


func exit() -> Player:
	if not driving:
		return null
	driving = false
	set_physics_process(false)
	throttle_input = 0.0
	brake_input = 0.0
	steering_input = 0.0
	var exiting_player := driver
	if not is_instance_valid(exiting_player):
		return null
	_camera.current = false
	exiting_player.camera.current = true
	exiting_player.model.visible = true
	if _driver_shape:
		_driver_shape.disabled = false
	exiting_player.set_physics_process(true)
	exiting_player.velocity = Vector3.ZERO
	exiting_player.global_position = global_position + global_transform.basis.x * 1.65 + Vector3.UP * 0.08
	exiting_player.yaw = rotation.y
	exiting_player.cam_yaw.rotation.y = exiting_player.yaw
	exiting_player.model.rotation.y = exiting_player.yaw
	exiting_player.move_input = Vector2.ZERO
	driver = null
	return exiting_player


func _physics_process(delta: float) -> void:
	if not driving or not is_instance_valid(driver):
		return
	var keyboard_gas := Input.is_action_pressed("move_forward")
	var keyboard_reverse := Input.is_action_pressed("move_back")
	var keyboard_brake := Input.is_action_pressed("jump")
	var throttle := maxf(throttle_input, maxf(driver.move_input.y, 1.0 if keyboard_gas else 0.0))
	var reverse := (keyboard_reverse or driver.move_input.y < -0.45) and not keyboard_gas and throttle_input < 0.05
	var braking := brake_input > 0.05 or keyboard_brake
	var target_speed := MAX_FORWARD_SPEED if throttle > 0.05 else (-MAX_REVERSE_SPEED if reverse else 0.0)
	if braking:
		speed_mps = move_toward(speed_mps, 0.0, BRAKE_RATE * delta)
	elif absf(target_speed) > 0.01:
		speed_mps = move_toward(speed_mps, target_speed, ACCELERATION * delta)
	else:
		speed_mps = move_toward(speed_mps, 0.0, COAST_RATE * delta)
	var keyboard_steer := Input.get_axis("move_left", "move_right")
	var steer := clampf(steering_input + driver.move_input.x + keyboard_steer, -1.0, 1.0)
	if absf(speed_mps) > 0.4:
		var speed_factor := clampf(absf(speed_mps) / 4.0, 0.0, 1.0)
		rotation.y -= steer * TURN_RATE * speed_factor * signf(speed_mps) * delta
	var forward := -global_transform.basis.z
	velocity.x = forward.x * speed_mps
	velocity.z = forward.z * speed_mps
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = 0.0
	move_and_slide()
	if absf(speed_mps) > 4.0:
		for collision_index in range(get_slide_collision_count()):
			var collided: Object = get_slide_collision(collision_index).get_collider()
			if collided is NPC and not collided.has_meta("hit_by_vehicle"):
				collided.set_meta("hit_by_vehicle", true)
				collided.queue_free()
				Game.add_wanted(1)
				var owner_world := get_parent() as World
				if owner_world:
					owner_world.toast_requested.emit("Pedestrian collision reported · wanted level increased.")
				break
	driver.global_position = global_position
	driver.yaw = rotation.y


func speed_kph() -> int:
	return int(round(absf(speed_mps) * 3.6))
