/** V-WORLD renderer entry point: loads data/city.json, builds the world meshes and runs the viewer. */
import * as THREE from 'three';
import cityUrl from '../../data/city.json?url';
import type { CityData, Landmark } from '../shared/types';
import { pointInPolygon } from '../shared/geom';
import { buildAtlas, buildDetailTexture } from './atlas';
import { GLOBAL, makeAtlasMaterial, makePropMaterial, makeFoliageMaterial, makeGlassMaterial, makeTerrainMaterial, makeWaterMaterial } from './materials';
import { AtlasBuilder, ColorBuilder } from './geom';
import { TextAtlas, TextBuilder, makeTextMaterial } from './signs';
import { ChunkSet } from './world/chunks';
import { makeWorldBase, buildTerrain, buildWater, buildSurfaces } from './world/terrain';
import { buildRoads } from './world/roads';
import { buildBuildings } from './world/buildings';
import { buildWalls } from './world/walls';
import { buildProps } from './world/props';
import { buildLampGlow } from './world/glow';
import { makeSky } from './sky';
import { CityControls } from './controls';
import { Hud } from './hud';
import { Minimap } from './minimap';
import { Crowd, CROWD_PRESETS } from './crowd';

type Quality = 'low' | 'medium' | 'high';
const isMobile = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 1000;
const params = new URLSearchParams(location.search);
let quality: Quality = (params.get('q') as Quality) || (isMobile ? 'low' : 'high');
const QUALITY = {
  low: { atlasPx: 128, shadow: 1024, detail: 320, pixelRatio: 1.25, far: 2600, aa: false, shadows: false },
  medium: { atlasPx: 192, shadow: 2048, detail: 520, pixelRatio: 1.5, far: 3200, aa: true, shadows: true },
  high: { atlasPx: 256, shadow: 2048, detail: 800, pixelRatio: 2, far: 3800, aa: true, shadows: true },
};

const loading = document.getElementById('loading')!;
const loadingText = document.getElementById('loading-text')!;
const loadingBar = document.getElementById('loading-bar')!;
const setProgress = async (t: string, f: number) => { loadingText.textContent = t; loadingBar.style.width = `${Math.round(f * 100)}%`; await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };

async function main() {
  await setProgress('Loading city data…', 0.02);
  const city: CityData = await (await fetch(cityUrl)).json();
  const Q = QUALITY[quality];

  // renderer
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.aa, powerPreference: 'high-performance', logarithmicDepthBuffer: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q.pixelRatio));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = Q.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.5, Q.far);

  // materials
  await setProgress('Painting material atlas…', 0.06);
  const atlas = buildAtlas(Q.atlasPx);
  const detailTex = buildDetailTexture(256);
  const atlasMat = makeAtlasMaterial(atlas, { detail: detailTex });
  const propMat = makePropMaterial(), foliageMat = makeFoliageMaterial(), glassMat = makeGlassMaterial();
  const terrainMat = makeTerrainMaterial(detailTex);
  const waterMat = makeWaterMaterial();
  const textAtlas = new TextAtlas(2048, 4096, isMobile ? 0.5 : 1);
  const textMat = makeTextMaterial(textAtlas);
  const markMat = makePropMaterial(); markMat.polygonOffset = true; markMat.polygonOffsetFactor = -1; markMat.polygonOffsetUnits = -1; markMat.customProgramCacheKey = () => 'vworld-prop';

  // world base
  await setProgress('Grading terrain…', 0.1);
  const base = makeWorldBase(city);
  const world = new THREE.Group(); world.name = 'world'; scene.add(world);
  const terrain = buildTerrain(city, base, terrainMat); world.add(terrain);
  world.add(buildWater(city, waterMat));

  const detailMeshes: { obj: THREE.Object3D; cx: number; cz: number; r: number }[] = [];
  const addChunks = <B extends { empty: boolean; build(): THREE.BufferGeometry }>(set: ChunkSet<B>, mat: THREE.Material, opts: { cast?: boolean; receive?: boolean; detail?: boolean; name: string; renderOrder?: number }) => {
    const meshes: THREE.Mesh[] = [];
    for (const c of set.entries()) {
      if (c.b.empty) continue;
      const mesh = new THREE.Mesh(c.b.build(), mat);
      mesh.castShadow = !!opts.cast; mesh.receiveShadow = opts.receive !== false; mesh.name = opts.name + ':' + c.key;
      if (opts.renderOrder !== undefined) mesh.renderOrder = opts.renderOrder;
      world.add(mesh); meshes.push(mesh);
      if (opts.detail) detailMeshes.push({ obj: mesh, cx: c.cx, cz: c.cz, r: set.cell * 0.75 });
    }
    return meshes;
  };

  // roads
  await setProgress('Laying roads…', 0.18);
  const roadAtlas = new ChunkSet(300, () => new AtlasBuilder(atlas)), roadMarks = new ChunkSet(300, () => new ColorBuilder());
  buildRoads(city, base, { atlas: roadAtlas, marks: roadMarks });
  const surfaceAtlas = new ChunkSet(300, () => new AtlasBuilder(atlas));
  buildSurfaces(city, base, atlas, surfaceAtlas.get(0, 0) as AtlasBuilder);
  await setProgress('Laying roads…', 0.3);
  const roadMeshes = addChunks(roadAtlas, atlasMat, { name: 'roads', receive: true });
  addChunks(roadMarks, markMat, { name: 'markings', receive: false, detail: true });
  addChunks(surfaceAtlas, atlasMat, { name: 'surfaces', receive: true });

  // buildings
  await setProgress('Raising buildings…', 0.36);
  const bAtlas = new ChunkSet(200, () => new AtlasBuilder(atlas)), bColor = new ChunkSet(200, () => new ColorBuilder()), bText = new ChunkSet(400, () => new TextBuilder());
  buildBuildings(city, base, { atlas: bAtlas, color: bColor, text: bText, textAtlas });
  await setProgress('Raising buildings…', 0.55);
  const buildingMeshes = addChunks(bAtlas, atlasMat, { name: 'buildings', cast: true, receive: true });
  addChunks(bColor, propMat, { name: 'features', cast: true, receive: true, detail: true });

  // walls & fences
  await setProgress('Building compound walls…', 0.6);
  const wAtlas = new ChunkSet(200, () => new AtlasBuilder(atlas)), wColor = new ChunkSet(200, () => new ColorBuilder()), wGlass = new ChunkSet(320, () => new ColorBuilder()), wFol = new ChunkSet(320, () => new ColorBuilder());
  buildWalls(city, base, { atlas: wAtlas, color: wColor, glass: wGlass, foliage: wFol });
  addChunks(wAtlas, atlasMat, { name: 'walls', cast: true, receive: true, detail: true });
  addChunks(wColor, propMat, { name: 'wall-details', cast: false, receive: true, detail: true });
  addChunks(wFol, foliageMat, { name: 'hedges', cast: false, receive: true, detail: true });

  // props
  await setProgress('Planting trees and street furniture…', 0.68);
  const pColor = new ChunkSet(320, () => new ColorBuilder()), pFol = new ChunkSet(320, () => new ColorBuilder()), pGlass = new ChunkSet(320, () => new ColorBuilder()), pText = new ChunkSet(400, () => new TextBuilder());
  const propRes = buildProps(city, { color: pColor, foliage: pFol, glass: pGlass, text: pText, textAtlas }, (x, z) => base.ground.height(x, z));
  await setProgress('Planting trees and street furniture…', 0.8);
  addChunks(pColor, propMat, { name: 'props-static', cast: true, receive: true, detail: true });
  addChunks(pFol, foliageMat, { name: 'props-foliage', cast: false, receive: false, detail: true });
  const matFor = (m: 'prop' | 'foliage' | 'glass') => m === 'prop' ? propMat : m === 'foliage' ? foliageMat : glassMat;
  let instanceCount = 0;
  for (const b of propRes.instanced) {
    const im = new THREE.InstancedMesh(b.geo, matFor(b.mat), b.matrices.length);
    for (let i = 0; i < b.matrices.length; i++) { im.setMatrixAt(i, b.matrices[i]); im.setColorAt(i, b.colors[i]); }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = b.shadow && b.mat !== 'glass'; im.receiveShadow = b.mat !== 'glass';
    im.computeBoundingSphere(); im.frustumCulled = true;
    if (b.mat === 'glass') im.renderOrder = 3;
    world.add(im);
    detailMeshes.push({ obj: im, cx: b.cx, cz: b.cz, r: 320 * 0.75 });
    instanceCount += b.matrices.length;
  }
  // glass chunks (shelters, fence mesh) last for blending
  addChunks(wGlass, glassMat, { name: 'wall-glass', cast: false, receive: false, detail: true, renderOrder: 3 });
  addChunks(pGlass, glassMat, { name: 'prop-glass', cast: false, receive: false, detail: true, renderOrder: 3 });
  const glow = buildLampGlow(city); if (glow) world.add(glow);
  // text
  textAtlas.commit();
  addChunks(bText, textMat, { name: 'signs', cast: false, receive: false, detail: true, renderOrder: 4 });
  addChunks(pText, textMat, { name: 'sign-text', cast: false, receive: false, detail: true, renderOrder: 4 });

  // sky & lights
  await setProgress('Lighting…', 0.9);
  const sky = makeSky(scene, Q.shadow);
  const startHour = parseFloat(params.get('h') ?? '10');
  sky.setHour(isNaN(startHour) ? 10 : startHour);

  // controls / UI
  const controls = new CityControls(camera, canvas, (x, z) => base.ground.height(x, z));
  const start = city.landmarks.find(l => l.role === 'city-square') ?? city.landmarks[0];
  if (start) controls.lookAt([start.view.pos[0] + 120, start.view.pos[1] + 120, start.view.pos[2] + 160], start.view.target);
  const hud = new Hud(city, {
    onHour: h => setHour(h),
    onMode: m => controls.setMode(m),
    onQuality: q => { const u = new URL(location.href); u.searchParams.set('q', q); u.searchParams.set('h', sky.hour.toFixed(1)); location.href = u.toString(); },
    onLandmark: (l: Landmark) => controls.lookAt(l.view.pos, l.view.target),
    onShadows: on => { renderer.shadowMap.enabled = on; sky.sun.castShadow = on; scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; }); },
  }, { hour: sky.hour, quality, shadows: Q.shadows, mobile: isMobile });
  controls.onChange = () => hud.setMode(controls.mode);
  const minimap = new Minimap(city, isMobile ? 150 : 230, (x, z) => controls.teleport(x, z));

  // picking
  const raycaster = new THREE.Raycaster(); raycaster.far = 2500;
  const pickables = [...buildingMeshes, ...roadMeshes];
  const edgeById = new Map(city.roads.edges.map(e => [e.id, e]));
  let downAt: [number, number] | null = null;
  canvas.addEventListener('pointerdown', e => { downAt = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', e => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6 || e.button !== 0) return;
    if (controls.mode === 'walk' && document.pointerLockElement) return;
    const ndc = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    if (!hit) { hud.inspect(null); return; }
    const mesh = hit.object as THREE.Mesh;
    const idAttr = mesh.geometry.getAttribute('aId') as THREE.BufferAttribute | undefined;
    const idx = mesh.geometry.index ? mesh.geometry.index.getX(hit.faceIndex! * 3) : hit.faceIndex! * 3;
    const id = idAttr ? idAttr.getX(idx) : -1;
    if (id > 0 && city.buildings[id - 1]) {
      const b = city.buildings[id - 1];
      const d = city.districts.find(x => x.code === b.districtId);
      const lm = city.landmarks.find(l => l.buildingIds.includes(b.id));
      hud.inspect(`<div class="name">${b.name}</div><div class="sub">${b.use} · ${b.archetype}${lm ? ' · <b>landmark</b>' : ''}</div><div class="row"><span class="k">Address</span><span class="v">${b.address}</span></div><div class="row"><span class="k">District</span><span class="v">${d?.name ?? b.districtId}</span></div><div class="row"><span class="k">Floors</span><span class="v">${b.floors} (${b.height.toFixed(0)} m)</span></div><div class="row"><span class="k">Masses</span><span class="v">${b.masses.length}</span></div><div class="row"><span class="k">ID</span><span class="v">${b.id} · parcel ${b.parcelId}</span></div>${lm ? `<div class="desc">${lm.description}</div>` : ''}`);
    } else {
      // nearest road
      const p = hit.point; let best: { e: typeof city.roads.edges[0]; d: number } | null = null;
      for (const e of city.roads.edges) { for (let i = 1; i < e.points.length; i++) { const a = e.points[i - 1], b = e.points[i]; const dx = b[0] - a[0], dz = b[1] - a[1]; const l2 = dx * dx + dz * dz || 1; const t = Math.max(0, Math.min(1, ((p.x - a[0]) * dx + (p.z - a[1]) * dz) / l2)); const d = Math.hypot(a[0] + dx * t - p.x, a[1] + dz * t - p.z); if (!best || d < best.d) best = { e, d }; } }
      if (best && best.d < 25) { const e = best.e; const st = city.streets.find(s => s.id === e.streetId); hud.inspect(`<div class="name">${e.name}</div><div class="sub">${e.cls} road${e.bridge ? ' · bridge (' + e.bridge.kind + ')' : ''}${e.oneWay ? ' · one-way' : ''}</div><div class="row"><span class="k">Segment</span><span class="v">${e.id} · ${e.length.toFixed(0)} m</span></div><div class="row"><span class="k">Street</span><span class="v">${st ? st.edgeIds.length + ' segments' : '—'}</span></div><div class="row"><span class="k">Profile</span><span class="v">${city.roads.profiles[e.cls].carriageway} m carriageway, ${city.roads.profiles[e.cls].sidewalk} m sidewalks${e.drain ? ', open drains' : ''}</span></div>`); }
      else hud.inspect(null);
    }
    void edgeById;
  });

  // resize
  const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize);

  loading.classList.add('hidden');
  await setProgress('Ready', 1);

  // ambient crowd (streams in after the city is interactive; ?crowd=0 disables, ?crowd=high forces a preset)
  const crowdParam = params.get('crowd');
  const crowd = crowdParam === '0' ? null : new Crowd(city, (x, z) => base.ground.height(x, z), CROWD_PRESETS[(crowdParam as Quality) in CROWD_PRESETS ? (crowdParam as Quality) : quality]);
  if (crowd) { scene.add(crowd.group); crowd.load(controls.focus()).catch(err => console.warn('[crowd]', err)); }

  // main loop
  const districtAt = (x: number, z: number) => city.districts.find(d => pointInPolygon([x, z], d.polygon));
  let last = performance.now(), frames = 0, fpsT = performance.now(), fps = 0, frame = 0;
  const focus = new THREE.Vector3();
  const tick = () => {
    const now = performance.now(); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    controls.update(dt);
    GLOBAL.uTime.value = now / 1000;
    focus.copy(controls.focus());
    sky.follow(focus, controls.mode === 'walk' ? 160 : Math.min(420, 120 + controls.distance * 0.6));
    if (crowd) crowd.update(dt, camera, focus, controls.mode === 'orbit' ? controls.distance : 0);
    if (frame % 6 === 0) {
      const cam = camera.position; const detailR = Q.detail + (controls.mode === 'orbit' ? controls.distance * 0.25 : 0);
      for (const d of detailMeshes) { const dist = Math.hypot(d.cx - cam.x, d.cz - cam.z) - d.r; d.obj.visible = dist < detailR; }
    }
    renderer.render(scene, camera);
    frames++; if (now - fpsT >= 500) { fps = frames / ((now - fpsT) / 1000); frames = 0; fpsT = now; const d = districtAt(focus.x, focus.z); hud.update(d?.name ?? 'Outskirts', focus.x, focus.z, fps, `${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1e6).toFixed(2)} M tris${crowd && crowd.enabled ? ` · ${crowd.stats.visible} people${crowd.progress < 1 ? ` (loading ${Math.round(crowd.progress * 100)}%)` : ''}` : ''}`); }
    if (frame % 3 === 0) minimap.update(focus.x, focus.z, controls.yaw);
    frame++;
    requestAnimationFrame(tick);
  };
  console.info(`[v-world] ${city.meta.name} v${city.meta.version}: ${city.stats.buildings} buildings, ${city.stats.edges} road edges, ${instanceCount} instanced props`);
  const setHour = (h: number) => { sky.setHour(h); hud.setHourLabel(h); };
  (window as unknown as { vworld: unknown }).vworld = { city, scene, camera, controls, renderer, sky, setHour, crowd, get frame() { return frame; } };
  requestAnimationFrame(tick);
}

main().catch(err => { console.error(err); loadingText.textContent = 'Failed to start: ' + (err?.message ?? err); loadingText.classList.add('error'); });
