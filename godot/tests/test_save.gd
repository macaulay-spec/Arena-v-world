extends Node
## Headless unit test for new-game profile creation and local save/load.
## Run: godot --headless --path godot res://tests/test_save.tscn


func _ready() -> void:
	var fails: Array[String] = []
	Game.begin_new_game("Test Runner", "Male_Adult_01", 1.15, 0.95)
	Game.profile["cash"] = 123456
	Game.profile["health"] = 73.5
	Game.minutes = 22.5 * 60.0
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
