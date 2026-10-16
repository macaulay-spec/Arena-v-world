extends Node
## Boot flow: title card (key art + build card) -> tap -> build the world -> HUD.

var title: CanvasLayer
var world: World
var hud: HUD
var status: Label
var _started := false
var _auto_start := false


func _ready() -> void:
	get_tree().root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	_build_title()
	if OS.has_feature("screenshot") or "--autostart" in OS.get_cmdline_user_args():
		_auto_start = true
	if _auto_start:
		call_deferred("start_game")


func _build_title() -> void:
	title = CanvasLayer.new()
	title.layer = 5
	add_child(title)
	var bg := TextureRect.new()
	bg.texture = load("res://ui/title.png") if ResourceLoader.exists("res://ui/title.png") else load("res://ui/splash.png")
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	title.add_child(bg)
	var vb := VBoxContainer.new()
	vb.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	vb.position = Vector2(40, -170)
	title.add_child(vb)
	var name := Label.new()
	name.text = "VORA CITY"
	name.add_theme_font_size_override("font_size", 64)
	name.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	name.add_theme_constant_override("shadow_offset_y", 3)
	vb.add_child(name)
	var sub := Label.new()
	sub.text = "a JAG game  ·  slice S0 proof  ·  build %s  ·  %s" % [str(Game.build.get("commit", "dev")).substr(0, 7), str(Game.build.get("date", ""))]
	sub.add_theme_font_size_override("font_size", 16)
	sub.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	vb.add_child(sub)
	status = Label.new()
	status.text = "TAP TO START"
	status.add_theme_font_size_override("font_size", 22)
	status.add_theme_color_override("font_color", Color(1, 0.85, 0.4))
	status.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	vb.add_child(status)


func _unhandled_input(event: InputEvent) -> void:
	if _started:
		return
	if (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed) or (event is InputEventKey and event.pressed):
		start_game()


func start_game() -> void:
	if _started:
		return
	_started = true
	status.text = "Loading JAG House, North Heights…"
	await get_tree().process_frame
	await get_tree().process_frame
	world = World.new()
	world.name = "World"
	add_child(world)
	hud = HUD.new()
	hud.name = "HUD"
	hud.player = world.player
	add_child(hud)
	title.queue_free()
	if world.player and DisplayServer.get_name() != "headless" and not DisplayServer.is_touchscreen_available():
		pass
