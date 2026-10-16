class_name MansionDoor
extends Node3D
## Automatically swings the JAG House double entry doors open as the player approaches.

const LEAF_WIDTH := 1.56
const DOOR_HEIGHT := 2.68
const OPEN_ANGLE := PI * 0.5

var is_open := false
var open_amount := 0.0
var left_pivot: Node3D
var right_pivot: Node3D


func _ready() -> void:
	_build_leaf(-1.6, 1.0, true)
	_build_leaf(1.6, -1.0, false)
	var area := Area3D.new()
	area.name = "DoorProximity"
	area.collision_layer = 0
	area.collision_mask = 1
	area.monitoring = true
	area.monitorable = false
	var shape_node := CollisionShape3D.new()
	var sphere := SphereShape3D.new()
	sphere.radius = 3.0
	shape_node.shape = sphere
	shape_node.position = Vector3(0, 1.25, 0)
	area.add_child(shape_node)
	area.body_entered.connect(_on_body_entered)
	area.body_exited.connect(_on_body_exited)
	add_child(area)


func _build_leaf(hinge_x: float, extends_x: float, is_left: bool) -> void:
	var pivot := Node3D.new()
	pivot.name = "LeftLeaf" if is_left else "RightLeaf"
	pivot.position = Vector3(hinge_x, 0.0, 0.0)
	add_child(pivot)
	if is_left:
		left_pivot = pivot
	else:
		right_pivot = pivot
	var center_x := extends_x * LEAF_WIDTH * 0.5
	var wood := Materials.get_mat("interior_oak").duplicate() as StandardMaterial3D
	wood.roughness = 0.42
	var panel := BoxMesh.new()
	panel.size = Vector3(LEAF_WIDTH, DOOR_HEIGHT, 0.12)
	var mesh := MeshInstance3D.new()
	mesh.name = "DoorSlab"
	mesh.mesh = panel
	mesh.material_override = wood
	mesh.position = Vector3(center_x, DOOR_HEIGHT * 0.5, 0.0)
	pivot.add_child(mesh)
	# Raised inset panels give the door depth, with a warm metal handle at the meeting stile.
	var trim := StandardMaterial3D.new()
	trim.albedo_color = Color(0.42, 0.27, 0.16)
	trim.roughness = 0.48
	var inset := BoxMesh.new()
	inset.size = Vector3(LEAF_WIDTH * 0.72, 0.72, 0.035)
	for y in [0.62, 1.68]:
		var m := MeshInstance3D.new()
		m.mesh = inset
		m.material_override = trim
		m.position = Vector3(center_x, y, 0.078)
		pivot.add_child(m)
	var brass := StandardMaterial3D.new()
	brass.albedo_color = Color(0.68, 0.48, 0.22)
	brass.metallic = 0.7
	brass.roughness = 0.28
	var knob_mesh := SphereMesh.new()
	knob_mesh.radius = 0.055
	knob_mesh.height = 0.11
	var knob := MeshInstance3D.new()
	knob.mesh = knob_mesh
	knob.material_override = brass
	knob.position = Vector3(center_x + extends_x * 0.52, 1.05, 0.13)
	pivot.add_child(knob)
	var body := StaticBody3D.new()
	body.name = "DoorLeafCollision"
	body.collision_layer = 1
	body.collision_mask = 0
	var collision := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(LEAF_WIDTH, DOOR_HEIGHT, 0.14)
	collision.shape = box
	collision.position = Vector3(center_x, DOOR_HEIGHT * 0.5, 0.0)
	body.add_child(collision)
	pivot.add_child(body)


func _on_body_entered(body: Node3D) -> void:
	if body is Player:
		is_open = true


func _on_body_exited(body: Node3D) -> void:
	if body is Player:
		is_open = false


func _process(delta: float) -> void:
	var target := OPEN_ANGLE if is_open else 0.0
	open_amount = move_toward(open_amount, target, delta * 4.2)
	if left_pivot:
		left_pivot.rotation.y = open_amount
	if right_pivot:
		right_pivot.rotation.y = -open_amount
