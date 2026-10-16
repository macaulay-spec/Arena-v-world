extends Node
## Headless smoke test: builds the S0 world, checks budgets and key invariants. Exit code != 0 on failure.
## Run: godot --headless --path godot res://tests/test_world.tscn

func _ready() -> void:
	var fails: Array[String] = []
	var t0 := Time.get_ticks_msec()
	var world := World.new()
	add_child(world)
	var st: Dictionary = world.stats
	print("stats: ", st)
	if st.get("tris", 0) <= 0: fails.append("no geometry built")
	if st.get("tris", 0) > 150000: fails.append("static tris %d over 150k budget" % st["tris"])
	if st.get("surfaces", 0) > 40: fails.append("too many surfaces %d" % st["surfaces"])
	if world.player == null: fails.append("no player")
	elif world.player.anim == null: fails.append("player has no AnimationPlayer (Rocketbox assets missing?)")
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
