class_name MansionBuilder
extends RefCounted
## JAG House exterior (S0): compound wall + gate, the two-storey villa with glass fronts, entrance
## canopy, pool deck, fountain drive, carport, staff quarters, hedges and palms — on the real plateau
## of landmark L-jag-house (local frame: X = x + 374.1, Z = z + 411.9, Y = y − 22.1; Z = 76 is the street).

const OX := -374.1
const OZ := -411.9
const OY := 22.1
const GF := 0.45
const F1 := 3.85
const RF := 7.25

var wb: WorldBuilder
var palms: Array = []        # local XZ positions for palms (billboards)
var lights: Array = []       # world positions for night bollard lights
var car_slots: Array = []    # {pos, yaw, kind}


func _init(builder: WorldBuilder) -> void:
	wb = builder


func W(x: float, y: float, z: float) -> Vector3:
	return Vector3(x + OX, y + OY, z + OZ)


func build() -> void:
	_compound_wall()
	_house()
	_grounds()
	_staff_quarters()


# -------------------------------------------------------------- compound
func _compound_wall() -> void:
	var wall := wb.batch("compound_wall")
	var h := 2.6
	var t := 0.3
	var x0 := 0.6
	var x1 := 65.4
	var z0 := 0.6
	var z1 := 75.4
	var gate_a := 23.5
	var gate_b := 30.5
	var segs := [
		[Vector2(x0, z0), Vector2(x1, z0)],
		[Vector2(x1, z0), Vector2(x1, z1)],
		[Vector2(x0, z1), Vector2(x0, z0)],
		[Vector2(x1, z1), Vector2(gate_b + 0.5, z1)],
		[Vector2(gate_a - 0.5, z1), Vector2(x0, z1)],
	]
	for s in segs:
		var a: Vector2 = s[0]
		var b: Vector2 = s[1]
		var mid := (a + b) * 0.5
		var len := a.distance_to(b)
		var yaw := atan2((b - a).y, (b - a).x)
		var basis := Basis(Vector3.UP, -yaw)
		wall.add_box(W(mid.x, h * 0.5, mid.y), Vector3(len, h, t), basis, 4.0, Color(0.96, 0.94, 0.88), true, false)
		# coping
		wb.batch("concrete").add_box(W(mid.x, h + 0.06, mid.y), Vector3(len, 0.12, t + 0.16), basis, 2.0, Color(0.85, 0.85, 0.82), true, true)
		wb.collision_boxes.append([Transform3D(basis, W(mid.x, h * 0.5, mid.y)), Vector3(len, h, t)])
	# gate piers + open steel gate leaves
	var stone := wb.batch("stone")
	for gx: float in [gate_a - 0.5, gate_b + 0.5]:
		stone.add_box(W(gx, 1.6, z1), Vector3(0.7, 3.2, 0.7), Basis.IDENTITY, 2.0, Color.WHITE, true, false)
		wb.collision_boxes.append([Transform3D(Basis.IDENTITY, W(gx, 1.6, z1)), Vector3(0.7, 3.2, 0.7)])
		wb.batch("lamp_glow").add_box(W(gx, 3.35, z1), Vector3(0.3, 0.3, 0.3), Basis.IDENTITY, 1.0, Color.WHITE, true, false)
	var metal := wb.batch("metal_dark")
	var leaf := (gate_b - gate_a) * 0.5 - 0.1
	for side: float in [-1.0, 1.0]:
		var hinge := Vector2(gate_a if side < 0 else gate_b, z1)
		var ang := -1.25 * side  # swung inward
		var dir := Vector2(cos(ang), sin(ang)) * side
		var end := hinge + dir * leaf
		var mid := (hinge + end) * 0.5
		var basis := Basis(Vector3.UP, -atan2(dir.y, dir.x))
		# bars: frame + vertical bars approximated by a thin box with a slatted colour
		metal.add_box(W(mid.x, 1.2, mid.y), Vector3(leaf, 2.2, 0.06), basis, 1.0, Color(0.1, 0.1, 0.11), true, true)
		wb.collision_boxes.append([Transform3D(basis, W(mid.x, 1.2, mid.y)), Vector3(leaf, 2.2, 0.1)])
	# hedge line inside the wall
	var hedge := wb.batch("grass")
	for s in segs:
		var a: Vector2 = s[0]
		var b: Vector2 = s[1]
		var mid := (a + b) * 0.5
		var n := ((b - a).normalized())
		var inward := Vector2(-n.y, n.x)
		var centre := Vector2(33.0, 38.0)
		if inward.dot(centre - mid) < 0.0:
			inward = -inward
		var hm := mid + inward * 0.75
		var basis := Basis(Vector3.UP, -atan2(n.y, n.x))
		hedge.add_box(W(hm.x, 0.45, hm.y), Vector3(a.distance_to(b) - 1.2, 0.9, 0.8), basis, 1.0, Color(0.45, 0.62, 0.3), true, false)


# -------------------------------------------------------------- house
func _house() -> void:
	var wall := wb.batch("mansion_wall")
	var glass := wb.batch("mansion_glass")
	var stone := wb.batch("stone")
	var slab := wb.batch("concrete")
	var x0 := 16.0
	var x1 := 50.0
	var z0 := 20.0
	var z1 := 44.0
	var h_top := RF + 0.6   # parapet top
	# main volume (two floors)
	_box(wall, x0, x1, z0, z1, GF - 0.5, RF, Color(0.97, 0.96, 0.93), true)
	# roof slab + parapet
	slab.add_rect(W(x0, RF + 0.02, z1), W(x1, RF + 0.02, z1), W(x1, RF + 0.02, z0), W(x0, RF + 0.02, z0), 4.0, 4.0, Color(0.8, 0.8, 0.78))
	_parapet(wall, x0, x1, z0, z1, RF, 0.6)
	# roof terrace penthouse / stair bulkhead
	_box(wall, 26.85, 30.15, 32.5, 39.5, RF, RF + 3.0, Color(0.97, 0.96, 0.93), true)
	slab.add_rect(W(26.85, RF + 3.02, 39.5), W(30.15, RF + 3.02, 39.5), W(30.15, RF + 3.02, 32.5), W(26.85, RF + 3.02, 32.5), 4.0, 4.0, Color(0.8, 0.8, 0.78))
	# stone-clad entrance tower, proud of the facade
	_box(stone, 29.0, 37.0, z1 - 0.1, z1 + 0.5, GF - 0.5, h_top + 0.4, Color(0.9, 0.86, 0.8), true)
	# glass: south facade (street side, z1), two floors
	var zs := z1 + 0.03
	for band: Array in [[17.0, 27.0], [40.0, 49.0]]:
		_glass_quad(glass, band[0], band[1], zs, GF + 0.3, F1 - 0.3, 0)   # ground floor
		_glass_quad(glass, band[0], band[1], zs, F1 + 0.3, RF - 0.5, 0)   # first floor
	# entrance: double door recessed into the stone tower
	var wood := wb.batch("wood")
	wood.add_quad(W(31.4, GF, z1 + 0.52), W(34.6, GF, z1 + 0.52), W(34.6, GF + 2.7, z1 + 0.52), W(31.4, GF + 2.7, z1 + 0.52),
		Vector2(0, 1), Vector2(1.6, 1), Vector2(1.6, 0), Vector2(0, 0), Color(0.5, 0.35, 0.22))
	_glass_quad(glass, 30.0, 36.0, z1 + 0.52, F1 + 0.4, RF - 0.4, 0)     # tower window
	# canopy over the entrance on two columns
	slab.add_box(W(33.0, 3.55, z1 + 2.4), Vector3(9.0, 0.3, 4.4), Basis.IDENTITY, 4.0, Color(0.9, 0.9, 0.88), true, true)
	for cx: float in [29.4, 36.6]:
		stone.add_box(W(cx, 1.85, z1 + 4.2), Vector3(0.45, 3.4, 0.45), Basis.IDENTITY, 2.0, Color.WHITE, false, false)
		wb.collision_boxes.append([Transform3D(Basis.IDENTITY, W(cx, 1.85, z1 + 4.2)), Vector3(0.45, 3.4, 0.45)])
	# entrance steps + porch
	for i in range(3):
		var depth := 4.6 - i * 0.4
		slab.add_box(W(33.0, GF - 0.15 * (i + 1) + 0.075, z1 + 2.4 + i * 0.2), Vector3(9.0 - i * 0.4, 0.15, depth), Basis.IDENTITY, 2.0, Color(0.88, 0.86, 0.82), true, false)
	wb.collision_boxes.append([Transform3D(Basis.IDENTITY, W(33.0, GF - 0.3, z1 + 2.4)), Vector3(9.0, 0.6, 4.8)])
	# first-floor balcony over the living room, glass balustrade
	slab.add_box(W(22.0, F1 - 0.1, z1 + 1.0), Vector3(10.0, 0.25, 2.0), Basis.IDENTITY, 4.0, Color(0.9, 0.9, 0.88), true, true)
	glass.add_quad(W(17.0, F1, z1 + 1.98), W(27.0, F1, z1 + 1.98), W(27.0, F1 + 1.1, z1 + 1.98), W(17.0, F1 + 1.1, z1 + 1.98),
		Vector2(0, 0.3), Vector2(2.5, 0.3), Vector2(2.5, 0), Vector2(0, 0), Color(0.75, 0.85, 0.9))
	# north (pool) facade: full-height glass to the terrace
	_glass_quad(glass, 34.5, 47.5, z0 - 0.03, GF + 0.2, F1 - 0.3, 2)
	_glass_quad(glass, 18.0, 30.0, z0 - 0.03, GF + 0.6, F1 - 0.4, 2)
	_glass_quad(glass, 34.5, 47.5, z0 - 0.03, F1 + 0.3, RF - 0.5, 2)
	# east / west windows
	for yy: Array in [[GF + 0.9, F1 - 0.5], [F1 + 0.9, RF - 0.6]]:
		_glass_quad(glass, 22.0, 30.0, x1 + 0.03, yy[0], yy[1], 1)
		_glass_quad(glass, 35.0, 41.0, x1 + 0.03, yy[0], yy[1], 1)
		_glass_quad(glass, 22.0, 30.0, x0 - 0.03, yy[0], yy[1], 3)
		_glass_quad(glass, 35.0, 41.0, x0 - 0.03, yy[0], yy[1], 3)
	# pool terrace + pool
	var pav := wb.batch("pavers")
	pav.add_rect(W(31.0, 0.06, 20.0), W(51.0, 0.06, 20.0), W(51.0, 0.06, 2.5), W(31.0, 0.06, 2.5), 2.0, 2.0, Color(0.95, 0.93, 0.9))
	var water := wb.batch("water")
	water.add_rect(W(34.0, -0.35, 13.0), W(48.0, -0.35, 13.0), W(48.0, -0.35, 5.0), W(34.0, -0.35, 5.0), 4.0, 4.0, Color(0.6, 0.9, 1.0))
	_pool_walls(34.0, 48.0, 5.0, 13.0)
	# sun loungers (simple slabs) so the terrace is not empty
	for lx: float in [36.0, 39.0, 42.0]:
		wood.add_box(W(lx, 0.3, 16.0), Vector3(0.8, 0.12, 2.0), Basis.IDENTITY, 1.0, Color(0.9, 0.85, 0.75), true, false)
		wood.add_box(W(lx, 0.25, 16.0), Vector3(0.1, 0.4, 0.1), Basis.IDENTITY, 1.0, Color(0.7, 0.6, 0.5), true, false)
	for p in [[32.5, 4.0], [49.5, 4.0], [32.5, 14.5], [49.5, 14.5]]:
		palms.append(p)


func _pool_walls(x0: float, x1: float, z0: float, z1: float) -> void:
	var tile := wb.batch("pavers")
	var d := 0.45
	var c := Color(0.8, 0.95, 1.0)
	tile.add_quad(W(x0, 0.06, z0), W(x1, 0.06, z0), W(x1, -d, z0), W(x0, -d, z0), Vector2(0, 0), Vector2(7, 0), Vector2(7, 0.25), Vector2(0, 0.25), c)
	tile.add_quad(W(x1, 0.06, z1), W(x0, 0.06, z1), W(x0, -d, z1), W(x1, -d, z1), Vector2(0, 0), Vector2(7, 0), Vector2(7, 0.25), Vector2(0, 0.25), c)
	tile.add_quad(W(x0, 0.06, z1), W(x0, 0.06, z0), W(x0, -d, z0), W(x0, -d, z1), Vector2(0, 0), Vector2(4, 0), Vector2(4, 0.25), Vector2(0, 0.25), c)
	tile.add_quad(W(x1, 0.06, z0), W(x1, 0.06, z1), W(x1, -d, z1), W(x1, -d, z0), Vector2(0, 0), Vector2(4, 0), Vector2(4, 0.25), Vector2(0, 0.25), c)
	wb.collision_boxes.append([Transform3D(Basis.IDENTITY, W((x0 + x1) * 0.5, -0.3, (z0 + z1) * 0.5)), Vector3(x1 - x0, 0.2, z1 - z0)])


func _glass_quad(b: MeshBatch, a0: float, a1: float, fixed: float, y0: float, y1: float, face: int) -> void:
	## face: 0 = south (+Z, varying X), 1 = east (+X, varying Z), 2 = north (-Z), 3 = west (-X)
	var p0: Vector3
	var p1: Vector3
	match face:
		0:
			p0 = W(a0, y0, fixed)
			p1 = W(a1, y0, fixed)
		1:
			p0 = W(fixed, y0, a1)
			p1 = W(fixed, y0, a0)
		2:
			p0 = W(a1, y0, fixed)
			p1 = W(a0, y0, fixed)
		_:
			p0 = W(fixed, y0, a0)
			p1 = W(fixed, y0, a1)
	var up := Vector3(0, y1 - y0, 0)
	var u := (a1 - a0) / 3.0
	var v := (y1 - y0) / 3.0
	b.add_quad(p0, p1, p1 + up, p0 + up, Vector2(0, v), Vector2(u, v), Vector2(u, 0), Vector2(0, 0), Color(0.8, 0.9, 1.0))
	# dark mullions implied by the texture; add a thin frame slab for depth
	var frame := wb.batch("metal_dark")
	var mid := (p0 + p1) * 0.5 + up * 0.5
	var basis := Basis(Vector3.UP, -atan2((p1 - p0).z, (p1 - p0).x))
	frame.add_box(mid, Vector3((p1 - p0).length() + 0.1, (y1 - y0) + 0.1, 0.04), basis, 1.0, Color(0.15, 0.15, 0.16), true, true)


func _box(b: MeshBatch, x0: float, x1: float, z0: float, z1: float, y0: float, y1: float, col: Color, collide: bool) -> void:
	var c := W((x0 + x1) * 0.5, (y0 + y1) * 0.5, (z0 + z1) * 0.5)
	var size := Vector3(x1 - x0, y1 - y0, z1 - z0)
	b.add_box(c, size, Basis.IDENTITY, 4.0, col, false, false)
	if collide:
		wb.collision_boxes.append([Transform3D(Basis.IDENTITY, c), size])


func _parapet(b: MeshBatch, x0: float, x1: float, z0: float, z1: float, y: float, h: float) -> void:
	var t := 0.25
	b.add_box(W((x0 + x1) * 0.5, y + h * 0.5, z0 + t * 0.5), Vector3(x1 - x0, h, t), Basis.IDENTITY, 4.0, Color(0.97, 0.96, 0.93), true, false)
	b.add_box(W((x0 + x1) * 0.5, y + h * 0.5, z1 - t * 0.5), Vector3(x1 - x0, h, t), Basis.IDENTITY, 4.0, Color(0.97, 0.96, 0.93), true, false)
	b.add_box(W(x0 + t * 0.5, y + h * 0.5, (z0 + z1) * 0.5), Vector3(t, h, z1 - z0), Basis.IDENTITY, 4.0, Color(0.97, 0.96, 0.93), true, false)
	b.add_box(W(x1 - t * 0.5, y + h * 0.5, (z0 + z1) * 0.5), Vector3(t, h, z1 - z0), Basis.IDENTITY, 4.0, Color(0.97, 0.96, 0.93), true, false)


# -------------------------------------------------------------- grounds
func _grounds() -> void:
	var pav := wb.batch("pavers")
	var stone := wb.batch("stone")
	var y := 0.05
	# drive from the gate to the fountain circle and on to the carport
	pav.add_rect(W(23.5, y, 75.4), W(30.5, y, 75.4), W(30.5, y, 48.0), W(23.5, y, 48.0), 2.0, 2.0, Color(0.9, 0.88, 0.84))
	_disc(pav, Vector2(33.0, 52.0), 10.0, y, Color(0.9, 0.88, 0.84))
	pav.add_rect(W(40.0, y, 56.0), W(66.0, y, 56.0), W(66.0, y, 48.0), W(40.0, y, 48.0), 2.0, 2.0, Color(0.9, 0.88, 0.84))
	pav.add_rect(W(52.0, y, 72.0), W(66.0, y, 72.0), W(66.0, y, 56.0), W(52.0, y, 56.0), 2.0, 2.0, Color(0.9, 0.88, 0.84))
	# path to the front door
	pav.add_rect(W(29.0, y, 48.0), W(37.0, y, 48.0), W(37.0, y, 44.5), W(29.0, y, 44.5), 2.0, 2.0, Color(0.9, 0.88, 0.84))
	# fountain
	stone.add_cylinder(W(33.0, 0.0, 52.0), 3.2, 3.2, 0.6, 20, 2.0, Color(0.9, 0.88, 0.84), false)
	stone.add_cylinder(W(33.0, 0.0, 52.0), 3.2, 3.0, 0.6, 20, 2.0, Color(0.9, 0.88, 0.84), false)
	wb.batch("water").add_cylinder(W(33.0, 0.0, 52.0), 0.0, 2.9, 0.45, 20, 2.0, Color(0.7, 0.9, 1.0), true)
	stone.add_cylinder(W(33.0, 0.4, 52.0), 0.5, 0.35, 1.3, 10, 1.0, Color.WHITE, true)
	stone.add_cylinder(W(33.0, 1.6, 52.0), 1.1, 1.1, 0.15, 14, 1.0, Color.WHITE, true)
	wb.collision_boxes.append([Transform3D(Basis.IDENTITY, W(33.0, 0.3, 52.0)), Vector3(6.4, 0.6, 6.4)])
	# lawn centre of the circle is the fountain; grass elsewhere is the plateau
	# carport: flat roof on four posts
	var metal := wb.batch("metal_dark")
	var slab := wb.batch("concrete")
	slab.add_box(W(59.0, 3.1, 64.0), Vector3(12.0, 0.25, 11.0), Basis.IDENTITY, 4.0, Color(0.85, 0.85, 0.83), true, true)
	for px: float in [53.5, 64.5]:
		for pz: float in [59.0, 69.0]:
			metal.add_box(W(px, 1.5, pz), Vector3(0.25, 3.0, 0.25), Basis.IDENTITY, 1.0, Color(0.2, 0.2, 0.2), false, false)
			wb.collision_boxes.append([Transform3D(Basis.IDENTITY, W(px, 1.5, pz)), Vector3(0.25, 3.0, 0.25)])
	car_slots.append({"pos": W(56.5, 0.05, 64.0), "yaw": PI * 0.5, "kind": "owner_suv"})
	car_slots.append({"pos": W(61.5, 0.05, 64.0), "yaw": PI * 0.5, "kind": "owner_sedan"})
	# palms along the drive, bollard lights
	for i in range(5):
		var z := 72.0 - i * 5.5
		palms.append([21.0, z])
		palms.append([33.0, z])
		lights.append(W(22.3, 0.0, z - 2.5))
		lights.append(W(31.7, 0.0, z - 2.5))
	for p in [[8.0, 30.0], [8.0, 50.0], [58.0, 30.0], [58.0, 45.0], [12.0, 68.0], [46.0, 70.0]]:
		palms.append(p)
	var glow := wb.batch("lamp_glow")
	for lp in lights:
		metal.add_cylinder(lp, 0.08, 0.08, 0.8, 6, 1.0, Color(0.2, 0.2, 0.2), false)
		glow.add_box(lp + Vector3(0, 0.85, 0), Vector3(0.18, 0.12, 0.18), Basis.IDENTITY, 1.0, Color.WHITE, true, false)
	# generator shed / utility behind the carport
	_box(wb.batch("plaster_plain"), 58.0, 64.0, 2.0, 7.0, -0.3, 2.6, Color(0.85, 0.83, 0.78), true)
	slab.add_rect(W(58.0, 2.62, 7.0), W(64.0, 2.62, 7.0), W(64.0, 2.62, 2.0), W(58.0, 2.62, 2.0), 4.0, 4.0, Color(0.8, 0.8, 0.78))


func _staff_quarters() -> void:
	var wall := wb.batch("plaster_win")
	_box(wall, 2.0, 12.0, 2.0, 10.0, -0.3, 3.3, Color(0.92, 0.9, 0.84), true)
	wb.batch("roof_concrete").add_rect(W(2.0, 3.32, 10.0), W(12.0, 3.32, 10.0), W(12.0, 3.32, 2.0), W(2.0, 3.32, 2.0), 4.0, 4.0, Color.WHITE)
	_parapet(wb.batch("plaster_plain"), 2.0, 12.0, 2.0, 10.0, 3.3, 0.4)


func _disc(b: MeshBatch, c: Vector2, r: float, y: float, col: Color) -> void:
	var segs := 24
	var uvm := 2.0
	var centre := b.add_vertex(W(c.x, y, c.y), Vector3.UP, c / uvm, col)
	var ring := PackedInt32Array()
	for i in range(segs + 1):
		var ang := TAU * float(i) / float(segs)
		var p := c + Vector2(cos(ang), sin(ang)) * r
		ring.append(b.add_vertex(W(p.x, y, p.y), Vector3.UP, p / uvm, col))
	for i in range(segs):
		b.indices.append_array(PackedInt32Array([centre, ring[i + 1], ring[i]]))


func palm_world_positions() -> Array:
	var out := []
	for p in palms:
		out.append([p[0] + OX, p[1] + OZ])
	return out


func player_spawn() -> Transform3D:
	# on the porch path, looking towards the gate (+Z local = south)
	var pos := W(33.0, 0.2, 49.5)
	return Transform3D(Basis(Vector3.UP, 0.0), pos)
