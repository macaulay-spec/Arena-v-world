# VORA CITY — the game (Phase 3)

**Studio:** JAG · **Working title:** VORA CITY · **Platform:** Android (landscape phone), also playable in a desktop
browser · **Tone:** gritty-realistic but light · **Frame:** GTA-style open world, built in APK milestones.

This document describes what is in the current build (**APK 1 – "App + Home"**), how the runtime is put together,
how the APK is produced, and the agreed road-map for APK 2–5.

---

## 1. APK 1 — "App + Home"

The player **creates their own protagonist** and wakes up in **their home: JAG House, 1 Ridge Street, North
Heights** — a furnished two-storey mansion with roof terrace, pool, forecourt fountain, gatehouse, carport with the
owner's cars, staff quarters and a generator house, sitting on the plateau of the existing landmark `L-jag-house`
in the Vora City data. The whole city from Phase 1 is loaded around it, with the Phase 2 crowd on the streets.

### Flow

```
JAG logo  →  loading (city + characters + house)  →  live title (slow orbit of the compound, "tap to start")
   →  Continue / New game / Settings
   →  New game: character creation on the roof terrace — Look (name, sex, skin tone, hair, outfit, height),
      Body (build, muscle) and Face (jaw, chin, nose width/length, eye spacing/size, lips, mouth width, cheeks)
   →  fade → wake up in the master bedroom at 07:12, Day 1, ₦25,000
```

### What you can do

| Thing | Interaction |
|---|---|
| Doors (every room, gatehouse, BQ, generator house) | open / close — many start open so the house reads as lived-in |
| Beds | **Sleep** → fade, clock jumps to 07:00 next day, health 100, game saved |
| Fridge / cooker | **Eat** (health + meals stat) |
| Wardrobes (and the mirror in the dressing room) | re-open the creator and change outfit / hair |
| TV screens | switch on / off (animated screen content) |
| Laptop on the study desk | "coming soon" (phone / apps land in APK 5) |
| Owner's cars (Range Rover, G-Wagon, saloon, pickup, danfo, okada) | "Drive — next update" (APK 3) |
| Main gate | slides open / closed (also opens for the player when the gateman is asked) |
| Generator | "Up NEPA" — toggles the generator (lights at night) |
| Household NPCs | walk up and **Talk** — one-liners by role, they turn to face you |
| Streets | walk out of the gate into North Heights; the place card shows `North Heights · Vora City` |

### The household (src/game/npcs.ts `HOUSEHOLD`)

Cast from the Phase 2 manifest by role id (falls back by tag/sex). Each stands at a named spot in the compound and
performs its function with the animation library: gateman (guard clip at the gate), security (porch), driver
(carport, on the phone), housekeeper (sweeping the living room), cook (kitchen, work clip), gardener (back garden),
friend (sitting on the sofa), guest (poolside), steward (dining room), night guard (gatehouse). Scheduling, walking
between spots and mocap come in APK 2.

### HUD and controls

* **Radar** (top-left, rotates with the camera, shows the house footprint, roads, NPCs), **cash** (₦, en-NG
  formatting), **clock + day**, **health bar**, **place card** when you enter a room/area, **prompt** for the
  nearest interactable, **toasts** and NPC **speech** bubbles, optional **FPS** counter.
* **Touch:** left virtual stick (touch the stick itself, or anywhere in the left 45 % of the screen for a floating
  stick), right side of the screen = look, two fingers on the right = pinch zoom, buttons
  **Interact · Jump · Run · Camera · Pause**. Every pointer is tracked by id: the stick belongs to the finger that
  started it, and `pointerup` / `pointercancel` / `lostpointercapture` / window blur / tab hide all release it.
* **Keyboard:** `WASD` / arrows move, mouse-drag look, `Shift` run, `Space` jump, `E`/`Enter` interact, `V` camera
  distance, `Esc`/`P` pause.
* **Pause:** Resume · Save · Settings (quality Auto/Lite/Standard/High, look sensitivity, invert-Y, FPS, sound) ·
  Quit to title. Changing quality reloads the game with the new preset.

### Save

`localStorage` — `voracity.save.v1` (appearance, cash, health, clock, position, stats, timestamps) and
`voracity.settings.v1`. Autosave every 45 s, on tab hide/close, after sleeping and on manual save. A new game
deletes the previous save after confirmation.

### Day / night and performance

* Game clock: 2 real seconds per game minute. The sky, sun, fog, city window lights and street lamps follow the hour
  (`src/app/sky.ts`); night is < 06:24 or > 18:36.
* Indoors the ambient light is lifted and warmed; a pool of point lights (Lite 2 / Standard 5 / High 8) is refilled
  every few frames from the lamps nearest the player.
* Presets (`PRESETS` in `src/game/main.ts`): pixel ratio, shadow map, draw distance, crowd size, light count.
  `auto` picks a preset from device memory / cores / GPU string (`autoQuality()` in `src/game/save.ts`).

### Bug-fix pass after APK 1 (controls, creator, performance, validation)

What changed, where, and how it is verified (`npm test` = 71 unit tests; `node scripts/game-verify.mjs` drives the
real page with emulated touch events under headless Chromium/SwiftShader and writes
`docs/screenshots/game/verify/verify-standard.json` + screenshots):

| Area | Fix | Verified by |
|---|---|---|
| Joystick (`src/game/input.ts`) | the visible stick overlay starts the joystick itself (it sits above the canvas, so canvas `pointerdown` never saw it); one pointer id owns the stick, a second finger on the right orbits / two fingers pinch-zoom; `pointerup`, `pointercancel`, `lostpointercapture`, window `blur` and tab hide all release it; moves from unknown pointers are ignored | `tests/input.test.ts` (happy-dom), `game-verify` touch drag / release / `pointercancel` |
| Input reset | `Input.clear()` drops keys, pointers, stick, look + zoom deltas, pending edge actions and the run toggle (settings untouched); called on pause **and** resume, cutscenes, focus loss | `tests/input.test.ts`, `game-verify` resume check |
| Jump (`src/game/player.ts`) | impulse applied in the update that accepts the press (was gated behind a 0.26 s clip timer); no re-impulse while airborne; `vy ≤ 0` guard before landing | `tests/player.test.ts`, `game-verify` ("first update after the press") |
| Movement direction | translation follows the camera-relative input direction immediately; the body turns towards it at 11 rad/s (4 in the air); deceleration keeps the release heading; diagonals normalised | `tests/player.test.ts` |
| Appearance races | `Avatar.setAppearance` is a serialised, versioned queue: stale loads are dropped before they attach, failures keep the current model, replaced models are detached and their private skin material disposed | `tests/avatar.test.ts` (synthetic kits with slow/fast loads), `game-verify` rapid m/f switching |
| Body + face morphs | the pipeline exports 22 glTF morph targets per kit (`shape_weight_lo/hi`, `shape_muscle_lo/hi` on body, hair caps and every outfit; `face_<jaw,chin,nose_width,nose_length,eye_spacing,eye_size,lips,mouth_width,cheeks>_<neg,pos>` on the body) built from the MakeHuman macro/detail targets re-posed with the same rig (`characters/player.ts`, `characters/gltf.ts`, `characters/rig.ts`); the creator's Body / Face tabs drive them; height is a bone-length change (legs, spine, arms ± 6 %) with the model lifted so the feet stay on the floor, not a whole-model scale; sliders are only shown for targets the kit carries | `tests/morphs.test.ts`, `game-verify` morph influence checks, `docs/screenshots/game/verify/creator-*.png` |
| Rig / deformation | bent-pose tests on shoulder, elbow, wrist, hip, knee, ankle and a finger: chain vertices rotate rigidly, unweighted vertices stay, mid-segment girth ≥ 85 % (no candy-wrapper), weights normalised; garments stay within 2 cm of the skin beneath at the knee and shoulder | `tests/morphs.test.ts` |
| Culling | crowd, household NPCs and the player keep `frustumCulled = true` with an explicit pose-independent bounding sphere (`src/characters/bounds.ts`) instead of disabling culling; the crowd tests a sphere, not a point | `tests/avatar.test.ts` |
| Camera | `ChaseCamera.update` and the creator camera allocate nothing per frame | code review |
| Pause | no simulation, no crowd/NPC/lighting work and no GPU frame while paused (one re-render on resize); resume clears input and restarts the clock | `game-verify` ("paused: loop runs but no GPU frames") |
| Quality selection (`src/game/save.ts`) | `chooseQuality()` is conservative when memory / GPU are unknown (Lite), uses a GPU-string tier (Adreno / Mali / Apple / desktop), needs WebGL2 for anything above Lite; Lite now also halves crowd simulation rate, uses a smaller crowd (18 agents, 70 m), shorter NPC LOD distances, 220 m prop detail, 1.8 km far plane | `tests/save.test.ts` |
| Settings / saves | `sanitizeSettings` / `sanitizeSave`: unknown presets → `auto`, numbers clamped, booleans coerced, malformed JSON or wrong version → defaults / `null`, `localStorage` failures caught | `tests/save.test.ts` |

**Benchmark (headless Chromium + SwiftShader software GL, 960 × 540, 45 s per spot, same spots and clock).**
These compare code paths only; they are not Android frame rates.

| Preset · spot | before (b16189f) calls / tris / ms per frame | after calls / tris / ms per frame |
|---|---|---|
| Lite · living room | 460 / 1.21 M / 1406 | 338 / 0.96 M / 1324 |
| Lite · street outside the gate | 479 / 1.61 M / 1407 | 250 / 1.05 M / 1154 |
| Standard · living room | 447 / 1.21 M / 4503 | 418 / 1.17 M / 3216 |
| Standard · street outside the gate | 567 / 1.91 M / 4501 | 529 / 1.89 M / 3462 |

(Software rasterisation is bound by pixels and triangles, which is why Lite's smaller crowd and shorter detail
range show up mostly as fewer draw calls / triangles; on a GPU the draw-call and update savings matter more.)

**Known limitations that need more assets or modelling work**

* Body-shape range is what the MakeHuman macro targets give (≈ 3 cm at the belly for full weight); the creator
  extrapolates the heavy end to 1.35 × the target.
* Face sliders move the MakeHuman head geometry; there is still no facial animation (blendshapes/visemes are an
  APK 2 item with the Rocketbox reference).
* Hair is a scalp cap plus procedural strands: the cap follows the body-shape morphs, the strands do not (no
  visible gap at the shipped slider ranges).
* The jump still uses the procedural clip; mocap replaces it in APK 2.
* Automatic quality cannot measure real GPU speed — it is a device-fact heuristic. Runtime adaptation (dropping
  pixel ratio when frames are slow) is not implemented because frame-time telemetry from real phones is not
  available yet.

---

## 2. Runtime architecture

```
index.html (game)           src/game/main.ts  — boot pipeline, state machine, clock, light pool, autosave, window.vora
city.html  (city viewer)    src/app/…         — Phase 1 world builder (terrain, roads, buildings, props, sky, crowd)
characters.html (lineup)    src/characters/…  — Phase 2 glTF loading / retarget helpers

src/game/
  input.ts      touch stick + buttons, keyboard, mouse → one InputFrame per tick
  player.ts     loads player_f / player_m glTF, applies appearance (skin, hair, outfit nodes), PlayerController
  camera.ts     ChaseCamera: spring follow, ground clearance, 3-ray occlusion against walls/windows
  collision.ts  2-D wall segments + floor slabs + pits; groundAt(), rayFraction(), sweep & slide
  radar.ts      canvas minimap
  npcs.ts       HOUSEHOLD cast, spot placement, clip cycling, talk
  hud.ts        HUD writes + screen fade
  screens.ts    logo / loading / title / create / pause / settings DOM screens
  save.ts       save + settings schema, autoQuality, labels
  mansion/      procedural house kit (walls with openings, glazing, slabs with holes, stairs, cylinders, prisms),
                dynamic parts (doors, sliders, fans, screens), furniture, cars, house.ts (rooms) and compound.ts
                (walls, gate, drive, forecourt, pool, gazebo, BQ, generator house) → buildMansion()
```

* The mansion is built in a **local frame** (origin world `(-374.1, 24.3, -411.9)`, X east 0..66, Z south 0..76,
  Z = 76 is the street side). Rooms, doors and spots are authored in `house.ts` / `compound.ts`; every wall segment
  registers a collider, every door an interactable, every lamp a candidate point light.
* The city terrain is clipped (material clipping planes) where the pool is dug, so below-ground features inside the
  compound need both a lawn hole and a terrain clip rectangle (`mansion.pits`).
* `window.vora` exposes scene, camera, player, household, sky, clock and save for the screenshot driver and debugging.

---

## 3. Building the APK

The APK is built by **GitHub Actions** (`.github/workflows/android.yml`) on every push and on `v*` tags:

1. `npm ci` → `npm run typecheck` → `npm test`
2. `npm run characters` (the glTF humans are generated, not committed)
3. `npm run build` (Vite → `dist/`: game + city viewer + character lineup, ~90 MB incl. 72 character files)
4. `npx cap sync android` copies `dist/` into the Android project
5. `./gradlew assembleDebug` → artifact **`vora-city-<sha>-debug.apk`** (Actions → run → Artifacts);
   tags additionally publish the APK on a GitHub Release.

Android shell (Capacitor 7, `android/`): app id `com.jag.voracity`, name *Vora City*, `sensorLandscape`,
immersive-sticky full screen, keep-screen-on, display-cutout short-edges, black splash with the JAG / VORA CITY
wordmark, adaptive launcher icon (`scripts/android/make-icons.py` regenerates icons + splash). Min SDK 23
(Android 6), target SDK 35. The debug APK is signed with the debug key, so it installs directly from the phone's
downloads ("install unknown apps").

Local alternative (needs JDK 21 + Android SDK): `npm run build && npx cap sync android && cd android && ./gradlew assembleDebug`.

Screenshots in `docs/screenshots/game/` are real headless renders of the game (`node scripts/game-shot.mjs`,
env `SHOTS=…`, `QUALITY=…`, `MOBILE=1`).

---

## 4. Road-map (agreed build order)

| Milestone | Scope |
|---|---|
| **APK 1 – App + Home** (this build) | app shell, intro, title, creator, the mansion, household, HUD, save, settings, quality presets, APK pipeline |
| **APK 2 – Alive** | retargeted mocap (Rocketbox, MIT) on everyone, role placement + daily schedules across the city, traffic, animated world (signals, signs, water, lights), intro cinematic |
| **APK 3 – Ride & earn** | driving (owner's cars + city vehicles), jobs, money, shops |
| **APK 4 – Wanted** | crimes, wanted level, police chase and arrest, respawn, save slots |
| **APK 5 – Story** | missions, phone apps, more interiors, audio / radio, polish |
| later | multiplayer, normal houses for other players |

Known limitations in APK 1: procedural (not mocap) animation, painted faces, NPCs do not yet walk between spots,
no vehicles to drive, no sound. See `docs/REPORT.md` and `docs/CHARACTERS.md` for the earlier phases.
