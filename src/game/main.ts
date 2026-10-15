/**
 * VORA CITY — game runtime (APK 1 "App + Home").
 * Boot: JAG logo → load city + JAG House → title (live cinematic) → continue / create → wake up at home.
 */
import * as THREE from 'three';
import cityUrl from '../../data/city.json?url';
import type { CityData } from '../shared/types';
import { pointInPolygon } from '../shared/geom';
import { buildCityWorld, cullDetail, type CityWorld } from '../app/world/build';
import { makeSky } from '../app/sky';
import { GLOBAL } from '../app/materials';
import { Crowd, CROWD_PRESETS, type Manifest } from '../app/crowd';
import { Input } from './input';
import { CollisionWorld } from './collision';
import { Avatar, PlayerController, DEFAULT_APPEARANCE, ASSETS, loadKitInfo, promptOf, type Appearance, type Interactable, type KitInfo } from './player';
import { ChaseCamera } from './camera';
import { buildMansion, type Mansion } from './mansion/index';
import { Household } from './npcs';
import { Radar } from './radar';
import { Hud, fade } from './hud';
import { Screens } from './screens';
import { loadSave, writeSave, newSave, deleteSave, loadSettings, writeSettings, autoQuality, clockLabel, type SaveData, type Settings, type QualityId } from './save';

const PRESETS: Record<QualityId, { label: string; pixelRatio: number; aa: boolean; shadows: number; atlasPx: number; detail: number; far: number; lights: number; crowd: 'low' | 'medium' | 'high' | null; tex: number; anisotropy: number }> = {
  lite: { label: 'Lite', pixelRatio: 1, aa: false, shadows: 0, atlasPx: 128, detail: 300, far: 2200, lights: 2, crowd: 'low', tex: 256, anisotropy: 1 },
  standard: { label: 'Standard', pixelRatio: 1.5, aa: true, shadows: 1024, atlasPx: 192, detail: 520, far: 3000, lights: 5, crowd: 'medium', tex: 512, anisotropy: 4 },
  high: { label: 'High', pixelRatio: 2, aa: true, shadows: 2048, atlasPx: 256, detail: 800, far: 3800, lights: 8, crowd: 'high', tex: 1024, anisotropy: 8 },
};
const MANSION_ORIGIN: [number, number, number] = [-374.1, 24.3, -411.9];
const HOUSE_NAME = 'JAG House', HOUSE_ADDR = '1 Ridge Street, North Heights';
const ROOM_LABEL: Record<string, string> = { living: 'Living room', hall: 'Entrance hall', dining: 'Dining room', kitchen: 'Kitchen', lounge: 'Family lounge', wc: 'Guest WC', store: 'Store', study: 'Study', landing: 'Landing', corridor: 'Upstairs corridor', master: 'Master bedroom', dressing: 'Dressing room', masterbath: 'Master bathroom', bedroom2: 'Guest bedroom', bedroom3: 'Bedroom', ensuite3: 'En-suite', bath: 'Bathroom', bedroom4: 'Kids’ room', penthouse: 'Roof lounge', roof: 'Roof terrace' };
const SECONDS_PER_GAME_MINUTE = 2;

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const nextFrame = () => new Promise<void>(r => requestAnimationFrame(() => r()));

async function main() {
  const settings = loadSettings();
  const qualityId: QualityId = settings.quality === 'auto' ? autoQuality() : settings.quality;
  const Q = PRESETS[qualityId];
  const screens = new Screens();
  const logoDone = screens.logo();
  const isTouch = matchMedia('(pointer: coarse)').matches;
  document.body.classList.add(isTouch ? 'touch' : 'pointer');

  // ─── renderer / scene ───
  const canvas = $<HTMLCanvasElement>('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = Q.shadows > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.15, Q.far);
  const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize); visualViewport?.addEventListener('resize', onResize);

  // ─── loading (behind the logo, then the loading screen) ───
  let loadingShown = false;
  const progress = async (label: string, f: number) => { if (!loadingShown) { loadingShown = true; await logoDone; screens.show('loading'); } screens.setLoading(label, f); await nextFrame(); await nextFrame(); };
  const city: CityData = await (await fetch(cityUrl)).json();
  const built: CityWorld = await buildCityWorld(city, { atlasPx: Q.atlasPx, detail: Q.detail }, { progress: (l, f) => progress(l, f * 0.55), smallText: isTouch });
  scene.add(built.world);
  const sky = makeSky(scene, Math.max(512, Q.shadows)); sky.sun.castShadow = Q.shadows > 0;

  await progress('Building JAG House…', 0.6);
  const collision = new CollisionWorld((x, z) => built.height(x, z));
  for (const b of city.buildings) for (const m of b.masses) collision.addPolygon(m.footprint as [number, number][], m.baseY - 2, m.baseY + m.floors * m.floorHeight + 2);
  const mansion: Mansion = buildMansion({ origin: MANSION_ORIGIN, collision, shadows: Q.shadows > 0, textureSize: Q.tex });
  scene.add(mansion.group);
  await progress('Furnishing…', 0.72);

  // household + player assets
  const kitInfo: KitInfo[] = await loadKitInfo(ASSETS);
  const manifest: Manifest = await (await fetch(ASSETS + 'manifest.json')).json();
  const avatar = new Avatar(ASSETS, Q.shadows > 0); scene.add(avatar.root);
  const household = new Household(ASSETS, Q.shadows > 0); scene.add(household.group);
  const spotsLocal: Record<string, { x: number; y: number; z: number; yaw: number }> = {};
  for (const [id, s] of Object.entries(mansion.spots)) spotsLocal[id] = { x: s.pos[0], y: s.pos[1], z: s.pos[2], yaw: s.yaw };
  await progress('Waking the household…', 0.8);

  // ─── game objects ───
  const input = new Input(canvas, { stick: $('stick'), knob: $('knob'), buttons: { jump: $('btn-jump'), run: $('btn-run'), interact: $('btn-interact'), camera: $('btn-camera'), pause: $('btn-pause') } });
  input.sensitivity = settings.sensitivity; input.invertY = settings.invertY;
  const player = new PlayerController(avatar, collision);
  const chase = new ChaseCamera(camera, collision);
  const hud = new Hud(); const radar = new Radar(city, hud.radar);
  radar.setMarkers([{ x: MANSION_ORIGIN[0] + 33, z: MANSION_ORIGIN[2] + 38, color: '#f2c230' }]);
  hud.setFpsVisible(settings.showFps);
  household.onSay = (who, line) => { hud.say(who, line); save && save.stats.talks++; };
  const crowd = Q.crowd ? new Crowd(city, (x, z) => built.height(x, z), CROWD_PRESETS[Q.crowd]) : null;
  if (crowd) scene.add(crowd.group);

  // dynamic light pool (nearest N of the mansion's light spots)
  const lightPool: THREE.PointLight[] = [];
  for (let i = 0; i < Q.lights; i++) { const l = new THREE.PointLight(0xffffff, 0, 10, 2); l.visible = false; scene.add(l); lightPool.push(l); }
  let power = true;

  // ─── state ───
  let save: SaveData | null = loadSave();
  let appearance: Appearance = save?.appearance ?? { ...DEFAULT_APPEARANCE };
  let state: 'title' | 'create' | 'game' | 'paused' | 'cutscene' = 'title';
  let gameMinutes = save?.minutes ?? 7 * 60 + 12, day = save?.day ?? 1;
  let interactables: Interactable[] = [];
  const mansionInteractables: Interactable[] = mansion.interactables.map(i => ({ prompt: i.prompt, pos: new THREE.Vector3(...i.pos), radius: i.radius, action: () => gameAction(i.id, i.action), enabled: i.enabled }));

  await avatar.setAppearance(appearance, kitInfo);
  await household.load(manifest, spotsLocal, appearance.sex, (d, t) => { screens.setLoading(`Waking the household… ${d}/${t}`, 0.8 + 0.18 * d / t); });
  interactables = [...mansionInteractables, ...household.interactables];
  await progress('Ready', 1); await wait(200);
  screens.show('loading', false);

  // ─── helpers ───
  const setClock = (minutes: number) => { gameMinutes = ((minutes % 1440) + 1440) % 1440; sky.setHour(gameMinutes / 60); };
  const isNight = () => { const h = gameMinutes / 60; return h < 6.4 || h > 18.6; };
  const districtAt = (x: number, z: number) => city.districts.find(d => pointInPolygon([x, z], d.polygon));
  const focus = new THREE.Vector3(); const tmp = new THREE.Vector3();
  const flash = (t: string) => hud.notify(t);
  const persist = (withPos = true) => { if (!save) return; save.minutes = gameMinutes; save.day = day; save.appearance = appearance; if (withPos) save.pos = [player.pos.x, player.pos.y, player.pos.z, player.yaw]; writeSave(save); };
  const enterFullscreen = () => {
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
    (el.requestFullscreen?.({ navigationUI: 'hide' }) ?? el.webkitRequestFullscreen?.())?.catch?.(() => {});
    const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    so.lock?.('landscape').catch(() => {});
  };

  // ─── game actions wired to mansion interactables ───
  async function gameAction(id: string, base: () => void) {
    if (!save) return;
    if (id.startsWith('door:')) { base(); save.stats.doors++; return; }
    if (id === 'gate') { base(); return; }
    if (id.startsWith('tv')) { base(); return; }
    if (id === 'eat') { base(); save.stats.meals++; save.health = Math.min(100, save.health + 15); flash('You ate. Health +15'); return; }
    if (id === 'sleep') { await sleep(); return; }
    if (id === 'wardrobe') { await wardrobe(); return; }
    if (id === 'laptop') { flash('JAG Mail: “Welcome home. Business meeting at Unity Tower — soon.”'); return; }
    if (id.startsWith('car:')) { flash('Driving arrives in the next update (APK 3: Ride & earn).'); return; }
    if (id === 'generator') { power = !power; flash(power ? 'Generator on — “Up NEPA!”' : 'Generator off. The house runs on the grid.'); return; }
    base();
  }
  async function sleep() {
    if (!save) return; state = 'cutscene'; player.busy = true; input.clear();
    await fade(true, 700);
    avatar.play('lie', 0.1); const bed = mansion.spots.bed ?? mansion.spots.wake; if (bed) player.teleport(bed.pos[0], bed.pos[1], bed.pos[2], bed.yaw);
    const slept = gameMinutes < 7 * 60 ? 7 * 60 - gameMinutes : 24 * 60 - gameMinutes + 7 * 60; if (gameMinutes >= 7 * 60) day++;
    setClock(7 * 60); save.health = 100; save.stats.sleeps++; persist(); flash(`You slept ${Math.round(slept / 60)} hours. Day ${day}. Game saved.`);
    await wait(900); await fade(false, 900); await wait(1200);
    const wake = mansion.spots.wake; if (wake) player.teleport(wake.pos[0], wake.pos[1], wake.pos[2], wake.yaw);
    avatar.play('idle', 0.4); chase.snapBehind(player.yaw); player.busy = false; state = 'game';
  }
  async function wardrobe() {
    if (!save) return; state = 'create'; player.busy = true; input.clear(); input.enabled = false;
    const wake = mansion.spots.mirror ?? mansion.spots.wake; if (wake) player.teleport(wake.pos[0], wake.pos[1], wake.pos[2], wake.yaw + Math.PI);
    avatar.play('idle', 0.2);
    appearance = await screens.create(kitInfo, appearance, a => { appearance = a; avatar.setAppearance(a, kitInfo); });
    await avatar.setAppearance(appearance, kitInfo); save.appearance = appearance; persist();
    flash('Looking sharp.'); input.enabled = true; player.busy = false; chase.snapBehind(player.yaw); state = 'game';
  }

  // ─── title cinematic ───
  const centre = new THREE.Vector3(MANSION_ORIGIN[0] + 33, MANSION_ORIGIN[1] + 4, MANSION_ORIGIN[2] + 38);
  let cineT = 0;
  const cinematicCamera = (dt: number) => {
    cineT += dt; const a = cineT * 0.07 + 2.4, r = 46 + Math.sin(cineT * 0.11) * 8, h = 14 + Math.sin(cineT * 0.09) * 4;
    camera.position.set(centre.x + Math.cos(a) * r, centre.y + h, centre.z + Math.sin(a) * r); camera.lookAt(centre.x, centre.y + 1, centre.z);
  };
  const creationCamera = () => {
    const p = player.pos; const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw));
    camera.position.set(p.x + f.x * 3.0 - f.z * 0.9, p.y + 1.25, p.z + f.z * 3.0 + f.x * 0.9); camera.lookAt(p.x, p.y + 0.95, p.z);
  };

  async function openSettings() {
    const before = settings.quality;
    await screens.settings(settings, s => { writeSettings(s); input.sensitivity = s.sensitivity; input.invertY = s.invertY; hud.setFpsVisible(s.showFps); }, () => { deleteSave(); save = null; flash('Save deleted.'); });
    if (settings.quality !== before) { const nq = settings.quality === 'auto' ? autoQuality() : settings.quality; if (nq !== qualityId) { await fade(true, 400); location.reload(); } }
  }

  // ─── boot into the title ───
  setClock(17 * 60 + 20); // golden hour for the title
  cinematicCamera(0);
  state = 'title';
  const playerSpawn = async (fresh: boolean) => {
    if (!save) return;
    state = 'cutscene'; player.busy = true;
    const wake = mansion.spots.wake;
    if (!fresh && save.pos) { player.teleport(save.pos[0], save.pos[1], save.pos[2], save.pos[3]); avatar.play('idle'); }
    else if (wake) { const bed = mansion.spots.bed ?? wake; player.teleport(bed.pos[0], bed.pos[1], bed.pos[2], bed.yaw); avatar.play('lie', 0); }
    setClock(save.minutes); day = save.day;
    chase.snapBehind(player.yaw); chase.update(0, player.pos, player.yaw, 0, 0, 0, false, true);
    await fade(false, 800); hud.show(true);
    hud.setPlace(HOUSE_NAME, `${HOUSE_ADDR} · ${clockLabel(gameMinutes)}`);
    if (fresh || !save.pos) { await wait(1800); if (wake) player.teleport(wake.pos[0], wake.pos[1], wake.pos[2], wake.yaw); avatar.play('idle', 0.5); chase.snapBehind(player.yaw); flash(`Good morning, ${save.appearance.name}. Welcome home.`); }
    player.busy = false; state = 'game';
  };

  const runTitle = async () => {
    state = 'title'; hud.show(false); setClock(17 * 60 + 20); await fade(false, 600);
    const choice = await screens.title(!!save, Q.label, openSettings, enterFullscreen);
    await fade(true, 500);
    if (choice === 'new' || !save) {
      appearance = save?.appearance ?? { ...DEFAULT_APPEARANCE, name: '' };
      state = 'create'; const roof = mansion.spots.roof ?? mansion.spots.wake;
      if (roof) player.teleport(roof.pos[0], roof.pos[1], roof.pos[2], roof.yaw + Math.PI);
      avatar.play('idle'); setClock(16 * 60 + 40); creationCamera(); await fade(false, 500);
      appearance = await screens.create(kitInfo, appearance, a => { appearance = a; avatar.setAppearance(a, kitInfo); });
      await avatar.setAppearance(appearance, kitInfo);
      save = newSave(appearance); writeSave(save);
      await fade(true, 500);
      await playerSpawn(true);
    } else {
      await playerSpawn(false);
    }
  };
  runTitle().catch(e => console.error(e));

  // ─── main loop ───
  let last = performance.now(), frame = 0, fpsFrames = 0, fpsT = last, autosaveT = 0, clockAcc = 0, lastRoom: string | null = null, indoorMix = 0;
  let ambientRef = { hour: -1, ambient: 0, hemi: 0 };
  const refresh = () => { if (ambientRef.hour !== sky.hour) { ambientRef = { hour: sky.hour, ambient: sky.ambient.intensity, hemi: sky.hemi.intensity }; } };
  const baseAmbient = () => { refresh(); return ambientRef.ambient; }, baseHemi = () => { refresh(); return ambientRef.hemi; };
  const tick = () => {
    requestAnimationFrame(tick);
    const now = performance.now(); const dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    GLOBAL.uTime.value = now / 1000;
    const inp = input.poll();

    if (state === 'title') { cinematicCamera(dt); }
    else if (state === 'create') { creationCamera(); if (inp.lookDX) player.yaw -= inp.lookDX * 1.5; avatar.root.rotation.y = player.yaw; avatar.update(dt); }
    else if (state === 'game' || state === 'cutscene' || state === 'paused') {
      if (state === 'game') {
        if (inp.pausePressed) { pause(); }
        else {
          if (inp.cameraPressed) chase.cycleMode();
          player.update(dt, inp, chase.yaw);
          // clock
          clockAcc += dt; if (clockAcc >= SECONDS_PER_GAME_MINUTE) { clockAcc -= SECONDS_PER_GAME_MINUTE; setClock(gameMinutes + 1); if (gameMinutes === 0) day++; }
          // interactions
          let best: Interactable | null = null, bestD = Infinity;
          for (const it of interactables) { if (it.enabled && !it.enabled()) continue; const d = it.pos.distanceTo(player.pos); if (d < it.radius && d < bestD) { best = it; bestD = d; } }
          hud.setPrompt(best ? promptOf(best) : null);
          if (best && inp.interactPressed) best.action();
          autosaveT += dt; if (autosaveT > 45) { autosaveT = 0; persist(); }
          if (save) { save.played += dt; if (player.moving) save.stats.steps += dt * (player.speed > 3 ? 2.6 : 1.5); }
        }
      }
      const room = mansion.roomAt(player.pos.x, player.pos.y + 0.5, player.pos.z);
      const indoor = !!room && room !== 'roof';
      // interiors only get sky/ambient light (the sun is shadowed) → lift the ambient term indoors
      indoorMix += ((indoor ? 1 : 0) - indoorMix) * Math.min(1, dt * 3);
      sky.ambient.intensity = baseAmbient() + indoorMix * 0.55; sky.hemi.intensity = baseHemi() + indoorMix * 0.35;
      if (state !== 'paused') chase.update(dt, player.pos, player.yaw, inp.lookDX, inp.lookDY, inp.zoom, player.moving, indoor);
      if (room !== lastRoom && state === 'game') {
        lastRoom = room;
        if (room) hud.setPlace(ROOM_LABEL[room] ?? room, HOUSE_NAME);
        else if (mansion.inCompound(player.pos.x, player.pos.z)) hud.setPlace(HOUSE_NAME, HOUSE_ADDR);
        else { const d = districtAt(player.pos.x, player.pos.z); hud.setPlace(d?.name ?? 'Vora City', 'Vora City'); }
      } else if (!room && state === 'game' && frame % 60 === 0 && !mansion.inCompound(player.pos.x, player.pos.z)) { const d = districtAt(player.pos.x, player.pos.z); hud.setPlace(d?.name ?? 'Vora City', 'Vora City'); }
      if (save) hud.setStats(gameMinutes, day, save.cash, save.health);
      if (frame % 2 === 0) radar.update(player.pos.x, player.pos.z, chase.yaw);
    }
    if (state !== 'paused') { mansion.update(dt); household.update(dt, player.pos, camera.position); }
    hud.update(dt);

    // lighting: shadows follow the focus; nearest light spots fill the pool (night, or indoors by day)
    focus.copy(state === 'title' ? centre : player.pos);
    sky.follow(focus, mansion.inCompound(focus.x, focus.z) ? 70 : 140);
    if (lightPool.length && frame % 4 === 0) {
      const night = isNight(); const cands: { d: number; s: typeof mansion.lights[number] }[] = [];
      for (const s of mansion.lights) {
        const on = s.outdoor ? night : (night || !!mansion.roomAt(focus.x, focus.y + 0.5, focus.z)); if (!on || (!power && !s.outdoor && night)) continue;
        const d = tmp.set(s.pos[0], s.pos[1], s.pos[2]).distanceToSquared(focus); if (d < 30 * 30) cands.push({ d, s });
      }
      cands.sort((a, b) => a.d - b.d);
      lightPool.forEach((l, i) => { const c = cands[i]; if (!c) { l.visible = false; return; } l.visible = true; l.position.set(c.s.pos[0], c.s.pos[1], c.s.pos[2]); l.color.setHex(c.s.color); l.intensity = c.s.intensity * 6; l.distance = c.s.distance; });
    }
    if (crowd) crowd.update(dt, camera, focus, 0);
    if (frame % 6 === 0) cullDetail(built.detailMeshes, camera.position, Q.detail);
    renderer.render(scene, camera);
    fpsFrames++; if (now - fpsT >= 500) { hud.setFps(fpsFrames / ((now - fpsT) / 1000), `${renderer.info.render.calls} calls`); fpsFrames = 0; fpsT = now; }
  };
  requestAnimationFrame(tick);

  // crowd streams in once the title is up (outside the walls only — the compound has no sidewalks)
  if (crowd) crowd.load(centre).catch(e => console.warn('[crowd]', e));

  async function pause() {
    if (state !== 'game') return;
    state = 'paused'; input.enabled = false; input.clear();
    for (;;) {
      const s = save!;
      const info = `${s.appearance.name} · Day ${day}, ${clockLabel(gameMinutes)} · ${Math.round(s.played / 60)} min played · ${s.stats.doors} doors, ${s.stats.meals} meals, ${s.stats.sleeps} nights, ${s.stats.talks} chats · ${Q.label} graphics`;
      const choice = await screens.pause(info);
      if (choice === 'settings') { await openSettings(); continue; }
      if (choice === 'save') { persist(); flash('Game saved.'); continue; }
      if (choice === 'quit') { persist(); await fade(true, 500); hud.show(false); input.enabled = true; state = 'title'; await runTitle(); return; }
      break;
    }
    input.enabled = true; state = 'game';
  }
  addEventListener('visibilitychange', () => { if (document.hidden && state === 'game') { persist(); pause(); } });
  addEventListener('beforeunload', () => persist());

  (window as unknown as { vora: unknown }).vora = { scene, camera, renderer, player, chase, mansion, household, sky, setClock, collision, get save() { return save; }, get state() { return state; }, get frame() { return frame; } };
}

main().catch(err => { console.error(err); const el = document.getElementById('load-text'); if (el) { el.textContent = 'Failed to start: ' + (err?.message ?? err); } document.getElementById('screen-loading')?.classList.remove('hidden'); document.getElementById('screen-logo')?.classList.add('hidden'); });
