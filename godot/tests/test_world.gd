extends Node
## Headless smoke test: builds the S0 world, checks budgets and key invariants. Exit code != 0 on failure.
## Run: godot --headless --path godot res://tests/test_world.tscn

func _ready() -> void:
	var fails: Array[String] = []
	var t0 := Time.get_ticks_msec()
	var world := World.new()
	add_child(world)
	for frame in range(3):
		await get_tree().physics_frame
	await get_tree().create_timer(0.6).timeout
	var st: Dictionary = world.stats
	print("stats: ", st)
	if st.get("tris", 0) <= 0: fails.append("no geometry built")
	if st.get("tris", 0) > 150000: fails.append("static + imported tris %d over 150k budget" % st["tris"])
	if st.get("surfaces", 0) > 40: fails.append("too many batched city/house surfaces %d" % st["surfaces"])
	if int(st.get("scene_assets", 0)) < 80: fails.append("expected >= 80 licensed 3D house props, got %d" % int(st.get("scene_assets", 0)))
	if int(st.get("asset_mesh_groups", 0)) < 30: fails.append("too few imported furniture mesh groups: %d" % int(st.get("asset_mesh_groups", 0)))
	if int(st.get("asset_errors", 0)) != 0: fails.append("failed to load %d imported furniture assets" % int(st.get("asset_errors", 0)))
	if world.get_node_or_null("FurnitureAssets") == null: fails.append("missing imported 3D furniture scene")
	if world.player == null: fails.append("no player")
	else:
		var local_spawn: Vector3 = world.player.global_position - Vector3(MansionBuilder.OX, MansionBuilder.OY, MansionBuilder.OZ)
		if local_spawn.x < 27.0 or local_spawn.x > 39.0 or local_spawn.z < 39.0 or local_spawn.z > 44.0:
			fails.append("player did not start inside JAG House foyer: %s" % str(local_spawn))
		if world.front_door == null: fails.append("JAG House has no working front door")
		elif not world.front_door.is_open: fails.append("front door did not auto-open for the starting player")
		else:
			var door_probe := KinematicCollision3D.new()
			if world.player.test_move(world.player.global_transform, Vector3(0, 0, 2.5), door_probe):
				fails.append("front-door opening blocked by %s at %s (normal %s)" % [str(door_probe.get_collider()), str(door_probe.get_position()), str(door_probe.get_normal())])
		if world.player.anim == null: fails.append("player has no AnimationPlayer (Rocketbox assets missing?)")
		elif not world.player.anim.has_animation("rb/" + world.player.walk_clip): fails.append("walk clip missing: " + world.player.walk_clip)
	if world.npcs.size() < 10: fails.append("expected >= 10 NPCs, got %d" % world.npcs.size())
	# NPC skinned tris budget
	var npc_tris := 0
	for n in world.npcs:
		for mi in n.find_children("*", "MeshInstance3D", true, false):
			var m: Mesh = mi.mesh
			for s in range(m.get_surface_count()):
				npc_tris += m.surface_get_arrays(s)[Mesh.ARRAY_INDEX].size() / 3
	print("npc tris total: ", npc_tris, " over ", world.npcs.size(), " npcs")
	if world.npcs.size() > 0 and npc_tris / world.npcs.size() > 9000: fails.append("NPC average tris too high")
	# every placed object must have a sane world size (a 460x car once filled the sky)
	for mi in world.find_children("*", "MeshInstance3D", true, false):
		if mi.mesh == null or mi == world.skirt or mi.name == "Chunk":
			continue
		var wsz: Vector3 = ((mi as MeshInstance3D).global_transform * (mi as MeshInstance3D).get_aabb()).size
		if maxf(wsz.x, maxf(wsz.y, wsz.z)) > 12.0:
			fails.append("oversized mesh %s: %s" % [mi.get_path(), str(wsz)])
	# spawn on the plateau
	var p := world.player.global_position
	if absf(p.y - 22.3) > 0.5: fails.append("player spawn y %.2f not on plateau" % p.y)
	# sidewalk routes exist near the gate
	if world.builder.sidewalk_paths.size() < 4: fails.append("too few sidewalk routes")
	print("build+checks %d ms" % (Time.get_ticks_msec() - t0))
	if fails.is_empty():
		print("TEST OK")
		get_tree().quit(0)
	else:
		for f in fails: printerr("FAIL: " + f)
		get_tree().quit(1)
