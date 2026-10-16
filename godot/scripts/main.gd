extends Node
## Boot flow: title card (key art + build card) -> tap -> build the world -> HUD.

var title: CanvasLayer
var world: World
var hud: HUD
var status: Label
var build_meta: Label
var menu_panel: PanelContainer
var creator_panel: PanelContainer
var name_input: LineEdit
var avatar_label: Label
var body_label: Label
var height_label: Label
var preview_viewport: SubViewport
var preview_model: Node3D
var _avatar_choices: Array[String] = []
var _avatar_index := 0
var _creator_sex := "m"
var _build_value := 1.0
var _height_value := 1.0
var _screen := "title"
var _started := false
var _auto_start := false
var _autosave_timer := 0.0


func _ready() -> void:
	get_tree().root.content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	_build_title()
	if ShotRunner.requested() != "" or "--autostart" in OS.get_cmdline_user_args():
		_auto_start = true
	if _auto_start:
		call_deferred("_quick_start")
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--title-shot="):
			_title_shot(a.substr(13))
		elif a.begins_with("--creator-shot="):
			_creator_shot(a.substr(15))


func _process(delta: float) -> void:
	if not _started:
		return
	_autosave_timer += delta
	if _autosave_timer >= 45.0:
		_autosave_timer = 0.0
		Game.save_game(world)


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_WM_CLOSE_REQUEST:
		if _started and is_instance_valid(world):
			Game.save_game(world)


func _quick_start() -> void:
	Game.begin_new_game("JAG", "Male_Adult_01", 1.0, 1.0)
	start_game()


## Dev/CI: capture the title screen to <dir>/title.png and quit.
func _title_shot(dir: String) -> void:
	DirAccess.make_dir_recursive_absolute(dir)
	for i in range(12):
		await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png(dir.path_join("title.png"))
	print("title shot saved")
	get_tree().quit(0)


func _creator_shot(dir: String) -> void:
	_open_creator()
	for i in range(24):
		await get_tree().process_frame
	DirAccess.make_dir_recursive_absolute(dir)
	var image: Image = get_viewport().get_texture().get_image()
	if image == null:
		printerr("creator shot failed: no rendered viewport image")
		get_tree().quit(1)
		return
	var error := image.save_png(dir.path_join("creator.png"))
	if error != OK:
		printerr("creator shot failed: image save error %s" % error_string(error))
		get_tree().quit(1)
		return
	print("creator shot saved")
	get_tree().quit(0)


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
	var shade := ColorRect.new()
	shade.color = Color(0.02, 0.025, 0.04, 0.28)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	title.add_child(shade)
	var grad := TextureRect.new()
	var gt := GradientTexture2D.new()
	var g := Gradient.new()
	g.set_color(0, Color(0, 0, 0, 0))
	g.set_color(1, Color(0, 0, 0, 0.78))
	gt.gradient = g
	gt.fill_from = Vector2(0, 0)
	gt.fill_to = Vector2(0, 1)
	gt.width = 4
	gt.height = 64
	grad.texture = gt
	grad.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	grad.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	grad.anchor_top = 0.55
	title.add_child(grad)

	var brand := VBoxContainer.new()
	brand.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	brand.position = Vector2(40, -172)
	brand.add_theme_constant_override("separation", 6)
	title.add_child(brand)
	var logo := Label.new()
	logo.text = "VORA CITY"
	logo.add_theme_font_size_override("font_size", 64)
	logo.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	logo.add_theme_constant_override("shadow_offset_y", 3)
	brand.add_child(logo)
	build_meta = Label.new()
	build_meta.text = "a JAG game  ·  SINGLE-PLAYER  ·  North Heights / JAG House  ·  build %s  ·  %s" % [str(Game.build.get("commit", "dev")).substr(0, 7), str(Game.build.get("date", ""))]
	build_meta.add_theme_font_size_override("font_size", 16)
	build_meta.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	brand.add_child(build_meta)
	status = Label.new()
	status.text = "YOUR STORY STARTS AT JAG HOUSE"
	status.add_theme_font_size_override("font_size", 18)
	status.add_theme_color_override("font_color", Color(1, 0.85, 0.4))
	status.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	brand.add_child(status)

	menu_panel = PanelContainer.new()
	menu_panel.anchor_left = 1.0
	menu_panel.anchor_right = 1.0
	menu_panel.anchor_top = 0.5
	menu_panel.anchor_bottom = 0.5
	menu_panel.offset_left = -380
	menu_panel.offset_right = -40
	menu_panel.offset_top = -205
	menu_panel.offset_bottom = 205
	menu_panel.add_theme_stylebox_override("panel", _panel_style())
	title.add_child(menu_panel)
	var menu := VBoxContainer.new()
	menu.add_theme_constant_override("separation", 12)
	menu_panel.add_child(menu)
	var heading := Label.new()
	heading.text = "VORA CITY"
	heading.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	heading.add_theme_font_size_override("font_size", 28)
	menu.add_child(heading)
	var continue_button := _menu_button("CONTINUE")
	continue_button.visible = Game.has_save()
	continue_button.pressed.connect(_continue_game)
	menu.add_child(continue_button)
	var new_button := _menu_button("NEW GAME")
	new_button.pressed.connect(_open_creator)
	menu.add_child(new_button)
	var quality_button := _menu_button("QUALITY: " + str(Game.quality.get("label", "Lite")))
	quality_button.pressed.connect(func():
		var choices: Array[String] = ["lite", "standard", "high"]
		var index := choices.find(Game.quality_id)
		Game.set_quality(choices[(index + 1) % choices.size()])
		quality_button.text = "QUALITY: " + str(Game.quality.get("label", "Lite"))
	)
	menu.add_child(quality_button)
	var scope_note := Label.new()
	scope_note.text = "Offline single-player · autosave enabled"
	scope_note.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	scope_note.add_theme_font_size_override("font_size", 13)
	scope_note.add_theme_color_override("font_color", Color(0.82, 0.84, 0.88))
	menu.add_child(scope_note)
	_build_creator_panel()


func _panel_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.025, 0.035, 0.055, 0.9)
	style.border_color = Color(0.85, 0.67, 0.28, 0.8)
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	style.set_content_margin_all(18)
	return style


func _menu_button(text: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(0, 56)
	button.add_theme_font_size_override("font_size", 18)
	button.focus_mode = Control.FOCUS_NONE
	return button


func _build_creator_panel() -> void:
	creator_panel = PanelContainer.new()
	creator_panel.anchor_left = 0.43
	creator_panel.anchor_right = 0.98
	creator_panel.anchor_top = 0.08
	creator_panel.anchor_bottom = 0.92
	creator_panel.add_theme_stylebox_override("panel", _panel_style())
	creator_panel.visible = false
	title.add_child(creator_panel)
	var content := HBoxContainer.new()
	content.add_theme_constant_override("separation", 18)
	creator_panel.add_child(content)
	var form := VBoxContainer.new()
	form.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	form.add_theme_constant_override("separation", 9)
	content.add_child(form)
	var heading := Label.new()
	heading.text = "CREATE YOUR CHARACTER"
	heading.add_theme_font_size_override("font_size", 23)
	form.add_child(heading)
	var detail := Label.new()
	detail.text = "Choose a Rocketbox person and tune their build."
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.add_theme_font_size_override("font_size", 13)
	form.add_child(detail)
	var name_caption := Label.new()
	name_caption.text = "NAME"
	form.add_child(name_caption)
	name_input = LineEdit.new()
	name_input.placeholder_text = "Enter your name"
	name_input.text = "JAG"
	name_input.max_length = 24
	name_input.custom_minimum_size.y = 42
	form.add_child(name_input)

	var sex_row := HBoxContainer.new()
	form.add_child(sex_row)
	var sex_caption := Label.new()
	sex_caption.text = "BODY"
	sex_caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sex_row.add_child(sex_caption)
	var sex_button := _menu_button("MALE")
	sex_button.custom_minimum_size = Vector2(124, 42)
	sex_button.pressed.connect(func():
		_creator_sex = "f" if _creator_sex == "m" else "m"
		sex_button.text = "FEMALE" if _creator_sex == "f" else "MALE"
		_avatar_index = 0
		_refresh_avatar_choices()
		_refresh_creator_preview()
	)
	sex_row.add_child(sex_button)

	var avatar_row := HBoxContainer.new()
	avatar_row.add_theme_constant_override("separation", 8)
	form.add_child(avatar_row)
	var prev := _menu_button("‹")
	prev.custom_minimum_size = Vector2(48, 44)
	prev.pressed.connect(func(): _cycle_avatar(-1))
	avatar_row.add_child(prev)
	avatar_label = Label.new()
	avatar_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	avatar_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	avatar_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	avatar_label.custom_minimum_size.y = 42
	avatar_row.add_child(avatar_label)
	var next := _menu_button("›")
	next.custom_minimum_size = Vector2(48, 44)
	next.pressed.connect(func(): _cycle_avatar(1))
	avatar_row.add_child(next)

	var build_row := HBoxContainer.new()
	form.add_child(build_row)
	var build_down := _menu_button("−")
	build_down.custom_minimum_size = Vector2(48, 44)
	build_down.pressed.connect(func(): _adjust_build(-0.05))
	build_row.add_child(build_down)
	body_label = Label.new()
	body_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	body_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	build_row.add_child(body_label)
	var build_up := _menu_button("+")
	build_up.custom_minimum_size = Vector2(48, 44)
	build_up.pressed.connect(func(): _adjust_build(0.05))
	build_row.add_child(build_up)

	var height_row := HBoxContainer.new()
	form.add_child(height_row)
	var height_down := _menu_button("−")
	height_down.custom_minimum_size = Vector2(48, 44)
	height_down.pressed.connect(func(): _adjust_height(-0.05))
	height_row.add_child(height_down)
	height_label = Label.new()
	height_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	height_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	height_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	height_row.add_child(height_label)
	var height_up := _menu_button("+")
	height_up.custom_minimum_size = Vector2(48, 44)
	height_up.pressed.connect(func(): _adjust_height(0.05))
	height_row.add_child(height_up)

	var caution := Label.new()
	caution.text = "Starting a new game replaces this device's single autosave."
	caution.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	caution.add_theme_font_size_override("font_size", 12)
	caution.add_theme_color_override("font_color", Color(1.0, 0.78, 0.55))
	form.add_child(caution)
	var start_button := _menu_button("CREATE & START AT JAG HOUSE")
	start_button.pressed.connect(_create_and_start)
	form.add_child(start_button)
	var cancel_button := _menu_button("BACK")
	cancel_button.pressed.connect(_close_creator)
	form.add_child(cancel_button)

	var preview := SubViewportContainer.new()
	preview.custom_minimum_size = Vector2(270, 500)
	preview.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	preview.size_flags_vertical = Control.SIZE_EXPAND_FILL
	preview.stretch = true
	preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
	content.add_child(preview)
	preview_viewport = SubViewport.new()
	preview_viewport.size = Vector2i(320, 520)
	preview_viewport.transparent_bg = true
	preview_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	preview.add_child(preview_viewport)
	var stage := Node3D.new()
	preview_viewport.add_child(stage)
	var camera := Camera3D.new()
	camera.position = Vector3(0, 1.0, -3.8)
	camera.current = true
	camera.fov = 34.0
	stage.add_child(camera)
	camera.look_at(Vector3(0, 0.92, 0), Vector3.UP)
	var key_light := DirectionalLight3D.new()
	key_light.rotation_degrees = Vector3(-26, -22, 0)
	key_light.light_energy = 1.4
	stage.add_child(key_light)
	var fill_light := OmniLight3D.new()
	fill_light.position = Vector3(1.0, 1.5, 2.0)
	fill_light.light_energy = 0.7
	fill_light.omni_range = 5.0
	stage.add_child(fill_light)
	_refresh_avatar_choices()
	_refresh_creator_preview()


func _open_creator() -> void:
	_screen = "creator"
	menu_panel.visible = false
	creator_panel.visible = true
	build_meta.visible = false
	preview_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	_build_value = 1.0
	_height_value = 1.0
	_refresh_creator_preview()


func _close_creator() -> void:
	_screen = "title"
	creator_panel.visible = false
	preview_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	build_meta.visible = true
	menu_panel.visible = true


func _continue_game() -> void:
	if not Game.load_save():
		status.text = "No valid save found. Start a new game."
		return
	_screen = "loading"
	menu_panel.visible = false
	start_game()


func _create_and_start() -> void:
	var chosen_avatar := _selected_avatar()
	Game.begin_new_game(name_input.text, chosen_avatar, _build_value, _height_value)
	_screen = "loading"
	start_game()


func _refresh_avatar_choices() -> void:
	_avatar_choices.clear()
	for entry: Dictionary in Rocketbox.avatar_entries("civ"):
		if String(entry.get("sex", "m")) == _creator_sex:
			_avatar_choices.append(String(entry.get("name", "")))
	if _avatar_choices.is_empty():
		_avatar_choices.append("Male_Adult_01" if _creator_sex == "m" else "Female_Adult_01")
	_avatar_index = clampi(_avatar_index, 0, _avatar_choices.size() - 1)


func _selected_avatar() -> String:
	if _avatar_choices.is_empty():
		return "Male_Adult_01" if _creator_sex == "m" else "Female_Adult_01"
	return _avatar_choices[_avatar_index]


func _cycle_avatar(step: int) -> void:
	if _avatar_choices.is_empty():
		return
	_avatar_index = posmod(_avatar_index + step, _avatar_choices.size())
	_refresh_creator_preview()


func _adjust_build(amount: float) -> void:
	_build_value = clampf(_build_value + amount, 0.85, 1.2)
	_refresh_creator_preview()


func _adjust_height(amount: float) -> void:
	_height_value = clampf(_height_value + amount, 0.9, 1.1)
	_refresh_creator_preview()


func _refresh_creator_preview() -> void:
	if not is_instance_valid(avatar_label):
		return
	var avatar := _selected_avatar()
	avatar_label.text = avatar.replace("_", " ")
	body_label.text = "BUILD  %d%%" % int(round(_build_value * 100.0))
	height_label.text = "HEIGHT  %d%%" % int(round(_height_value * 100.0))
	if _screen != "creator":
		return
	if is_instance_valid(preview_model):
		preview_model.queue_free()
	preview_model = null
	if Rocketbox.entry(avatar).is_empty():
		return
	preview_model = Rocketbox.create(avatar)
	preview_model.scale = Vector3(_build_value, _height_value, _build_value)
	var stage: Node3D = preview_viewport.get_child(0) as Node3D
	stage.add_child(preview_model)
	var anim: AnimationPlayer = preview_model.get_meta("anim") if preview_model.has_meta("anim") else null
	var sex := String(preview_model.get_meta("sex", _creator_sex))
	Rocketbox.play(anim, Rocketbox.pick(sex, "idle_breathe"), 0.0)


func _unhandled_input(event: InputEvent) -> void:
	if _started or _screen != "title":
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		get_tree().quit()


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
	if Game.has_loaded_save:
		Game.restore_world(world)
	hud = HUD.new()
	hud.name = "HUD"
	hud.player = world.player
	add_child(hud)
	Game.save_game(world)
	title.queue_free()
	if ShotRunner.requested() != "":
		var runner := ShotRunner.new()
		runner.name = "Shots"
		add_child(runner)
		runner.start(world)
