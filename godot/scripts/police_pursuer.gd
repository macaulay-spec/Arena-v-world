class_name PolicePursuer
extends CharacterBody3D
## Single-player foot pursuit. The closest officer runs toward the player until escape or arrest.

const GRAVITY := 14.0
const PURSUIT_SPEED := 4.3

var world: World
var target: Node3D
var model: Node3D
var anim: AnimationPlayer
var _run_clip := "m_run_neutral"
var _arrest_cooldown := 0.0


func setup(owner_world: World, avatar: String) -> void:
	world = owner_world
	model = Rocketbox.create(avatar)


func _ready() -> void:
	name = "PolicePursuer"
	collision_layer = 2
	collision_mask = 1
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.3
	capsule.height = 1.75
	shape.shape = capsule
	shape.position = Vector3(0, 0.9, 0)
	add_child(shape)
	if model:
		add_child(model)
		anim = model.get_meta("anim") if model.has_meta("anim") else null
		var sex := String(model.get_meta("sex", "m"))
		_run_clip = Rocketbox.pick(sex, "run_neutral")
		if _run_clip.is_empty():
			_run_clip = Rocketbox.pick(sex, "run")
		Rocketbox.play(anim, _run_clip, 0.15)


func _physics_process(delta: float) -> void:
	if world == null or int(Game.profile.get("wanted", 0)) <= 0:
		queue_free()
		return
	_arrest_cooldown = maxf(0.0, _arrest_cooldown - delta)
	target = world.active_vehicle if is_instance_valid(world.active_vehicle) else world.player
	if not is_instance_valid(target):
		return
	var offset := target.global_position - global_position
	offset.y = 0.0
	var distance := offset.length()
	if distance <= 1.8:
		velocity.x = 0.0
		velocity.z = 0.0
		if _arrest_cooldown <= 0.0:
			_arrest_cooldown = 2.0
			world.arrest_player()
			return
	var direction := offset.normalized() if distance > 0.05 else Vector3.ZERO
	velocity.x = direction.x * PURSUIT_SPEED
	velocity.z = direction.z * PURSUIT_SPEED
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		velocity.y = 0.0
	if direction.length_squared() > 0.01 and model:
		model.rotation.y = lerp_angle(model.rotation.y, atan2(-direction.x, -direction.z), clampf(delta * 8.0, 0.0, 1.0))
	move_and_slide()
