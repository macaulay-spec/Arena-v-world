class_name MansionInterior
extends RefCounted
## Real, walkable JAG House interior. The established room plan is unchanged; imported CC0 glTF
## furnishings are emitted as static MultiMeshes with simple walkable collision proxies.

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
	# Finished rugs are imported glTF props and are placed in _furnish(); no flat texture quads stand in for them.


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
	_partition_z(32.0, 16.2, 27.0, 22.0, 3.2, base, top, height) # wide living / study opening
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
	MansionFurniture.new(wb).build()


func _box(material_name: String, x: float, y: float, z: float, sx: float, sy: float, sz: float, color: Color = Color.WHITE, basis: Basis = Basis.IDENTITY, collide: bool = false) -> void:
	var size := Vector3(sx, sy, sz)
	var center := W(x, y, z)
	wb.batch(material_name).add_box(center, size, basis, Materials.uv_m(material_name), color, true, false)
	if collide:
		wb.collision_boxes.append([Transform3D(basis, center), size])
