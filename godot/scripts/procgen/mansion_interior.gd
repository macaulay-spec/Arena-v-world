class_name MansionInterior
extends RefCounted
## Real, walkable JAG House interior. The floorplate follows the established room plan; furniture is
## low-poly but proportioned as furniture, textured with generated materials, and batched by material.

const OX := MansionBuilder.OX
const OZ := MansionBuilder.OZ
const OY := MansionBuilder.OY
const GF := MansionBuilder.GF
const F1 := MansionBuilder.F1
const RF := MansionBuilder.RF

var wb: WorldBuilder


func _init(builder: WorldBuilder) -> void:
	wb = builder


func W(x: float, y: float, z: float) -> Vector3:
	return Vector3(x + OX, y + OY, z + OZ)


func build() -> void:
	_floors()
	_inner_shell()
	_ground_floor_partitions()
	_upper_floor_partitions()
	_stairs()
	_furnish()


func _floors() -> void:
	var floor := wb.batch("interior_floor")
	_floor_rect(floor, 16.2, 49.8, 20.2, 43.8, GF)
	_add_floor_collision(16.2, 49.8, 20.2, 43.8, GF)
	# First-floor slab is split around the real stairwell (31.4..34.6, z 37.2..42.4).
	_floor_rect(floor, 16.2, 49.8, 20.2, 37.2, F1)
	_floor_rect(floor, 16.2, 49.8, 42.4, 43.8, F1)
	_floor_rect(floor, 16.2, 31.4, 37.2, 42.4, F1)
	_floor_rect(floor, 34.6, 49.8, 37.2, 42.4, F1)
	_add_floor_collision(16.2, 49.8, 20.2, 37.2, F1)
	_add_floor_collision(16.2, 49.8, 42.4, 43.8, F1)
	_add_floor_collision(16.2, 31.4, 37.2, 42.4, F1)
	_add_floor_collision(34.6, 49.8, 37.2, 42.4, F1)
	# Finished ceilings are the underside of the floor/roof slabs; the stair opening stays open below.
	var ceiling := wb.batch("plaster_plain")
	_ceiling_rect(ceiling, 16.2, 49.8, 20.2, 37.2, F1 - 0.03)
	_ceiling_rect(ceiling, 16.2, 49.8, 42.4, 43.8, F1 - 0.03)
	_ceiling_rect(ceiling, 16.2, 31.4, 37.2, 42.4, F1 - 0.03)
	_ceiling_rect(ceiling, 34.6, 49.8, 37.2, 42.4, F1 - 0.03)
	_ceiling_rect(ceiling, 16.2, 49.8, 20.2, 43.8, RF - 0.04)
	# Small rugs soften the stone without cluttering routes through the rooms.
	_floor_rect(wb.batch("interior_fabric"), 17.0, 25.8, 34.2, 39.0, GF + 0.018, Color(0.86, 0.9, 0.84))
	_floor_rect(wb.batch("interior_fabric"), 31.0, 38.0, 22.8, 29.0, GF + 0.018, Color(0.74, 0.84, 0.72))
	_floor_rect(wb.batch("interior_fabric"), 40.0, 48.6, 36.0, 41.4, GF + 0.018, Color(0.9, 0.86, 0.76))
	_floor_rect(wb.batch("interior_fabric"), 18.2, 28.2, 27.6, 32.6, F1 + 0.018, Color(0.86, 0.88, 0.82))


func _floor_rect(batch: MeshBatch, x0: float, x1: float, z0: float, z1: float, y: float, col: Color = Color.WHITE) -> void:
	if x1 - x0 < 0.05 or z1 - z0 < 0.05:
		return
	batch.add_rect(W(x0, y, z1), W(x1, y, z1), W(x1, y, z0), W(x0, y, z0),
		Materials.uv_m("interior_floor"), Materials.uv_m("interior_floor"), col)


func _ceiling_rect(batch: MeshBatch, x0: float, x1: float, z0: float, z1: float, y: float) -> void:
	# Reverse the floor winding so the front faces downward into the room.
	batch.add_rect(W(x0, y, z0), W(x1, y, z0), W(x1, y, z1), W(x0, y, z1),
		Materials.uv_m("plaster_plain"), Materials.uv_m("plaster_plain"), Color(0.98, 0.97, 0.94))


func _add_floor_collision(x0: float, x1: float, z0: float, z1: float, top_y: float) -> void:
	var size := Vector3(x1 - x0, 0.2, z1 - z0)
	var center := W((x0 + x1) * 0.5, top_y - 0.1, (z0 + z1) * 0.5)
	wb.collision_boxes.append([Transform3D(Basis.IDENTITY, center), size])


func _inner_shell() -> void:
	var wall := wb.batch("plaster_plain")
	var y0 := GF - 0.45
	var y1 := RF - 0.2
	var south_open := [
		[17.0, 27.0, GF + 0.3, F1 - 0.3], [17.0, 27.0, F1 + 0.3, RF - 0.5],
		[40.0, 49.0, GF + 0.3, F1 - 0.3], [40.0, 49.0, F1 + 0.3, RF - 0.5],
		[31.2, 34.8, GF - 0.1, GF + 2.75],
	]
	var north_open := [
		[34.5, 47.5, GF + 0.2, F1 - 0.3], [18.0, 30.0, GF + 0.6, F1 - 0.4],
		[34.5, 47.5, F1 + 0.3, RF - 0.5],
	]
	var side_open := [
		[22.0, 30.0, GF + 0.9, F1 - 0.5], [35.0, 41.0, GF + 0.9, F1 - 0.5],
		[22.0, 30.0, F1 + 0.9, RF - 0.6], [35.0, 41.0, F1 + 0.9, RF - 0.6],
	]
	# Inner plaster face of each exterior wall. Openings line up with the real glazing and front door.
	_inner_facade(wall, 0, 16.0, 50.0, 43.82, y0, y1, south_open)
	_inner_facade(wall, 2, 16.0, 50.0, 20.18, y0, y1, north_open)
	_inner_facade(wall, 1, 20.0, 44.0, 49.82, y0, y1, side_open)
	_inner_facade(wall, 3, 20.0, 44.0, 16.18, y0, y1, side_open)
	# Discreet timber skirting around the rooms; breaks at the entrance and major windows are deliberate.
	var trim_y := GF + 0.08
	_box("interior_oak", 16.25, trim_y, 43.72, 15.0, 0.16, 0.07, Color(0.62, 0.46, 0.3))
	_box("interior_oak", 34.9, trim_y, 43.72, 14.7, 0.16, 0.07, Color(0.62, 0.46, 0.3))
	_box("interior_oak", 16.28, trim_y, 20.28, 33.8, 0.16, 0.07, Color(0.62, 0.46, 0.3))
	_box("interior_oak", 16.28, trim_y, 20.35, 0.07, 0.16, 23.4, Color(0.62, 0.46, 0.3))
	_box("interior_oak", 49.72, trim_y, 20.35, 0.07, 0.16, 23.4, Color(0.62, 0.46, 0.3))


func _inner_facade(batch: MeshBatch, face: int, a0: float, a1: float, fixed: float, y0: float, y1: float, openings: Array) -> void:
	var xs: Array[float] = [a0, a1]
	for opening in openings:
		xs.append(clampf(float(opening[0]), a0, a1))
		xs.append(clampf(float(opening[1]), a0, a1))
	xs.sort()
	for i in range(xs.size() - 1):
		var c0: float = xs[i]
		var c1: float = xs[i + 1]
		if c1 - c0 < 0.005:
			continue
		var mid := (c0 + c1) * 0.5
		var intervals: Array = []
		for opening in openings:
			if float(opening[0]) <= mid and float(opening[1]) >= mid:
				intervals.append([maxf(float(opening[2]), y0), minf(float(opening[3]), y1)])
		intervals.sort_custom(func(a, b): return a[0] < b[0])
		var y := y0
		for interval in intervals:
			if float(interval[0]) > y + 0.005:
				_inner_wall_piece(batch, face, c0, c1, fixed, y, float(interval[0]))
			y = maxf(y, float(interval[1]))
		if y1 > y + 0.005:
			_inner_wall_piece(batch, face, c0, c1, fixed, y, y1)


func _inner_wall_piece(batch: MeshBatch, face: int, c0: float, c1: float, fixed: float, y0: float, y1: float) -> void:
	var p0: Vector3
	var p1: Vector3
	var normal: Vector3
	match face:
		0: # south wall, faces north into the house
			p0 = W(c0, y0, fixed); p1 = W(c1, y0, fixed); normal = Vector3.FORWARD
		1: # east wall, faces west
			p0 = W(fixed, y0, c1); p1 = W(fixed, y0, c0); normal = Vector3.LEFT
		2: # north wall, faces south
			p0 = W(c1, y0, fixed); p1 = W(c0, y0, fixed); normal = Vector3.BACK
		_: # west wall, faces east
			p0 = W(fixed, y0, c0); p1 = W(fixed, y0, c1); normal = Vector3.RIGHT
	var up := Vector3(0, y1 - y0, 0)
	var u0 := c0 / 4.0
	var u1 := c1 / 4.0
	batch.add_quad(p0, p1, p1 + up, p0 + up, Vector2(u0, -y0 / 4.0), Vector2(u1, -y0 / 4.0),
		Vector2(u1, -y1 / 4.0), Vector2(u0, -y1 / 4.0), Color(0.98, 0.96, 0.91), normal)


func _ground_floor_partitions() -> void:
	var base := GF + 0.01
	var top := F1 - 0.17
	var height := 2.75
	# Room dividers follow the approved floor plan; door gaps keep the foyer and rooms connected.
	_partition_x(27.0, 32.0, 43.8, 38.2, 1.25, base, top, height) # living / hall
	_partition_x(39.0, 34.0, 43.8, 39.0, 1.25, base, top, height) # hall / dining
	_partition_x(39.0, 20.2, 34.0, 30.0, 1.25, base, top, height) # family / kitchen
	_partition_x(27.0, 20.2, 32.0, 26.0, 1.25, base, top, height) # study / family
	_partition_z(32.0, 16.2, 27.0, 22.0, 1.25, base, top, height) # living / study
	_partition_z(32.0, 27.0, 39.0, 33.0, 1.5, base, top, height) # hall / family
	_partition_z(34.0, 39.0, 49.8, 44.5, 1.25, base, top, height) # dining / kitchen


func _upper_floor_partitions() -> void:
	var base := F1 + 0.02
	var top := RF - 0.18
	var height := 2.7
	# The master suite occupies the west wing; an open landing and stairwell connect the floor.
	_partition_x(30.2, 27.0, 43.8, 36.8, 1.25, base, top, height)
	_partition_z(34.0, 16.2, 30.2, 24.0, 1.3, base, top, height)
	_partition_x(39.5, 20.2, 31.5, 25.0, 1.2, base, top, height)
	_partition_z(31.8, 39.5, 49.8, 44.5, 1.2, base, top, height)


func _partition_x(x: float, z0: float, z1: float, door_center: float, door_width: float, bottom: float, top: float, door_height: float) -> void:
	var lo := door_center - door_width * 0.5
	var hi := door_center + door_width * 0.5
	var th := 0.14
	if lo > z0 + 0.05:
		_wall_box(Vector3(x, (bottom + top) * 0.5, (z0 + lo) * 0.5), Vector3(th, top - bottom, lo - z0))
	if z1 > hi + 0.05:
		_wall_box(Vector3(x, (bottom + top) * 0.5, (hi + z1) * 0.5), Vector3(th, top - bottom, z1 - hi))
	if top > bottom + door_height:
		_wall_box(Vector3(x, (bottom + door_height + top) * 0.5, door_center), Vector3(th, top - bottom - door_height, door_width))


func _partition_z(z: float, x0: float, x1: float, door_center: float, door_width: float, bottom: float, top: float, door_height: float) -> void:
	var lo := door_center - door_width * 0.5
	var hi := door_center + door_width * 0.5
	var th := 0.14
	if lo > x0 + 0.05:
		_wall_box(Vector3((x0 + lo) * 0.5, (bottom + top) * 0.5, z), Vector3(lo - x0, top - bottom, th))
	if x1 > hi + 0.05:
		_wall_box(Vector3((hi + x1) * 0.5, (bottom + top) * 0.5, z), Vector3(x1 - hi, top - bottom, th))
	if top > bottom + door_height:
		_wall_box(Vector3(door_center, (bottom + door_height + top) * 0.5, z), Vector3(door_width, top - bottom - door_height, th))


func _wall_box(center: Vector3, size: Vector3) -> void:
	var basis := Basis.IDENTITY
	wb.batch("plaster_plain").add_box(W(center.x, center.y, center.z), size, basis, 3.0, Color(0.96, 0.94, 0.89), true, false)
	wb.collision_boxes.append([Transform3D(basis, W(center.x, center.y, center.z)), size])


func _stairs() -> void:
	var stair := wb.batch("interior_floor")
	var steps := 18
	var tread := 0.28
	var rise := (F1 - GF) / float(steps)
	var start_z := 42.2
	for i in range(steps):
		var y_top := GF + rise * float(i + 1)
		var z_center := start_z - (float(i) + 0.5) * tread
		var size := Vector3(2.4, y_top - GF, tread)
		var center := W(33.0, (GF + y_top) * 0.5, z_center)
		stair.add_box(center, size, Basis.IDENTITY, 3.0, Color(0.94, 0.91, 0.84), true, false)
		wb.collision_boxes.append([Transform3D(Basis.IDENTITY, center), size])
	# Timber handrails rise with the flight; posts and rails are decorative and do not obstruct the steps.
	var rail_basis := Basis(Vector3.RIGHT, atan2(F1 - GF, start_z - (start_z - steps * tread)))
	var rail_len := sqrt(pow(F1 - GF, 2.0) + pow(float(steps) * tread, 2.0))
	var wood := wb.batch("interior_oak")
	for side: float in [-1.0, 1.0]:
		var x := 33.0 + side * 1.42
		var rail_center := W(x, (GF + F1) * 0.5 + 0.78, start_z - float(steps) * tread * 0.5)
		wood.add_box(rail_center, Vector3(0.09, 0.09, rail_len), rail_basis, 1.5, Color(0.62, 0.43, 0.26), true, true)
		for i in range(0, steps + 1, 3):
			var p := W(x, GF + rise * float(i) + 0.45, start_z - float(i) * tread)
			wood.add_box(p, Vector3(0.06, 0.85, 0.06), Basis.IDENTITY, 1.0, Color(0.62, 0.43, 0.26), false, false)


func _furnish() -> void:
	_living_room()
	_dining_room()
	_kitchen()
	_family_lounge()
	_study()
	_master_suite()
	_upstairs_guest_bedroom()
	_upstairs_east_suite()
	_upstairs_sitting_room()
	_entry_hall()
	_wall_art()


func _living_room() -> void:
	_sofa(21.5, 38.2, 3.1, 0.98)
	_coffee_table(21.5, 35.9, 1.5, 0.82)
	# media console and screen on the north partition
	_box("interior_oak", 21.5, GF + 0.42, 32.55, 3.4, 0.72, 0.52, Color(0.76, 0.65, 0.5), Basis(Vector3.UP, 0.0), true)
	_box("metal_dark", 21.5, GF + 1.55, 32.25, 2.35, 1.32, 0.1, Color(0.12, 0.13, 0.14))
	_box("jag_house_art", 21.5, GF + 1.55, 32.18, 2.18, 1.15, 0.035, Color.WHITE)
	# end table and lamp
	_box("interior_oak", 18.2, GF + 0.38, 39.4, 0.58, 0.65, 0.58, Color(0.68, 0.52, 0.35), Basis.IDENTITY, true)
	_cylinder("metal_dark", 18.2, GF + 0.78, 39.4, 0.045, 0.045, 0.55, Color(0.72, 0.55, 0.3))
	_cylinder("interior_fabric", 18.2, GF + 1.17, 39.4, 0.28, 0.1, 0.38, Color(0.92, 0.8, 0.58))


func _dining_room() -> void:
	# Six seats, timber frame, padded seats and one broad family table.
	_box("interior_oak", 44.5, GF + 0.82, 39.1, 3.2, 0.16, 1.35, Color(0.8, 0.69, 0.53), Basis.IDENTITY, true)
	for x: float in [43.2, 45.8]:
		for z: float in [38.5, 39.7]:
			_box("interior_oak", x, GF + 0.39, z, 0.11, 0.78, 0.11, Color(0.31, 0.2, 0.12))
	for x: float in [42.5, 44.5, 46.5]:
		_chair(x, 37.95, 0.0)
		_chair(x, 40.25, PI)
	# sideboard against the east wall
	_box("interior_oak", 48.7, GF + 0.5, 37.0, 0.6, 0.9, 3.0, Color(0.64, 0.44, 0.28), Basis.IDENTITY, true)
	for i in range(3):
		_box("metal_dark", 48.37, GF + 0.55, 36.2 + float(i) * 0.72, 0.045, 0.09, 0.045, Color(0.64, 0.47, 0.26))


func _kitchen() -> void:
	# Full-height pantry + lower/upper cabinets, stone worktops, sink and induction hob.
	_box("interior_oak", 48.8, GF + 0.48, 26.7, 0.72, 0.9, 12.0, Color(0.76, 0.64, 0.48), Basis.IDENTITY, true)
	_box("interior_floor", 48.3, GF + 0.98, 26.7, 0.92, 0.12, 12.0, Color(0.92, 0.89, 0.81))
	_box("interior_oak", 48.6, GF + 2.0, 26.7, 0.62, 0.82, 10.5, Color(0.65, 0.48, 0.32), Basis.IDENTITY, true)
	for z: float in [22.0, 24.2, 26.4, 28.6, 30.8, 33.0]:
		_box("metal_dark", 48.18, GF + 0.55, z, 0.04, 0.1, 0.04, Color(0.68, 0.52, 0.29))
	# island, stone counter, sink and hob
	_box("interior_oak", 43.5, GF + 0.48, 28.2, 3.9, 0.9, 1.05, Color(0.73, 0.57, 0.4), Basis.IDENTITY, true)
	_box("interior_floor", 43.5, GF + 0.98, 28.2, 4.05, 0.12, 1.17, Color(0.94, 0.91, 0.84))
	_box("metal_dark", 42.6, GF + 1.06, 28.05, 0.72, 0.055, 0.56, Color(0.12, 0.13, 0.14))
	_box("mansion_glass", 44.7, GF + 1.05, 28.35, 0.66, 0.04, 0.46, Color(0.55, 0.65, 0.69))
	# three bar stools on the living-room side of the island
	for z: float in [27.1, 28.25, 29.4]:
		_box("interior_oak", 40.9, GF + 0.62, z, 0.48, 0.14, 0.48, Color(0.66, 0.47, 0.28))
		_box("interior_oak", 40.9, GF + 0.3, z, 0.08, 0.62, 0.08, Color(0.3, 0.2, 0.12))
	# refrigerator and built-in oven on the north/east side
	_box("metal_dark", 46.1, GF + 1.15, 21.8, 1.5, 2.25, 0.95, Color(0.52, 0.56, 0.58), Basis.IDENTITY, true)
	_box("mansion_glass", 46.1, GF + 1.15, 21.28, 1.1, 1.8, 0.035, Color(0.26, 0.34, 0.38))
	_box("metal_dark", 47.8, GF + 0.92, 21.8, 0.68, 1.25, 0.72, Color(0.13, 0.14, 0.15))


func _family_lounge() -> void:
	_sofa(34.5, 25.4, 2.7, 0.9)
	_coffee_table(34.5, 22.8, 1.25, 0.7)
	_box("interior_oak", 37.75, GF + 0.45, 26.0, 0.38, 0.8, 2.1, Color(0.59, 0.4, 0.25), Basis.IDENTITY, true)
	_box("jag_house_art", 37.52, GF + 1.63, 26.0, 0.04, 1.15, 1.75, Color.WHITE)


func _study() -> void:
	# desk, task chair and bookshelf (book spines are separate coloured low-poly volumes)
	_box("interior_oak", 22.0, GF + 0.79, 22.2, 3.4, 0.16, 1.25, Color(0.67, 0.47, 0.3), Basis.IDENTITY, true)
	for x: float in [20.6, 23.4]:
		_box("interior_oak", x, GF + 0.38, 22.2, 0.12, 0.76, 0.12, Color(0.3, 0.2, 0.12))
	_box("interior_fabric", 22.0, GF + 0.52, 24.1, 0.72, 0.14, 0.72, Color(0.75, 0.83, 0.72))
	_box("interior_oak", 22.0, GF + 1.0, 24.45, 0.76, 0.95, 0.14, Color(0.42, 0.29, 0.18))
	_box("interior_oak", 17.1, GF + 1.3, 24.0, 0.54, 2.55, 6.2, Color(0.59, 0.41, 0.27), Basis.IDENTITY, true)
	for i in range(18):
		var x := 16.86
		var z := 21.2 + float(i % 6) * 0.91
		var y := GF + 0.44 + float(i / 6) * 0.71
		var palette: Array[Color] = [Color(0.48, 0.22, 0.17), Color(0.2, 0.32, 0.38), Color(0.62, 0.45, 0.26), Color(0.25, 0.36, 0.25)]
		_box("interior_fabric", x, y, z, 0.14, 0.54, 0.68, palette[i % palette.size()])


func _master_suite() -> void:
	# king bed with headboard, layered linen, pillows and matching nightstands
	_box("interior_oak", 22.8, F1 + 0.28, 30.1, 2.9, 0.48, 2.45, Color(0.34, 0.23, 0.16), Basis.IDENTITY, true)
	_box("interior_fabric", 22.8, F1 + 0.58, 30.0, 2.7, 0.25, 2.28, Color(0.83, 0.84, 0.79))
	_box("interior_fabric", 22.8, F1 + 0.74, 30.45, 2.55, 0.16, 1.25, Color(0.26, 0.36, 0.28))
	for x: float in [21.85, 23.75]:
		_box("interior_fabric", x, F1 + 0.81, 28.45, 0.78, 0.18, 0.48, Color(0.9, 0.87, 0.79))
	_box("interior_oak", 22.8, F1 + 1.15, 27.05, 3.3, 1.0, 0.2, Color(0.44, 0.3, 0.21), Basis.IDENTITY, true)
	for x: float in [20.4, 25.2]:
		_box("interior_oak", x, F1 + 0.45, 29.0, 0.72, 0.8, 0.72, Color(0.68, 0.49, 0.32), Basis.IDENTITY, true)
		_box("interior_floor", x, F1 + 0.87, 29.0, 0.78, 0.08, 0.78, Color(0.86, 0.79, 0.66))
		_cylinder("metal_dark", x, F1 + 1.12, 29.0, 0.04, 0.04, 0.34, Color(0.7, 0.52, 0.29))
		_cylinder("interior_fabric", x, F1 + 1.43, 29.0, 0.22, 0.1, 0.3, Color(0.9, 0.75, 0.48))
	# wardrobe on the west wall
	_box("interior_oak", 17.5, F1 + 1.3, 30.7, 1.05, 2.5, 4.4, Color(0.56, 0.39, 0.25), Basis.IDENTITY, true)
	for z: float in [29.4, 31.8]:
		_box("metal_dark", 16.94, F1 + 1.3, z, 0.05, 0.28, 0.05, Color(0.68, 0.52, 0.29))


func _upstairs_guest_bedroom() -> void:
	# A second fully furnished bedroom opens from the landing, rather than ending at an empty box.
	_box("interior_oak", 22.5, F1 + 0.27, 38.6, 2.55, 0.46, 2.65, Color(0.4, 0.27, 0.18), Basis.IDENTITY, true)
	_box("interior_fabric", 22.5, F1 + 0.56, 38.55, 2.42, 0.23, 2.48, Color(0.87, 0.86, 0.8))
	_box("interior_fabric", 22.5, F1 + 0.71, 39.05, 2.3, 0.13, 1.35, Color(0.28, 0.38, 0.3))
	for x: float in [21.65, 23.35]:
		_box("interior_fabric", x, F1 + 0.78, 37.25, 0.72, 0.16, 0.48, Color(0.92, 0.88, 0.8))
	_box("interior_oak", 22.5, F1 + 1.0, 37.0, 2.85, 0.92, 0.18, Color(0.47, 0.32, 0.21), Basis.IDENTITY, true)
	for x: float in [19.5, 25.5]:
		_box("interior_oak", x, F1 + 0.43, 37.2, 0.68, 0.76, 0.68, Color(0.66, 0.47, 0.3), Basis.IDENTITY, true)
		_box("interior_floor", x, F1 + 0.83, 37.2, 0.72, 0.08, 0.72, Color(0.87, 0.8, 0.68))
		_cylinder("metal_dark", x, F1 + 1.08, 37.2, 0.035, 0.035, 0.3, Color(0.72, 0.53, 0.3))
		_cylinder("interior_fabric", x, F1 + 1.36, 37.2, 0.2, 0.1, 0.26, Color(0.92, 0.76, 0.5))
	_box("interior_oak", 28.8, F1 + 0.72, 40.4, 1.0, 1.2, 2.4, Color(0.59, 0.41, 0.27), Basis.IDENTITY, true)


func _upstairs_east_suite() -> void:
	# East-wing guest room with a view to the North Heights greenery through the tall glazing.
	_box("interior_oak", 44.0, F1 + 0.27, 25.8, 2.5, 0.46, 2.5, Color(0.4, 0.27, 0.18), Basis.IDENTITY, true)
	_box("interior_fabric", 44.0, F1 + 0.56, 25.8, 2.38, 0.23, 2.34, Color(0.89, 0.87, 0.8))
	_box("interior_fabric", 44.0, F1 + 0.71, 25.35, 2.24, 0.13, 1.25, Color(0.24, 0.34, 0.29))
	for x: float in [43.15, 44.85]:
		_box("interior_fabric", x, F1 + 0.78, 27.0, 0.7, 0.16, 0.45, Color(0.92, 0.88, 0.8))
	_box("interior_oak", 44.0, F1 + 1.0, 27.25, 2.8, 0.92, 0.18, Color(0.46, 0.31, 0.2), Basis.IDENTITY, true)
	for x: float in [41.3, 46.7]:
		_box("interior_oak", x, F1 + 0.43, 27.2, 0.66, 0.76, 0.66, Color(0.66, 0.47, 0.3), Basis.IDENTITY, true)
		_box("interior_floor", x, F1 + 0.83, 27.2, 0.7, 0.08, 0.7, Color(0.87, 0.8, 0.68))
		_cylinder("metal_dark", x, F1 + 1.08, 27.2, 0.035, 0.035, 0.3, Color(0.72, 0.53, 0.3))
		_cylinder("interior_fabric", x, F1 + 1.36, 27.2, 0.2, 0.1, 0.26, Color(0.92, 0.76, 0.5))
	_box("interior_oak", 48.2, F1 + 0.84, 29.5, 0.8, 1.45, 2.4, Color(0.58, 0.4, 0.26), Basis.IDENTITY, true)


func _upstairs_sitting_room() -> void:
	# Quiet reading room in the east wing: a real desk, chair and book storage around the landing door.
	_box("interior_oak", 45.8, F1 + 0.79, 38.7, 2.7, 0.16, 1.05, Color(0.64, 0.45, 0.29), Basis.IDENTITY, true)
	for x: float in [44.7, 46.9]:
		_box("interior_oak", x, F1 + 0.38, 38.7, 0.1, 0.76, 0.1, Color(0.31, 0.21, 0.14))
	_box("interior_fabric", 45.8, F1 + 0.5, 40.25, 0.72, 0.14, 0.72, Color(0.71, 0.8, 0.71))
	_box("interior_oak", 45.8, F1 + 0.94, 40.55, 0.76, 0.9, 0.14, Color(0.42, 0.29, 0.19))
	_box("interior_oak", 48.5, F1 + 1.05, 36.0, 0.55, 2.0, 3.6, Color(0.57, 0.39, 0.25), Basis.IDENTITY, true)
	for i in range(9):
		var z := 34.6 + float(i % 3) * 1.0
		var y := F1 + 0.52 + float(i / 3) * 0.55
		var palette: Array[Color] = [Color(0.48, 0.23, 0.17), Color(0.23, 0.35, 0.38), Color(0.62, 0.45, 0.26)]
		_box("interior_fabric", 48.19, y, z, 0.16, 0.38, 0.76, palette[i % palette.size()])


func _entry_hall() -> void:
	# console, mirror and a low bench immediately inside the front doors
	_box("interior_oak", 37.1, GF + 0.55, 39.3, 0.78, 1.0, 2.2, Color(0.67, 0.48, 0.31), Basis.IDENTITY, true)
	_box("interior_oak", 33.0, GF + 0.32, 35.2, 2.0, 0.22, 0.52, Color(0.48, 0.33, 0.23), Basis.IDENTITY, true)
	_box("mansion_glass", 33.0, GF + 1.85, 32.16, 1.55, 1.45, 0.04, Color(0.55, 0.64, 0.66))


func _wall_art() -> void:
	# The generated lagoon canvas is a textured 3D panel, not a flat scene backdrop.
	var art := wb.batch("jag_house_art")
	var z := 34.08
	var x0 := 40.2
	var x1 := 43.3
	var y0 := GF + 1.15
	var y1 := GF + 2.9
	art.add_quad(W(x0, y0, z), W(x1, y0, z), W(x1, y1, z), W(x0, y1, z),
		Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0), Color.WHITE, Vector3.BACK)
	for x: float in [x0 - 0.08, x1 + 0.08]:
		_box("interior_oak", x, (y0 + y1) * 0.5, z + 0.025, 0.12, y1 - y0 + 0.24, 0.08, Color(0.35, 0.23, 0.14))
	for y: float in [y0 - 0.08, y1 + 0.08]:
		_box("interior_oak", (x0 + x1) * 0.5, y, z + 0.025, x1 - x0 + 0.24, 0.12, 0.08, Color(0.35, 0.23, 0.14))


func _sofa(x: float, z: float, width: float, depth: float) -> void:
	_box("interior_oak", x, GF + 0.23, z, width, 0.28, depth, Color(0.34, 0.23, 0.15), Basis.IDENTITY, true)
	_box("interior_fabric", x, GF + 0.47, z - 0.03, width - 0.18, 0.24, depth - 0.2, Color(0.86, 0.86, 0.79))
	_box("interior_fabric", x, GF + 0.89, z + depth * 0.36, width - 0.18, 0.78, 0.24, Color(0.79, 0.84, 0.75))
	for side: float in [-1.0, 1.0]:
		_box("interior_fabric", x + side * (width * 0.5 - 0.1), GF + 0.57, z, 0.22, 0.62, depth, Color(0.75, 0.81, 0.72))
	for i in range(3):
		var seat_x := x - width * 0.31 + float(i) * width * 0.31
		_box("interior_fabric", seat_x, GF + 0.61, z - 0.07, width * 0.27, 0.14, depth * 0.54, Color(0.9, 0.89, 0.83))
	for side: float in [-1.0, 1.0]:
		_box("interior_fabric", x + side * 0.55, GF + 0.98, z + depth * 0.25, 0.48, 0.45, 0.2, Color(0.78, 0.62, 0.42), Basis(Vector3.UP, side * 0.12))


func _coffee_table(x: float, z: float, width: float, depth: float) -> void:
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			_box("interior_oak", x + sx * (width * 0.42), GF + 0.22, z + sz * (depth * 0.4), 0.1, 0.42, 0.1, Color(0.34, 0.22, 0.14))
	_box("interior_oak", x, GF + 0.46, z, width, 0.12, depth, Color(0.73, 0.57, 0.39), Basis.IDENTITY, true)
	_box("mansion_glass", x, GF + 0.54, z, width - 0.18, 0.035, depth - 0.16, Color(0.65, 0.78, 0.81))


func _chair(x: float, z: float, yaw: float) -> void:
	var basis := Basis(Vector3.UP, yaw)
	_box("interior_oak", x, GF + 0.42, z, 0.78, 0.12, 0.76, Color(0.65, 0.46, 0.29), basis, true)
	_box("interior_fabric", x, GF + 0.51, z, 0.66, 0.12, 0.64, Color(0.77, 0.82, 0.73), basis)
	var back_center := Vector3(x, GF + 0.91, z) + basis * Vector3(0, 0, 0.31)
	_box("interior_oak", back_center.x, back_center.y, back_center.z, 0.76, 0.82, 0.12, Color(0.58, 0.39, 0.24), basis)
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			var off := basis * Vector3(sx * 0.29, 0, sz * 0.26)
			_box("interior_oak", x + off.x, GF + 0.2, z + off.z, 0.09, 0.4, 0.09, Color(0.35, 0.23, 0.15), basis)


func _box(material_name: String, x: float, y: float, z: float, sx: float, sy: float, sz: float, color: Color = Color.WHITE, basis: Basis = Basis.IDENTITY, collide: bool = false) -> void:
	var size := Vector3(sx, sy, sz)
	var center := W(x, y, z)
	wb.batch(material_name).add_box(center, size, basis, Materials.uv_m(material_name), color, true, false)
	if collide:
		wb.collision_boxes.append([Transform3D(basis, center), size])


func _cylinder(material_name: String, x: float, y: float, z: float, radius_bottom: float, radius_top: float, height: float, color: Color) -> void:
	wb.batch(material_name).add_cylinder(W(x, y - height * 0.5, z), radius_bottom, radius_top, height, 10, Materials.uv_m(material_name), color)
