# VORA CITY on Godot — migration record

Decision (2026-10-16, agreed with the owner): the web/three.js runtime (APK 1) is replaced by a **Godot 4
(Compatibility / OpenGL ES 3 renderer)** game. Target: **Android phones with 2 GB RAM and up**, steady 30 fps.
The city plan (six districts, roads, landmarks, names, `data/city.json`) is kept unchanged. Humans come from
**Microsoft Rocketbox** (MIT) first; our MakeHuman generator becomes a variation tool.

## Why (short)

APK 1 measured 0.75–1.9 M triangles per frame, 300–600 draw calls, ~28 k-triangle characters, the whole 2 km
city generated in JavaScript at start-up, inside a WebView that costs 200–300 MB before the game starts. GTA SA
mobile draws roughly 100–300 k triangles with 1–2 k-triangle pedestrians and streams the world. The content was
5–10× over budget **and** the stack added latency, memory and a single JS thread. Both are fixed together.

## Hard budgets (checked in CI from the first slice)

| Per frame on the 2 GB target | Per asset |
|---|---|
| ≤ 150 k triangles · ≤ 120 draw calls · ≤ 400 MB RAM · cold start ≤ 15 s · 30 fps steady | NPC 3–7 k tris · car 5–10 k · façade 200–800 · textures ≤ 512² (player face 1024²) · ETC2/ASTC compressed on import |

World streaming in 128 m chunks (3×3 ring around the player, background thread). Nothing is resident that is
not near the player.

## Proofs run in the sandbox (2026-10-16)

The sandbox cannot reach GitHub's release CDN, so `.github/workflows/tools-fetch.yml` downloads the official
Godot build in CI, verifies its SHA-512 and pushes it xz-compressed to a disposable `tools/godot-<version>`
branch that the sandbox can `git fetch`. Result: `Godot 4.7.2.stable.official.ed1daf0bf` runs here with
`--headless` (import, scripts, tests). The same channel will proxy CC0/MIT asset packs.

**Rocketbox import (Godot's built-in FBX importer, no conversion):**

| File | Result |
|---|---|
| `Male_Adult_01.fbx` | 7,440 tris (body 3,939 · head 3,007 · hair/opacity 494), 81 bones (`Bip01…`), A-pose, head at 1.587 m, materials wired to `*_color.tga` |
| `Police_Male_01.fbx` | 8,687 tris incl. equipment + pistol, same skeleton |
| `m_walk_neutral`, `m_run_neutral`, `m_idle_breathe_01`, `m_gestic_talk_neutral_01` | 1.07 s / 0.77 s / 2.73 s / 35.6 s clips, 30 fps, root position track present |

**Mocap on avatar (copy the clip's bone tracks into the avatar's `AnimationPlayer`, keep only the root position
track):** walk — feet 0.11→0.26 m, stride 0.68 m, thigh swing 33°, head bob 4.5 cm, root 1.40 m/s; run — feet to
0.40 m, 37°, 3.07 m/s; idle/talk — subtle, stable. No bone further than 0.92 m from the pelvis (no distortion).
No retargeting needed: avatars and clips share the same Biped rig. 115 avatars (incl. 8 police, 2 security,
9 construction, chef, gardener, delivery, medical) and 471 clips are available; faces have blendshape variants
(`*_facial.fbx`) for later viseme work.

Probe scripts: `tools/godot-probes/`.

## Asset strategy

* **Source assets are not committed.** `assets/manifest/*.json` lists what the game uses (Rocketbox avatars and
  clips, CC0 packs, generated art); `tools/fetch_assets.py` downloads and pre-processes them (downscale to the
  texture budget, strip unused clips) in CI (full internet) and, for small subsets, locally through the
  tools-fetch proxy. Game-ready, compressed assets are produced by the Godot import step.
* **Generated art** (image tool): JAG mark, VORA CITY wordmark, adaptive icon, splash/loader, title key art,
  district loading cards, UI/phone icons, billboards, shop signs, posters, danfo liveries, dialogue portraits, and a
  60–100 tile seamless material library (concrete, plaster, corrugated roofing, pavers, laterite, asphalt, lagoon
  water). Sources at full resolution under `art/src/`, with a script producing the game-ready versions.
* Licences: Rocketbox MIT (attribution + the requested citation in `docs/CREDITS.md`), CC0 packs, our own
  generator output.

## Verification loop

1. Every build shows its commit on the title screen; a **Perf** button shows FPS, frame ms, draw calls,
   triangles, RAM, GPU, chunk count and copies the report to the clipboard — the owner pastes it back.
2. CI exports the APK on every push (Godot headless export, debug keystore generated in CI, APK named by commit)
   and renders fixed camera shots with Xvfb + Mesa, pushed to a `ci/evidence` branch the sandbox can read.
3. Headless in the sandbox: imports, GDScript unit tests, budget checks, chunk-streaming simulations.
4. A build that misses 30 fps on the owner's phone blocks new features until fixed.

## Slices (each ends as an APK on the owner's phone)

| Slice | Content | Exit test |
|---|---|---|
| **S0 Proof** | Godot project + CI APK, build card + perf report, one street block + mansion exterior (textured, lit), player on foot, 10 mocap Rocketbox NPCs, two parked cars, day/night | 30 fps steady, < 300 MB, "already looks better than APK 1" |
| **S1 Streaming city** | full generator city as streamed chunks with façades, generated materials + signage, LODs, MultiMesh props, per-chunk collision + navmesh, radar/map, districts | all six districts on foot at 30 fps, flat memory |
| **S2 Home** | JAG House rebuilt (modelled furniture, baked interior light, doors/stairs/pool), household with mocap + schedules, owner's cars, creator (Rocketbox base + variation) | every room and the compound without a collision complaint |
| **S3 Alive** | pedestrian routines by role/district, traffic (lanes, junctions, danfo stops, okadas), animated world, ambient audio | busy Unity Boulevard at 30 fps |
| **S4 Ride & earn** | arcade vehicles for touch, enter/exit, damage, fuel, money, shops, jobs, phone UI | a 10-minute delivery loop that is fun |
| **S5 Wanted** | crimes, wanted levels, police on foot/cars, chase AI, arrest/escape/respawn, save slots | a chase that feels like a chase |
| **S6 Story & city life** | missions with portraits, interiors, radio, weather, photo mode, Pidgin/English | 2–3 hours of content |
| **S7 Multiplayer** | dedicated Godot server, 16–32 players per instance, player houses, police roles, shared economy | — |

Risks: CI screenshot pipeline (fallback: owner screenshots), GDScript crowd/traffic cost on A53 cores (counts,
server APIs, GDExtension option), memory kills on 2 GB devices (streaming + the 400 MB gate).


## S0 build status (2026-10-16)

**Pipeline live.** Every push runs `.github/workflows/godot-android.yml`: fetch Rocketbox subset (sparse clone,
textures → ≤512² PNG) + Kenney Car Kit → `--import` → bake mocap library → headless world test → **Android APK export**
(`vora-city-<sha>-s0-debug.apk`, ~72 MB, artifact) → Xvfb/llvmpipe screenshots at 8 viewpoints × {Lite, Standard}
→ `ci/evidence` branch + render report. **Gate:** the Lite preset (the 2 GB-phone preset) must stay ≤ 120 draw calls and
≤ 150k primitives in every shot — first green run: worst 63 calls / 77k primitives.

What is in the S0 world (`godot/`):
- The real North Heights block around JAG House, exported from the city plan (`tools/export_chunk.ts` → `assets/world/s0.json`,
  260 × 260 m, 2 m heightmap, 26 road edges, 51 buildings / 62 masses, 474 props). Terrain is flattened under roads and on the plateau.
- Roads with kerbs + paver sidewalks (sidewalks trimmed at junctions), buildings extruded from their footprints with the plan's
  façade tile/colour, hip/gable/shed/flat roofs with overhangs, plinths buried into the slope, rooftop tanks; palms / trees as
  alpha-scissor cutouts; lamp posts; parked Kenney cars merged to one mesh each. Whole block = 26 surfaces, ~44k triangles,
  builds in ~0.3 s.
- JAG House exterior: compound wall with coping + hedges, stone gate piers with an open steel gate, two-storey white villa with
  recessed glass openings, stone entrance tower, canopy on columns, steps, balconies with glass balustrades, slab bands, roof
  pergola + stair bulkhead, pool terrace with loungers, fountain drive circle, carport with the owner's two cars, bollard lights,
  staff quarters, generator shed, palms along the drive.
- Sun/sky/day–night tuned for Lagos (sunrise 06:30, sunset 18:45), AgX tonemap, aerial-perspective fog; after dark: emissive
  lamps/windows + up to 3 (Lite) / 5 / 6 pooled OmniLights that follow the player.
- Player: Rocketbox `Male_Adult_01`, third-person SpringArm camera, touch stick + look drag + RUN/JUMP, walk 1.40 m/s and run
  3.07 m/s taken from the clips' root motion (no foot sliding). 12 NPCs: 7 walkers on sidewalk routes, a talking pair at the gate,
  a phone caller, a police officer at the corner, the gate guard — 20 baked clips, animation paused beyond 70 m.
- Build card + Perf screen (fps, p10, frame ms, draw calls, primitives, RAM/VRAM, device/GPU, budget verdict, "Copy report",
  quality presets, time-of-day buttons).

All 22 material tiles / tree cutouts are now generated art (`art/src/textures` → `tools/make_textures.py`); no
procedural placeholders remain. Still open before S0 exit: title key art (`godot/ui/title.png`), and the phone test itself.

Local off-screen rendering (fast loop, ~5 s per view): the CI job `tools-xroot.yml` exports a Debian user-space tree with
Xvfb + Mesa to the branch `tools/xroot-*`; unpack it, start `Xvfb :99 -screen 0 1280x720x24`, then
`DISPLAY=:99 LIBGL_ALWAYS_SOFTWARE=1 godot --path godot --rendering-driver opengl3 -- --shots=/tmp/shots --quality=standard --only=03`
(`--shot=name,x,y,z,yaw,pitch,minutes` adds a custom view). Debian 12's Mesa 22.3 mis-renders the Godot sky (white sheets);
use the Debian 13 tree for faithful skies.
