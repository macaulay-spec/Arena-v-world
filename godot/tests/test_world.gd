extends Node
## Headless smoke test: builds the S0 world, checks budgets and key invariants. Exit code != 0 on failure.
## Run: godot --headless --path godot res://tests/test_world.tscn

func _ready() -> void:
	var fails: Array[String] = []
	var t0 := Time.get_ticks_msec()
	Game.begin_new_game("Test Hero", "Female_Adult_01", 1.05, 0.98)
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
		if world.player.avatar_name != "Female_Adult_01": fails.append("new-game avatar selection was not applied to the player")
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
	var housekeeper: NPC
	var priority_household := 0
	for npc in world.npcs:
		if npc.household_priority: priority_household += 1
		if npc.role_id == "housekeeper": housekeeper = npc
	if priority_household < 3: fails.append("JAG House household contacts were not spawned")
	if housekeeper == null:
		fails.append("JAG House is missing its housekeeper contact")
	else:
		var spawn_before_talk: Vector3 = world.player.global_position
		world.player.global_position = housekeeper.global_position + Vector3(0, 0, 2.0)
		if world.interaction_label() != "TALK TO HOUSEKEEPER": fails.append("housekeeper is not interactable from nearby")
		if housekeeper.dialogue_line(Game.profile).is_empty(): fails.append("housekeeper has no dialogue")
		world.interact()
		world.player.global_position = spawn_before_talk
	# The furnished house is a working home: meal purchase/healing and sleep/day progression.
	var home_test_spawn: Vector3 = world.player.global_position
	var home_cash_before := int(Game.profile.get("cash", 0))
	var meals_before := int(Game.profile.get("meals", 0))
	Game.profile["health"] = 50.0
	world.player.global_position = world.fridge_position + Vector3(0, 0, 2.0)
	if world.interaction_label() != "EAT · ₦250": fails.append("fridge is not interactable in the kitchen")
	world.interact()
	if int(Game.profile.get("cash", -1)) != home_cash_before - 250: fails.append("meal price was not charged")
	if int(Game.profile.get("meals", -1)) != meals_before + 1 or absf(float(Game.profile.get("health", 0.0)) - 75.0) > 0.01:
		fails.append("meal did not increment the stat and restore health")
	var day_before_sleep := int(Game.profile.get("day", 1))
	Game.profile["health"] = 55.0
	Game.minutes = 23.0 * 60.0
	world.player.global_position = world.sleep_position + Vector3(0, 0, 2.0)
	if world.interaction_label() != "SLEEP · Rest until 07:00": fails.append("master bed is not interactable upstairs")
	world.interact()
	if int(Game.profile.get("day", 0)) != day_before_sleep + 1 or absf(Game.minutes - 7.0 * 60.0) > 0.01:
		fails.append("sleep did not advance to the next morning")
	if absf(float(Game.profile.get("health", 0.0)) - 100.0) > 0.01:
		fails.append("sleep did not restore full health")
	world.player.global_position = home_test_spawn
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
	# Exercise the first real driving/job loop in the single-player world.
	if world.owned_vehicles.size() != 2:
		fails.append("expected two driveable JAG owner cars, got %d" % world.owned_vehicles.size())
	if world.interaction_label() != "ACCEPT COURIER SHIFT":
		fails.append("courier dispatch should be available from the starting foyer, got: " + world.interaction_label())
	else:
		world.interact()
		if not world.delivery_active: fails.append("courier shift did not start")
		if int(Game.profile.get("job_reward", 0)) <= 0: fails.append("courier job has no reward")
		world.delivery_destination = world.player.global_position
		world.interact()
		if world.delivery_active: fails.append("courier job did not complete at the destination")
		if int(Game.profile.get("deliveries", 0)) != 1: fails.append("completed delivery was not counted")
	if not world.owned_vehicles.is_empty():
		var spawn_before_vehicle_test: Vector3 = world.player.global_position
		var test_vehicle: DrivableCar = world.owned_vehicles[0]
		world.player.global_position = test_vehicle.global_position + Vector3(0, 0, 3.0)
		world.interact()
		if world.active_vehicle != test_vehicle: fails.append("player could not enter the owner car")
		elif world.player.model.visible: fails.append("player avatar stayed visible inside the car")
		if world.active_vehicle == test_vehicle:
			if not Game.save_game(world):
				fails.append("could not save while inside an owner car")
			else:
				world.active_vehicle.exit()
				world.active_vehicle = null
				if not Game.load_save():
					fails.append("could not reload active-car save")
				else:
					Game.restore_world(world)
					if not is_instance_valid(world.active_vehicle) or world.active_vehicle.vehicle_id != test_vehicle.vehicle_id:
						fails.append("active owner car did not survive save/load")
			if is_instance_valid(world.active_vehicle):
				world.interact()
		if world.active_vehicle != null: fails.append("player could not exit the owner car")
		world.player.global_position = spawn_before_vehicle_test
	# A nearby Rocketbox officer should end a wanted chase with an arrest/fine.
	Game.set_wanted(1)
	world._spawn_police_pursuer()
	if world.police_pursuer == null:
		fails.append("wanted level did not spawn a Rocketbox police pursuer")
	else:
		var cash_before_arrest := int(Game.profile.get("cash", 0))
		world.police_pursuer.global_position = world.player.global_position + Vector3(0, 0, 1.0)
		for frame in range(4):
			await get_tree().physics_frame
		if int(Game.profile.get("wanted", -1)) != 0: fails.append("police did not clear wanted level on arrest")
		if int(Game.profile.get("cash", -1)) != maxi(0, cash_before_arrest - 1000): fails.append("arrest fine was not charged")
	# Exercise the single-player profile + position save round trip without leaving a test save behind.
	var profile_before: Dictionary = Game.profile.duplicate(true)
	var minutes_before: float = Game.minutes
	var player_pos_before: Vector3 = world.player.global_position
	Game.profile["cash"] = int(Game.profile.get("cash", 25000)) + 177
	Game.minutes = 22.5 * 60.0
	if not Game.save_game(world):
		fails.append("could not write game save")
	else:
		Game.profile["cash"] = 0
		if not Game.load_save():
			fails.append("could not load game save")
		else:
			if int(Game.profile.get("cash", -1)) != int(profile_before.get("cash", 25000)) + 177:
				fails.append("saved profile cash did not round-trip")
			if absf(Game.minutes - 22.5 * 60.0) > 0.01:
				fails.append("saved in-game clock did not round-trip")
			Game.restore_world(world)
			if world.player.global_position.distance_to(player_pos_before) > 0.01:
				fails.append("saved player position did not round-trip")
	Game.profile = profile_before
	Game.minutes = minutes_before
	Game.delete_save()
	print("build+checks %d ms" % (Time.get_ticks_msec() - t0))
	if fails.is_empty():
		print("TEST OK")
		get_tree().quit(0)
	else:
		for f in fails: printerr("FAIL: " + f)
		get_tree().quit(1)
