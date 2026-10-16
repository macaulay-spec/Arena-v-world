class_name HUD
extends CanvasLayer
## Touch HUD: left-half virtual stick, right-half look drag, interaction and context-aware
## on-foot/vehicle controls, a courier objective, and a compact performance/settings panel.

var player: Player
var stick_origin := Vector2.ZERO
var stick_id := -1
var look_id := -1
var stick_base: Control
var stick_knob: Control
var build_label: Label
var profile_label: Label
var mission_label: Label
var run_button: Button
var jump_button: Button
var interact_button: Button
var _was_driving := false
var perf_panel: PanelContainer
var perf_text: Label
var short_label: Label
var font_small := 14
var _perf_visible := false
var _toast: Label
var _toast_t := 0.0


func _ready() -> void:
	layer = 10
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)
	# build card (top-left)
	build_label = Label.new()
	build_label.position = Vector2(12, 8)
	build_label.add_theme_font_size_override("font_size", 13)
	build_label.add_theme_color_override("font_color", Color(1, 1, 1, 0.85))
	build_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	build_label.add_theme_constant_override("shadow_offset_x", 1)
	build_label.add_theme_constant_override("shadow_offset_y", 1)
	root.add_child(build_label)
	short_label = Label.new()
	short_label.position = Vector2(12, 26)
	short_label.add_theme_font_size_override("font_size", 13)
	short_label.add_theme_color_override("font_color", Color(1, 0.9, 0.6, 0.9))
	short_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.8))
	root.add_child(short_label)
	profile_label = Label.new()
	profile_label.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	profile_label.position = Vector2(-500, 10)
	profile_label.size = Vector2(400, 32)
	profile_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	profile_label.add_theme_font_size_override("font_size", 16)
	profile_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.45))
	profile_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.85))
	root.add_child(profile_label)
	mission_label = Label.new()
	mission_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	mission_label.position = Vector2(-280, 45)
	mission_label.custom_minimum_size = Vector2(560, 32)
	mission_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mission_label.add_theme_font_size_override("font_size", 17)
	mission_label.add_theme_color_override("font_color", Color(0.75, 0.94, 1.0))
	mission_label.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.95))
	mission_label.add_theme_constant_override("shadow_offset_y", 2)
	root.add_child(mission_label)
	# stick visuals
	stick_base = _circle(Color(1, 1, 1, 0.18), 150)
	stick_knob = _circle(Color(1, 1, 1, 0.45), 64)
	root.add_child(stick_base)
	root.add_child(stick_knob)
	stick_base.visible = false
	stick_knob.visible = false
	# buttons (bottom-right cluster)
	run_button = _button("RUN", Vector2(-230, -110), Vector2(96, 72))
	run_button.toggle_mode = true
	run_button.toggled.connect(_on_run_toggled)
	root.add_child(run_button)
	jump_button = _button("JUMP", Vector2(-124, -140), Vector2(104, 104))
	jump_button.button_down.connect(_on_jump_down)
	jump_button.button_up.connect(_on_jump_up)
	jump_button.pressed.connect(_on_jump_pressed)
	root.add_child(jump_button)
	interact_button = _button("USE", Vector2(-390, -96), Vector2(160, 60))
	interact_button.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	interact_button.position = Vector2(-390, -96)
	interact_button.add_theme_font_size_override("font_size", 15)
	interact_button.visible = false
	interact_button.pressed.connect(_interact)
	root.add_child(interact_button)
	var perf := _button("PERF", Vector2(-92, 10), Vector2(80, 40))
	perf.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	perf.position = Vector2(-92, 10)
	perf.pressed.connect(toggle_perf)
	root.add_child(perf)
	var save_button := _button("SAVE", Vector2(-92, 58), Vector2(80, 40))
	save_button.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	save_button.position = Vector2(-92, 58)
	save_button.pressed.connect(_save_game)
	root.add_child(save_button)
	# perf panel
	perf_panel = PanelContainer.new()
	perf_panel.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	perf_panel.position = Vector2(-470, 58)
	perf_panel.custom_minimum_size = Vector2(450, 0)
	perf_panel.visible = false
	var vb := VBoxContainer.new()
	perf_panel.add_child(vb)
	perf_text = Label.new()
	perf_text.add_theme_font_size_override("font_size", 13)
	vb.add_child(perf_text)
	var hb := HBoxContainer.new()
	vb.add_child(hb)
	var copy := Button.new()
	copy.text = "Copy report"
	copy.pressed.connect(func(): Perf.copy_report(); toast("Report copied to clipboard"))
	hb.add_child(copy)
	for q in ["lite", "standard", "high"]:
		var qb := Button.new()
		qb.text = Game.PRESETS[q]["label"]
		qb.pressed.connect(func(): Game.set_quality(q); toast("Quality: " + Game.PRESETS[q]["label"]))
		hb.add_child(qb)
	var hb2 := HBoxContainer.new()
	vb.add_child(hb2)
	for t in [["Morning", 8 * 60], ["Noon", 12 * 60 + 30], ["Sunset", 18 * 60 + 15], ["Night", 21 * 60 + 30]]:
		var tb := Button.new()
		tb.text = t[0]
		tb.pressed.connect(func(): Game.minutes = float(t[1]))
		hb2.add_child(tb)
	var speed := Button.new()
	speed.text = "Clock x60"
	speed.toggle_mode = true
	speed.toggled.connect(func(on): Game.clock_speed = 60.0 if on else 1.0)
	hb2.add_child(speed)
	root.add_child(perf_panel)
	_toast = Label.new()
	_toast.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_toast.position = Vector2(-200, 60)
	_toast.custom_minimum_size = Vector2(400, 30)
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.9))
	_toast.visible = false
	root.add_child(_toast)


func _circle(c: Color, size: int) -> Control:
	var ctl := ColorRect.new()
	ctl.color = Color(0, 0, 0, 0)
	ctl.size = Vector2(size, size)
	ctl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var draw := func():
		ctl.draw_circle(Vector2(size * 0.5, size * 0.5), size * 0.5, c)
	ctl.draw.connect(draw)
	return ctl


func _button(text: String, pos: Vector2, size: Vector2) -> Button:
	var b := Button.new()
	b.text = text
	b.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	b.position = pos
	b.size = size
	b.custom_minimum_size = size
	b.add_theme_font_size_override("font_size", 16)
	b.focus_mode = Control.FOCUS_NONE
	b.modulate = Color(1, 1, 1, 0.8)
	return b


func toggle_perf() -> void:
	_perf_visible = not _perf_visible
	perf_panel.visible = _perf_visible


func _current_world() -> World:
	if player and player.get_parent() is World:
		return player.get_parent() as World
	return null


func _on_run_toggled(on: bool) -> void:
	var world := _current_world()
	if world and is_instance_valid(world.active_vehicle):
		world.active_vehicle.throttle_input = 1.0 if on else 0.0
	elif player:
		player.run_toggle = on


func _on_jump_down() -> void:
	var world := _current_world()
	if world and is_instance_valid(world.active_vehicle):
		world.active_vehicle.brake_input = 1.0


func _on_jump_up() -> void:
	var world := _current_world()
	if world and is_instance_valid(world.active_vehicle):
		world.active_vehicle.brake_input = 0.0


func _on_jump_pressed() -> void:
	var world := _current_world()
	if (world == null or not is_instance_valid(world.active_vehicle)) and player:
		player.jump_pressed = true


func _interact() -> void:
	var world := _current_world()
	if world:
		world.interact()


func _mission_text(world: World) -> String:
	if world.delivery_active:
		var target_position := world.active_vehicle.global_position if is_instance_valid(world.active_vehicle) else player.global_position
		var distance_m := int(round(target_position.distance_to(world.delivery_destination)))
		return "JAG COURIER  ·  Deliver the package  ·  %d m  ·  ₦%s" % [distance_m, _format_cash(world.delivery_reward).trim_prefix("₦")]
	return "JAG COURIER  ·  Start a shift at the glowing dispatch marker"


func toast(msg: String) -> void:
	_toast.text = msg
	_toast.visible = true
	_toast_t = 2.0


func _save_game() -> void:
	if Game.save_game(player.get_parent() if player else null):
		toast("Game saved")
	else:
		toast("Save failed — check device storage")


func _format_cash(amount: int) -> String:
	var digits := str(maxi(amount, 0))
	var formatted := ""
	for i in range(digits.length()):
		if i > 0 and (digits.length() - i) % 3 == 0:
			formatted += ","
		formatted += digits.substr(i, 1)
	return "₦" + formatted


func _process(delta: float) -> void:
	var q: String = Game.quality.get("label", "")
	build_label.text = "VORA CITY · JAG HOUSE · S0 · build %s · %s · %s" % [str(Game.build.get("commit", "dev")).substr(0, 7), q, Game.clock_label()]
	var wanted := int(Game.profile.get("wanted", 0))
	var wanted_text := "  ·  WANTED %d" % wanted if wanted > 0 else ""
	profile_label.text = "%s  ·  %s  ·  DAY %d  ·  HP %d%%%s" % [str(Game.profile.get("name", "JAG")), _format_cash(int(Game.profile.get("cash", 0))), int(Game.profile.get("day", 1)), int(round(float(Game.profile.get("health", 100.0)))), wanted_text]
	short_label.text = Perf.short_line()
	var world := _current_world()
	if world:
		var prompt := world.interaction_label()
		mission_label.text = _mission_text(world)
		if not prompt.is_empty():
			mission_label.text += "\n[USE] " + prompt
		interact_button.disabled = prompt.is_empty()
		interact_button.visible = not prompt.is_empty()
		interact_button.tooltip_text = prompt
		var driving := is_instance_valid(world.active_vehicle)
		if driving != _was_driving:
			run_button.set_pressed_no_signal(false)
			run_button.text = "GAS" if driving else "RUN"
			jump_button.text = "BRAKE" if driving else "JUMP"
			if driving:
				world.active_vehicle.throttle_input = 0.0
				world.active_vehicle.brake_input = 0.0
			_was_driving = driving
	if _perf_visible:
		perf_text.text = Perf.report()
	if _toast_t > 0.0:
		_toast_t -= delta
		if _toast_t <= 0.0:
			_toast.visible = false
	if Input.is_action_just_pressed("perf_toggle"):
		toggle_perf()


func _unhandled_input(event: InputEvent) -> void:
	var vp_size := get_viewport().get_visible_rect().size
	if event is InputEventScreenTouch:
		var e := event as InputEventScreenTouch
		if e.pressed:
			if e.position.x < vp_size.x * 0.45 and stick_id == -1:
				stick_id = e.index
				stick_origin = e.position
				stick_base.position = stick_origin - stick_base.size * 0.5
				stick_knob.position = stick_origin - stick_knob.size * 0.5
				stick_base.visible = true
				stick_knob.visible = true
			elif look_id == -1:
				look_id = e.index
		else:
			if e.index == stick_id:
				stick_id = -1
				stick_base.visible = false
				stick_knob.visible = false
				if player:
					player.move_input = Vector2.ZERO
			elif e.index == look_id:
				look_id = -1
	elif event is InputEventScreenDrag:
		var d := event as InputEventScreenDrag
		if d.index == stick_id:
			var v := d.position - stick_origin
			var r := 70.0
			if v.length() > r:
				v = v.normalized() * r
			stick_knob.position = stick_origin + v - stick_knob.size * 0.5
			if player:
				player.move_input = Vector2(v.x / r, -v.y / r)
		elif d.index == look_id:
			if player:
				player.look_delta += d.relative * 1.6
