/** Street furniture, vegetation, vehicles and site props: template geometry + instancing, plus parametric one-offs. */
import * as THREE from 'three';
import type { CityData, Prop } from '../../shared/types';
import { ColorBuilder, type V3 } from '../geom';
import { TextBuilder, type TextAtlas } from '../signs';
import type { ChunkSet } from './chunks';
import { RNG } from '../../shared/rng';

const C = (h: string) => new THREE.Color(h);
const STEEL = C('#8e959b'), DARKSTEEL = C('#4c5156'), WOOD = C('#8a6a4a'), TRUNK = C('#6b5238'), PALMTRUNK = C('#8c7a5c'), CONC = C('#b5afa4'), WHITE = C('#f2f2f0'), BLACK = C('#1a1a1a'), WARM = C('#ffd9a0'), RED = C('#c62828'), YELLOW = C('#f2c230'), GREEN = C('#2e7d32'), SAND = C('#d2bc8a'), WATER = C('#6fb3d8'), RUST = C('#8f5a3a');
const CAR_COLORS = ['#d9d9d9', '#1f1f1f', '#8d8d8d', '#b3261e', '#1d5c8a', '#e6e6e6', '#2f4a3a', '#c9a227', '#6b6b6b', '#f0f0f0', '#4a3a6a', '#a8b0b8'];
const LEAF = ['#3f7a2f', '#4d8a35', '#5a9440', '#3a6f2a', '#6a9a3c', '#46803a'];
const FABRIC = ['#b3261e', '#d98a1f', '#1f7a4d', '#1d5c8a', '#e0b323', '#7a3b8a'];

export type MatKind = 'prop' | 'foliage' | 'glass';
export interface TemplatePart { mat: MatKind; geo: THREE.BufferGeometry; shadow: boolean; }
export interface Template { parts: TemplatePart[]; tintDefault?: (v: number, r: RNG) => THREE.Color; }

interface Batch { template: Template; matrices: THREE.Matrix4[]; colors: THREE.Color[]; }

export interface PropBuild { color: ChunkSet<ColorBuilder>; foliage: ChunkSet<ColorBuilder>; glass: ChunkSet<ColorBuilder>; text: ChunkSet<TextBuilder>; textAtlas: TextAtlas; }

export interface PropResult { instanced: { mat: MatKind; geo: THREE.BufferGeometry; matrices: THREE.Matrix4[]; colors: THREE.Color[]; shadow: boolean; cx: number; cz: number }[] }

const INSTANCE_CELL = 320;

/** build all props: returns instanced batches (per template part per cell); static one-offs are written into `out` builders */
export function buildProps(city: CityData, out: PropBuild, heightAt: (x: number, z: number) => number): PropResult {
  const rng = new RNG('props-render');
  const templates = new Map<string, Template>();
  const batches = new Map<string, Batch>(); // key: templateKey|cell
  const res: PropResult = { instanced: [] };
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3(), AXIS = new THREE.Vector3(0, 1, 0);

  const getTemplate = (key: string, make: () => Template): Template => { let t = templates.get(key); if (!t) { t = make(); templates.set(key, t); } return t; };
  const place = (key: string, make: () => Template, p: Prop, r: RNG, scaleOverride?: [number, number, number]) => {
    const t = getTemplate(key, make);
    const s = scaleOverride ?? (typeof p.s === 'number' ? [p.s, p.s, p.s] : p.s ?? [1, 1, 1]);
    tmpQ.setFromAxisAngle(AXIS, p.r); tmpS.set(Math.max(0.01, s[0]), Math.max(0.01, s[1]), Math.max(0.01, s[2])); tmpP.set(p.x, p.y, p.z);
    tmpM.compose(tmpP, tmpQ, tmpS);
    const cell = Math.floor(p.x / INSTANCE_CELL) + ',' + Math.floor(p.z / INSTANCE_CELL);
    const bk = key + '|' + cell;
    let b = batches.get(bk); if (!b) { b = { template: t, matrices: [], colors: [] }; batches.set(bk, b); }
    b.matrices.push(tmpM.clone());
    b.colors.push(p.c ? C(p.c) : t.tintDefault ? t.tintDefault(p.v ?? 0, r) : WHITE);
  };

  for (const p of city.props) {
    const r = rng.fork(p.t + p.x.toFixed(1) + p.z.toFixed(1));
    const v = p.v ?? 0;
    switch (p.t) {
      case 'lamp': place('lamp' + (v % 3), () => lampTemplate(v % 3), p, r); break;
      case 'lamp-double': place('lampd', lampDoubleTemplate, p, r); break;
      case 'lamp-tall': place('lampt', lampTallTemplate, p, r); break;
      case 'tree-palm': place('palm' + (v % 2), () => palmTemplate(v % 2), p, r); break;
      case 'tree-broad': place('broad' + (v % 2), () => broadTemplate(v % 2), p, r); break;
      case 'tree-neem': place('neem', neemTemplate, p, r); break;
      case 'tree-small': place('small', smallTreeTemplate, p, r); break;
      case 'shrub': case 'bush': place('bush', bushTemplate, p, r); break;
      case 'bench': place('bench', benchTemplate, p, r); break;
      case 'bin': place('bin', binTemplate, p, r); break;
      case 'bollard': place('bollard', bollardTemplate, p, r); break;
      case 'signal': place('signal' + (v ? 1 : 0), () => signalTemplate(!!v), p, r); break;
      case 'stopsign': place('stop', stopTemplate, p, r); break;
      case 'busstop': place('busstop', busStopTemplate, p, r); break;
      case 'busshelter': place('shelter', shelterTemplate, p, r); break;
      case 'pole': place('pole', poleTemplate, p, r); break;
      case 'kiosk': place('kiosk', kioskTemplate, p, r); break;
      case 'stall': place('stall', stallTemplate, p, r); break;
      case 'umbrella': place('umbrella', umbrellaTemplate, p, r); break;
      case 'car': place('car' + (v % 3), () => carTemplate(v % 3), p, r); break;
      case 'minibus': place('minibus', minibusTemplate, p, r); break;
      case 'pickup': place('pickup', pickupTemplate, p, r); break;
      case 'truck': place('truck' + (v % 2), () => truckTemplate(v % 2), p, r); break;
      case 'manhole': place('manhole', manholeTemplate, p, r); break;
      case 'planter': place('planter', planterTemplate, p, r); break;
      case 'fountain': place('fountain' + (v % 2), () => fountainTemplate(v % 2), p, r); break;
      case 'sculpture': place('sculpt' + (v % 3), () => sculptureTemplate(v % 3), p, r); break;
      case 'playground': place('playground', playgroundTemplate, p, r); break;
      case 'cone': place('cone', coneTemplate, p, r); break;
      case 'barrier': place('barrier', barrierTemplate, p, r); break;
      case 'flag': place('flag', flagTemplate, p, r); break;
      case 'tank': place('tank' + (v % 4), () => tankTemplate(v % 4), p, r); break;
      case 'pylon': place('pylon', pylonTemplate, p, r); break;
      case 'boat': place('boat' + (v % 3), () => boatTemplate(v % 3), p, r); break;
      case 'pump': place('pump', pumpTemplate, p, r); break;
      case 'hydrant': place('hydrant', hydrantTemplate, p, r); break;
      case 'cabinet': place('cabinet', cabinetTemplate, p, r); break;
      case 'washline': place('washline', washlineTemplate, p, r); break;
      case 'pallets': place('pallets', palletsTemplate, p, r); break;
      case 'sandheap': place('sandheap', sandheapTemplate, p, r); break;
      case 'parkingline': place('parkingline', parkingLineTemplate, p, r, [typeof p.s === 'object' ? p.s[0] : 2.6, 1, typeof p.s === 'object' ? p.s[2] : 5]); break;
      case 'path': place('path', pathTemplate, p, r, [typeof p.s === 'object' ? p.s[0] : 10, 1, typeof p.s === 'object' ? p.s[2] : 3]); break;
      case 'container': { const n = Math.max(1, Math.round(p.p?.[0] ?? 1)); for (let i = 0; i < n; i++) place('container', containerTemplate, { ...p, y: p.y + i * 2.6, v: (v + i * 3) % 6 }, r.fork('c' + i)); break; }
      // ── parametric one-offs ──
      case 'wire': wire(out, p); break;
      case 'streetsign': streetSign(out, p); break;
      case 'directional': directionalSign(out, p); break;
      case 'billboard': billboard(out, p); break;
      case 'monument': monument(out, p); break;
      case 'goalpost': goalposts(out, p); break;
      case 'crane': towerCrane(out, p); break;
      case 'quaycrane': quayCrane(out, p); break;
      case 'floodlight': floodlight(out, p); break;
      case 'pier': pier(out, p, heightAt); break;
      case 'arch': gateway(out, p); break;
      case 'stairs': amphitheatre(out, p); break;
      case 'speedbump': speedbump(out, p); break;
      case 'scaffold': scaffold(out, p); break;
      case 'roadworks': roadworks(out, p, r); break;
      case 'field': cropField(out, p, r, heightAt); break;
      case 'hoarding': hoarding(out, p); break;
      default: break;
    }
  }
  for (const [bk, b] of batches) {
    const [, cell] = bk.split('|'); const [cx, cz] = cell.split(',').map(Number);
    for (const part of b.template.parts) res.instanced.push({ mat: part.mat, geo: part.geo, matrices: b.matrices, colors: b.colors, shadow: part.shadow, cx: (cx + 0.5) * INSTANCE_CELL, cz: (cz + 0.5) * INSTANCE_CELL });
  }
  return res;
}

// ─────────────────────────── templates ───────────────────────────

function T(parts: { mat: MatKind; b: ColorBuilder; shadow?: boolean }[], tintDefault?: Template['tintDefault']): Template {
  return { parts: parts.filter(p => !p.b.empty).map(p => ({ mat: p.mat, geo: p.b.build(), shadow: p.shadow ?? true })), tintDefault };
}

function lampTemplate(v: number): Template {
  const b = new ColorBuilder();
  const h = v === 1 ? 4.2 : v === 2 ? 8 : 9;
  const col = v === 2 ? C('#6f7378') : C('#3b3f44');
  b.cylinder(0, 0, 0, 0.16, 0.1, h, 8, col);
  b.cylinder(0, 0, 0, 0.26, 0.26, 0.5, 8, col);
  if (v === 1) { b.sphere(0, h + 0.3, 0, 0.32, 1, 10, 6, WARM, 0, 1); }
  else {
    const arm = v === 2 ? 1.4 : 2.0;
    b.box(-arm / 2, h - 0.1, 0, arm, 0.1, 0.1, col);
    b.box(-arm, h - 0.15, 0, 0.9, 0.16, 0.3, col);
    b.box(-arm, h - 0.26, 0, 0.8, 0.06, 0.24, WARM, 0, 1);
  }
  return T([{ mat: 'prop', b }]);
}
function lampDoubleTemplate(): Template {
  const b = new ColorBuilder(); const col = C('#3b3f44'); const h = 11;
  b.cylinder(0, 0, 0, 0.18, 0.12, h, 8, col); b.cylinder(0, 0, 0, 0.3, 0.3, 0.6, 8, col);
  for (const s of [-1, 1]) { b.box(s * 1.2, h - 0.1, 0, 2.4, 0.1, 0.1, col); b.box(s * 2.3, h - 0.15, 0, 0.9, 0.16, 0.3, col); b.box(s * 2.3, h - 0.26, 0, 0.8, 0.06, 0.24, WARM, 0, 1); }
  return T([{ mat: 'prop', b }]);
}
function lampTallTemplate(): Template {
  const b = new ColorBuilder(); const col = C('#4b4f54'); const h = 12;
  b.cylinder(0, 0, 0, 0.2, 0.12, h, 8, col); b.cylinder(0, 0, 0, 0.32, 0.32, 0.6, 8, col);
  b.box(-1.4, h - 0.1, 0, 2.8, 0.12, 0.12, col); b.box(-2.7, h - 0.15, 0, 1.1, 0.18, 0.34, col); b.box(-2.7, h - 0.28, 0, 1.0, 0.06, 0.28, WARM, 0, 1);
  return T([{ mat: 'prop', b }]);
}
function palmTemplate(v: number): Template {
  const t = new ColorBuilder(), f = new ColorBuilder(); const r = new RNG('palm' + v);
  const h = v === 0 ? 7.5 : 5.5; const lean = v === 0 ? 0.35 : 0.2;
  const seg = 6; let px = 0, pz = 0;
  for (let i = 0; i < seg; i++) { const y0 = (h * i) / seg; const nx = lean * ((i + 1) / seg) ** 2; t.cylinder(px + (nx - px) / 2, y0, pz, 0.22 - i * 0.012, 0.2 - i * 0.012, h / seg + 0.05, 7, PALMTRUNK.clone().lerp(TRUNK, (i % 2) * 0.15)); px = nx; }
  const top: V3 = [px, h, pz];
  f.sphere(top[0], top[1] + 0.1, top[2], 0.35, 0.8, 7, 4, C('#6b4f2a'));
  const fronds = 9;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + r.range(-0.2, 0.2); const len = r.range(2.6, 3.4); const droop = r.range(0.9, 1.5);
    const dx = Math.cos(a), dz = Math.sin(a);
    const segs = 4; let prev: [V3, V3] | null = null;
    for (let k = 1; k <= segs; k++) {
      const tt = k / segs; const y = top[1] + 0.6 + 0.9 * tt - droop * tt * tt; const l = len * tt; const w = 0.36 * (1 - tt * 0.7) + 0.15;
      const cx = top[0] + dx * l, cz = top[2] + dz * l; const sx = -dz * w, sz = dx * w;
      const L: V3 = [cx + sx, y, cz + sz], R: V3 = [cx - sx, y, cz - sz];
      if (prev) { f.quad(prev[0], prev[1], R, L, LEAF_FRONDS, 1, 0); }
      else { const base: V3 = [top[0] + dx * 0.2, top[1] + 0.6, top[2] + dz * 0.2]; f.tri(base, R, L, LEAF_FRONDS, 1, 0); }
      prev = [L, R];
    }
  }
  return T([{ mat: 'prop', b: t }, { mat: 'foliage', b: f, shadow: true }], (vv, rr) => C(LEAF[(vv + rr.int(0, 2)) % LEAF.length]).lerp(C('#5f8f3a'), 0.3));
}
const LEAF_FRONDS = C('#ffffff');
function broadTemplate(v: number): Template {
  const t = new ColorBuilder(), f = new ColorBuilder(); const r = new RNG('broad' + v);
  const h = v === 0 ? 4.2 : 3.4;
  t.cylinder(0, 0, 0, 0.32, 0.22, h, 7, TRUNK);
  for (const [bx, bz, by, br] of [[0, 0, h + 1.9, 3.1], [1.6, 0.4, h + 1.2, 2.2], [-1.4, -0.9, h + 1.4, 2.0], [0.3, -1.7, h + 1.0, 1.9], [-0.6, 1.5, h + 1.1, 1.8]]) f.sphere(bx, by, bz, br, 0.72, 9, 5, WHITE, 1, 0, 0.18, () => r.next());
  for (const [bx, bz] of [[1.2, 0.3], [-1.0, -0.7], [0.2, -1.3]]) t.cylinder(bx * 0.3, h - 0.6, bz * 0.3, 0.12, 0.06, 1.8, 5, TRUNK);
  return T([{ mat: 'prop', b: t }, { mat: 'foliage', b: f }], (vv, rr) => C(LEAF[(vv + rr.int(0, 5)) % LEAF.length]));
}
function neemTemplate(): Template {
  const t = new ColorBuilder(), f = new ColorBuilder(); const r = new RNG('neem');
  t.cylinder(0, 0, 0, 0.26, 0.18, 4.6, 7, TRUNK);
  f.sphere(0, 7.2, 0, 2.5, 1.25, 9, 6, WHITE, 1, 0, 0.16, () => r.next());
  f.sphere(1.2, 5.8, 0.6, 1.5, 0.9, 8, 5, WHITE, 1, 0, 0.16, () => r.next());
  f.sphere(-1.1, 6.1, -0.7, 1.4, 0.9, 8, 5, WHITE, 1, 0, 0.16, () => r.next());
  return T([{ mat: 'prop', b: t }, { mat: 'foliage', b: f }], (vv, rr) => C(LEAF[(vv + rr.int(0, 5)) % LEAF.length]).lerp(C('#2f5f26'), 0.3));
}
function smallTreeTemplate(): Template {
  const t = new ColorBuilder(), f = new ColorBuilder(); const r = new RNG('small');
  t.cylinder(0, 0, 0, 0.14, 0.1, 2.2, 6, TRUNK);
  f.sphere(0, 3.3, 0, 1.5, 1.0, 8, 5, WHITE, 1, 0, 0.2, () => r.next());
  return T([{ mat: 'prop', b: t }, { mat: 'foliage', b: f }], (vv, rr) => C(LEAF[(vv + rr.int(0, 5)) % LEAF.length]).lerp(C('#7aa040'), 0.3));
}
function bushTemplate(): Template {
  const f = new ColorBuilder(); const r = new RNG('bush');
  f.sphere(0, 0.5, 0, 0.8, 0.7, 7, 4, WHITE, 1, 0, 0.25, () => r.next());
  f.sphere(0.5, 0.4, 0.3, 0.55, 0.7, 6, 4, WHITE, 1, 0, 0.25, () => r.next());
  return T([{ mat: 'foliage', b: f, shadow: false }], (vv, rr) => C(LEAF[(vv + rr.int(0, 5)) % LEAF.length]));
}
function benchTemplate(): Template {
  const b = new ColorBuilder();
  for (const s of [-0.7, 0.7]) { b.box(0, 0.22, s, 0.5, 0.44, 0.08, DARKSTEEL); b.box(-0.25, 0.65, s, 0.06, 0.45, 0.08, DARKSTEEL); }
  for (let i = 0; i < 3; i++) b.box(-0.2 + i * 0.16, 0.46, 0, 0.13, 0.05, 1.6, WOOD);
  for (let i = 0; i < 2; i++) b.box(-0.27, 0.62 + i * 0.18, 0, 0.05, 0.12, 1.6, WOOD);
  return T([{ mat: 'prop', b, shadow: false }]);
}
function binTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.3, 0.32, 0.95, 8, C('#2f5d3a')); b.cylinder(0, 0.95, 0, 0.34, 0.3, 0.1, 8, C('#1f3f28')); return T([{ mat: 'prop', b, shadow: false }]); }
function bollardTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.14, 0.12, 0.9, 8, C('#5a5e63')); b.cylinder(0, 0.65, 0, 0.13, 0.13, 0.08, 8, WHITE, 0, 0.3); return T([{ mat: 'prop', b, shadow: false }]); }
function signalTemplate(withArm: boolean): Template {
  const b = new ColorBuilder(); const col = C('#3a3d40');
  b.cylinder(0, 0, 0, 0.12, 0.1, withArm ? 6 : 4.2, 8, col);
  const head = (x: number, y: number, z: number) => { b.box(x, y, z, 0.36, 1.05, 0.3, C('#222')); b.sphere(x, y + 0.33, z - 0.16, 0.1, 1, 6, 4, RED, 0, 1); b.sphere(x, y, z - 0.16, 0.1, 1, 6, 4, C('#5a4a10')); b.sphere(x, y - 0.33, z - 0.16, 0.1, 1, 6, 4, C('#1b4d1b')); };
  head(0, withArm ? 3.4 : 3.6, 0);
  if (withArm) { b.box(2.2, 5.85, 0, 4.4, 0.12, 0.12, col); head(4.0, 5.2, 0); }
  return T([{ mat: 'prop', b, shadow: false }]);
}
function stopTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.05, 0.05, 2.6, 6, STEEL); b.cylinder(0, 2.2, 0, 0.38, 0.38, 0.05, 8, RED); b.box(0, 2.2, -0.04, 0.5, 0.1, 0.02, WHITE); return T([{ mat: 'prop', b, shadow: false }]); }
function busStopTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.05, 0.05, 2.8, 6, STEEL); b.box(0, 2.45, 0, 0.5, 0.5, 0.04, YELLOW); b.box(0, 2.45, -0.03, 0.28, 0.16, 0.02, BLACK); return T([{ mat: 'prop', b, shadow: false }]); }
function shelterTemplate(): Template {
  const b = new ColorBuilder(), g = new ColorBuilder(); const col = C('#4a5560');
  for (const z of [-1.7, 1.7]) { b.box(-0.6, 1.25, z, 0.1, 2.5, 0.1, col); b.box(0.8, 1.25, z, 0.1, 2.5, 0.1, col); }
  b.box(0.1, 2.55, 0, 1.9, 0.1, 3.8, col);
  g.box(-0.6, 1.3, 0, 0.03, 2.2, 3.4, C('#cfe3ee'));
  b.box(0.2, 0.45, 0, 0.45, 0.06, 3.0, WOOD); for (const z of [-1.3, 1.3]) b.box(0.2, 0.22, z, 0.4, 0.44, 0.06, col);
  b.box(-0.55, 2.0, 0, 0.04, 0.5, 3.4, C('#1f6f8f'), 0, 0.4);
  return T([{ mat: 'prop', b }, { mat: 'glass', b: g, shadow: false }]);
}
function poleTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.14, 0.1, 8.2, 7, C('#7a6a55')); b.box(0, 7.6, 0, 1.6, 0.1, 0.1, C('#6a5a45')); for (const x of [-0.7, 0, 0.7]) b.cylinder(x, 7.65, 0, 0.05, 0.05, 0.2, 5, C('#e8e8e8')); return T([{ mat: 'prop', b, shadow: false }]); }
function kioskTemplate(): Template {
  const b = new ColorBuilder();
  b.box(0, 1.15, 0, 2.4, 2.3, 2.2, WHITE, 1, 0);
  b.box(0, 2.38, 0, 2.7, 0.08, 2.5, C('#7f8a94'));
  b.box(0, 1.5, -1.12, 1.6, 0.9, 0.04, C('#2a2a2a'));
  b.box(0, 1.0, -1.15, 1.8, 0.08, 0.5, WOOD);
  b.box(0, 2.1, -1.14, 2.2, 0.3, 0.04, C('#ffffff'), 0, 0.5);
  return T([{ mat: 'prop', b }], (v) => C(FABRIC[v % FABRIC.length]).lerp(WHITE, 0.3));
}
function stallTemplate(): Template {
  const b = new ColorBuilder(), f = new ColorBuilder();
  b.box(0, 0.8, 0, 2.0, 0.08, 1.0, WOOD);
  for (const [x, z] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) b.box(x, 0.4, z, 0.06, 0.8, 0.06, WOOD);
  for (const [x, z] of [[-0.95, -0.45], [0.95, -0.45], [-0.95, 0.45], [0.95, 0.45]]) b.box(x, 1.5, z, 0.05, 1.4, 0.05, STEEL);
  f.box(0, 2.22, 0, 2.3, 0.04, 1.4, WHITE, 1, 0);
  // goods
  b.box(-0.5, 0.98, 0, 0.6, 0.28, 0.6, C('#d9a441')); b.box(0.4, 0.95, -0.2, 0.5, 0.22, 0.4, C('#b3261e')); b.box(0.5, 0.94, 0.3, 0.4, 0.2, 0.3, C('#3f8a3a'));
  return T([{ mat: 'prop', b, shadow: false }, { mat: 'foliage', b: f, shadow: false }], (v) => C(FABRIC[v % FABRIC.length]));
}
function umbrellaTemplate(): Template {
  const b = new ColorBuilder(), f = new ColorBuilder();
  b.cylinder(0, 0, 0, 0.04, 0.04, 2.4, 6, STEEL); b.cylinder(0, 0, 0, 0.3, 0.3, 0.08, 8, CONC);
  f.cylinder(0, 2.0, 0, 1.5, 0.05, 0.6, 10, WHITE, 1, 0, false);
  return T([{ mat: 'prop', b, shadow: false }, { mat: 'foliage', b: f, shadow: false }], (v) => C(FABRIC[v % FABRIC.length]));
}
function carTemplate(v: number): Template {
  const b = new ColorBuilder(), g = new ColorBuilder();
  const L = v === 0 ? 4.4 : v === 1 ? 4.7 : 4.2, W = 1.8, H = v === 2 ? 1.75 : 1.45;
  b.box(0, 0.35 + 0.25, 0, W, 0.6, L, WHITE, 1, 0);
  const cabL = v === 2 ? L * 0.6 : L * 0.5; const cabZ = v === 2 ? 0.1 : -0.1;
  b.box(0, 0.6 + 0.3 + (H - 1.45) / 2, cabZ, W - 0.16, H - 0.9, cabL, WHITE, 1, 0);
  g.box(0, 0.6 + 0.3 + (H - 1.45) / 2, cabZ, W - 0.1, (H - 0.9) * 0.6, cabL + 0.04, C('#9fc3d6'));
  for (const [x, z] of [[-0.85, 1.35], [0.85, 1.35], [-0.85, -1.35], [0.85, -1.35]]) b.box(x, 0.33, z, 0.22, 0.64, 0.64, BLACK);
  b.box(0, 0.55, L / 2 + 0.01, 1.2, 0.15, 0.04, C('#ffffff'), 0, 0.5); b.box(0, 0.55, -L / 2 - 0.01, 1.2, 0.15, 0.04, C('#c62828'), 0, 0.3);
  return T([{ mat: 'prop', b }, { mat: 'glass', b: g, shadow: false }], (vv) => C(CAR_COLORS[vv % CAR_COLORS.length]));
}
function minibusTemplate(): Template {
  const b = new ColorBuilder(), g = new ColorBuilder();
  b.box(0, 1.1, 0, 2.0, 1.9, 4.9, WHITE, 1, 0);
  b.box(0, 1.2, 0, 2.02, 0.3, 4.92, BLACK);
  g.box(0, 1.5, 0, 2.04, 0.6, 4.3, C('#9fc3d6'));
  for (const [x, z] of [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.6], [0.95, -1.6]]) b.box(x, 0.36, z, 0.24, 0.7, 0.7, BLACK);
  b.box(0, 2.1, 0, 1.4, 0.2, 2.5, C('#8d8d8d'));
  return T([{ mat: 'prop', b }, { mat: 'glass', b: g, shadow: false }], (v) => C(v % 3 === 0 ? '#f2c230' : v % 3 === 1 ? '#e6e6e6' : '#2f6fa8'));
}
function pickupTemplate(): Template {
  const b = new ColorBuilder(), g = new ColorBuilder();
  b.box(0, 0.75, 0, 1.9, 0.7, 5.2, WHITE, 1, 0); b.box(0, 1.5, 0.9, 1.8, 0.8, 1.9, WHITE, 1, 0); g.box(0, 1.6, 0.9, 1.82, 0.5, 1.92, C('#9fc3d6'));
  b.box(0, 1.2, -1.5, 1.8, 0.1, 2.2, C('#4a4a4a'));
  for (const [x, z] of [[-0.9, 1.7], [0.9, 1.7], [-0.9, -1.6], [0.9, -1.6]]) b.box(x, 0.38, z, 0.24, 0.74, 0.74, BLACK);
  return T([{ mat: 'prop', b }, { mat: 'glass', b: g, shadow: false }], (v) => C(CAR_COLORS[v % CAR_COLORS.length]));
}
function truckTemplate(v: number): Template {
  const b = new ColorBuilder(), g = new ColorBuilder();
  const L = v === 0 ? 9 : 7;
  b.box(0, 1.0, 0, 2.4, 0.5, L, C('#2a2a2a'));
  b.box(0, 1.9, L / 2 - 1.2, 2.4, 2.2, 2.2, WHITE, 1, 0); g.box(0, 2.3, L / 2 - 1.2, 2.42, 0.7, 2.22, C('#9fc3d6'));
  b.box(0, 2.6, -1.4, 2.45, 2.7, L - 3.0, v === 0 ? C('#d9d9d9') : WHITE, v === 0 ? 0 : 1, 0);
  for (const z of [L / 2 - 1.2, -L / 2 + 1.5, -L / 2 + 2.6]) for (const x of [-1.1, 1.1]) b.box(x, 0.5, z, 0.3, 1.0, 1.0, BLACK);
  return T([{ mat: 'prop', b }, { mat: 'glass', b: g, shadow: false }], (vv) => C(['#c62828', '#1d5c8a', '#2e7d32', '#f2c230', '#6b6b6b', '#e6e6e6'][vv % 6]));
}
function manholeTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0.0, 0, 0.42, 0.42, 0.04, 12, C('#4a4a46')); return T([{ mat: 'prop', b, shadow: false }]); }
function planterTemplate(): Template { const b = new ColorBuilder(), f = new ColorBuilder(); b.box(0, 0.3, 0, 1.2, 0.6, 0.6, CONC); f.sphere(0, 0.9, 0, 0.5, 0.7, 7, 4, WHITE, 1); return T([{ mat: 'prop', b, shadow: false }, { mat: 'foliage', b: f, shadow: false }], (v, r) => C(LEAF[r.int(0, 5)])); }
function fountainTemplate(v: number): Template {
  const b = new ColorBuilder();
  b.cylinder(0, 0, 0, 3.2, 3.0, 0.7, 20, C('#c9c2b4')); b.cylinder(0, 0.7, 0, 2.7, 2.7, 0.05, 20, WATER, 0, 0.2);
  if (v === 0) { b.cylinder(0, 0.7, 0, 0.5, 0.35, 1.6, 10, C('#b9b3a7')); b.cylinder(0, 2.2, 0, 1.3, 0.2, 0.5, 14, C('#c9c2b4')); b.cylinder(0, 2.75, 0, 1.1, 1.1, 0.03, 14, WATER, 0, 0.2); b.cylinder(0, 2.6, 0, 0.08, 0.02, 2.4, 6, C('#d6ecf6'), 0, 0.3); }
  else { for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.cylinder(Math.cos(a) * 1.6, 0.7, Math.sin(a) * 1.6, 0.06, 0.02, 1.6 + (i % 2) * 0.4, 5, C('#d6ecf6'), 0, 0.3); } }
  return T([{ mat: 'prop', b, shadow: false }]);
}
function sculptureTemplate(v: number): Template {
  const b = new ColorBuilder(); b.box(0, 0.4, 0, 2.4, 0.8, 2.4, C('#c9c2b4'));
  if (v === 0) { for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; b.box(Math.cos(a) * 1.4, 2.6 + Math.sin(a) * 1.4, 0, 0.5, 0.5, 0.4, C('#b35a1e'), 0, 0, a); } }
  else if (v === 1) { b.cylinder(0, 0.8, 0, 0.6, 0.1, 7, 6, C('#7a8590')); b.sphere(0, 7.6, 0, 0.6, 1, 8, 5, C('#d9b24a')); }
  else { b.box(0, 1.8, 0, 0.9, 2.0, 0.7, C('#5a4a3a')); b.sphere(0, 3.2, 0, 0.42, 1.1, 8, 5, C('#5a4a3a')); b.box(0.75, 2.2, 0, 0.3, 1.2, 0.3, C('#5a4a3a'), 0, 0, 0); }
  return T([{ mat: 'prop', b }]);
}
function playgroundTemplate(): Template {
  const b = new ColorBuilder();
  // swing frame
  for (const z of [-1.5, 1.5]) { b.box(-3, 1.3, z, 0.1, 2.6, 0.1, C('#1d5c8a')); }
  b.box(-3, 2.6, 0, 0.1, 0.1, 3.2, C('#1d5c8a')); for (const z of [-0.6, 0.6]) { b.box(-3, 1.5, z, 0.03, 2.1, 0.03, STEEL); b.box(-3, 0.45, z, 0.5, 0.06, 0.25, C('#b3261e')); }
  // slide
  b.box(2, 1.0, -1.5, 1.2, 2.0, 1.2, C('#f2c230')); b.box(2, 1.75, -1.5, 1.2, 0.1, 1.2, C('#e6e6e6'));
  const sl = new THREE.Vector3(); void sl; for (let i = 0; i < 6; i++) { b.box(2, 1.7 - i * 0.28, -0.6 + i * 0.5, 0.7, 0.08, 0.6, C('#b3261e')); }
  // climbing frame
  for (const x of [-0.6, 0.6]) for (const z of [0.8, 2.0]) b.box(x, 1.0, z, 0.06, 2.0, 0.06, C('#2e7d32'));
  for (let i = 1; i < 5; i++) { b.box(0, i * 0.45, 0.8, 1.2, 0.05, 0.05, C('#2e7d32')); b.box(0, i * 0.45, 2.0, 1.2, 0.05, 0.05, C('#2e7d32')); }
  // sand pit
  b.cylinder(1.5, 0, 2.5, 2.2, 2.2, 0.15, 14, SAND);
  return T([{ mat: 'prop', b, shadow: false }]);
}
function coneTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.22, 0.05, 0.7, 8, C('#ff6a00')); b.box(0, 0.02, 0, 0.45, 0.04, 0.45, C('#ff6a00')); return T([{ mat: 'prop', b, shadow: false }]); }
function barrierTemplate(): Template { const b = new ColorBuilder(); b.box(0, 0.4, 0, 0.5, 0.8, 2.0, C('#d9d9d9')); b.box(0, 0.5, 0, 0.52, 0.2, 2.02, C('#e05a1e')); return T([{ mat: 'prop', b, shadow: false }]); }
function flagTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.06, 0.04, 9, 6, C('#dcdcdc')); b.box(0.75, 8.4, 0, 1.5, 1.0, 0.03, C('#1f7a4d')); b.box(0.75, 8.4, 0, 0.5, 1.0, 0.035, WHITE); return T([{ mat: 'prop', b, shadow: false }]); }
function tankTemplate(v: number): Template {
  const b = new ColorBuilder();
  if (v === 0) { b.box(0, 0.35, 0, 1.0, 0.7, 1.0, STEEL); b.cylinder(0, 0.7, 0, 0.5, 0.45, 0.3, 10, BLACK); }
  else if (v === 1) { b.cylinder(0, 0, 0, 0.5, 0.5, 0.95, 16, C('#d6d2c8')); b.cylinder(0, 0.95, 0, 0.5, 0.05, 0.05, 16, C('#c4bfb5')); b.box(0.5, 0.5, 0, 0.04, 0.9, 0.05, STEEL); }
  else if (v === 2) { b.cylinder(0, 0, 0, 0.5, 0.5, 1.0, 20, C('#b5afa4')); b.cylinder(0, 0.9, 0, 0.47, 0.47, 0.08, 20, C('#3f7f9f'), 0, 0.1); b.box(0, 1.05, 0, 1.0, 0.04, 0.05, STEEL); }
  else { for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) b.box(x, 0.35, z, 0.05, 0.7, 0.05, STEEL); b.box(0, 0.5, 0, 0.75, 0.02, 0.02, STEEL); b.cylinder(0, 0.7, 0, 0.45, 0.5, 0.28, 12, C('#cfd4d8')); b.cylinder(0, 0.98, 0, 0.5, 0.05, 0.02, 12, C('#cfd4d8')); }
  return T([{ mat: 'prop', b }]);
}
function pylonTemplate(): Template {
  const b = new ColorBuilder(); const col = C('#8a9096'); const h = 28;
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { b.box(x * 0.6, h / 2, z * 0.6, 0.18, h, 0.18, col); }
  for (let y = 4; y < h; y += 5) { b.box(0, y, -1.2, 2.5, 0.08, 0.08, col); b.box(0, y, 1.2, 2.5, 0.08, 0.08, col); b.box(-1.2, y, 0, 0.08, 0.08, 2.5, col); b.box(1.2, y, 0, 0.08, 0.08, 2.5, col); }
  b.box(0, h - 4, 0, 10, 0.2, 0.2, col); b.box(0, h - 9, 0, 8, 0.2, 0.2, col);
  for (const x of [-4.5, 4.5, -3.5, 3.5]) b.cylinder(x, Math.abs(x) > 4 ? h - 5.2 : h - 10.2, 0, 0.1, 0.1, 1.2, 5, C('#e8e8e8'));
  return T([{ mat: 'prop', b }]);
}
function boatTemplate(v: number): Template {
  const b = new ColorBuilder();
  if (v === 2) { // small cargo ship
    b.box(0, 1.5, 0, 12, 3.0, 60, C('#2f4a6a')); b.box(0, 3.4, 0, 11.6, 0.8, 58, C('#b3261e')); b.box(0, 6.5, -22, 9, 6, 8, WHITE); b.box(0, 10.2, -22, 4, 1.4, 3, C('#3a3a3a')); for (let i = 0; i < 5; i++) b.box(0, 4.8, -10 + i * 7, 9, 2.4, 6, C(['#c62828', '#1d5c8a', '#2e7d32', '#f2c230', '#6b6b6b'][i]));
  } else if (v === 1) { b.box(0, 0.5, 0, 2.6, 1.0, 8, C('#2f6fa8')); b.box(0, 1.5, -1.5, 2.0, 1.2, 2.4, WHITE); b.box(0, 0.95, 0, 2.3, 0.1, 7.5, WOOD); b.cylinder(0, 2.1, -1.5, 0.05, 0.05, 2.5, 5, STEEL); }
  else { b.box(0, 0.3, 0, 1.2, 0.6, 5, C(['#c9a227', '#1d5c8a', '#b3261e'][v % 3])); b.box(0, 0.62, 0, 1.0, 0.04, 4.6, WOOD); }
  return T([{ mat: 'prop', b }]);
}
function pumpTemplate(): Template { const b = new ColorBuilder(); b.box(0, 0.9, 0, 1.0, 1.8, 0.5, WHITE, 1, 0); b.box(0, 1.3, -0.26, 0.6, 0.4, 0.03, C('#222'), 0, 0.4); b.box(0, 0.1, 0, 1.4, 0.2, 0.9, CONC); return T([{ mat: 'prop', b, shadow: false }], () => C('#e6e6e6')); }
function hydrantTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 0.14, 0.12, 0.7, 8, RED); b.sphere(0, 0.72, 0, 0.15, 0.8, 8, 4, RED); b.box(0, 0.45, 0, 0.5, 0.12, 0.12, RED); return T([{ mat: 'prop', b, shadow: false }]); }
function cabinetTemplate(): Template { const b = new ColorBuilder(); b.box(0, 0.65, 0, 0.9, 1.3, 0.45, C('#8e9a8a')); b.box(0, 1.32, 0, 0.95, 0.04, 0.5, C('#6e7a6a')); return T([{ mat: 'prop', b, shadow: false }]); }
function washlineTemplate(): Template { const b = new ColorBuilder(); for (const x of [-2.5, 2.5]) b.cylinder(x, 0, 0, 0.04, 0.04, 2.0, 5, STEEL); b.box(0, 1.95, 0, 5, 0.02, 0.02, C('#dddddd')); for (let i = 0; i < 6; i++) b.box(-2 + i * 0.8, 1.55, 0, 0.5, 0.75, 0.02, C(FABRIC[i % FABRIC.length]).lerp(WHITE, 0.4)); return T([{ mat: 'prop', b, shadow: false }]); }
function palletsTemplate(): Template { const b = new ColorBuilder(); for (let i = 0; i < 4; i++) b.box(0, 0.08 + i * 0.16, 0, 1.2, 0.12, 1.0, WOOD.clone().lerp(WHITE, (i % 2) * 0.15)); b.box(1.3, 0.55, 0.2, 1.1, 1.1, 1.1, C('#c9b28a')); return T([{ mat: 'prop', b, shadow: false }]); }
function sandheapTemplate(): Template { const b = new ColorBuilder(); b.cylinder(0, 0, 0, 2.6, 0.2, 1.6, 10, SAND, 0, 0, true); b.cylinder(3.2, 0, 1.0, 1.8, 0.2, 1.1, 8, C('#8d8d8d'), 0, 0, true); return T([{ mat: 'prop', b, shadow: false }]); }
function parkingLineTemplate(): Template { const b = new ColorBuilder(); const t = 0.045; b.box(-0.5, 0.03, 0, t, 0.02, 1, WHITE); b.box(0.5, 0.03, 0, t, 0.02, 1, WHITE); b.box(0, 0.03, 0.5, 1, 0.02, t, WHITE); return T([{ mat: 'prop', b, shadow: false }]); }
function pathTemplate(): Template { const b = new ColorBuilder(); b.box(0, 0.04, 0, 1, 0.08, 1, C('#c9b99a')); return T([{ mat: 'prop', b, shadow: false }]); }
function containerTemplate(): Template { const b = new ColorBuilder(); b.box(0, 1.3, 0, 2.44, 2.6, 6.06, WHITE, 1, 0); for (let i = -2; i <= 2; i++) b.box(0, 1.3, i * 1.2, 2.5, 2.5, 0.08, WHITE, 1, 0); return T([{ mat: 'prop', b }], (v) => C(['#c62828', '#1d5c8a', '#2e7d32', '#f2c230', '#6b6b6b', '#e07a1e'][v % 6])); }

// ─────────────────────────── one-offs ───────────────────────────

function wire(out: PropBuild, p: Prop) {
  if (!p.e) return;
  const K = out.color.get(p.x, p.z); const h = p.p?.[0] ?? 7, sag = p.p?.[1] ?? 1.2;
  const x0 = p.x, z0 = p.z, x1 = p.e[0], z1 = p.e[1]; const y0 = p.y + h;
  const segs = 8; let prev: V3 = [x0, y0, z0];
  for (let i = 1; i <= segs; i++) { const t = i / segs; const q: V3 = [x0 + (x1 - x0) * t, y0 - Math.sin(t * Math.PI) * sag, z0 + (z1 - z0) * t]; const mx = (prev[0] + q[0]) / 2, my = (prev[1] + q[1]) / 2, mz = (prev[2] + q[2]) / 2; const len = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); const rot = -Math.atan2(q[2] - prev[2], q[0] - prev[0]); K.box(mx, my, mz, len + 0.02, 0.035, 0.035, C('#2a2a2a'), 0, 0, rot); prev = q; }
}
function streetSign(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z), T = out.text.get(p.x, p.z);
  K.cylinder(p.x, p.y, p.z, 0.045, 0.045, 2.7, 6, STEEL);
  const text = (p.text ?? '').split(' / ');
  const c = Math.cos(p.r), s = Math.sin(p.r); const nx = s, nz = c; // local +Z facing
  for (let i = 0; i < Math.min(2, text.length); i++) {
    const y = p.y + 2.55 - i * 0.3;
    const slot = out.textAtlas.get(text[i]);
    const w = Math.min(1.3, slot.aspect * 0.18 + 0.2);
    K.box(p.x, y, p.z, w, 0.24, 0.03, C('#1f6f3a'), 0, 0.15, p.r + (i === 1 ? Math.PI / 2 : 0));
    const fx = i === 1 ? c : -nx, fz = i === 1 ? -s : -nz; // face normal of each plate (two plates at right angles)
    T.label(p.x + fx * 0.02, y, p.z + fz * 0.02, fx, fz, 0.17, w - 0.1, slot, WHITE, 0.8, true);
  }
}
function directionalSign(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z), T = out.text.get(p.x, p.z);
  K.cylinder(p.x, p.y, p.z, 0.06, 0.06, 3.2, 6, STEEL);
  const slot = out.textAtlas.get(p.text ?? '');
  const w = Math.min(2.6, slot.aspect * 0.3 + 0.4);
  const nx = -Math.sin(p.r), nz = -Math.cos(p.r);
  K.box(p.x, p.y + 2.8, p.z, w, 0.5, 0.04, C('#1d5c8a'), 0, 0.15, p.r);
  T.label(p.x + nx * 0.03, p.y + 2.8, p.z + nz * 0.03, nx, nz, 0.28, w - 0.2, slot, WHITE, 0.8, true);
}
function billboard(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z), T = out.text.get(p.x, p.z);
  const c = Math.cos(p.r), s = Math.sin(p.r);
  for (const dx of [-3, 3]) K.cylinder(p.x + dx * c, p.y, p.z - dx * s, 0.15, 0.12, 6.5, 8, DARKSTEEL);
  K.box(p.x, p.y + 7.8, p.z, 9, 3.2, 0.2, C('#1d5c8a'), 0, 0.25, p.r);
  K.box(p.x, p.y + 9.5, p.z, 9.2, 0.2, 0.3, DARKSTEEL, 0, 0, p.r);
  const nx = -s, nz = -c; const slot = out.textAtlas.get(p.text ?? 'VORA');
  T.label(p.x + nx * 0.12, p.y + 7.8, p.z + nz * 0.12, nx, nz, 1.4, 8.2, slot, WHITE, 1);
  T.label(p.x - nx * 0.12, p.y + 7.8, p.z - nz * 0.12, -nx, -nz, 1.4, 8.2, slot, WHITE, 1);
}
function monument(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z); const h = p.p?.[0] ?? 12;
  K.box(p.x, p.y + 0.4, p.z, 8, 0.8, 8, C('#c9c2b4')); K.box(p.x, p.y + 1.1, p.z, 6, 0.6, 6, C('#bfb8a9')); K.box(p.x, p.y + 1.9, p.z, 3.4, 1.0, 3.4, C('#d8d0c0'));
  K.cylinder(p.x, p.y + 2.4, p.z, 1.3, 0.55, h - 3.4, 4, C('#d6cfbf'));
  K.cylinder(p.x, p.y + h - 1.0, p.z, 0.6, 0.02, 1.4, 4, C('#d9b24a'));
}
function goalposts(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z); const w = p.p?.[0] ?? 30, d = p.p?.[1] ?? 18; const c = Math.cos(p.r), s = Math.sin(p.r);
  for (const sgn of [-1, 1]) {
    const gx = p.x + c * sgn * w / 2, gz = p.z - s * sgn * w / 2;
    for (const dz of [-3.6, 3.6]) K.cylinder(gx + s * dz, p.y, gz + c * dz, 0.06, 0.06, 2.4, 6, WHITE);
    K.box(gx, p.y + 2.4, gz, 0.1, 0.1, 7.3, WHITE, 0, 0, p.r);
  }
  // touchlines
  K.box(p.x, p.y + 0.04, p.z, w, 0.02, 0.1, WHITE, 0, 0, p.r); K.box(p.x, p.y + 0.04, p.z, 0.1, 0.02, d, WHITE, 0, 0, p.r);
  for (const sgn of [-1, 1]) K.box(p.x + s * sgn * d / 2, p.y + 0.04, p.z + c * sgn * d / 2, w, 0.02, 0.1, WHITE, 0, 0, p.r);
  K.cylinder(p.x, p.y + 0.02, p.z, 4.6, 4.6, 0.02, 20, WHITE);
}
function towerCrane(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z); const h = p.p?.[0] ?? 30, jib = p.p?.[1] ?? 25; const col = C('#e0b323');
  K.box(p.x, p.y + 0.6, p.z, 6, 1.2, 6, CONC);
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) K.box(p.x + x, p.y + h / 2, p.z + z, 0.14, h, 0.14, col);
  for (let y = 3; y < h; y += 3) { K.box(p.x, p.y + y, p.z - 0.8, 1.7, 0.06, 0.06, col); K.box(p.x, p.y + y, p.z + 0.8, 1.7, 0.06, 0.06, col); K.box(p.x - 0.8, p.y + y, p.z, 0.06, 0.06, 1.7, col); K.box(p.x + 0.8, p.y + y, p.z, 0.06, 0.06, 1.7, col); }
  K.box(p.x, p.y + h + 0.8, p.z, 2.0, 1.6, 2.0, C('#e6e6e6'));
  const c = Math.cos(p.r), s = Math.sin(p.r);
  K.box(p.x + c * (jib / 2 - 4), p.y + h + 1.6, p.z - s * (jib / 2 - 4), jib, 0.9, 0.9, col, 0, 0, p.r);
  K.box(p.x - c * 5, p.y + h + 1.6, p.z + s * 5, 7, 0.8, 0.8, col, 0, 0, p.r); K.box(p.x - c * 7.5, p.y + h + 1.0, p.z + s * 7.5, 2.2, 1.6, 1.6, CONC, 0, 0, p.r);
  K.box(p.x, p.y + h + 4.5, p.z, 0.5, 5, 0.5, col);
  K.box(p.x + c * (jib - 6), p.y + h - 6, p.z - s * (jib - 6), 0.05, 15, 0.05, C('#333'));
}
function quayCrane(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z); const h = p.p?.[0] ?? 36; const col = C('#2f6fa8'); const c = Math.cos(p.r), s = Math.sin(p.r);
  for (const [lx, lz] of [[-6, -8], [6, -8], [-6, 8], [6, 8]]) { const x = p.x + lx * c + lz * s, z = p.z - lx * s + lz * c; K.box(x, p.y + h / 2, z, 1.2, h, 1.2, col); }
  K.box(p.x, p.y + h, p.z, 14, 2, 18, col, 0, 0, p.r);
  K.box(p.x + s * 18, p.y + h + 1.5, p.z + c * 18, 3, 3, 52, col, 0, 0, p.r);
  K.box(p.x + s * 30, p.y + h - 7, p.z + c * 30, 3, 2, 6, C('#e0b323'), 0, 0, p.r);
  K.box(p.x, p.y + h + 10, p.z, 2, 18, 2, col, 0, 0, p.r);
}
function floodlight(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z); const h = p.p?.[0] ?? 30;
  K.cylinder(p.x, p.y, p.z, 0.6, 0.35, h, 8, STEEL);
  K.box(p.x, p.y + h + 1.5, p.z, 4.5, 3.2, 0.6, C('#dcdcdc'), 0, 0.9, p.r);
}
function pier(out: PropBuild, p: Prop, heightAt: (x: number, z: number) => number) {
  const K = out.color.get(p.x, p.z); const L = p.p?.[0] ?? 40, W = p.p?.[1] ?? 5; const v = p.v ?? 0;
  const c = Math.cos(p.r), s = Math.sin(p.r);
  const deckY = v === 1 ? Math.max(1.2, heightAt(p.x, p.z) + 0.2) : 1.1;
  K.box(p.x, deckY, p.z, L, v === 1 ? 1.0 : 0.3, W, v === 1 ? CONC : WOOD, 0, 0, p.r);
  const n = Math.max(2, Math.floor(L / 6));
  for (let i = 0; i <= n; i++) { const t = -L / 2 + (L * i) / n; for (const w of [-W / 2 + 0.4, W / 2 - 0.4]) { const x = p.x + c * t + s * w, z = p.z - s * t + c * w; K.cylinder(x, -4, z, v === 1 ? 0.5 : 0.18, v === 1 ? 0.5 : 0.18, deckY + 4, 6, v === 1 ? CONC : TRUNK); } }
  if (v === 1) { for (let i = 0; i < n; i++) { const t = -L / 2 + 3 + (L * i) / n; const x = p.x + c * t + s * (W / 2 - 0.3), z = p.z - s * t + c * (W / 2 - 0.3); K.cylinder(x, deckY + 0.5, z, 0.3, 0.3, 0.6, 8, BLACK); } }
  else { for (let i = 0; i <= n; i++) { const t = -L / 2 + (L * i) / n; for (const w of [-W / 2 + 0.2, W / 2 - 0.2]) { const x = p.x + c * t + s * w, z = p.z - s * t + c * w; K.box(x, deckY + 0.6, z, 0.1, 1.0, 0.1, WOOD); } } K.box(p.x + s * (W / 2 - 0.2), deckY + 1.05, p.z + c * (W / 2 - 0.2), L, 0.08, 0.08, WOOD, 0, 0, p.r); K.box(p.x - s * (W / 2 - 0.2), deckY + 1.05, p.z - c * (W / 2 - 0.2), L, 0.08, 0.08, WOOD, 0, 0, p.r); }
}
function gateway(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z), T = out.text.get(p.x, p.z);
  const span = p.p?.[0] ?? 24, h = p.p?.[1] ?? 18, d = p.p?.[2] ?? 6; const col = C('#d8cfc0'); const c = Math.cos(p.r), s = Math.sin(p.r);
  for (const sgn of [-1, 1]) { const x = p.x + c * sgn * (span / 2 + 2), z = p.z - s * sgn * (span / 2 + 2); K.box(x, p.y + h / 2, z, 4, h, d, col, 0, 0, p.r); K.box(x, p.y + h + 0.8, z, 4.6, 1.6, d + 0.6, C('#c4bba9'), 0, 0, p.r); }
  K.box(p.x, p.y + h - 2, p.z, span + 8, 4, d, col, 0, 0, p.r);
  K.box(p.x, p.y + h + 0.8, p.z, span + 8.6, 1.6, d + 0.6, C('#c4bba9'), 0, 0, p.r);
  K.box(p.x, p.y + h + 3.5, p.z, 6, 4, 2, C('#1f7a4d'), 0, 0, p.r); K.cylinder(p.x, p.y + h + 5.5, p.z, 0.1, 0.06, 6, 6, STEEL); K.box(p.x + 0.8, p.y + h + 10.5, p.z, 1.6, 1.0, 0.04, C('#1f7a4d'), 0, 0, p.r);
  const slot = out.textAtlas.get(p.text ?? 'VORA CITY');
  for (const sgn of [-1, 1]) { const nx = -s * sgn, nz = -c * sgn; T.label(p.x + nx * (d / 2 + 0.05), p.y + h - 2, p.z + nz * (d / 2 + 0.05), nx, nz, 2.2, span, slot, C('#1f3f28'), 0.6); }
}
function amphitheatre(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z); const w = p.p?.[0] ?? 16, steps = Math.round(p.p?.[1] ?? 6); const c = Math.cos(p.r), s = Math.sin(p.r);
  for (let i = 0; i < steps; i++) { const dz = i * 1.2; K.box(p.x + s * dz, p.y + 0.2 + i * 0.4, p.z + c * dz, w - i * 1.2, 0.4, 1.2, CONC, 0, 0, p.r); }
}
function speedbump(out: PropBuild, p: Prop) { const K = out.color.get(p.x, p.z); const L = p.p?.[0] ?? 6; K.box(p.x, p.y + 0.05, p.z, 0.5, 0.1, L, C('#e0b323'), 0, 0, p.r); for (let i = 0; i < Math.floor(L / 1.2); i++) K.box(p.x, p.y + 0.11, p.z - L / 2 + 0.6 + i * 1.2, 0.5, 0.02, 0.5, BLACK, 0, 0, p.r); }
function scaffold(out: PropBuild, p: Prop) {
  const K = out.color.get(p.x, p.z); const L = p.p?.[0] ?? 12, H = p.p?.[1] ?? 6; const c = Math.cos(p.r), s = Math.sin(p.r);
  const n = Math.max(2, Math.floor(L / 2.4));
  for (let i = 0; i <= n; i++) { const t = -L / 2 + (L * i) / n; for (const w of [0, 1.2]) { K.cylinder(p.x + c * t + s * w, p.y, p.z - s * t + c * w, 0.04, 0.04, H, 5, STEEL); } }
  for (let lvl = 1; lvl * 2 <= H; lvl++) { K.box(p.x + s * 0.6, p.y + lvl * 2, p.z + c * 0.6, L, 0.06, 1.2, WOOD, 0, 0, p.r); K.box(p.x + s * 1.2, p.y + lvl * 2 + 0.9, p.z + c * 1.2, L, 0.04, 0.04, STEEL, 0, 0, p.r); }
  K.box(p.x + s * 1.3, p.y + H / 2, p.z + c * 1.3, L, H, 0.02, C('#3f7f3f'), 0, 0, p.r);
}
function roadworks(out: PropBuild, p: Prop, r: RNG) {
  const K = out.color.get(p.x, p.z); const L = p.p?.[0] ?? 14; const c = Math.cos(p.r), s = Math.sin(p.r);
  for (let i = 0; i <= Math.floor(L / 2); i++) { const t = -L / 2 + i * 2; const x = p.x + s * t, z = p.z + c * t; K.cylinder(x + c * 1.2, p.y, z - s * 1.2, 0.22, 0.05, 0.7, 8, C('#ff6a00')); }
  K.box(p.x, p.y + 0.4, p.z, 1.2, 0.8, L * 0.5, C('#d9d9d9'), 0, 0, p.r); K.box(p.x, p.y + 0.5, p.z, 1.22, 0.2, L * 0.5 + 0.02, C('#e05a1e'), 0, 0, p.r);
  K.box(p.x - c * 2, p.y + 0.3, p.z + s * 2, 3, 0.6, 2, SAND, 0, 0, p.r);
  K.box(p.x + s * (L / 2 + 1), p.y + 1.2, p.z + c * (L / 2 + 1), 0.08, 2.4, 0.08, STEEL); K.box(p.x + s * (L / 2 + 1), p.y + 2.0, p.z + c * (L / 2 + 1), 0.9, 0.9, 0.04, C('#f2c230'), 0, 0.2, p.r);
  void r;
}
function cropField(out: PropBuild, p: Prop, r: RNG, heightAt: (x: number, z: number) => number) {
  const F = out.foliage.get(p.x, p.z); const w = typeof p.s === 'object' ? p.s[0] : 60, d = typeof p.s === 'object' ? p.s[2] : 40; const v = p.v ?? 0;
  const c = Math.cos(p.r), s = Math.sin(p.r);
  const rowStep = v === 0 ? 1.6 : v === 1 ? 2.2 : 3.0; const col = C(['#6f9a3a', '#7fa04a', '#8f9a3a', '#5f8a32'][v % 4]);
  const rows = Math.floor(d / rowStep);
  for (let i = 0; i < rows; i++) {
    const t = -d / 2 + rowStep * (i + 0.5); const cx = p.x + s * t, cz = p.z + c * t;
    const segs = Math.max(1, Math.floor(w / 12));
    for (let k = 0; k < segs; k++) { const u = -w / 2 + (w * (k + 0.5)) / segs; const x = cx + c * u, z = cz - s * u; const h = v === 2 ? 2.2 : 0.7 + r.range(0, 0.3); F.box(x, heightAt(x, z) + h / 2, z, w / segs - 0.4, h, v === 2 ? 0.6 : 0.5, col, 1, 0, p.r); }
  }
  void r;
}
function hoarding(out: PropBuild, p: Prop) { const K = out.color.get(p.x, p.z); K.box(p.x, p.y + 1.2, p.z, 4, 2.4, 0.06, C('#3f7f3f'), 0, 0, p.r); for (const dx of [-1.9, 1.9]) K.box(p.x + Math.cos(p.r) * dx, p.y + 1.2, p.z - Math.sin(p.r) * dx, 0.1, 2.4, 0.1, STEEL); }
