class_name MeshBatch
extends RefCounted
## Accumulates triangles for ONE material and emits an ArrayMesh surface.
## All world geometry is batched per material so a whole block costs a handful of draw calls.

var verts := PackedVector3Array()
var normals := PackedVector3Array()
var uvs := PackedVector2Array()
var colors := PackedColorArray()
var indices := PackedInt32Array()
var aabb_min := Vector3(INF, INF, INF)
var aabb_max := Vector3(-INF, -INF, -INF)


func is_empty() -> bool:
	return indices.is_empty()


func tri_count() -> int:
	return indices.size() / 3


func add_vertex(p: Vector3, n: Vector3, uv: Vector2, c: Color) -> int:
	verts.append(p)
	normals.append(n)
	uvs.append(uv)
	colors.append(c)
	aabb_min = aabb_min.min(p)
	aabb_max = aabb_max.max(p)
	return verts.size() - 1


## Quad a-b-c-d counter-clockwise seen from the front; uv per corner.
func add_quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, uva: Vector2, uvb: Vector2, uvc: Vector2, uvd: Vector2, col: Color = Color.WHITE, n: Vector3 = Vector3.ZERO) -> void:
	if n == Vector3.ZERO:
		n = (b - a).cross(c - a)
		if n.length_squared() < 1e-12:
			n = (c - a).cross(d - a)
		n = n.normalized()
	var i0 := add_vertex(a, n, uva, col)
	var i1 := add_vertex(b, n, uvb, col)
	var i2 := add_vertex(c, n, uvc, col)
	var i3 := add_vertex(d, n, uvd, col)
	indices.append_array(PackedInt32Array([i0, i1, i2, i0, i2, i3]))


## Rectangle quad with uv tiled in metres: u along (b-a), v along (d-a).
func add_rect(a: Vector3, b: Vector3, c: Vector3, d: Vector3, u_scale: float, v_scale: float, col: Color = Color.WHITE, u0: float = 0.0, v0: float = 0.0) -> void:
	var ul := (b - a).length() / maxf(u_scale, 0.001)
	var vl := (d - a).length() / maxf(v_scale, 0.001)
	add_quad(a, b, c, d, Vector2(u0, v0 + vl), Vector2(u0 + ul, v0 + vl), Vector2(u0 + ul, v0), Vector2(u0, v0), col)


func add_tri(a: Vector3, b: Vector3, c: Vector3, uva: Vector2, uvb: Vector2, uvc: Vector2, col: Color = Color.WHITE) -> void:
	var n := (b - a).cross(c - a).normalized()
	var i0 := add_vertex(a, n, uva, col)
	var i1 := add_vertex(b, n, uvb, col)
	var i2 := add_vertex(c, n, uvc, col)
	indices.append_array(PackedInt32Array([i0, i1, i2]))


## Axis-aligned-in-local-frame box: centre, size, basis (rotation), uv scale per metre; faces: top/bottom optional.
func add_box(center: Vector3, size: Vector3, basis: Basis, uv_m: float, col: Color = Color.WHITE, top: bool = true, bottom: bool = false, v_offset: float = 0.0) -> void:
	var hx := size.x * 0.5
	var hy := size.y * 0.5
	var hz := size.z * 0.5
	var corners := []
	for sy in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]:
			for sx in [-1.0, 1.0]:
				corners.append(center + basis * Vector3(sx * hx, sy * hy, sz * hz))
	# index: (sy, sz, sx) -> ((sy+1)/2)*4 + ((sz+1)/2)*2 + (sx+1)/2
	var c := func(sx: int, sy: int, sz: int) -> Vector3:
		return corners[sy * 4 + sz * 2 + sx]
	var um := maxf(uv_m, 0.001)
	# +Z face (front)
	add_rect(c.call(0, 0, 1), c.call(1, 0, 1), c.call(1, 1, 1), c.call(0, 1, 1), um, um, col, 0.0, v_offset)
	# -Z face (back)
	add_rect(c.call(1, 0, 0), c.call(0, 0, 0), c.call(0, 1, 0), c.call(1, 1, 0), um, um, col, 0.0, v_offset)
	# +X face
	add_rect(c.call(1, 0, 1), c.call(1, 0, 0), c.call(1, 1, 0), c.call(1, 1, 1), um, um, col, 0.0, v_offset)
	# -X face
	add_rect(c.call(0, 0, 0), c.call(0, 0, 1), c.call(0, 1, 1), c.call(0, 1, 0), um, um, col, 0.0, v_offset)
	if top:
		add_rect(c.call(0, 1, 1), c.call(1, 1, 1), c.call(1, 1, 0), c.call(0, 1, 0), um, um, col)
	if bottom:
		add_rect(c.call(0, 0, 0), c.call(1, 0, 0), c.call(1, 0, 1), c.call(0, 0, 1), um, um, col)


## Vertical cylinder (open or capped), n segments.
func add_cylinder(base: Vector3, radius_bottom: float, radius_top: float, height: float, segs: int, uv_m: float, col: Color = Color.WHITE, cap_top: bool = true) -> void:
	var ring0 := PackedInt32Array()
	var ring1 := PackedInt32Array()
	for i in range(segs + 1):
		var ang := TAU * float(i) / float(segs)
		var dir := Vector3(cos(ang), 0.0, sin(ang))
		var u := float(i) / float(segs) * TAU * radius_bottom / maxf(uv_m, 0.001)
		ring0.append(add_vertex(base + dir * radius_bottom, dir, Vector2(u, 0.0), col))
		ring1.append(add_vertex(base + dir * radius_top + Vector3(0, height, 0), dir, Vector2(u, height / maxf(uv_m, 0.001)), col))
	for i in range(segs):
		indices.append_array(PackedInt32Array([ring0[i], ring1[i], ring1[i + 1], ring0[i], ring1[i + 1], ring0[i + 1]]))
	if cap_top and radius_top > 0.0:
		var centre := add_vertex(base + Vector3(0, height, 0), Vector3.UP, Vector2(0.5, 0.5), col)
		for i in range(segs):
			indices.append_array(PackedInt32Array([centre, ring1[i + 1], ring1[i]]))


func commit(mesh: ArrayMesh, material: Material) -> void:
	if is_empty():
		return
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_COLOR] = colors
	arrays[Mesh.ARRAY_INDEX] = indices
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh.surface_set_material(mesh.get_surface_count() - 1, material)
