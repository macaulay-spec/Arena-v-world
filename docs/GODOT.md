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

* Large source libraries are not committed: `assets/manifest/rocketbox.json` lists the Rocketbox avatars/clips,
  and `tools/fetch_assets.py` downloads and pre-processes them in CI. Kenney vehicles are fetched by the Android
  workflow. The small selected KayKit CC0 house set is committed as game-ready glTF in
  `godot/assets/furniture/`, with the pack license notices beside it and the exact model list in
  `assets/manifest/kaykit-house.json`; Godot imports/compresses it for GLES3. Generated art sources remain under
  `art/src/` and are processed by the project scripts.
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
| **S0 Proof** | Godot project + CI APK, build card + perf report, one street block, player/NPCs/owner cars/day-night; current expansion adds an enterable furnished JAG House foyer and main rooms | 30 fps steady, < 300 MB, "already looks better than APK 1" |
| **S1 Streaming city** | full generator city as streamed chunks with façades, generated materials + signage, LODs, MultiMesh props, per-chunk collision + navmesh, radar/map, districts | all six districts on foot at 30 fps, flat memory |
| **S2 Home** | finish/polish all JAG House rooms and interior lighting, household roles + schedules, interactions, owner's cars, creator (Rocketbox base + variation) | every room and the compound without a collision complaint |
| **S3 Alive** | pedestrian routines by role/district, traffic (lanes, junctions, danfo stops, okadas), animated world, ambient audio | busy Unity Boulevard at 30 fps |
| **S4 Ride & earn** | arcade vehicles for touch, enter/exit, damage, fuel, money, shops, jobs, phone UI | a 10-minute delivery loop that is fun |
| **S5 Wanted** | crimes, wanted levels, police on foot/cars, chase AI, arrest/escape/respawn, save slots | a chase that feels like a chase |
| **S6 Story & city life** | missions with portraits, interiors, radio, weather, photo mode, Pidgin/English | 2–3 hours of content |
| **S7 Multiplayer** | dedicated Godot server, 16–32 players per instance, player houses, police roles, shared economy | — |

Risks: CI screenshot pipeline (fallback: owner screenshots), GDScript crowd/traffic cost on A53 cores (counts,
server APIs, GDExtension option), memory kills on 2 GB devices (streaming + the 400 MB gate).


## Last CI-verified S0 baseline (commit `905402b`; 2026-10-16)

This is the pre-KayKit-furniture checkpoint, verified by CI with Godot 4.7.2 and the Compatibility renderer:

- North Heights street block + JAG House estate/interior, 26 game-ready textures (no placeholders), day/night,
  12 Rocketbox mocap NPCs, 10 parked Kenney cars, and on-foot controls with kerb step.
- Title key art `godot/ui/title.png` (source `art/src/brand/title-key-art.png`).
- Lite preset (the 2 GB phone target): worst 69 draw calls / 75.7k primitives — within the gate
  (<=120 calls, <=150k prims). Standard is report-only and over budget at 172 / 265.2k.
- APK `vora-city-905402b-s0-debug.apk` (74 MB) from [CI run 38895000945](https://github.com/macaulay-spec/Arena-v-world/actions/runs/38895000945).

Bugs found by the render loop (keep these in mind for new code):

1. Godot front faces are **clockwise** when seen from the front; all MeshBatch helpers take
   points counter-clockwise and flip internally. New geometry: a->b->c->d CCW from the front.
2. `Node.find_children()` never returns the node itself — `_aabb_of()` on a single MeshInstance3D
   returned an empty AABB, so merged cars were scaled 460x and became "white sheets in the sky"
   that looked like a sky-shader bug. `tests/test_world.gd` now fails on any mesh larger than 12 m.

Open before S0 exit: the user's phone verdict (Perf screen -> "Copy report").

## JAG House + full-game project status

The project is the full landscape-phone VORA CITY/JAG game; the house is only its current S0 entry slice, not the
complete game. The approved city seed, six districts and layout are unchanged. The player starts in the North
Heights foyer; the mansion has an open, proximity-controlled collidable double door, the established room plan,
a walkable stair, finished plaster ceilings, custom wall art and the current exterior compound.

The current implementation replaces the prior box-built furniture pass with **39 actual KayKit CC0 glTF models
and 90 placements** across the living room, dining room, kitchen, family lounge, study, entry, bedrooms and upstairs
sitting room. Furniture is grouped into static MultiMeshes for mobile rendering and paired with simple collision
proxies; source/license attribution is in `docs/CREDITS.md`, `assets/manifest/kaykit-house.json` and each pack's
retained `LICENSE.txt`. This code change has passed a local Godot 4.7.2 headless load audit for all 39 models
(0 asset-load errors; 79,928 static/imported triangles). The full project smoke test cannot pass in this sandbox
because the large CI-fetched Rocketbox and Kenney assets are not present locally; CI verification for this change
is pending. The prior CI evidence below is for the earlier box-furniture baseline, not this updated furniture
implementation.

That previous verified baseline (commit `905402b`, CI run `38895000945`) passed import, headless world test,
Android debug export and the Lite render gate: 49,270 static triangles, 30 batched surfaces, 864 collision shapes,
12 NPCs and 10 cars; Lite worst was 69 draw calls / 75,740 primitives. Its llvmpipe [foyer](progress/jag-house-foyer-lite.png),
[living room](progress/jag-house-living-lite.png) and [media wall](progress/jag-house-media-wall-lite.png) shots
are not evidence of the new asset pass or of phone performance.

Bathrooms, interior lighting polish, household roles/schedules and deeper interaction systems remain unfinished.
The 128 m / 3×3 S1 streamer and multi-tile exporter are still an unverified opt-in draft; there is no S1 build or
APK yet. The next milestone is to verify this asset-backed house in CI, get the owner's 2 GB phone verdict, then
expand the Ridge Street approach and North Heights block before progressing through city streaming, simulation,
jobs/economy, wanted/arrest, story/persistence and multiplayer milestones.

Dev switches (user args after `--`): `--quality=lite|standard|high`, `--shots=<dir>`
(`--only=<prefix>`, `--shot=name,x,y,z,yaw,pitch,minutes`), `--title-shot=<dir>`,
`--dbg=noskirt,nofog,defaultsky,nosky`.

