class_name HUD
extends CanvasLayer
## Touch HUD: left-half virtual stick, right-half look drag, RUN / JUMP / PERF buttons,
## build card (always visible, small) and the Perf screen with "Copy report" + quality + time.

var player: Player
var stick_origin := Vector2.ZERO
var stick_id := -1
var look_id := -1
var stick_base: Control
var stick_knob: Control
var build_label: Label
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
	# stick visuals
	stick_base = _circle(Color(1, 1, 1, 0.18), 150)
	stick_knob = _circle(Color(1, 1, 1, 0.45), 64)
	root.add_child(stick_base)
	root.add_child(stick_knob)
	stick_base.visible = false
	stick_knob.visible = false
	# buttons (bottom-right cluster)
	var run := _button("RUN", Vector2(-230, -110), Vector2(96, 72))
	run.toggle_mode = true
	run.toggled.connect(func(on): if player: player.run_toggle = on)
	root.add_child(run)
	var jump := _button("JUMP", Vector2(-124, -140), Vector2(104, 104))
	jump.pressed.connect(func(): if player: player.jump_pressed = true)
	root.add_child(jump)
	var perf := _button("PERF", Vector2(-92, 10), Vector2(80, 40))
	perf.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	perf.position = Vector2(-92, 10)
	perf.pressed.connect(toggle_perf)
	root.add_child(perf)
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


func toast(msg: String) -> void:
	_toast.text = msg
	_toast.visible = true
	_toast_t = 2.0


func _process(delta: float) -> void:
	var q: String = Game.quality.get("label", "")
	build_label.text = "VORA CITY · JAG HOUSE · S0 · build %s · %s · %s" % [str(Game.build.get("commit", "dev")).substr(0, 7), q, Game.clock_label()]
	short_label.text = Perf.short_line()
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
