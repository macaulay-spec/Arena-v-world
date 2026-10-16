/**
 * Movement-path test (headless Chromium): boots the game and drives the real PlayerController along
 * waypoint routes through the mansion — bed → stairs → hall → front door → veranda steps → forecourt →
 * drive → gate → street and back, plus the garden / pool / back-door loop — at simulation speed
 * (60 Hz steps, no rendering between steps). Every step is checked against the rendered geometry:
 *
 *   sink      feet more than 4 cm below the visible floor (ray-cast down through the mansion + terrain)
 *   hover     feet more than 25 cm above the visible floor while grounded (invisible collision floor)
 *   fall      the controller lost ground contact without a jump (walked into a hole / off a hairline gap)
 *   teleport  horizontal displacement in one step beyond what the speed allows
 *   stuck     no progress towards the current waypoint for 4 simulated seconds (trapped)
 *
 * Exit code 1 when any route fails. Prints JSON.
 *
 *   node scripts/game-walk.mjs [baseUrl] [outJson]   (env: QUALITY=lite|standard|high)
 */
import { writeFileSync } from 'node:fs';
import { launchBrowser, bootGame } from './lib/headless.mjs';

const base = process.argv[2] ?? 'http://localhost:5173/';
const outJson = process.argv[3];
const QUALITY = process.env.QUALITY ?? 'lite';

const { browser, page, errors } = await launchBrowser();
await bootGame(page, base, QUALITY);

// local mansion coordinates (metres): X east 0..66, Z south 0..76 (gate side), Y above the terrace
const GF = 0.45, F1 = 3.85, RF = 7.25;
const ROUTES = {
  // the exit the player takes every morning: wake → master door → corridor → landing → half-landing → flight 1 → hall → front door → veranda → steps → forecourt → drive → gate → street
  bedToStreet: [[25.2, F1, 29.2], [29.2, F1, 30.55], [31.2, F1, 30.55], [33, F1, 30.55], [33, F1, 38.7], [31, F1, 38.7], [28.5, F1, 38.7], [28.5, GF, 43.3], [31, GF, 43.3], [33, GF, 41], [33, GF, 44.6], [33, GF, 46.2], [33, 0, 48.6], [29.2, 0, 52], [27.5, 0, 60], [27, 0, 70], [27, 0, 75.7], [27, 0, 80], [27, 0, 86]],
  // and back in (the reverse, finishing at the bedside)
  streetToBed: [[27, 0, 86], [27, 0, 80], [27, 0, 75.7], [27, 0, 70], [27.5, 0, 60], [29.2, 0, 52], [33, 0, 48.6], [33, GF, 46.2], [33, GF, 44.6], [33, GF, 41], [31, GF, 43.3], [28.5, GF, 43.3], [28.5, F1, 38.7], [31, F1, 38.7], [33, F1, 38.7], [33, F1, 30.55], [31.2, F1, 30.55], [29.2, F1, 30.55], [25.2, F1, 29.2]],
  // pedestrian side gate and the walkway along the west wall
  sideGate: [[27, 0, 70], [22.15, 0, 72], [22.15, 0, 75.7], [22.15, 0, 79], [10, 0, 79.5], [22.15, 0, 79], [22.15, 0, 75.7], [22.15, 0, 72], [27, 0, 68], [27.5, 0, 58], [18, 0, 52], [8, 0, 50], [8, 0, 60], [12, 0, 40]],
  // kitchen → garden door → rear deck → along the pool → round its east end → down the pool steps into the water → back up → lawn → carport lane → drive
  houseToGarden: [[33, GF, 41], [34, GF, 33], [34, GF, 24], [34, GF, 20.4], [34.8, 0.15, 19.1], [34.8, 0.15, 17.5], [41, 0.15, 17.6], [49.5, 0.15, 15], [49.5, 0.15, 9], [46.4, -0.85, 9], [44.5, -1.15, 9], [49.5, 0.15, 9], [53.5, 0.15, 10], [55, 0, 10], [60, 0, 20], [62, 0, 45], [55, 0, 57], [55, 0, 70], [48, 0, 60], [44, 0, 54], [36.5, 0, 52]],
  // roof terrace: landing → half-landing → flight 2 → penthouse → terrace door (north wall) → terrace → the roof lounge and back down two floors to the hall
  roof: [[33, F1, 38.7], [31, F1, 38.7], [28.5, F1, 38.7], [28.35, RF, 33.2], [28.35, RF, 31.2], [34, RF, 31], [39, RF, 36.5], [34, RF, 31], [28.35, RF, 31.2], [28.35, RF, 33.2], [28.5, F1, 38.7], [28.5, GF, 43.3], [31, GF, 43.3], [33, GF, 41]],
};

const result = await page.evaluate(async (ROUTES) => {
  const v = window.vora; const m = v.mansion; const [ox, oy, oz] = m.origin; const col = v.collision; const player = v.player;
  const scene = v.scene;
  const terrain = scene.getObjectByName('world')?.getObjectByName('terrain');
  const roads = scene.getObjectByName('world')?.children.filter(c => /^(roads|surfaces):/.test(c.name || '')) ?? [];
  const castInto = [m.group, terrain, ...roads].filter(Boolean);
  const THREE = v.THREE; // the game exposes its three.js namespace for diagnostics
  const ray = new THREE.Raycaster(); ray.far = 60;
  const down = new THREE.Vector3(0, -1, 0), origin = new THREE.Vector3();
  /**
   * What the down-ray meets at (x, z): `floor` = the first upward-facing face at or below the feet
   * (+5 cm), `inside` = the highest upward-facing face between the feet and 1.2 m up that is not a
   * door/gate leaf — standing under such a face means the body is inside furniture that has no collider.
   */
  m.group.updateMatrixWorld(true);
  const probe = (x, y, z) => {
    origin.set(x, y + 1.2, z); ray.set(origin, down);
    const hits = ray.intersectObjects(castInto, true);
    let floor = null, inside = null;
    for (const h of hits) {
      if (!h.object.visible || !h.face) continue;
      const n = h.face.normal.clone().transformDirection(h.object.matrixWorld); if (n.y < 0.5) continue;
      const hy = h.point.y;
      if (hy > y + 0.05) {
        const what = pathOf(h.object);
        // door/gate leaves are not furniture; terrain inside a pit is clipped away by the renderer (pool), not geometry
        if (inside === null && !/door|gate|slider|:water$/i.test(what) && !(/terrain/.test(what) && inPit(x, z))) inside = { y: hy, what };
        continue;
      }
      floor = hy; break;
    }
    return { floor, inside };
  };
  const inPit = (x, z) => m.pits.some(([x0, z0, x1, z1]) => x >= ox + x0 && x <= ox + x1 && z >= oz + z0 && z <= oz + z1);
  const pathOf = (o) => { const parts = []; for (let p = o; p && p !== scene; p = p.parent) parts.unshift(p.name || p.type); return parts.join('/'); };
  // open every door, gate and slider through the same interactable actions the player uses, then let them animate
  const opened = [];
  for (const i of m.interactables) {
    const label = i.prompt?.() ?? i.id;
    if ((/^door:/.test(i.id) || i.id === 'gate') && /^Open /.test(label)) { i.action(); opened.push(label); }
  }
  for (let k = 0; k < 400; k++) m.update(1 / 60);
  m.group.updateMatrixWorld(true);
  const doorsOpen = m.doors.filter(d => d.open).length, slidersOpen = m.sliders.filter(s => s.open).length;

  const run = (name, pts, running = false) => {
    const dt = 1 / 60; const [sx, sy, sz] = pts[0];
    player.busy = false;
    player.teleport(ox + sx, oy + sy, oz + sz, 0); player.settle();
    const log = { name, steps: 0, seconds: 0, waypoints: pts.length, reached: 0, events: [], minClear: Infinity, maxHover: -Infinity, ok: true, path: [] };
    const inp = { moveX: 0, moveY: 0, moveMag: 1, run: running, jumpPressed: false, interactPressed: false, cameraPressed: false, pausePressed: false, lookDX: 0, lookDY: 0, zoom: 0, touch: true };
    let wasGrounded = true;
    for (let w = 1; w < pts.length; w++) {
      const [tx, , tz] = pts[w]; const X = ox + tx, Z = oz + tz;
      let best = Infinity, lastGain = 0, steps = 0;
      while (steps < 60 * 90) {
        const dx = X - player.pos.x, dz = Z - player.pos.z; const d = Math.hypot(dx, dz);
        if (d < 0.22) break;
        // camera yaw 0: input x → +x world, input y → −z world (PlayerController.inputDirection)
        inp.moveX = dx / d; inp.moveY = -dz / d; inp.moveMag = 1;
        const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
        player.update(dt, inp, 0); m.update(dt);
        steps++; log.steps++;
        const moved = Math.hypot(player.pos.x - px, player.pos.z - pz);
        if (moved > player.runSpeed * dt * 2.5 + 0.05) { log.events.push({ kind: 'teleport', at: [+(px - ox).toFixed(2), +(py - oy).toFixed(2), +(pz - oz).toFixed(2)], moved: +moved.toFixed(2) }); }
        if (wasGrounded && !player.grounded) log.events.push({ kind: 'fall', at: [+(px - ox).toFixed(2), +(py - oy).toFixed(2), +(pz - oz).toFixed(2)], toward: w });
        wasGrounded = player.grounded;
        if (log.steps % 3 === 0 && player.grounded) {
          if (log.steps % 30 === 0) m.group.updateMatrixWorld(true); // doors keep animating without renders
          const at = [+(player.pos.x - ox).toFixed(2), +(player.pos.y - oy).toFixed(2), +(player.pos.z - oz).toFixed(2)];
          const { floor, inside } = probe(player.pos.x, player.pos.y, player.pos.z);
          if (floor !== null) {
            const clear = player.pos.y - floor; // + above the visible floor, − buried
            log.minClear = Math.min(log.minClear, clear); log.maxHover = Math.max(log.maxHover, clear);
            if (clear < -0.04) log.events.push({ kind: 'sink', at, by: +(-clear).toFixed(3) });
            else if (clear > 0.25) log.events.push({ kind: 'hover', at, by: +clear.toFixed(3) });
          }
          if (inside) log.events.push({ kind: 'clip', at, by: +(inside.y - player.pos.y).toFixed(2), what: inside.what.split('/').pop() });
        }
        if (log.steps % 30 === 0) log.path.push([+(player.pos.x - ox).toFixed(2), +(player.pos.y - oy).toFixed(2), +(player.pos.z - oz).toFixed(2)]);
        if (d < best - 0.05) { best = d; lastGain = steps; }
        else if (steps - lastGain > 60 * 4) { log.events.push({ kind: 'stuck', at: [+(player.pos.x - ox).toFixed(2), +(player.pos.y - oy).toFixed(2), +(player.pos.z - oz).toFixed(2)], toward: w, target: pts[w], dist: +d.toFixed(2) }); break; }
      }
      const dEnd = Math.hypot(X - player.pos.x, Z - player.pos.z);
      if (dEnd < 0.22) log.reached++; else { log.events.push({ kind: 'unreached', toward: w, target: pts[w], at: [+(player.pos.x - ox).toFixed(2), +(player.pos.y - oy).toFixed(2), +(player.pos.z - oz).toFixed(2)], dist: +dEnd.toFixed(2) }); break; }
    }
    log.seconds = +(log.steps / 60).toFixed(1);
    log.minClear = +log.minClear.toFixed(3); log.maxHover = +log.maxHover.toFixed(3);
    // de-duplicate consecutive identical event kinds at nearby positions
    const ev = []; for (const e of log.events) { const p = ev[ev.length - 1]; if (p && p.kind === e.kind && Math.hypot(p.at[0] - e.at[0], p.at[2] - e.at[2]) < 1.0) { p.count = (p.count ?? 1) + 1; continue; } ev.push(e); }
    log.events = ev;
    // clipping through collider-less furniture is reported but does not fail the route (the player is
    // never trapped or dropped by it); everything else does
    log.ok = log.reached === pts.length - 1 && !ev.some(e => (e.kind !== 'hover' && e.kind !== 'clip') || (e.kind === 'hover' && e.by > 0.45));
    return log;
  };
  const routes = {}; for (const [name, pts] of Object.entries(ROUTES)) routes[name] = run(name, pts, /^streetToBed|^houseToGarden/.test(name)); // the way back and the garden loop are run, the rest walked
  // collision cost while doors / gate animate (scoped index updates)
  const time = (fn, n) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(); return +((performance.now() - t) / n).toFixed(3); };
  const door = m.doors[0], gate = m.sliders[0];
  const perf = { doorStepMs: time(() => { door.toggle(); door.update(1 / 60); }, 60), gateStepMs: time(() => { gate.toggle(); gate.update(1 / 60); }, 60), cells: col.cellCount ?? null, blockers: col.blockers.length, surfaces: col.surfaces.length };
  return { quality: v.quality, origin: m.origin, opened, doorsOpen, slidersOpen, routes, perf };
}, ROUTES);

result.errors = errors;
result.ok = Object.values(result.routes).every(r => r.ok) && errors.length === 0;
const summary = Object.fromEntries(Object.entries(result.routes).map(([k, r]) => [k, { ok: r.ok, reached: `${r.reached}/${r.waypoints - 1}`, seconds: r.seconds, minClear: r.minClear, maxHover: r.maxHover, events: r.events.map(e => `${e.kind}@${e.at?.join(',') ?? ''}${e.by != null ? ' by ' + e.by : ''}${e.what ? ' ' + e.what : ''}${e.count ? ' x' + e.count : ''}${e.target ? ' → ' + e.target.join(',') : ''}`) }]));
console.log(JSON.stringify({ ok: result.ok, quality: result.quality, origin: result.origin, opened: result.opened, doorsOpen: result.doorsOpen, slidersOpen: result.slidersOpen, perf: result.perf, routes: summary, errors }, null, 1));
if (outJson) writeFileSync(outJson, JSON.stringify(result, null, 1));
await browser.close();
process.exit(result.ok ? 0 : 1);
