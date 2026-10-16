extends Node
## Headless unit test for new-game profile creation and local save/load.
## Run: godot --headless --path godot res://tests/test_save.tscn


func _ready() -> void:
	var fails: Array[String] = []
	Game.begin_new_game("Test Runner", "Male_Adult_01", 1.15, 0.95)
	Game.profile["cash"] = 123456
	Game.profile["health"] = 73.5
	Game.profile["deliveries"] = 4
	Game.profile["job_active"] = true
	Game.profile["job_destination"] = [12.5, 22.1, -38.75]
	Game.profile["job_reward"] = 4200
	Game.profile["wanted"] = 3
	Game.minutes = 22.5 * 60.0
	Game.add_cash(-999999)
	if int(Game.profile.get("cash", -1)) != 0: fails.append("cash helper allowed a negative balance")
	Game.profile["cash"] = 123456
	Game.set_wanted(99)
	if int(Game.profile.get("wanted", -1)) != 5: fails.append("wanted-level helper did not clamp to five stars")
	Game.set_wanted(3)
	if not Game.save_game():
		fails.append("could not write save")
	elif not Game.load_save():
		fails.append("could not reload save")
	else:
		if String(Game.profile.get("name", "")) != "Test Runner":
			fails.append("player name did not round-trip")
		if String(Game.profile.get("avatar_name", "")) != "Male_Adult_01":
			fails.append("avatar selection did not round-trip")
		if absf(float(Game.profile.get("build", 0.0)) - 1.15) > 0.001:
			fails.append("build selection did not round-trip")
		if absf(float(Game.profile.get("height", 0.0)) - 0.95) > 0.001:
			fails.append("height selection did not round-trip")
		if int(Game.profile.get("cash", -1)) != 123456:
			fails.append("cash did not round-trip")
		if int(Game.profile.get("deliveries", -1)) != 4:
			fails.append("delivery count did not round-trip")
		if not bool(Game.profile.get("job_active", false)) or int(Game.profile.get("job_reward", -1)) != 4200:
			fails.append("active courier job did not round-trip")
		var saved_destination: Array = Game.profile.get("job_destination", [])
		if saved_destination.size() != 3 or absf(float(saved_destination[2]) - -38.75) > 0.001:
			fails.append("courier destination did not round-trip")
		if int(Game.profile.get("wanted", -1)) != 3:
			fails.append("wanted level did not round-trip")
		if absf(float(Game.profile.get("health", 0.0)) - 73.5) > 0.001:
			fails.append("health did not round-trip")
		if absf(Game.minutes - 22.5 * 60.0) > 0.001:
			fails.append("game clock did not round-trip")
	Game.delete_save()
	if fails.is_empty():
		print("SAVE TEST OK")
		get_tree().quit(0)
	else:
		for failure: String in fails:
			printerr("SAVE FAIL: " + failure)
		get_tree().quit(1)
