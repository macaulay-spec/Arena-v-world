# Vora City — Godot 4 project (slice S0)

Landscape phone game, Compatibility renderer (OpenGL ES 3), Jolt physics, GDScript. Package `com.jag.voracity`.

## Layout
- `project.godot` — settings (gl_compatibility, ETC2/ASTC import defaults, landscape, 30 Hz physics)
- `scenes/main.tscn` + `scripts/main.gd` — title card → world → HUD; `--shots=<dir>` runs the evidence capture
- `scripts/world.gd` — builds the S0 chunk (`assets/world/s0.json`), sun/sky/day-night, player, NPCs, cars
- `scripts/procgen/` — `world_builder.gd` (terrain, roads, buildings, trees, lamps), `mansion_builder.gd` (JAG House), `mesh_batch.gd`, `materials.gd`
- `scripts/player.gd` / `npc.gd` — Rocketbox avatars driven by baked mocap; speeds come from the clip root motion
- `scripts/rocketbox.gd` — avatar factory (textures, animation library)
- `scripts/perf.gd`, `scripts/hud.gd` — perf counters, budget checks, touch controls, Perf screen with "Copy report"
- `assets/textures/` — game-ready tiles (`tools/make_textures.py` from `art/src/textures/`)
- `assets/anim/rocketbox.res` — baked mocap library (`tools/bake_clips.gd`)
- `assets/ext/` — fetched, never committed: Rocketbox avatars/clips, Kenney cars (`tools/fetch_assets.py`, CI)
- `tests/test_world.tscn` — headless smoke/budget test

## Local loop (needs the Godot 4.7.2 binary)
```
python3 tools/fetch_assets.py                     # Rocketbox subset (sparse clone)
python3 tools/make_textures.py                    # tiles from art/src/textures
npx tsx tools/export_chunk.ts --name s0 --grid 2  # city plan → godot/assets/world/s0.json
godot --headless --path godot --import
godot --headless --path godot --script tools/bake_clips.gd
godot --headless --path godot res://tests/test_world.tscn
godot --path godot -- --shots=/tmp/shots --quality=lite   # screenshots + render report (needs a display / Xvfb)
```

## Budgets (CI gate on the Lite preset)
≤ 120 draw calls, ≤ 150k primitives per frame, ≤ 400 MB RAM, cold start ≤ 15 s, 30 fps steady on a 2 GB phone.
The APK is built on every push by `.github/workflows/godot-android.yml`; screenshots land on the `ci/evidence` branch.
