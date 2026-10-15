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
   →  New game: character creation on the roof terrace (name, sex, skin tone, hair, outfit, height, random)
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
* **Touch:** left virtual stick (walk; push further to run), right side of the screen = look, buttons
  **Interact · Jump · Run · Camera · Pause**.
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
