class_name WorldBuilder
extends RefCounted
## Builds a city chunk (terrain, roads, buildings, props) from a planner export
## (godot/assets/world/<name>.json produced by tools/export_chunk.ts).
## Geometry is batched per material (MeshBatch) -> a whole neighbourhood is ~20 draw calls.

var data: Dictionary
var origin := Vector2.ZERO
var grid := 2.0
var nx := 0
var nz := 0
var heights := PackedFloat32Array()
var batches: Dictionary = {}       # material name -> MeshBatch
var collision_boxes: Array = []    # [Transform3D, Vector3 size]
var sidewalk_paths: Array = []     # Array[PackedVector3Array] for NPC walking
var lamp_positions: PackedVector3Array = PackedVector3Array()
var car_slots: Array = []          # [{pos, yaw, kind}]
var rng := RandomNumberGenerator.new()
var stats := {"tris": 0, "surfaces": 0, "buildings": 0, "trees": 0}


static func load_chunk(name: String) -> Dictionary:
	var path := "res://assets/world/%s.json" % name
	if not FileAccess.file_exists(path):
		push_error("WorldBuilder: missing " + path)
		return {}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}


func _init(chunk: Dictionary) -> void:
	data = chunk
	rng.seed = 20260419
	if data.is_empty():
		return
	origin = Vector2(data["origin"][0], data["origin"][1])
	grid = float(data["grid"])
	nx = int(data["nx"])
	nz = int(data["nz"])
	heights.resize(nx * nz)
	var h: Array = data["heights"]
	for i in range(h.size()):
		heights[i] = float(h[i])


func batch(name: String) -> MeshBatch:
	if not batches.has(name):
		batches[name] = MeshBatch.new()
	return batches[name]


## Bilinear terrain height at world (x, z).
func height_at(x: float, z: float) -> float:
	var fx := (x - origin.x) / grid
	var fz := (z - origin.y) / grid
	var i := clampi(int(floor(fx)), 0, nx - 2)
	var j := clampi(int(floor(fz)), 0, nz - 2)
	var tx := clampf(fx - i, 0.0, 1.0)
	var tz := clampf(fz - j, 0.0, 1.0)
	var h00 := heights[j * nx + i]
	var h10 := heights[j * nx + i + 1]
	var h01 := heights[(j + 1) * nx + i]
	var h11 := heights[(j + 1) * nx + i + 1]
	return lerpf(lerpf(h00, h10, tx), lerpf(h01, h11, tx), tz)


func build_all() -> void:
	if data.is_empty():
		return
	build_terrain()
	build_roads()
	build_buildings()
	build_props()


# ---------------------------------------------------------------- terrain
func build_terrain() -> void:
	var b := batch("grass")
	var uvm := Materials.uv_m("grass")
	var base_index := b.verts.size()
	for j in range(nz):
		for i in range(nx):
			var x := origin.x + i * grid
			var z := origin.y + j * grid
			var y := heights[j * nx + i]
			# normal from central differences
			var hl := heights[j * nx + maxi(i - 1, 0)]
			var hr := heights[j * nx + mini(i + 1, nx - 1)]
			var hd := heights[maxi(j - 1, 0) * nx + i]
			var hu := heights[mini(j + 1, nz - 1) * nx + i]
			var n := Vector3(hl - hr, 2.0 * grid, hd - hu).normalized()
			# subtle colour variation: slope -> drier, random patches
			var slope := 1.0 - n.y
			var patch := 0.9 + 0.2 * _hash2(i, j)
			var c := Color(0.95 * patch, 1.0 * patch, 0.85 * patch).lerp(Color(0.95, 0.85, 0.65), clampf(slope * 4.0, 0.0, 0.6))
			b.add_vertex(Vector3(x, y, z), n, Vector2(x / uvm, z / uvm), c)
	for j in range(nz - 1):
		for i in range(nx - 1):
			var i00 := base_index + j * nx + i
			var i10 := i00 + 1
			var i01 := i00 + nx
			var i11 := i01 + 1
			b.indices.append_array(PackedInt32Array([i00, i01, i11, i00, i11, i10]))


func _hash2(i: int, j: int) -> float:
	var n := i * 374761393 + j * 668265263
	n = (n ^ (n >> 13)) * 1274126177
	return float((n ^ (n >> 16)) & 0xffff) / 65535.0


# ---------------------------------------------------------------- roads
func build_roads() -> void:
	var roads: Array = data["roads"]
	# node degree / max half width per node id (for trimming sidewalks at junctions)
	var node_halfw: Dictionary = {}
	var node_count: Dictionary = {}
	for r in roads:
		var hw: float = float(r["profile"]["carriageway"]) * 0.5 + float(r["profile"].get("median", 0)) * 0.5
		for nid in [r["a"], r["b"]]:
			node_count[nid] = node_count.get(nid, 0) + 1
			node_halfw[nid] = maxf(float(node_halfw.get(nid, 0.0)), hw)
	var asphalt := batch("asphalt")
	var pavers := batch("pavers")
	var kerb := batch("concrete")
	var prio := {"arterial": 0.012, "secondary": 0.008, "local": 0.004, "lane": 0.0, "service": 0.0, "waterfront": 0.006}
	for r in roads:
		var pts: Array = r["points"]
		var hs: Array = r["heights"]
		var prof: Dictionary = r["profile"]
		var cw := float(prof["carriageway"])
		var med := float(prof.get("median", 0))
		var sw := float(prof["sidewalk"])
		var half := cw * 0.5 + med * 0.5
		var lift: float = prio.get(r["cls"], 0.0)
		# cumulative length
		var p3: Array[Vector3] = []
		var along: Array[float] = []
		var total := 0.0
		for k in range(pts.size()):
			var p := Vector3(pts[k][0], float(hs[k]) + 0.03 + lift, pts[k][1])
			if k > 0:
				total += Vector2(p.x - p3[k - 1].x, p.z - p3[k - 1].z).length()
			p3.append(p)
			along.append(total)
		if total < 1.0:
			continue
		# trim distances at both ends for sidewalks (other roads' half widths)
		var trim_a: float = node_halfw.get(r["a"], 0.0) + 0.3 if node_count.get(r["a"], 1) > 1 else 0.0
		var trim_b: float = node_halfw.get(r["b"], 0.0) + 0.3 if node_count.get(r["b"], 1) > 1 else 0.0
		var asph_m := Materials.uv_m("asphalt")
		var pav_m := Materials.uv_m("pavers")
		var left_path := PackedVector3Array()
		var right_path := PackedVector3Array()
		for k in range(p3.size() - 1):
			var a := p3[k]
			var bq := p3[k + 1]
			var dir := Vector3(bq.x - a.x, 0.0, bq.z - a.z).normalized()
			var side := Vector3(-dir.z, 0.0, dir.x)
			var ua := along[k] / asph_m
			var ub := along[k + 1] / asph_m
			# carriageway (uv u across = width/7 tiles, v along)
			var ut := cw / asph_m
			asphalt.add_quad(a - side * half, bq - side * half, bq + side * half, a + side * half,
				Vector2(0.0, ua), Vector2(0.0, ub), Vector2(ut, ub), Vector2(ut, ua), Color.WHITE, Vector3.UP)
			# sidewalks: trimmed at junction ends
			var sa := a
			var sb := bq
			var seg_len := along[k + 1] - along[k]
			var cut_a := trim_a - along[k] if k == 0 else 0.0
			var cut_b := trim_b - (total - along[k + 1]) if k == p3.size() - 2 else 0.0
			if cut_a > 0.0:
				sa = a + dir * minf(cut_a, seg_len)
			if cut_b > 0.0:
				sb = bq - dir * minf(cut_b, seg_len)
			if (sb - sa).dot(dir) <= 0.5:
				continue
			for s: float in [-1.0, 1.0]:
				var inner := side * (half * s)
				var outer := side * ((half + sw) * s)
				var up := Vector3(0, 0.15, 0)
				var q0 := sa + inner + up
				var q1 := sb + inner + up
				var q2 := sb + outer + up
				var q3 := sa + outer + up
				if s > 0:
					pavers.add_quad(q0, q1, q2, q3, Vector2(0, 0), Vector2(0, (sb - sa).length() / pav_m), Vector2(sw / pav_m, (sb - sa).length() / pav_m), Vector2(sw / pav_m, 0), Color.WHITE, Vector3.UP)
				else:
					pavers.add_quad(q3, q2, q1, q0, Vector2(0, 0), Vector2(0, (sb - sa).length() / pav_m), Vector2(sw / pav_m, (sb - sa).length() / pav_m), Vector2(sw / pav_m, 0), Color.WHITE, Vector3.UP)
				# kerb face toward the road
				var k0 := sa + inner
				var k1 := sb + inner
				if s > 0:
					kerb.add_quad(k1, k1 + up, k0 + up, k0, Vector2(0, 0), Vector2(0, 0.08), Vector2((sb - sa).length() / 2.0, 0.08), Vector2((sb - sa).length() / 2.0, 0), Color(0.9, 0.9, 0.88))
				else:
					kerb.add_quad(k0, k0 + up, k1 + up, k1, Vector2(0, 0), Vector2(0, 0.08), Vector2((sb - sa).length() / 2.0, 0.08), Vector2((sb - sa).length() / 2.0, 0), Color(0.9, 0.9, 0.88))
				# collision slab for the sidewalk
				var mid := (sa + sb) * 0.5 + side * ((half + sw * 0.5) * s) + Vector3(0, 0.075 - 0.2, 0)
				var basis := Basis.looking_at(dir, Vector3.UP)
				collision_boxes.append([Transform3D(basis, mid), Vector3(sw, 0.55, (sb - sa).length())])
				var walk := side * ((half + sw * 0.5) * s) + up
				if s < 0:
					left_path.append(sa + walk)
					left_path.append(sb + walk)
				else:
					right_path.append(sa + walk)
					right_path.append(sb + walk)
			# lamp posts along the right side every lampSpacing
			var spacing := float(prof.get("lampSpacing", 0))
			if spacing > 0.0:
				var d := spacing * 0.5
				while d < seg_len:
					var pos := a + dir * d + side * (half + sw - 0.4)
					lamp_positions.append(pos + Vector3(0, 0.15, 0))
					d += spacing
		if left_path.size() >= 2:
			sidewalk_paths.append(left_path)
		if right_path.size() >= 2:
			sidewalk_paths.append(right_path)


# ---------------------------------------------------------------- buildings
func build_buildings() -> void:
	for bld in data["buildings"]:
		for m in bld["masses"]:
			_build_mass(m, bld)
		stats["buildings"] += 1


func _build_mass(m: Dictionary, bld: Dictionary) -> void:
	var fp: Array = m.get("footprint", [])
	if fp.size() < 3:
		return
	var floors := int(m["floors"])
	var fh := float(m["fh"])
	var base_y := float(m["baseY"])
	var plinth_y := float(m.get("plinth", base_y - 1.0))
	var top_y := base_y + floors * fh
	var fac: Dictionary = m["facade"]
	var tex := Materials.facade_tex(str(fac.get("tile", "plaster-win")))
	var col := Color.html(str(fac.get("color", "#d8d0c0")))
	var bay := float(fac.get("bayWidth", 4.0))
	var wall := batch(tex)
	var plain := batch("plaster_plain")
	# polygon orientation
	var pts: Array[Vector2] = []
	var centroid := Vector2.ZERO
	for p in fp:
		var v := Vector2(p[0], p[1])
		pts.append(v)
		centroid += v
	centroid /= pts.size()
	# walls
	for i in range(pts.size()):
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		var mid := (a + b) * 0.5
		var edge := b - a
		var n2 := Vector2(edge.y, -edge.x).normalized()
		if n2.dot(mid - centroid) < 0.0:
			var t := a
			a = b
			b = t
		var len := edge.length()
		var a3 := Vector3(a.x, base_y, a.y)
		var b3 := Vector3(b.x, base_y, b.y)
		# main facade: u in bays, v in floors
		wall.add_quad(a3, a3 + Vector3(0, top_y - base_y, 0), b3 + Vector3(0, top_y - base_y, 0), b3,
			Vector2(0, floors), Vector2(0, 0), Vector2(len / bay, 0), Vector2(len / bay, floors), col)
		# plinth below ground level (buried into the slope)
		var pa := Vector3(a.x, plinth_y - 0.5, a.y)
		var pb := Vector3(b.x, plinth_y - 0.5, b.y)
		plain.add_quad(pa, a3, b3, pb, Vector2(0, 1), Vector2(0, 0), Vector2(len / 4.0, 0), Vector2(len / 4.0, 1), col.darkened(0.25))
	# collision box (rectangle footprint assumed)
	var ext := Vector2.ZERO
	var axis_x := (pts[1] - pts[0])
	var axis_z := (pts[3] - pts[0]) if pts.size() >= 4 else Vector2(-axis_x.y, axis_x.x)
	var w := axis_x.length()
	var d := axis_z.length()
	var yaw := atan2(axis_x.y, axis_x.x)
	var centre3 := Vector3(centroid.x, (plinth_y + top_y) * 0.5, centroid.y)
	var basis := Basis(Vector3.UP, -yaw)
	collision_boxes.append([Transform3D(basis, centre3), Vector3(w, top_y - plinth_y, d)])
	# roof
	var roof: Dictionary = m.get("roof", {"type": "flat", "tile": "roof-concrete"})
	var rtex := Materials.roof_tex(str(roof.get("tile", "roof-concrete")))
	var rcol := Color.html(str(roof.get("color", "#9a9a94"))) if roof.has("color") else Color(0.95, 0.95, 0.95)
	match str(roof.get("type", "flat")):
		"hip", "gable", "shed":
			_build_pitched_roof(pts, top_y, roof, rtex, rcol, wall, col, floors)
		_:
			_build_flat_roof(pts, top_y, roof, rtex, rcol, plain, col)
	# features: water tank on flat roofs, very Lagos
	if "tank" in m.get("features", []) or ("rooftank" in m.get("features", [])):
		var tb := batch("tank")
		var tp := Vector3(centroid.x, top_y + 0.05, centroid.y) + Vector3(axis_x.x, 0, axis_x.y).normalized() * (w * 0.3)
		tb.add_cylinder(tp, 0.6, 0.6, 1.3, 8, 1.0, Color(0.15, 0.15, 0.15))
	stats["tris"] += 0


func _build_flat_roof(pts: Array[Vector2], top_y: float, roof: Dictionary, rtex: String, rcol: Color, wall_batch: MeshBatch, wall_col: Color) -> void:
	var rb := batch(rtex)
	var uvm := Materials.uv_m(rtex)
	var parapet := float(roof.get("parapet", 0.0))
	var y := top_y + 0.02
	# fan triangulation (rectangles / convex footprints)
	var n := Vector3.UP
	var i0 := rb.add_vertex(Vector3(pts[0].x, y, pts[0].y), n, pts[0] / uvm, rcol)
	var prev := rb.add_vertex(Vector3(pts[1].x, y, pts[1].y), n, pts[1] / uvm, rcol)
	for i in range(2, pts.size()):
		var cur := rb.add_vertex(Vector3(pts[i].x, y, pts[i].y), n, pts[i] / uvm, rcol)
		# ensure upward facing
		var a := Vector3(pts[0].x, y, pts[0].y)
		var b := Vector3(pts[i - 1].x, y, pts[i - 1].y)
		var c := Vector3(pts[i].x, y, pts[i].y)
		if (b - a).cross(c - a).y > 0.0:
			rb.indices.append_array(PackedInt32Array([i0, prev, cur]))
		else:
			rb.indices.append_array(PackedInt32Array([i0, cur, prev]))
		prev = cur
	if parapet > 0.05:
		var centroid := Vector2.ZERO
		for p in pts:
			centroid += p
		centroid /= pts.size()
		for i in range(pts.size()):
			var a := pts[i]
			var b := pts[(i + 1) % pts.size()]
			var e := b - a
			var len := e.length()
			var mid := (a + b) * 0.5
			var basis := Basis(Vector3.UP, -atan2(e.y, e.x))
			var inward := (centroid - mid).normalized() * 0.1
			wall_batch.add_box(Vector3(mid.x + inward.x, top_y + parapet * 0.5, mid.y + inward.y), Vector3(len, parapet, 0.2), basis, 4.0, wall_col, true, false, 0.0)


func _build_pitched_roof(pts: Array[Vector2], top_y: float, roof: Dictionary, rtex: String, rcol: Color, wall_batch: MeshBatch, wall_col: Color, floors: int) -> void:
	if pts.size() != 4:
		_build_flat_roof(pts, top_y, roof, rtex, rcol, wall_batch, wall_col)
		return
	var rb := batch(rtex)
	var uvm := Materials.uv_m(rtex)
	var pitch := float(roof.get("pitch", 0.4))
	var overhang := float(roof.get("overhang", 0.6))
	var rtype := str(roof.get("type", "hip"))
	# long axis
	var e0 := pts[1] - pts[0]
	var e1 := pts[2] - pts[1]
	var long_first := e0.length() >= e1.length()
	var u_axis := (e0 if long_first else e1).normalized()          # along ridge
	var v_axis := (e1 if long_first else -e0).normalized()        # across
	var centre := (pts[0] + pts[1] + pts[2] + pts[3]) * 0.25
	var half_l := (e0.length() if long_first else e1.length()) * 0.5 + overhang
	var half_w := (e1.length() if long_first else e0.length()) * 0.5 + overhang
	var eave_y := top_y - overhang * pitch
	var rise := half_w * pitch
	var ridge_y := eave_y + rise
	var hip_inset := half_w if rtype == "hip" else 0.0
	if rtype == "shed":
		# one slope across the whole span
		var a := centre - u_axis * half_l - v_axis * half_w
		var b := centre + u_axis * half_l - v_axis * half_w
		var c := centre + u_axis * half_l + v_axis * half_w
		var d := centre - u_axis * half_l + v_axis * half_w
		var hi := eave_y + 2.0 * rise
		rb.add_quad(Vector3(a.x, eave_y, a.y), Vector3(d.x, hi, d.y), Vector3(c.x, hi, c.y), Vector3(b.x, eave_y, b.y),
			Vector2(0, 0), Vector2(0, half_w * 2.0 / uvm), Vector2(half_l * 2.0 / uvm, half_w * 2.0 / uvm), Vector2(half_l * 2.0 / uvm, 0), rcol)
		# triangle gables under the slope
		_gable_tri(wall_batch, Vector3(a.x, top_y, a.y), Vector3(d.x, top_y, d.y), Vector3(d.x, hi, d.y), wall_col)
		_gable_tri(wall_batch, Vector3(c.x, top_y, c.y), Vector3(b.x, top_y, b.y), Vector3(c.x, hi, c.y), wall_col)
		return
	var r0 := centre - u_axis * (half_l - hip_inset)
	var r1 := centre + u_axis * (half_l - hip_inset)
	var ridge0 := Vector3(r0.x, ridge_y, r0.y)
	var ridge1 := Vector3(r1.x, ridge_y, r1.y)
	var ea0 := centre - u_axis * half_l - v_axis * half_w
	var ea1 := centre + u_axis * half_l - v_axis * half_w
	var eb0 := centre - u_axis * half_l + v_axis * half_w
	var eb1 := centre + u_axis * half_l + v_axis * half_w
	var A0 := Vector3(ea0.x, eave_y, ea0.y)
	var A1 := Vector3(ea1.x, eave_y, ea1.y)
	var B0 := Vector3(eb0.x, eave_y, eb0.y)
	var B1 := Vector3(eb1.x, eave_y, eb1.y)
	var slope_len := sqrt(half_w * half_w + rise * rise)
	var ul := half_l * 2.0 / uvm
	var vl := slope_len / uvm
	# side A (-v): eave A0->A1, ridge ridge0->ridge1
	rb.add_quad(A1, ridge1, ridge0, A0, Vector2(ul, 0), Vector2(ul - hip_inset / uvm, vl), Vector2(hip_inset / uvm, vl), Vector2(0, 0), rcol)
	# side B (+v)
	rb.add_quad(B0, ridge0, ridge1, B1, Vector2(0, 0), Vector2(hip_inset / uvm, vl), Vector2(ul - hip_inset / uvm, vl), Vector2(ul, 0), rcol)
	if rtype == "hip":
		rb.add_tri(A0, ridge0, B0, Vector2(0, 0), Vector2(half_w / uvm, vl), Vector2(half_w * 2.0 / uvm, 0), rcol)
		rb.add_tri(B1, ridge1, A1, Vector2(0, 0), Vector2(half_w / uvm, vl), Vector2(half_w * 2.0 / uvm, 0), rcol)
	else:
		# gable ends in wall material (inside the overhang)
		var g0 := centre - u_axis * (half_l - overhang)
		var g1 := centre + u_axis * (half_l - overhang)
		var w_in := half_w - overhang
		_gable_tri(wall_batch, Vector3(g0.x - v_axis.x * w_in, top_y, g0.y - v_axis.y * w_in), Vector3(g0.x + v_axis.x * w_in, top_y, g0.y + v_axis.y * w_in), Vector3(g0.x, ridge_y, g0.y), wall_col)
		_gable_tri(wall_batch, Vector3(g1.x + v_axis.x * w_in, top_y, g1.y + v_axis.y * w_in), Vector3(g1.x - v_axis.x * w_in, top_y, g1.y - v_axis.y * w_in), Vector3(g1.x, ridge_y, g1.y), wall_col)
	# soffit/fascia underside so the overhang reads from the street
	var fascia := batch("plaster_plain")
	fascia.add_quad(A0, A0 - Vector3(0, 0.25, 0), A1 - Vector3(0, 0.25, 0), A1, Vector2(0, 0), Vector2(0, 0.06), Vector2(ul, 0.06), Vector2(ul, 0), wall_col.darkened(0.1))
	fascia.add_quad(B1, B1 - Vector3(0, 0.25, 0), B0 - Vector3(0, 0.25, 0), B0, Vector2(0, 0), Vector2(0, 0.06), Vector2(ul, 0.06), Vector2(ul, 0), wall_col.darkened(0.1))


func _gable_tri(b: MeshBatch, p0: Vector3, p1: Vector3, apex: Vector3, col: Color) -> void:
	var w := (p1 - p0).length()
	b.add_tri(p0, p1, apex, Vector2(0, 0), Vector2(w / 4.0, 0), Vector2(w / 8.0, (apex.y - p0.y) / 3.2), col)
	b.add_tri(p1, p0, apex, Vector2(0, 0), Vector2(w / 4.0, 0), Vector2(w / 8.0, (apex.y - p0.y) / 3.2), col)


# ---------------------------------------------------------------- props
const TREE_SIZE := {
	"tree-palm": [5.0, 8.0, "tree_palm"],
	"tree-broad": [7.5, 7.5, "tree_broad"],
	"tree-neem": [6.5, 7.0, "tree_neem"],
	"tree-small": [4.0, 4.2, "tree_small"],
	"bush": [1.8, 1.4, "tree_small"],
}


func build_props() -> void:
	for p in data["props"]:
		var t := str(p["t"])
		var x := float(p["x"])
		var z := float(p["z"])
		if TREE_SIZE.has(t):
			_add_tree(t, x, z, float(p.get("r", 0.0)), float(p.get("s", 1.0)))
		elif t == "lamp" or t == "lamp-tall" or t == "lamp-double":
			lamp_positions.append(Vector3(x, height_at(x, z) + 0.15, z))
		elif t == "car" or t == "minibus":
			car_slots.append({"pos": Vector3(x, height_at(x, z), z), "yaw": float(p.get("r", 0.0)), "kind": t})
		elif t == "tank":
			var tb := batch("tank")
			tb.add_cylinder(Vector3(x, height_at(x, z) + 0.4, z), 0.55, 0.55, 1.2, 8, 1.0, Color(0.15, 0.15, 0.15))
	_build_lamps()


func _add_tree(t: String, x: float, z: float, rot: float, s: float) -> void:
	var def: Array = TREE_SIZE[t]
	var w: float = def[0] * s
	var h: float = def[1] * s
	var b := batch(def[2])
	var y := height_at(x, z) - 0.05
	var c := Color(0.85 + 0.15 * _hash2(int(x * 10), int(z * 10)), 0.9 + 0.1 * _hash2(int(z * 7), int(x * 3)), 0.85)
	for k in range(2):
		var ang := rot + k * PI * 0.5
		var dir := Vector3(cos(ang), 0, sin(ang)) * (w * 0.5)
		var a := Vector3(x, y, z) - dir
		var bq := Vector3(x, y, z) + dir
		b.add_quad(a, bq, bq + Vector3(0, h, 0), a + Vector3(0, h, 0), Vector2(0, 1), Vector2(1, 1), Vector2(1, 0), Vector2(0, 0), c, Vector3.UP)
	stats["trees"] += 1
	if w > 3.0:
		collision_boxes.append([Transform3D(Basis.IDENTITY, Vector3(x, y + 1.5, z)), Vector3(0.5, 3.0, 0.5)])


func _build_lamps() -> void:
	var pole := batch("metal_dark")
	var glow := batch("lamp_glow")
	for pos in lamp_positions:
		pole.add_cylinder(pos, 0.09, 0.07, 6.5, 6, 1.0, Color(0.5, 0.5, 0.52))
		var head := pos + Vector3(0, 6.5, 0)
		pole.add_box(head + Vector3(0.6, 0.0, 0.0), Vector3(1.4, 0.12, 0.12), Basis.IDENTITY, 1.0, Color(0.5, 0.5, 0.52), true, true)
		glow.add_box(head + Vector3(1.25, -0.12, 0.0), Vector3(0.5, 0.14, 0.26), Basis.IDENTITY, 1.0, Color.WHITE, true, true)


# ---------------------------------------------------------------- emit
## Builds batched mesh, per-chunk collision and a lightweight walkable navmesh under `parent`.
## `include_terrain` is false for the custom JAG House overlay, which shares S0 height data but not its terrain.
func emit(parent: Node3D, include_terrain: bool = true, include_navigation: bool = false) -> void:
	var mesh := ArrayMesh.new()
	var tris := 0
	for name in batches.keys():
		var b: MeshBatch = batches[name]
		if b.is_empty():
			continue
		b.commit(mesh, Materials.get_mat(name))
		tris += b.tri_count()
	var mi := MeshInstance3D.new()
	mi.name = "Chunk"
	mi.mesh = mesh
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	parent.add_child(mi)
	stats["tris"] = tris
	stats["surfaces"] = mesh.get_surface_count()
	# one terrain heightfield + a compact compound of building/sidewalk/tree colliders per tile
	var body := StaticBody3D.new()
	body.name = "Collision"
	if include_terrain:
		var hm := HeightMapShape3D.new()
		hm.map_width = nx
		hm.map_depth = nz
		hm.map_data = heights
		var cs := CollisionShape3D.new()
		cs.shape = hm
		cs.position = Vector3(origin.x + (nx - 1) * grid * 0.5, 0.0, origin.y + (nz - 1) * grid * 0.5)
		cs.scale = Vector3(grid, 1.0, grid)
		body.add_child(cs)
	for box in collision_boxes:
		var shape := BoxShape3D.new()
		shape.size = box[1]
		var c := CollisionShape3D.new()
		c.shape = shape
		c.transform = box[0]
		body.add_child(c)
	parent.add_child(body)
	if include_terrain and include_navigation and not sidewalk_paths.is_empty():
		_add_navigation(parent)


## Navigation polygons follow the same sidewalk centre-lines as the pedestrian planner. Tiles share
## exact boundaries, so Godot connects the regions as they stream in and out.
func _add_navigation(parent: Node3D) -> void:
	var vertices := PackedVector3Array()
	var polygons: Array[PackedInt32Array] = []
	for path: PackedVector3Array in sidewalk_paths:
		for i in range(path.size() - 1):
			var a := path[i] + Vector3(0, 0.04, 0)
			var b := path[i + 1] + Vector3(0, 0.04, 0)
			var dir := Vector3(b.x - a.x, 0.0, b.z - a.z).normalized()
			if dir.length_squared() < 0.0001:
				continue
			var side := Vector3(-dir.z, 0.0, dir.x) * 1.35
			var base := vertices.size()
			vertices.append_array(PackedVector3Array([a - side, b - side, b + side, a + side]))
			polygons.append(PackedInt32Array([base, base + 1, base + 2, base + 3]))
	if polygons.is_empty():
		return
	var nav := NavigationMesh.new()
	nav.agent_radius = 0.3
	nav.agent_height = 1.8
	nav.cell_size = 0.2
	nav.cell_height = 0.1
	nav.vertices = vertices
	for polygon in polygons:
		nav.add_polygon(polygon)
	var region := NavigationRegion3D.new()
	region.name = "Navigation"
	region.navigation_mesh = nav
	region.navigation_layers = 1
	parent.add_child(region)
