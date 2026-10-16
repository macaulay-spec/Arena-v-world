class_name Materials
extends RefCounted
## Material registry for world geometry. One StandardMaterial3D per texture name; textures live in
## res://assets/textures/<name>.png (≤512², generated art, made tileable by tools/make_textures.py).
## Missing textures fall back to a flat colour so the scene always builds (and the fallback is obvious).

const TEX_DIR := "res://assets/textures/"

## name -> [fallback colour, roughness, uv metres per tile]
const DEFS := {
	"asphalt": [Color(0.22, 0.22, 0.23), 0.95, 7.0],
	"pavers": [Color(0.62, 0.58, 0.54), 0.9, 2.0],
	"concrete": [Color(0.66, 0.64, 0.6), 0.9, 2.0],
	"grass": [Color(0.33, 0.45, 0.2), 1.0, 6.0],
	"earth": [Color(0.5, 0.4, 0.28), 1.0, 6.0],
	"plaster_win": [Color(0.86, 0.82, 0.74), 0.85, 4.0],
	"plaster_win2": [Color(0.88, 0.85, 0.78), 0.85, 4.0],
	"plaster_louvre": [Color(0.8, 0.77, 0.7), 0.85, 4.0],
	"plaster_plain": [Color(0.84, 0.8, 0.72), 0.9, 4.0],
	"concrete_grid": [Color(0.7, 0.7, 0.68), 0.85, 4.0],
	"roof_tile": [Color(0.55, 0.3, 0.22), 0.8, 3.0],
	"roof_concrete": [Color(0.55, 0.54, 0.5), 0.95, 4.0],
	"roof_metal": [Color(0.5, 0.52, 0.55), 0.6, 3.0],
	"compound_wall": [Color(0.85, 0.82, 0.74), 0.9, 4.0],
	"mansion_wall": [Color(0.93, 0.92, 0.88), 0.7, 4.0],
	"mansion_glass": [Color(0.12, 0.16, 0.2), 0.15, 4.0],
	"stone": [Color(0.55, 0.5, 0.45), 0.8, 2.0],
	"wood": [Color(0.36, 0.24, 0.14), 0.7, 2.0],
	"water": [Color(0.1, 0.45, 0.6), 0.05, 4.0],
	"metal_dark": [Color(0.12, 0.12, 0.13), 0.5, 1.0],
	"lamp_glow": [Color(1.0, 0.9, 0.7), 0.3, 1.0],
	"tree_palm": [Color(0.3, 0.45, 0.2), 1.0, 1.0],
	"tree_broad": [Color(0.25, 0.42, 0.18), 1.0, 1.0],
	"tree_neem": [Color(0.28, 0.45, 0.2), 1.0, 1.0],
	"tree_small": [Color(0.3, 0.48, 0.22), 1.0, 1.0],
	"tank": [Color(0.1, 0.1, 0.1), 0.7, 1.0],
}

static var _cache: Dictionary = {}


static func get_mat(name: String) -> StandardMaterial3D:
	if _cache.has(name):
		return _cache[name]
	var def: Array = DEFS.get(name, [Color.MAGENTA, 0.9, 2.0])
	var m := StandardMaterial3D.new()
	m.resource_name = name
	m.vertex_color_use_as_albedo = true
	m.roughness = def[1]
	m.metallic = 0.0
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var path := TEX_DIR + name + ".png"
	if ResourceLoader.exists(path):
		m.albedo_texture = load(path)
		m.albedo_color = Color.WHITE
	else:
		m.albedo_color = def[0]
	if name.begins_with("tree_"):
		m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA_SCISSOR
		m.alpha_scissor_threshold = 0.5
		m.cull_mode = BaseMaterial3D.CULL_DISABLED
		m.shading_mode = BaseMaterial3D.SHADING_MODE_PER_PIXEL
		m.backlight = Color(0.3, 0.3, 0.3)
	if name == "lamp_glow":
		m.emission_enabled = true
		m.emission = Color(1.0, 0.85, 0.6)
		m.emission_energy_multiplier = 2.0
	if name == "mansion_glass":
		m.metallic = 0.6
		m.roughness = 0.15
		m.metallic_specular = 0.8
	if name == "water":
		m.metallic = 0.3
		m.roughness = 0.05
	_cache[name] = m
	return m


## Metres per tile for uv computations.
static func uv_m(name: String) -> float:
	var def: Array = DEFS.get(name, [Color.MAGENTA, 0.9, 2.0])
	return def[2]


## Maps the city-plan facade tile ids to our texture set.
static func facade_tex(tile: String) -> String:
	match tile:
		"plaster-win": return "plaster_win"
		"plaster-win2": return "plaster_win2"
		"plaster-louvre": return "plaster_louvre"
		"plaster-plain": return "plaster_plain"
		"concrete-grid": return "concrete_grid"
		"concrete-strip": return "concrete_grid"
		_: return "plaster_win"


static func roof_tex(tile: String) -> String:
	match tile:
		"roof-tile": return "roof_tile"
		"roof-metal", "roof-zinc", "roof-zinc-rust": return "roof_metal"
		_: return "roof_concrete"
