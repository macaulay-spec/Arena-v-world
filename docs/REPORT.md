# V-WORLD · Vora City — build report (Stages 1–2 of the foundation)

Date: 2026-10-14 · Branch: `arena/654fc159-arena-v-world` · Seed: `20260419` · `data/city.json` version `0.2.0`

## 1. Audit of the legacy demo (Stage 1)

`legacy/V-WORLD-City-End-to-End.html` (the original upload, kept for reference) was a single-file three.js scene.
Findings that drove the rebuild:

| Finding | Consequence | Replacement |
|---|---|---|
| Roads were a uniform grid of flat quads; no graph, no junction geometry, overlapping surfaces | nothing could be aligned to roads; no T/4-way/roundabout logic | planar road graph with hierarchy, junction trimming, markings, kerbs, medians, bridges |
| Buildings were random boxes dropped on a grid, many intersecting roads and each other | not a believable city | blocks → parcels → archetype massing with setbacks, frontage and verified clearance |
| Seven rectangular district areas with flat colours | no district character | six polygonal districts (+ hinterland) with their own road grammar, archetype mix, materials, fences and props |
| Flat ground, no water, no terrain | no site logic (river, lagoon, heights) | heightmap terrain, lagoon shoreline and river channel, roads graded to terrain |
| Solid-colour materials, static lighting | cartoon look | procedurally painted 8×8 texture atlas, tint/emissive masks, time-of-day sun/sky/fog, night windows & lamp pools |
| No ids / data layer | nothing could be extended | stable ids and typed schema for every entity (`src/shared/types.ts`) |
| Traffic/NPC toys mixed into the scene | out of scope for the foundation | removed; parked vehicles only, structure left for later systems |

## 2. What was built (Stage 2)

### Generator (`generator/`, deterministic, ~1 s)
* **Layout** (`config.ts`): district polygons (Central District, Market Quarter, North Heights, Old Town,
  Industrial District, Green Estates), 40 authored streets with names, 27 reserved landmark sites, 7 roundabouts,
  2 bridges, the North Gate.
* **Roads** (`graph.ts`, `roads.ts`): authored skeleton → super-blocks → district-specific subdivision (grid, winding,
  organic, service) → one planar graph. Fixes made during verification: crossings that fell within the merge radius of a
  vertex were being swallowed (Meridian Avenue × Market Street had no junction), near-parallel duplicate streets, stale
  adjacency after node merges, and coarse resampling that moved roads away from the blocks cut from them. Output: 458
  nodes, 721 edges, 194 named streets, 423 intersections, 7 roundabouts, 2 bridges; 43.2 km of road
  (arterial 7.5 km, secondary 13.0 km, local 18.1 km, lane 1.1 km, service 2.3 km, waterfront 1.1 km).
* **Blocks & parcels** (`blocks.ts`, `parcels.ts`): 261 blocks, 1,496 parcels. Building lines are inset per road class
  (corridor half-width + building line), roundabout corners are cut back, the wider corridor is kept where a wide street
  continues as a narrower one. Parcels carry frontage edge, front direction, fence type, gate position and a street address.
* **Buildings** (`archetypes.ts`, `buildings.ts`, `landmarks.ts`): 1,263 buildings, 49 archetypes, 23 landmarks.
  Per district: Old Town 418, North Heights 275, Market Quarter 228, Green Estates 207, Central 81 (incl. all towers),
  Industrial 42 (large footprints), hinterland 12. Massing is parcel-relative with a position/size search so irregular
  parcels still get a fitting building; every mass records facade tile, bay width, ground-floor treatment, roof type and
  features (balconies, canopies, porticos, colonnades, arcades, verandas, awnings, signs, tanks, AC units, roller doors,
  stacks, minarets, spires, crowns, fins, helipads, dishes, …).
* **Public space & props** (`props.ts`, `landmarks.ts`): 12,981 props across 55 types — 1,394 lamps, 4,263 trees,
  838 market stalls, 831 signals, 407 street-name signs, 342 parking bays, 304 benches, 241 manholes, 195 bins,
  128 utility cabinets, 760 poles with 426 wire spans, 71 bus stops/shelters, 1,477 parked vehicles, cranes,
  scaffolds, roadworks, playgrounds, pitches, fountains, monuments, boats, piers, quay cranes, fields, stadium and
  port floodlight masts.
  Land props are rejected in water or below graded ground level.

### Renderer (`src/app/`, three.js 0.170, Vite)
* Runtime-painted **texture atlas** (facades, shopfronts, roofs, ground; tint mask + emissive mask) — no downloads.
* **Terrain** (5 m lattice in the city, 10 m outside) coloured by land cover; parcel surfaces (plazas, yards, parking,
  stalls, pitches, fields) cut on the same lattice so they never z-fight; water shader with ripples, Fresnel, sun glints.
* **Roads**: carriageway, kerbs, continuous sidewalks, medians with palms, lane/centre markings, zebra crossings,
  stop lines, parking bays, drains, speed bumps, roundabout islands, beam and cable-stayed bridges with piers/pylons.
* **Buildings**: chunked merged meshes (200 m cells); the stadium is a dedicated bowl builder (rounded-rectangle
  two-tier stands in sector colours, concourse wall, cantilever roof ring, corner cores, marked pitch) with per-building tint and per-building/per-window night lighting
  (hash of tile repeat × face × building; warm/cool colour; staggered switch-on at dusk); picking via a per-vertex id.
* **Walls/fences/hedges/railings/gates** per parcel; **props** as instanced meshes per 320 m cell with per-instance
  colour, text signs from a glyph atlas, additive lamp-glow decals at night.
* **Sky/lighting**: sun path, dusk band, moon at night, hemisphere + ambient, fog tied to horizon colour, single
  2048² shadow map following the camera; quality presets (`?q=low|medium|high`), mobile auto-detection, LOD toggling
  of detail chunks by distance, frustum culling.
* **UI**: HUD (district, position, time slider, mode, quality, shadows, landmark jump, controls help, building
  inspector), minimap with click-to-travel, loading progress.

## 3. Verification (all actually run)

| Check | Result |
|---|---|
| `npm run typecheck` | clean (strict TypeScript across generator, shared, app, tests) |
| `npm run generate` twice → identical JSON (minus timestamp) | **pass** (`tests/city.test.ts`) |
| Road graph: unique ids, single connected component, no dangling ends inside the map, planar (no crossing without a node), hierarchy/bridges/roundabouts present | **pass** |
| Blocks/parcels/buildings: unique ids, references resolve, landmark building ids exist, district names preserved and character thresholds met | **pass** |
| No building mass corner/edge inside any road corridor (tolerance 0.9 m) | **pass** (0 of 1,263) |
| Building masses inside their parcel | **pass** |
| No land props in water | **pass** |
| Stats match data | **pass** |
| `npx vitest run` | **13 / 13 passed** |
| `npm run build` | production bundle: ≈620 kB JS (≈170 kB gzip) + 2.8 MB JSON (≈486 kB gzip) |
| Headless runtime test (`scripts/screenshot.mjs`, bundled Chromium 131 + SwiftShader software GL) | viewer loads, **no page errors / console errors / failed requests**; 12 views rendered to `docs/screenshots/`; a phone-emulated run (412×915 touch device, `low` preset) rendered to `docs/screenshots/mobile/` |

Measured in the software renderer (not representative of GPU speed): 108–583 draw calls and 0.5–1.9 M triangles
per view at the *medium* preset. On a GPU the scene is dominated by ~350 chunk/instance draw calls and the single
shadow pass; *low* disables shadows and antialiasing and halves the atlas for phones.

Screenshots were taken by the script above from the real viewer — see `docs/screenshots/*.png` and
`docs/screenshots/report.json` (per-view draw-call/triangle counts). `docs/map.png` is the generator's plan render.

## 4. Known limitations / next steps

* Visual quality is "clean procedural" rather than photo-real: facades are painted at 256 px per tile, trees are
  low-poly cards/blobs, there is no ambient occlusion or screen-space effects. Adding baked AO per chunk and a
  normal-mapped detail pass are the next biggest wins.
* Industrial District has 42 large buildings; yards are populated but a second pass of smaller workshops, fencing
  variety and rail/sidings would thicken it.
* The parallel-street filter removed a few legitimate but too-close North Heights lanes; the district still reads
  correctly but could regain cul-de-sacs with a tuned subdivision.
* Bridges: Unity Bridge is cable-stayed, the ring-road bridge is a beam bridge; approach ramps are flat decks at bank
  height rather than graded embankments.
* FPS readout in the headless screenshots shows 0–2 fps because SwiftShader renders in software; the HUD measures
  wall-clock frames and will show real values in a browser.
* Not done (out of scope by brief): interiors, traffic AI, NPCs, economy, multiplayer, missions.

## 5. Files

* `generator/` — config, graph, roads, blocks, parcels, archetypes, landmarks, buildings, props, index.
* `src/shared/` — types (schema), rng, noise, geom, terrain, ground (road-graded height), tiles, roadgeom.
* `src/app/` — main, atlas, materials, geom builders, signs, sky, controls, hud, minimap, style, `world/`
  (terrain, roads, buildings, walls, props, glow, chunks).
* `data/city.json` — baked world. `docs/map.png`, `docs/screenshots/` — renders. `tests/city.test.ts` — verification.
* `scripts/render_map.py` — plan renderer; `scripts/screenshot.mjs` — headless smoke test + screenshots.
* `legacy/` — the original single-file demo, untouched, for comparison.
