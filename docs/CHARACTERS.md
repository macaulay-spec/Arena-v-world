# V-WORLD characters — pipeline report (Phase 2)

Everything in this document describes code that exists in the repository and output that was rendered headlessly
from it (`docs/screenshots/characters/`). Nothing here is a mock-up.

## 1. Sources

| Source | Licence | Used for |
|---|---|---|
| MakeHuman 1.x base mesh, macro + detail targets, default skeleton & weights (`assets/source/makehuman/`, packed by `scripts/pack_makehuman.py`) | CC0 | the human body, morphing, skin binding |
| Mixamo "X Bot" FBX supplied by the user (`assets/source/mixamo/xbot.fbx`, `xbot_rig.json`) | user supplied | the bone naming / hierarchy convention (65 `mixamorig:*` bones) so Mixamo-style clips can be dropped in later; its "Take 001" contains no curves, so all clips are procedural |

## 2. Pipeline (`characters/`, pure TypeScript, deterministic)

```
population.ts  → 64 CharacterSpecs (roles × districts × wardrobe rules, seeded names, skin tones, hair)
body.ts        → MakeHuman macro/detail morph (gender, age, muscle, weight, height, proportions, African targets, cup/firmness)
rig.ts         → re-pose to Mixamo T-pose, 68 joints (65 Mixamo + Jaw, LeftEye, RightEye), 4 weights per vertex, IBMs
bodyparts.ts   → visible skin (hidden vertices under garments removed), eyeballs, mouth cavity
skin.ts/textures.ts → 8 shared multiplicative skin detail maps + per-character tone factor, eyes, fabric sheets
softmesh.ts    → clip / offset / rims / loosen helpers on the MakeHuman helper meshes (tights, skirt)
garments.ts    → 33 garment builders (tops, bottoms, full garments, footwear) → skinned parts + materials
hair.ts        → scalp carved from the head (hair styles) and head-wear caps (gele, fila, hijab, scarf, cap, beret, hard hat)
props.ts/prims.ts → 18 props as skinned primitives bound to one bone (head loads, bags, sticks, buckets …)
lod.ts         → quadric edge-collapse simplification → LOD1 (≈40 %) and LOD2 (≈15 %, garments inflated 4 mm)
anim.ts        → 9 procedural clips sampled at 30 fps; FK utility used by the tests
gltf.ts        → glTF 2.0 writer (skins, LOD nodes, materials, animation tracks)
assemble.ts    → one character: body + garments + hair + props → LOD chain → .gltf/.bin
index.ts       → textures, 2 body sheets + population, animations.gltf, manifest.json, data/characters.json
```

Conventions: metres, +X = character's left, +Y up, +Z front; bind pose = T-pose with identity node rotations.

## 3. Output

* `public/assets/characters/<id>.gltf` + `.bin` (git-ignored, rebuilt by `npm run characters`): 66 files,
  ≈1.1 MB each, 7–13 primitives, LOD0/LOD1/LOD2 nodes, COLOR_0 ambient occlusion, float UVs.
* `public/assets/characters/textures/` — 41 PNGs, 3.1 MB (8 skin variants, 3 eye variants, 24 fabrics, plain, misc).
* `public/assets/characters/animations.gltf` — skeleton-only file with the 9 clips (reference height 1.708 m).
* `data/characters.json` — committed population manifest with stable ids.

Measured (this build): LOD triangles ≈27 k / 11 k / 4 k average; tallest adult man 1.89 m, shortest adult woman
1.50 m; children 1.25–1.43 m; generation 65 s with cached textures / 90 s cold on the sandbox CPU.

## 4. Animation

| clip | length | notes |
|---|---|---|
| idle, idle_talk | 4 s | breathing, weight shift, head turns; talk adds gesture |
| walk | 1.1 s | 23° thigh swing, knee flex peaking in swing, heel-strike → flat → heel-rise → toe-off with toe dorsiflexion, 3 cm bob, arm swing |
| walk_carry | 1.1 s | walk with one hand steadying a head load, steadier hips |
| run | 0.72 s | 40° thigh swing, 85° knee flex, flight phase |
| sit, phone, wave, sell | 2–4 s | bench pose, phone to ear, greeting, trader arm gestures |

Clips are authored on the reference rig; rotations transfer unchanged (same bone conventions), the Hips translation
track is scaled by the character's height at load (`src/characters/retarget.ts`). Tests verify with FK that the
lowest foot joint stays within 3 cm of its rest height in every locomotion clip.

## 5. Crowd runtime (`src/app/crowd.ts`)

* Cast streamed after the city is interactive (2 parallel loaders), round-robin over districts so each quarter has
  its own people; agents are `SkeletonUtils.clone`s with their own `AnimationMixer`.
* Sidewalk lanes = road polylines offset by carriageway half-width + drain + half sidewalk; agents keep their
  right-hand side, pick a random outgoing edge at nodes, blend 8 m between sidewalk lines after a turn, and ride the
  graded ground / bridge deck height.
* Recycling: agents beyond the radius (walk mode ½·R, orbit R scaled by camera distance) are re-seeded on
  length-weighted lanes near the focus, preferring the character's districts and spots outside the view frustum; a
  teleport re-seeds everyone at once.
* LOD by distance (`[18, 45]` m on high), far agents update every 2nd / 4th frame, group hidden when the orbit camera
  is far above the city.
* Presets: low 8 cast / 30 agents, medium 16 / 64, high 24 / 120. Measured on the headless renderer: 56 people in
  view on Assembly Street added ≈260 draw calls at LOD mix 0/1/2.

## 6. Verification (`npm run test`)

`tests/characters.test.ts` (23 tests together with the city suite, ≈9 s):

* population determinism, unique ids, valid roles / districts / outfits, every district covered
* rig: 68 joints, T-pose axes, weights sum to 1, feet on the ground
* three assembled characters: LOD triangle budgets (≤34 k / ≤15 k / ≤6 k), ≤14 draws, ≤1.4 MB, glTF 2.0 validity
  (skin, LOD nodes, accessor ranges, buffer sizes), byte-for-byte determinism
* garments outside the skin: ≥98 % of sampled garment vertices on/outside the body (median signed distance to the 6
  nearest skin vertices), none deeper than 1.5 cm
* animation: known bones, unit quaternions, feet within 3 cm of rest height, swing height limits
* `data/characters.json`: schema, stable ids, heights, districts, clip references, population coverage

## 7. Known limitations / next steps

* Cloth is static geometry skinned to the body; no secondary motion.
* No facial expression morphs yet (jaw and eye joints exist; blink/talk can be added as rotation tracks).
* Painted skin and hair (no strand hair, no normal maps).
* Character files are uncompressed float32 (KHR_mesh_quantization + Draco/meshopt would cut them to ~¼).
* Crowd agents do not avoid each other or traffic, do not use crossings, and do not enter the market halls or plazas.
* Props are bound to a single bone (no two-hand constraints), so a briefcase swings with the arm.
* Vehicles, market stalls as character workplaces and seated crowds are the planned props pass.
