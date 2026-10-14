/**
 * Character viewer: turntable inspection of generated characters (glTF), clips, LODs, line-ups.
 * Query: ?id=<character>  ?clip=<name>  ?view=full|face|hands|back  ?lineup=all|id1,id2  ?cols=8  ?lod=0|1|2  ?q=low
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ManifestEntry { id: string; name?: string; role?: string; file: string; height: number; tris: number; district?: string; sex?: string; age?: number; tags?: string[] }
interface Manifest { characters: ManifestEntry[]; clips?: string[]; animations?: string }

const q = new URLSearchParams(location.search);
const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
THREE.Cache.enabled = true;

const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb3c8);
scene.fog = new THREE.Fog(0x9fb3c8, 30, 80);
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, canvas); controls.enableDamping = true; controls.dampingFactor = 0.08;

// lighting: warm key with shadows, cool sky fill, soft rim
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b5a46, 0.9); scene.add(hemi);
const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01;
const sc = key.shadow.camera; sc.near = 0.5; sc.far = 30; sc.left = sc.bottom = -4; sc.right = sc.top = 4; scene.add(key); scene.add(key.target);
const rim = new THREE.DirectionalLight(0xbcd3ff, 0.8); rim.position.set(-3, 4, -5); scene.add(rim);
const amb = new THREE.AmbientLight(0xffffff, 0.15); scene.add(amb);
function setLight(deg: number) { const a = (deg * Math.PI) / 180; key.position.set(Math.sin(a) * 6, 6, Math.cos(a) * 6); }
setLight(+(q.get('light') ?? 35));

// ground: soft disc + grid
const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x8d8f8a, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x6f746f, 0x7e837d); (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = 0.35; grid.position.y = 0.002; scene.add(grid);

const loader = new GLTFLoader();
const base = './assets/characters/';
const manifest: Manifest = await (await fetch(base + 'manifest.json')).json();
let animLib: THREE.AnimationClip[] = [];
if (manifest.animations) { try { const g = await loader.loadAsync(base + manifest.animations); animLib = g.animations; } catch (e) { console.warn('no animation library', e); } }

interface Loaded { entry: ManifestEntry; root: THREE.Group; mixer: THREE.AnimationMixer; lods: THREE.Object3D[]; clips: THREE.AnimationClip[]; action?: THREE.AnimationAction; skel?: THREE.SkeletonHelper }
const loaded: Loaded[] = [];
const clock = new THREE.Clock();
const ui = {
  clip: document.getElementById('cv-clip') as HTMLSelectElement, lod: document.getElementById('cv-lod') as HTMLSelectElement, view: document.getElementById('cv-view') as HTMLSelectElement,
  rot: document.getElementById('cv-rot') as HTMLInputElement, wire: document.getElementById('cv-wire') as HTMLInputElement, skel: document.getElementById('cv-skel') as HTMLInputElement,
  light: document.getElementById('cv-light') as HTMLInputElement, info: document.getElementById('cv-info')!, list: document.getElementById('cv-list')!, fps: document.getElementById('hud-fps')!,
};

function prepare(g: GLTF, entry: ManifestEntry): Loaded {
  const root = g.scene; const lods: THREE.Object3D[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; const mat = m.material as THREE.MeshStandardMaterial; if (mat.map) mat.map.anisotropy = 8; }
    if (/^LOD\d$/.test(o.name)) lods.push(o);
  });
  lods.sort((a, b) => a.name.localeCompare(b.name));
  const mixer = new THREE.AnimationMixer(root);
  const clips = [...g.animations, ...animLib.filter(c => !g.animations.some(x => x.name === c.name))];
  return { entry, root, mixer, lods, clips };
}

function setLod(l: Loaded, which: string) {
  if (!l.lods.length) return;
  if (which === 'auto') { l.lods.forEach((o, i) => (o.visible = i === 0)); return; }
  const n = Math.min(+which, l.lods.length - 1); l.lods.forEach((o, i) => (o.visible = i === n));
}
function play(l: Loaded, name: string) {
  const clip = l.clips.find(c => c.name === name) ?? l.clips[0];
  l.action?.fadeOut(0.2);
  if (!clip) { l.action = undefined; return; }
  const a = l.mixer.clipAction(clip); a.reset().setEffectiveWeight(1).fadeIn(0.2).play(); l.action = a;
  // scale hip translation for characters of different height (clips are authored for 1.75 m)
  (a as any).__scale = l.entry.height / 1.75;
}
function wire(on: boolean) { for (const l of loaded) l.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) ((m.material as THREE.MeshStandardMaterial).wireframe = on); }); }
function skel(on: boolean) { for (const l of loaded) { if (on && !l.skel) { l.skel = new THREE.SkeletonHelper(l.root); scene.add(l.skel); } if (l.skel) l.skel.visible = on; } }

async function load(entry: ManifestEntry): Promise<Loaded> {
  const g = await loader.loadAsync(base + entry.file);
  const l = prepare(g, entry); loaded.push(l); scene.add(l.root); return l;
}
function clear() { for (const l of loaded) { scene.remove(l.root); if (l.skel) scene.remove(l.skel); l.mixer.stopAllAction(); } loaded.length = 0; }

const turntable = new THREE.Group(); scene.add(turntable);
let lineup = false;
function frame(view: string) {
  const h = loaded.length ? Math.max(...loaded.map(l => l.entry.height)) : 1.75;
  const spread = lineup ? (loaded.length - 1) * 0.9 : 0;
  const cx = lineup ? spread / 2 : 0;
  let target = new THREE.Vector3(cx, h * 0.52, 0), dist = h * 1.9 + spread * 0.75, up = 0;
  if (view === 'face') { target.set(0, h * 0.92, 0.05); dist = 0.55; }
  if (view === 'hands') { target.set(0, h * 0.78, 0.1); dist = 1.1; }
  if (view === 'back') { up = Math.PI; }
  camera.position.set(target.x + Math.sin(0.35 + up) * dist, target.y + dist * 0.22, target.z + Math.cos(0.35 + up) * dist);
  controls.target.copy(target); controls.update();
  key.target.position.copy(target);
}

function info(l?: Loaded) {
  if (!l) { ui.info.textContent = `${manifest.characters.length} characters`; return; }
  const e = l.entry; const parts: string[] = [];
  l.root.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && m.parent?.visible) parts.push(`${m.parent?.name}/${(m.geometry.getAttribute('position') as THREE.BufferAttribute).count}`); });
  ui.info.textContent = `${e.name ?? e.id}${e.role ? ' · ' + e.role : ''}\nheight ${e.height.toFixed(2)} m · ${e.tris.toLocaleString()} tris (LOD0)${e.district ? '\n' + e.district : ''}${e.tags ? '\n' + e.tags.join(', ') : ''}`;
}

async function select(id: string) {
  clear(); lineup = false;
  const e = manifest.characters.find(c => c.id === id) ?? manifest.characters[0]; if (!e) return;
  const l = await load(e); l.root.position.set(0, 0, 0);
  fillClips(l); play(l, ui.clip.value || q.get('clip') || 'idle'); setLod(l, ui.lod.value); info(l);
  for (const d of ui.list.children) d.classList.toggle('sel', (d as HTMLElement).dataset.id === e.id);
  history.replaceState(null, '', `?id=${e.id}${q.get('view') ? '&view=' + q.get('view') : ''}`);
  frame(ui.view.value);
}
function fillClips(l: Loaded) {
  const cur = ui.clip.value; ui.clip.innerHTML = '';
  for (const c of l.clips) { const o = document.createElement('option'); o.value = c.name; o.textContent = c.name; ui.clip.appendChild(o); }
  if (!l.clips.length) { const o = document.createElement('option'); o.value = ''; o.textContent = '(bind pose)'; ui.clip.appendChild(o); }
  const want = q.get('clip') ?? cur; if (want && l.clips.some(c => c.name === want)) ui.clip.value = want;
}
async function showLineup(ids: string[]) {
  clear(); lineup = true;
  const entries = ids[0] === 'all' ? manifest.characters : ids.map(i => manifest.characters.find(c => c.id === i)!).filter(Boolean);
  const cols = +(q.get('cols') ?? Math.min(entries.length, 10));
  const rows = Math.ceil(entries.length / cols);
  const ls = await Promise.all(entries.map(e => load(e)));
  ls.forEach((l, i) => { const r = Math.floor(i / cols), c = i % cols; l.root.position.set(c * 0.9, 0, -r * 1.4); setLod(l, ui.lod.value); });
  if (ls[0]) fillClips(ls[0]);
  const clip = q.get('clip') ?? 'idle';
  ls.forEach((l, i) => { play(l, clip); if (l.action) l.action.time = (i * 0.37) % (l.action.getClip().duration || 1); });
  info(); ui.info.textContent = `${entries.length} characters`;
  const h = 1.8, w = (Math.min(cols, entries.length) - 1) * 0.9, d = (rows - 1) * 1.4;
  const target = new THREE.Vector3(w / 2, h * 0.5, -d / 2); const dist = Math.max(h * 2.2, w * 0.95 + 2.5, d * 1.3 + 2.5);
  camera.position.set(target.x, target.y + dist * 0.28, target.z + dist); controls.target.copy(target); controls.update();
  key.target.position.copy(target);
  sc.left = sc.bottom = -Math.max(4, w); sc.right = sc.top = Math.max(4, w); key.shadow.camera.updateProjectionMatrix();
}

// list
for (const e of manifest.characters) { const d = document.createElement('div'); d.dataset.id = e.id; d.textContent = `${e.name ?? e.id}${e.role ? ' · ' + e.role : ''}`; d.addEventListener('click', () => select(e.id)); ui.list.appendChild(d); }
ui.clip.addEventListener('change', () => loaded.forEach(l => play(l, ui.clip.value)));
ui.lod.addEventListener('change', () => loaded.forEach(l => setLod(l, ui.lod.value)));
ui.view.addEventListener('change', () => frame(ui.view.value));
ui.wire.addEventListener('change', () => wire(ui.wire.checked));
ui.skel.addEventListener('change', () => skel(ui.skel.checked));
ui.light.addEventListener('input', () => setLight(+ui.light.value));
if (q.get('view')) ui.view.value = q.get('view')!;
if (q.get('lod')) ui.lod.value = q.get('lod')!;
if (q.get('rot') === '0') ui.rot.checked = false;

if (q.get('lineup')) await showLineup(q.get('lineup')!.split(',')); else await select(q.get('id') ?? manifest.characters[0]?.id);

let frames = 0, fpsT = performance.now();
renderer.setAnimationLoop(() => {
  const dt = Math.min(0.05, clock.getDelta());
  for (const l of loaded) { l.mixer.update(dt); }
  if (ui.rot.checked && !lineup) for (const l of loaded) l.root.rotation.y += dt * 0.35;
  controls.update(); renderer.render(scene, camera);
  frames++; const now = performance.now(); if (now - fpsT > 500) { ui.fps.textContent = `${Math.round(frames * 1000 / (now - fpsT))} fps · ${renderer.info.render.calls} draw calls · ${(renderer.info.render.triangles / 1e3).toFixed(0)} k tris`; frames = 0; fpsT = now; }
});
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
(window as any).vwchars = { scene, camera, controls, renderer, loaded, select, showLineup, frame, play: (n: string) => loaded.forEach(l => play(l, n)), setLight, ready: true };
