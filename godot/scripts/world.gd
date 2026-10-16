class_name World
extends Node3D
## S0 world: the JAG House neighbourhood (North Heights) built from the city plan export,
## sun/sky/day-night, the player, street NPCs with mocap, parked cars.

signal built(stats: Dictionary)

const CHUNK := "s0"
const GATE_WORLD := Vector3(-347.1, 22.1, -336.5)   # just outside the gate (local 27, 75.4)
const CAR_DIR := "res://assets/ext/kenney/car-kit/"

var builder: WorldBuilder
var mansion: MansionBuilder
var player: Player
var sun: DirectionalLight3D
var env: Environment
var sky_mat: ProceduralSkyMaterial
var npcs: Array[NPC] = []
var stats := {}
var car_models: Array[String] = []
var night_lights: Array[OmniLight3D] = []
var _night := -1.0
var _light_timer := 0.0


func _ready() -> void:
	var t0 := Time.get_ticks_msec()
	var chunk := WorldBuilder.load_chunk(CHUNK)
	builder = WorldBuilder.new(chunk)
	builder.build_all()
	mansion = MansionBuilder.new(builder)
	mansion.build()
	for p in mansion.palm_world_positions():
		builder._add_tree("tree-palm", p[0], p[1], builder.rng.randf() * TAU, builder.rng.randf_range(0.9, 1.25))
	builder.emit(self)
	_lighting()
	_spawn_player()
	_spawn_npcs()
	stats = builder.stats.duplicate()
	_spawn_cars()
	stats["build_ms"] = Time.get_ticks_msec() - t0
	stats["npcs"] = npcs.size()
	stats["collision_shapes"] = builder.collision_boxes.size() + 1
	print("World built: ", stats)
	built.emit(stats)
	Game.quality_changed.connect(_apply_quality)
	_apply_quality(Game.quality)


func _lighting() -> void:
	sun = DirectionalLight3D.new()
	sun.name = "Sun"
	sun.shadow_enabled = bool(Game.quality.get("shadows", false))
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 70.0
	sun.directional_shadow_split_1 = 0.2
	sun.directional_shadow_fade_start = 0.8
	sun.shadow_bias = 0.08
	sun.shadow_normal_bias = 2.0
	sun.light_angular_distance = 0.7
	add_child(sun)
	var we := WorldEnvironment.new()
	env = Environment.new()
	sky_mat = ProceduralSkyMaterial.new()
	sky_mat.sun_angle_max = 28.0
	sky_mat.sun_curve = 0.12
	sky_mat.sky_curve = 0.09
	sky_mat.ground_bottom_color = Color(0.2, 0.17, 0.13)
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_64
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.15
	env.tonemap_white = 4.0
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_depth_begin = 70.0
	env.fog_depth_end = float(Game.quality.get("fog_end", 220.0))
	env.fog_depth_curve = 1.4
	env.fog_sky_affect = 0.0
	env.fog_aerial_perspective = 0.85
	env.adjustment_enabled = false
	we.environment = env
	add_child(we)
	# ground skirt: hides the end of the chunk until streaming (S1) fills the world
	var skirt := MeshInstance3D.new()
	var pm := PlaneMesh.new()
	pm.size = Vector2(3000, 3000)
	skirt.mesh = pm
	var sm := StandardMaterial3D.new()
	sm.albedo_color = Color(0.36, 0.42, 0.24)
	sm.roughness = 1.0
	skirt.material_override = sm
	skirt.position = Vector3(builder.origin.x + builder.nx * builder.grid * 0.5, 16.5, builder.origin.y + builder.nz * builder.grid * 0.5)
	skirt.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(skirt)
	# pooled street lights (moved to the lamps nearest the player after dark)
	for i in range(6):
		var l := OmniLight3D.new()
		l.light_color = Color(1.0, 0.8, 0.55)
		l.light_energy = 0.0
		l.omni_range = 16.0
		l.omni_attenuation = 1.2
		l.shadow_enabled = false
		l.visible = false
		add_child(l)
		night_lights.append(l)


func _apply_quality(q: Dictionary) -> void:
	if sun:
		sun.shadow_enabled = bool(q.get("shadows", false))
	if env:
		env.fog_depth_end = float(q.get("fog_end", 220.0))
	# NPC count follows the preset
	var want := int(q.get("npcs", 8))
	for i in range(npcs.size()):
		npcs[i].visible = i < want
		npcs[i].process_mode = Node.PROCESS_MODE_INHERIT if i < want else Node.PROCESS_MODE_DISABLED


func _process(_delta: float) -> void:
	_update_sun(Game.day_fraction())


func _update_sun(f: float) -> void:
	# Lagos (6°N): sunrise ~06:30, sunset ~18:45, short twilight
	var h := f * 24.0
	var day_t := (h - 6.5) / 12.25                      # 0 at sunrise, 1 at sunset
	var elev := sin(clampf(day_t, 0.0, 1.0) * PI)      # 0..1 over the day
	if day_t < 0.0:
		elev = -minf(-day_t * 4.0, 1.0)
	elif day_t > 1.0:
		elev = -minf((day_t - 1.0) * 4.0, 1.0)
	var day := clampf(elev * 3.5 + 0.08, 0.0, 1.0)
	var dusk := clampf(1.0 - absf(elev - 0.08) * 4.0, 0.0, 1.0)   # golden band around the horizon
	var night := 1.0 - day
	# sun direction: rises in the east (+x), sets west, arcs slightly through the south (+z)
	var az := clampf(day_t, -0.1, 1.1) * PI
	var dir := Vector3(-cos(az), -maxf(elev, 0.04) - 0.05, -0.25)
	sun.look_at_from_position(Vector3.ZERO, dir.normalized(), Vector3.UP)
	var warm := Color(1.0, 0.66, 0.4)
	var white := Color(1.0, 0.97, 0.92)
	sun.light_color = white.lerp(warm, dusk)
	sun.light_energy = 1.4 * day
	# after sunset the same light becomes the moon: high in the north-east, cool, dim
	if night > 0.5:
		var k := clampf((night - 0.5) * 2.0, 0.0, 1.0)
		var moon_dir := Vector3(0.35, -0.8, 0.45).normalized()
		sun.look_at_from_position(Vector3.ZERO, dir.normalized().lerp(moon_dir, k).normalized(), Vector3.UP)
		sun.light_color = sun.light_color.lerp(Color(0.62, 0.72, 1.0), k)
		sun.light_energy = maxf(sun.light_energy, 0.4 * k)
	# sky
	var top_day := Color(0.22, 0.45, 0.85)
	var hor_day := Color(0.66, 0.78, 0.92)
	var top_dusk := Color(0.2, 0.28, 0.52)
	var hor_dusk := Color(0.92, 0.74, 0.6)     # pale warm; the orange lives in the sun halo, not the whole sky
	var top_night := Color(0.03, 0.04, 0.09)
	var hor_night := Color(0.1, 0.12, 0.2)
	var top := top_day.lerp(top_dusk, dusk * 0.8).lerp(top_night, night * night)
	var hor := hor_day.lerp(hor_dusk, dusk).lerp(hor_night, night * night)
	sky_mat.sky_top_color = top
	sky_mat.sky_horizon_color = hor
	sky_mat.ground_horizon_color = hor.darkened(0.25)
	sky_mat.sky_energy_multiplier = 1.0
	env.ambient_light_color = Color(0.56, 0.62, 0.72).lerp(Color(0.85, 0.7, 0.58), dusk * 0.2).lerp(Color(0.24, 0.28, 0.42), night)
	env.ambient_light_energy = 0.75 - 0.2 * night
	env.tonemap_exposure = 1.15 + 0.6 * night      # eye adaptation after dark
	env.fog_light_color = hor
	# emissive props after dark
	var n := clampf(night * 1.4, 0.0, 1.0)
	if absf(n - _night) > 0.02:
		_night = n
		Materials.get_mat("lamp_glow").emission_energy_multiplier = 0.3 + 4.0 * n
		var g := Materials.get_mat("mansion_glass")
		g.emission_enabled = true
		g.emission = Color(1.0, 0.8, 0.5)
		g.emission_energy_multiplier = 1.4 * n
	_update_night_lights(n)


## Moves the pooled omni lights to the lamps nearest the player (cheap night lighting).
func _update_night_lights(n: float) -> void:
	_light_timer -= get_process_delta_time()
	if _light_timer > 0.0 and n > 0.0:
		return
	_light_timer = 0.5
	var count := int(Game.quality.get("night_lights", 3))
	if n <= 0.01 or player == null:
		for l in night_lights:
			l.visible = false
		return
	var pp := player.global_position
	var lamps: Array = []
	for lp in builder.lamp_positions:
		lamps.append(lp)
	for lp in mansion.lights:
		lamps.append(lp)
	lamps.sort_custom(func(a, b): return a.distance_squared_to(pp) < b.distance_squared_to(pp))
	for i in range(night_lights.size()):
		var l := night_lights[i]
		if i < count and i < lamps.size():
			var lp: Vector3 = lamps[i]
			var tall := lp.y - builder.height_at(lp.x, lp.z) < 1.0
			l.global_position = lp + (Vector3(1.2, 6.0, 0) if tall else Vector3(0, 1.0, 0))
			l.omni_range = 22.0 if tall else 8.0
			l.light_energy = (3.2 if tall else 1.6) * n
			l.visible = true
		else:
			l.visible = false


func _spawn_player() -> void:
	player = Player.new()
	player.name = "Player"
	var entry := Rocketbox.avatar_entries("player")
	if not entry.is_empty():
		player.avatar_name = entry[0]["name"]
	add_child(player)
	player.global_transform = mansion.player_spawn()
	player.yaw = 0.0


func _spawn_npcs() -> void:
	var civs := Rocketbox.avatar_entries("civ")
	if civs.is_empty():
		return
	var routes := builder.sidewalk_paths
	# routes near the house first
	var near_routes := []
	for r in routes:
		var mid: Vector3 = r[r.size() / 2]
		if mid.distance_to(GATE_WORLD) < 140.0:
			near_routes.append(r)
	if near_routes.is_empty():
		near_routes = routes
	var rng := RandomNumberGenerator.new()
	rng.seed = 7
	var ci := 0
	# walkers
	for i in range(7):
		if near_routes.is_empty():
			break
		var r: PackedVector3Array = near_routes[i % near_routes.size()]
		var n := NPC.new()
		n.setup(civs[ci % civs.size()]["name"], 100 + i)
		ci += 1
		n.mode = "walk"
		n.path = r
		n.routes = routes
		n.forward = rng.randf() < 0.5
		n.path_index = rng.randi_range(0, r.size() - 1)
		add_child(n)
		n.global_position = r[n.path_index] + Vector3(0, 0.1, 0)
		npcs.append(n)
	# talking pair near the gate on the sidewalk
	var spot := _nearest_route_point(GATE_WORLD + Vector3(9, 0, 0))
	var a := _standing(civs[ci % civs.size()]["name"], spot + Vector3(-0.6, 0, 0), "gestic_talk", spot + Vector3(0.6, 0, 0))
	ci += 1
	var b := _standing(civs[ci % civs.size()]["name"], spot + Vector3(0.6, 0, 0), "gestic_listen", spot + Vector3(-0.6, 0, 0))
	ci += 1
	# phone caller further along
	var spot2 := _nearest_route_point(GATE_WORLD + Vector3(-26, 0, 0))
	_standing(civs[ci % civs.size()]["name"], spot2, "cell_phone", spot2 + Vector3(0, 0, 4))
	# police officer at the street corner
	var police := Rocketbox.avatar_entries("police")
	if not police.is_empty():
		var corner := _nearest_route_point(Vector3(-379.0, 22.0, -333.0))
		_standing(police[0]["name"], corner, "idle_look", corner + Vector3(3, 0, -3))
	# guard inside the gate
	var guards := Rocketbox.avatar_entries("guard")
	if not guards.is_empty():
		var gpos := mansion.W(31.5, 0.1, 73.0)
		_standing(guards[0]["name"], gpos, "idle", gpos + Vector3(-3, 0, 2))


func _standing(avatar: String, pos: Vector3, category: String, face: Vector3) -> NPC:
	var n := NPC.new()
	n.setup(avatar, 500 + npcs.size())
	n.mode = "idle"
	n.idle_category = category
	n.face_target = face
	add_child(n)
	n.global_position = pos + Vector3(0, 0.1, 0)
	npcs.append(n)
	return n


func _nearest_route_point(p: Vector3) -> Vector3:
	var best := p
	var bd := INF
	for r in builder.sidewalk_paths:
		for i in range(r.size() - 1):
			var a: Vector3 = r[i]
			var b: Vector3 = r[i + 1]
			var ab := b - a
			var t := clampf((p - a).dot(ab) / maxf(ab.length_squared(), 0.001), 0.0, 1.0)
			var q := a + ab * t
			var d := Vector2(q.x - p.x, q.z - p.z).length()
			if d < bd:
				bd = d
				best = q
	return best


# ---------------------------------------------------------------- cars
func _spawn_cars() -> void:
	var dir := DirAccess.open(CAR_DIR)
	if dir == null:
		print("World: no car models at ", CAR_DIR, " (parked cars skipped)")
		return
	for f in dir.get_files():
		if f.ends_with(".glb") or f.ends_with(".gltf"):
			car_models.append(f)
	if car_models.is_empty():
		return
	var rng := RandomNumberGenerator.new()
	rng.seed = 99
	var pref := {"owner_suv": ["suv-luxury", "suv"], "owner_sedan": ["sedan-sports", "sedan", "race"],
		"car": ["sedan", "hatchback-sports", "suv", "taxi", "van", "truck"], "minibus": ["van", "delivery"]}
	var slots: Array = mansion.car_slots.duplicate()
	# a handful of street cars near the house (budget: ≤ 10 cars in S0)
	var street: Array = builder.car_slots.duplicate()
	street.sort_custom(func(a, b): return a["pos"].distance_to(GATE_WORLD) < b["pos"].distance_to(GATE_WORLD))
	for i in range(mini(8, street.size())):
		slots.append(street[i])
	var count := 0
	for s in slots:
		var options: Array = pref.get(s["kind"], pref["car"])
		var file := ""
		for o in options:
			for m in car_models:
				if m.begins_with(o + "."):
					file = m
					break
			if file != "":
				break
		if file == "":
			file = car_models[rng.randi_range(0, car_models.size() - 1)]
		var ps = load(CAR_DIR + file)
		if ps == null:
			continue
		var raw: Node3D = ps.instantiate()
		var inst := _merge_static(raw)   # one MeshInstance3D per car instead of 8-12 parts
		raw.free()
		var holder := Node3D.new()
		holder.name = "Car_%d" % count
		holder.add_child(inst)
		add_child(holder)
		# normalise length to real-world size
		var aabb := _aabb_of(inst)
		var length := maxf(aabb.size.x, aabb.size.z)
		var target := 4.6 if s["kind"] != "minibus" else 5.2
		var sc := target / maxf(length, 0.01)
		inst.scale = Vector3.ONE * sc
		inst.position = Vector3(0, -aabb.position.y * sc, 0)
		holder.global_position = s["pos"]
		holder.rotation.y = float(s["yaw"]) + (PI * 0.5 if aabb.size.x > aabb.size.z else 0.0)
		if s["kind"] == "minibus":
			_tint(inst, Color(0.95, 0.75, 0.1))
		for mi in inst.find_children("*", "MeshInstance3D", true, false):
			mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
		var body := StaticBody3D.new()
		var box := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(aabb.size.x * sc, aabb.size.y * sc, aabb.size.z * sc)
		box.shape = shape
		box.position = Vector3(0, aabb.size.y * sc * 0.5, 0)
		body.add_child(box)
		holder.add_child(body)
		count += 1
	stats["cars"] = count


## Flattens all MeshInstance3D parts of an imported scene into one mesh (one surface per material).
func _merge_static(src: Node3D) -> Node3D:
	var by_mat: Dictionary = {}
	for mi in src.find_children("*", "MeshInstance3D", true, false):
		var m: MeshInstance3D = mi
		if m.mesh == null:
			continue
		var xf: Transform3D = m.transform
		var p := m.get_parent()
		while p != src and p is Node3D:
			xf = (p as Node3D).transform * xf
			p = p.get_parent()
		for si in range(m.mesh.get_surface_count()):
			var mat := m.get_active_material(si)
			var key := mat.get_instance_id() if mat else 0
			if not by_mat.has(key):
				var st := SurfaceTool.new()
				st.begin(Mesh.PRIMITIVE_TRIANGLES)
				by_mat[key] = [st, mat]
			(by_mat[key][0] as SurfaceTool).append_from(m.mesh, si, xf)
	var mesh := ArrayMesh.new()
	for key in by_mat.keys():
		var st: SurfaceTool = by_mat[key][0]
		st.index()
		st.commit(mesh)
		var mat: Material = by_mat[key][1]
		if mat is BaseMaterial3D:
			var bm: BaseMaterial3D = (mat as BaseMaterial3D).duplicate()
			bm.roughness = 0.35
			bm.metallic = 0.25
			bm.metallic_specular = 0.6
			mat = bm
		mesh.surface_set_material(mesh.get_surface_count() - 1, mat)
	var out := MeshInstance3D.new()
	out.name = "CarMesh"
	out.mesh = mesh
	return out


func _aabb_of(n: Node3D) -> AABB:
	var out := AABB()
	var first := true
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		var a: AABB = (mi as MeshInstance3D).get_aabb()
		a = (mi as Node3D).transform * a
		var p := mi.get_parent()
		while p != n and p is Node3D:
			a = (p as Node3D).transform * a
			p = p.get_parent()
		if first:
			out = a
			first = false
		else:
			out = out.merge(a)
	return out


func _tint(n: Node3D, c: Color) -> void:
	for mi in n.find_children("*", "MeshInstance3D", true, false):
		var m: MeshInstance3D = mi
		for s in range(m.mesh.get_surface_count()):
			var src := m.mesh.surface_get_material(s)
			if src is BaseMaterial3D:
				var sm: BaseMaterial3D = src
				if sm.albedo_color.v > 0.3 and sm.albedo_color.s > 0.2:
					var dup: BaseMaterial3D = sm.duplicate()
					dup.albedo_color = c
					m.set_surface_override_material(s, dup)
