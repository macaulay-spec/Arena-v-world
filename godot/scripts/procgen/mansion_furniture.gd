class_name MansionFurniture
extends RefCounted
## Game-ready, walkable JAG House furnishings from KayKit's CC0 glTF packs.
## Each placement is recorded for batched MultiMesh emission and a separate simple collision proxy.

const OX := MansionBuilder.OX
const OZ := MansionBuilder.OZ
const OY := MansionBuilder.OY
const GF := MansionBuilder.GF
const F1 := MansionBuilder.F1
const FURNITURE := "res://assets/furniture/kaykit-furniture/"
const KITCHEN := "res://assets/furniture/kaykit-restaurant/"

var wb: WorldBuilder


func _init(builder: WorldBuilder) -> void:
	wb = builder


func W(x: float, y: float, z: float) -> Vector3:
	return Vector3(x + OX, y + OY, z + OZ)


func build() -> void:
	_rugs()
	_living_room()
	_dining_room()
	_kitchen()
	_family_lounge()
	_study()
	_entry_hall()
	_upstairs_bedrooms()
	_upstairs_sitting_room()
	_wall_art()


func _rugs() -> void:
	_asset(FURNITURE + "rug-rectangle-a.glb", 33.0, GF + 0.018, 40.5, PI * 0.5, Vector3(0.82, 0.12, 0.9))
	_asset(FURNITURE + "rug-rectangle-stripes-a.glb", 21.5, GF + 0.018, 36.3, 0.0, Vector3(0.95, 0.12, 0.95))
	_asset(FURNITURE + "rug-rectangle-a.glb", 44.5, GF + 0.018, 39.2, 0.0, Vector3(0.9, 0.12, 0.8))
	_asset(FURNITURE + "rug-rectangle-stripes-a.glb", 34.5, GF + 0.018, 24.2, 0.0, Vector3(0.9, 0.12, 0.78))
	_asset(FURNITURE + "rug-rectangle-a.glb", 22.0, F1 + 0.018, 26.3, 0.0, Vector3(0.8, 0.12, 0.7))
	_asset(FURNITURE + "rug-rectangle-stripes-a.glb", 22.8, F1 + 0.018, 31.5, 0.0, Vector3(0.92, 0.12, 0.85))
	_asset(FURNITURE + "rug-rectangle-a.glb", 22.5, F1 + 0.018, 40.4, 0.0, Vector3(0.85, 0.12, 0.75))
	_asset(FURNITURE + "rug-rectangle-stripes-a.glb", 44.0, F1 + 0.018, 26.6, 0.0, Vector3(0.85, 0.12, 0.75))
	_asset(FURNITURE + "rug-rectangle-a.glb", 45.8, F1 + 0.018, 38.5, 0.0, Vector3(0.8, 0.12, 0.7))


func _living_room() -> void:
	_asset(FURNITURE + "couch-pillows.glb", 21.5, GF, 38.4, 0.0, Vector3(0.95, 0.95, 0.9), Vector3(2.55, 0.76, 1.08), Vector3(0.0, 0.42, 0.0))
	_asset(FURNITURE + "table-low.glb", 21.5, GF, 36.1, 0.0, Vector3(0.58, 0.72, 0.55), Vector3(1.15, 0.28, 0.62), Vector3(0.0, 0.16, 0.0))
	_asset(FURNITURE + "armchair-pillows.glb", 18.5, GF, 36.6, -PI * 0.5, Vector3(0.58, 0.58, 0.58), Vector3(0.82, 0.52, 0.7), Vector3(0.0, 0.3, 0.0))
	_asset(FURNITURE + "armchair-pillows.glb", 24.5, GF, 36.6, PI * 0.5, Vector3(0.58, 0.58, 0.58), Vector3(0.82, 0.52, 0.7), Vector3(0.0, 0.3, 0.0))
	_asset(FURNITURE + "lamp-standing.glb", 18.5, GF, 40.4, 0.0, Vector3(0.72, 0.78, 0.72))
	_asset(FURNITURE + "table-small.glb", 25.0, GF, 39.3, 0.0, Vector3(0.48, 0.55, 0.45), Vector3(0.42, 0.4, 0.4), Vector3(0.0, 0.25, 0.0))
	_asset(FURNITURE + "lamp-table.glb", 25.0, GF + 0.54, 39.3, 0.0, Vector3(0.34, 0.38, 0.34))
	# Low media console is a real model; only the display panel itself is custom 3D wall decor.
	_asset(FURNITURE + "table-medium-long.glb", 21.5, GF, 32.65, 0.0, Vector3(0.82, 0.58, 0.34), Vector3(2.2, 0.52, 0.55), Vector3(0.0, 0.3, 0.0))
	_box("metal_dark", 21.5, GF + 1.55, 32.25, Vector3(2.35, 1.32, 0.1), Color(0.12, 0.13, 0.14))
	_box("jag_house_art", 21.5, GF + 1.55, 32.34, Vector3(2.18, 1.15, 0.035), Color.WHITE)


func _dining_room() -> void:
	_asset(KITCHEN + "kitchentable-a-large.glb", 44.5, GF, 39.1, 0.0, Vector3(0.82, 0.8, 0.64), Vector3(2.28, 0.58, 1.2), Vector3(0.0, 0.42, 0.0))
	for x: float in [42.55, 44.5, 46.45]:
		_asset(FURNITURE + "chair-a-wood.glb", x, GF, 37.55, PI, Vector3(0.86, 0.82, 0.82), Vector3(0.55, 0.7, 0.52), Vector3(0.0, 0.35, 0.0))
		_asset(FURNITURE + "chair-b-wood.glb", x, GF, 40.55, 0.0, Vector3(0.86, 0.82, 0.82), Vector3(0.55, 0.7, 0.52), Vector3(0.0, 0.35, 0.0))
	_asset(FURNITURE + "cabinet-small-decorated.glb", 48.8, GF, 36.9, PI * 0.5, Vector3(0.55, 0.62, 0.42), Vector3(0.48, 0.8, 0.46), Vector3(0.0, 0.4, 0.0))
	_asset(FURNITURE + "lamp-table.glb", 48.8, GF + 1.0, 36.9, 0.0, Vector3(0.32, 0.34, 0.32))
	_asset(FURNITURE + "cactus-medium-a.glb", 47.6, GF, 41.4, 0.0, Vector3(0.56, 0.6, 0.56))
	_asset(KITCHEN + "plate.glb", 44.5, GF + 0.81, 39.1, 0.0, Vector3(0.28, 0.22, 0.28))
	_asset(KITCHEN + "bowl.glb", 43.7, GF + 0.81, 39.1, 0.0, Vector3(0.25, 0.25, 0.25))


func _kitchen() -> void:
	# Lower cabinets and stone work surfaces use true modular restaurant-kit geometry.
	_asset(KITCHEN + "kitchencounter-straight-a.glb", 48.6, GF, 22.4, 0.0, Vector3(0.55, 0.92, 0.55), Vector3(0.95, 0.72, 0.92), Vector3(0.0, 0.38, 0.0))
	_asset(KITCHEN + "kitchencounter-sink.glb", 48.6, GF, 24.0, 0.0, Vector3(0.55, 0.5, 0.55), Vector3(0.95, 0.7, 0.9), Vector3(0.0, 0.38, 0.0))
	_asset(KITCHEN + "kitchencounter-straight-a.glb", 48.6, GF, 25.55, 0.0, Vector3(0.55, 0.92, 0.55), Vector3(0.95, 0.72, 0.92), Vector3(0.0, 0.38, 0.0))
	_asset(KITCHEN + "kitchencounter-innercorner.glb", 48.6, GF, 27.1, 0.0, Vector3(0.5, 0.92, 0.5), Vector3(0.9, 0.72, 0.9), Vector3(0.0, 0.38, 0.0))
	# Matching upper cabinetry sits at its authored 2–4 m local Y in the kit, then scales to the room.
	_asset(KITCHEN + "kitchencabinet.glb", 48.6, GF, 22.4, 0.0, Vector3(0.55, 0.52, 0.55))
	_asset(KITCHEN + "kitchencabinet-half.glb", 48.6, GF, 24.5, 0.0, Vector3(0.55, 0.52, 0.55))
	_asset(KITCHEN + "kitchencabinet-corner.glb", 48.6, GF, 27.1, 0.0, Vector3(0.5, 0.52, 0.5))
	# Freestanding cooktop and refrigerator are scaled to human proportions, not left at kit grid size.
	_asset(KITCHEN + "stove-multi-decorated.glb", 46.3, GF, 22.0, 0.0, Vector3(0.42, 0.58, 0.42), Vector3(0.8, 0.82, 0.8), Vector3(0.0, 0.42, 0.0))
	_asset(KITCHEN + "fridge-a-decorated.glb", 45.0, GF, 24.1, 0.0, Vector3(0.36, 0.45, 0.36), Vector3(0.92, 1.75, 0.88), Vector3(0.0, 0.86, 0.0))
	# A real island anchors the kitchen; the stools and small kitchenware are independent glTF meshes.
	_asset(KITCHEN + "kitchencounter-straight-a.glb", 41.9, GF, 29.0, 0.0, Vector3(0.5, 0.92, 0.5), Vector3(0.86, 0.72, 0.86), Vector3(0.0, 0.38, 0.0))
	_asset(KITCHEN + "kitchencounter-sink.glb", 43.0, GF, 29.0, 0.0, Vector3(0.5, 0.5, 0.5), Vector3(0.86, 0.7, 0.86), Vector3(0.0, 0.38, 0.0))
	_asset(KITCHEN + "kitchencounter-straight-a.glb", 44.1, GF, 29.0, 0.0, Vector3(0.5, 0.92, 0.5), Vector3(0.86, 0.72, 0.86), Vector3(0.0, 0.38, 0.0))
	for x: float in [41.9, 43.0, 44.1]:
		_asset(FURNITURE + "chair-stool-wood.glb", x, GF, 27.55, 0.0, Vector3(0.82, 1.35, 0.82), Vector3(0.48, 0.62, 0.48), Vector3(0.0, 0.3, 0.0))
	_asset(KITCHEN + "dishrack-plates.glb", 48.4, GF + 0.95, 24.0, 0.0, Vector3(0.25, 0.3, 0.25))
	_asset(KITCHEN + "dishrack.glb", 48.4, GF + 0.95, 25.7, 0.0, Vector3(0.27, 0.32, 0.27))
	_asset(KITCHEN + "bowl.glb", 43.0, GF + 0.95, 29.0, 0.0, Vector3(0.22, 0.22, 0.22))
	_asset(KITCHEN + "plate.glb", 44.1, GF + 0.95, 29.0, 0.0, Vector3(0.22, 0.22, 0.22))


func _family_lounge() -> void:
	_asset(FURNITURE + "couch-pillows.glb", 34.5, GF, 25.4, 0.0, Vector3(0.88, 0.9, 0.8), Vector3(2.35, 0.72, 1.0), Vector3(0.0, 0.4, 0.0))
	_asset(FURNITURE + "table-low.glb", 34.5, GF, 22.9, 0.0, Vector3(0.5, 0.68, 0.5), Vector3(1.0, 0.26, 0.6), Vector3(0.0, 0.15, 0.0))
	_asset(FURNITURE + "armchair-pillows.glb", 37.3, GF, 23.8, PI * 0.5, Vector3(0.5, 0.54, 0.5), Vector3(0.72, 0.5, 0.62), Vector3(0.0, 0.3, 0.0))
	_asset(FURNITURE + "lamp-standing.glb", 37.5, GF, 28.0, 0.0, Vector3(0.62, 0.7, 0.62))
	_asset(FURNITURE + "cabinet-small-decorated.glb", 37.5, GF, 21.5, PI * 0.5, Vector3(0.45, 0.56, 0.38), Vector3(0.4, 0.72, 0.38), Vector3(0.0, 0.36, 0.0))
	_asset(FURNITURE + "pictureframe-medium.glb", 37.67, GF + 1.65, 26.0, -PI * 0.5, Vector3(1.0, 1.0, 0.5))


func _study() -> void:
	_asset(FURNITURE + "table-medium.glb", 22.0, GF, 22.25, 0.0, Vector3(0.78, 0.78, 0.58), Vector3(1.45, 0.6, 0.95), Vector3(0.0, 0.36, 0.0))
	_asset(FURNITURE + "chair-b-wood.glb", 22.0, GF, 24.15, 0.0, Vector3(0.78, 0.78, 0.78), Vector3(0.52, 0.65, 0.5), Vector3(0.0, 0.34, 0.0))
	_asset(FURNITURE + "cabinet-medium-decorated.glb", 17.25, GF, 25.0, PI * 0.5, Vector3(0.55, 0.68, 0.46), Vector3(0.45, 1.1, 0.82), Vector3(0.0, 0.55, 0.0))
	_asset(FURNITURE + "shelf-b-large-decorated.glb", 17.25, GF + 1.35, 28.1, PI * 0.5, Vector3(0.58, 0.62, 0.48))
	_asset(FURNITURE + "shelf-a-big.glb", 17.25, GF + 2.05, 28.1, PI * 0.5, Vector3(0.58, 0.58, 0.48))
	_asset(FURNITURE + "book-set.glb", 22.0, GF + 0.63, 22.25, 0.0, Vector3(0.5, 0.5, 0.5))
	_asset(FURNITURE + "book-set.glb", 22.55, GF + 0.63, 22.25, 0.0, Vector3(0.45, 0.45, 0.45))
	_asset(FURNITURE + "lamp-table.glb", 21.4, GF + 0.78, 22.2, 0.0, Vector3(0.28, 0.3, 0.28))
	_asset(FURNITURE + "cactus-medium-a.glb", 17.25, GF + 1.25, 25.0, 0.0, Vector3(0.45, 0.46, 0.45))


func _entry_hall() -> void:
	_asset(FURNITURE + "cabinet-small-decorated.glb", 37.1, GF, 39.3, PI * 0.5, Vector3(0.62, 0.58, 0.45), Vector3(0.52, 0.92, 0.48), Vector3(0.0, 0.45, 0.0))
	_asset(FURNITURE + "table-medium.glb", 30.2, GF, 34.8, 0.0, Vector3(0.48, 0.48, 0.35), Vector3(0.82, 0.36, 0.58), Vector3(0.0, 0.22, 0.0))
	_asset(FURNITURE + "cactus-medium-a.glb", 37.9, GF, 37.1, 0.0, Vector3(0.65, 0.67, 0.65))
	_asset(FURNITURE + "pictureframe-large-a.glb", 27.12, GF + 2.15, 35.0, PI * 0.5, Vector3(1.0, 1.0, 0.5))


func _upstairs_bedrooms() -> void:
	# Main suite
	_asset(FURNITURE + "bed-double-a.glb", 22.8, F1, 30.1, 0.0, Vector3(0.82, 0.82, 0.82), Vector3(2.35, 0.62, 2.15), Vector3(0.0, 0.34, 0.0))
	_place_bedside(20.4, F1, 29.0)
	_place_bedside(25.2, F1, 29.0)
	_asset(FURNITURE + "cabinet-medium-decorated.glb", 17.4, F1, 30.7, PI * 0.5, Vector3(0.54, 0.65, 0.46), Vector3(0.45, 1.0, 0.82), Vector3(0.0, 0.5, 0.0))
	_asset(FURNITURE + "pillow-a.glb", 22.1, F1 + 0.77, 28.85, 0.0, Vector3(0.78, 0.72, 0.78))
	_asset(FURNITURE + "pillow-b.glb", 23.2, F1 + 0.77, 28.85, 0.0, Vector3(0.78, 0.72, 0.78))
	# North guest room
	_asset(FURNITURE + "bed-double-b.glb", 22.5, F1, 38.6, 0.0, Vector3(0.75, 0.75, 0.75), Vector3(2.05, 0.58, 2.0), Vector3(0.0, 0.32, 0.0))
	_place_bedside(20.0, F1, 37.6)
	_place_bedside(25.0, F1, 37.6)
	# East guest suite
	_asset(FURNITURE + "bed-double-a.glb", 44.0, F1, 25.8, PI, Vector3(0.74, 0.74, 0.74), Vector3(2.0, 0.56, 1.9), Vector3(0.0, 0.3, 0.0))
	_place_bedside(41.5, F1, 26.8)
	_place_bedside(46.5, F1, 26.8)


func _place_bedside(x: float, y: float, z: float) -> void:
	_asset(FURNITURE + "table-small.glb", x, y, z, 0.0, Vector3(0.46, 0.52, 0.46), Vector3(0.42, 0.42, 0.42), Vector3(0.0, 0.23, 0.0))
	_asset(FURNITURE + "lamp-table.glb", x, y + 0.48, z, 0.0, Vector3(0.28, 0.3, 0.28))


func _upstairs_sitting_room() -> void:
	_asset(FURNITURE + "table-medium-long.glb", 45.8, F1, 38.7, 0.0, Vector3(0.72, 0.74, 0.48), Vector3(1.95, 0.56, 0.85), Vector3(0.0, 0.36, 0.0))
	_asset(FURNITURE + "chair-a-wood.glb", 45.8, F1, 40.3, 0.0, Vector3(0.75, 0.76, 0.75), Vector3(0.52, 0.64, 0.48), Vector3(0.0, 0.33, 0.0))
	_asset(FURNITURE + "cabinet-medium-decorated.glb", 48.5, F1, 35.9, PI * 0.5, Vector3(0.5, 0.64, 0.45), Vector3(0.42, 0.98, 0.8), Vector3(0.0, 0.48, 0.0))
	_asset(FURNITURE + "book-set.glb", 45.8, F1 + 0.75, 38.7, 0.0, Vector3(0.44, 0.44, 0.44))
	_asset(FURNITURE + "armchair.glb", 42.1, F1, 39.2, -PI * 0.5, Vector3(0.48, 0.5, 0.48), Vector3(0.7, 0.46, 0.58), Vector3(0.0, 0.27, 0.0))


func _wall_art() -> void:
	# Generated lagoon painting remains a wall-mounted 3D material panel, not a furniture substitute.
	_art_panel(42.0, GF + 2.0, 34.07, 2.9, 1.6, 0.0)


func _art_panel(x: float, y: float, z: float, width: float, height: float, yaw: float) -> void:
	var facing := Basis(Vector3.UP, yaw)
	var center := W(x, y, z)
	var half_w := width * 0.5
	var half_h := height * 0.5
	var corners: Array[Vector3] = [
		center + facing * Vector3(-half_w, -half_h, 0.0),
		center + facing * Vector3(half_w, -half_h, 0.0),
		center + facing * Vector3(half_w, half_h, 0.0),
		center + facing * Vector3(-half_w, half_h, 0.0),
	]
	wb.batch("jag_house_art").add_quad(corners[0], corners[1], corners[2], corners[3], Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0), Color.WHITE, facing * Vector3.BACK)
	var frame_center := center + facing * Vector3(0.0, 0.0, 0.025)
	for side: float in [-1.0, 1.0]:
		var vertical := frame_center + facing * Vector3(side * (half_w + 0.07), 0.0, 0.0)
		wb.batch("interior_oak").add_box(vertical, Vector3(0.1, height + 0.18, 0.08), facing, Materials.uv_m("interior_oak"), Color(0.35, 0.23, 0.14), true, false)
	for side: float in [-1.0, 1.0]:
		var horizontal := frame_center + facing * Vector3(0.0, side * (half_h + 0.07), 0.0)
		wb.batch("interior_oak").add_box(horizontal, Vector3(width + 0.18, 0.1, 0.08), facing, Materials.uv_m("interior_oak"), Color(0.35, 0.23, 0.14), true, false)


func _box(material_name: String, x: float, y: float, z: float, size: Vector3, color: Color) -> void:
	wb.batch(material_name).add_box(W(x, y, z), size, Basis.IDENTITY, Materials.uv_m(material_name), color, true, false)


func _asset(path: String, x: float, y: float, z: float, yaw: float = 0.0, scale: Vector3 = Vector3.ONE,
		collision_size: Vector3 = Vector3.ZERO, collision_center: Vector3 = Vector3.ZERO) -> void:
	var rotation := Basis(Vector3.UP, yaw)
	var world_basis := rotation.scaled(scale)
	var name := "%s_%03d" % [path.get_file().get_basename(), wb.scene_assets.size()]
	wb.scene_assets.append({
		"path": path,
		"name": name,
		"transform": Transform3D(world_basis, W(x, y, z)),
	})
	if collision_size != Vector3.ZERO:
		var scaled_center := Vector3(collision_center.x * scale.x, collision_center.y * scale.y, collision_center.z * scale.z)
		var collider_transform := Transform3D(rotation, W(x, y, z) + rotation * scaled_center)
		var collider_size := Vector3(absf(collision_size.x * scale.x), absf(collision_size.y * scale.y), absf(collision_size.z * scale.z))
		wb.collision_boxes.append([collider_transform, collider_size])
