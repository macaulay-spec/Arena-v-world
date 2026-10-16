/**
 * Player kit morph targets (build / muscle / face) and rig deformation in a bent pose.
 * Builds the two player kits into a temp dir (≈2 s) and reads the glTF back.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Quaternion, Vector3 } from 'three';
import { morph, defaultBody } from '../characters/body';
import { buildRig, reposeWithRig, BONE_INDEX, BONE_PARENT, BONES } from '../characters/rig';
import { buildPlayerKits, FACE_DETAILS, SHAPE_TARGETS, type PlayerKit } from '../characters/player';

let dir: string; let kits: PlayerKit[];
beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'vora-kits-')); kits = buildPlayerKits(dir); });
afterAll(() => { rmSync(dir, { recursive: true, force: true }); });

interface Gltf { nodes: any[]; meshes: any[]; accessors: any[]; bufferViews: any[]; skins: any[] }
function readKit(file: string): { g: Gltf; bin: Buffer } {
  const g = JSON.parse(readFileSync(join(dir, file), 'utf8')) as Gltf & { buffers: { uri: string }[] };
  return { g, bin: readFileSync(join(dir, g.buffers[0].uri)) };
}
const CT: Record<number, { ctor: any; size: number }> = { 5120: { ctor: Int8Array, size: 1 }, 5121: { ctor: Uint8Array, size: 1 }, 5123: { ctor: Uint16Array, size: 2 }, 5125: { ctor: Uint32Array, size: 4 }, 5126: { ctor: Float32Array, size: 4 } };
const N: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
/** dense Float32Array of an accessor (handles sparse + normalised + strided views) */
function read(g: Gltf, bin: Buffer, ai: number): Float32Array {
  const a = g.accessors[ai]; const n = N[a.type]; const out = new Float32Array(a.count * n);
  const readView = (bvi: number, ct: number, count: number, comps: number, byteOffset = 0): Float32Array => {
    const bv = g.bufferViews[bvi]; const { ctor, size } = CT[ct]; const stride = bv.byteStride ?? size * comps; const res = new Float32Array(count * comps);
    for (let i = 0; i < count; i++) { const base = bin.byteOffset + bv.byteOffset + byteOffset + i * stride; const arr = new ctor(bin.buffer.slice(base, base + size * comps)); for (let k = 0; k < comps; k++) res[i * comps + k] = arr[k]; }
    return res;
  };
  if (a.bufferView !== undefined) out.set(readView(a.bufferView, a.componentType, a.count, n, a.byteOffset ?? 0));
  if (a.sparse) {
    const idx = readView(a.sparse.indices.bufferView, a.sparse.indices.componentType, a.sparse.count, 1);
    const val = readView(a.sparse.values.bufferView, a.componentType, a.sparse.count, n);
    for (let i = 0; i < a.sparse.count; i++) for (let k = 0; k < n; k++) out[idx[i] * n + k] = val[i * n + k];
  }
  if (a.normalized) { const max = a.componentType === 5120 ? 127 : a.componentType === 5121 ? 255 : 65535; for (let i = 0; i < out.length; i++) out[i] /= max; }
  return out;
}
const maxLen = (d: Float32Array) => { let m = 0; for (let i = 0; i < d.length; i += 3) m = Math.max(m, Math.hypot(d[i], d[i + 1], d[i + 2])); return m; };

describe('rig re-pose', () => {
  it('reposeWithRig reproduces the rig vertices for the base body (identity check)', () => {
    const p = defaultBody(); p.gender = 1; p.ageYears = 30; p.african = 0.95; p.asian = 0.05; p.caucasian = 0;
    const m = morph(p); const rig = buildRig(m.pos, m.groundDm);
    const again = reposeWithRig(rig, morph(p, m.groundDm).pos);
    let maxErr = 0; for (let i = 0; i < again.length; i++) maxErr = Math.max(maxErr, Math.abs(again[i] - rig.pos[i]));
    expect(maxErr).toBeLessThan(1e-6);
  });
});

describe('player kit morph targets', () => {
  it('player.json lists the body + face targets for both kits', () => {
    const expected = [...SHAPE_TARGETS.map(t => t.name), ...Object.keys(FACE_DETAILS).flatMap(k => [`face_${k}_neg`, `face_${k}_pos`])];
    for (const k of kits) expect(k.morphs).toEqual(expected);
    expect(expected.length).toBe(22);
  });
  it('LOD0 carries all targets with names; hair/outfit nodes carry the body-shape targets', () => {
    for (const k of kits) {
      const { g } = readKit(k.file);
      const lod0 = g.meshes.find(m => m.name === 'LOD0')!;
      expect(lod0.extras.targetNames).toEqual(k.morphs);
      for (const prim of lod0.primitives) expect(prim.targets.length).toBe(22);
      for (const m of g.meshes) if (/^(OUTFIT|HAIR)_/.test(m.name)) { expect(m.extras.targetNames).toEqual(k.morphs.slice(0, 4)); for (const prim of m.primitives) expect(prim.targets.length).toBe(4); }
    }
  });
  it('body targets move the torso by centimetres and clothes move with them; face targets stay in the head', () => {
    for (const k of kits) {
      const { g, bin } = readKit(k.file);
      const lod0 = g.meshes.find(m => m.name === 'LOD0')!; const skin = lod0.primitives[0];
      const pos = read(g, bin, skin.attributes.POSITION);
      const names: string[] = lod0.extras.targetNames;
      const t = (name: string) => read(g, bin, skin.targets[names.indexOf(name)].POSITION);
      expect(maxLen(t('shape_weight_hi'))).toBeGreaterThan(0.012);
      expect(maxLen(t('shape_weight_lo'))).toBeGreaterThan(0.008);
      expect(maxLen(t('shape_muscle_hi'))).toBeGreaterThan(0.008);
      expect(maxLen(t('shape_weight_hi'))).toBeLessThan(0.08); // sane magnitudes, no exploded vertices
      // face targets: every displaced vertex sits in the head (above the neck ≈ 83 % of the height)
      const neckY = k.height * 0.83;
      for (const name of names.filter(n => n.startsWith('face_'))) {
        const d = t(name); let moved = 0, below = 0, mx = 0;
        for (let i = 0; i < d.length; i += 3) { const l = Math.hypot(d[i], d[i + 1], d[i + 2]); if (l > 1e-5) { moved++; mx = Math.max(mx, l); if (pos[i + 1] < neckY) below++; } }
        expect(moved, name).toBeGreaterThan(10);
        expect(below, name).toBe(0);
        expect(mx, name).toBeGreaterThan(0.002); expect(mx, name).toBeLessThan(0.05);
      }
      // outfits: the casual outfit's weight target is in the same range as the body's
      const casual = g.meshes.find(m => m.name === 'OUTFIT_casual')!;
      const cw = Math.max(...casual.primitives.map((p: any) => maxLen(read(g, bin, p.targets[1].POSITION))));
      expect(cw).toBeGreaterThan(0.01); expect(cw).toBeLessThan(0.08);
    }
  });
});

describe('rig deformation in bent poses', () => {
  /** linear-blend skin `pos` with one bone chain rotated by `q` about the bone head; returns the posed positions */
  function poseChain(g: Gltf, bin: Buffer, prim: any, boneIdx: number, q: Quaternion) {
    const pos = read(g, bin, prim.attributes.POSITION), joints = read(g, bin, prim.attributes.JOINTS_0), weights = read(g, bin, prim.attributes.WEIGHTS_0);
    const ibm = read(g, bin, g.skins[0].inverseBindMatrices);
    const heads: Vector3[] = []; for (let b = 0; b < BONES.length; b++) heads.push(new Vector3(-ibm[b * 16 + 12], -ibm[b * 16 + 13], -ibm[b * 16 + 14]));
    const inChain = (b: number) => { for (let x = b; x >= 0; x = BONE_PARENT[x]) if (x === boneIdx) return true; return false; };
    const n = pos.length / 3; const out = new Float32Array(n * 3); const v = new Vector3(), acc = new Vector3(), tmp = new Vector3();
    const chainW = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      v.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); acc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) {
        const w = weights[i * 4 + k]; if (!w) continue; const b = joints[i * 4 + k];
        tmp.copy(v); if (inChain(b)) { tmp.sub(heads[boneIdx]).applyQuaternion(q).add(heads[boneIdx]); chainW[i] += w; }
        acc.addScaledVector(tmp, w);
      }
      out[i * 3] = acc.x; out[i * 3 + 1] = acc.y; out[i * 3 + 2] = acc.z;
    }
    return { pos, out, heads, joints, weights, chainW, n };
  }
  const JOINTS: { bone: string; child: string; axis: [number, number, number]; deg: number; minRigid: number; girth: number }[] = [
    { bone: 'LeftArm', child: 'LeftForeArm', axis: [0, 0, 1], deg: -60, minRigid: 300, girth: 0.85 },      // shoulder: raise the arm
    { bone: 'LeftForeArm', child: 'LeftHand', axis: [0, 0, 1], deg: -90, minRigid: 300, girth: 0.85 },     // elbow
    { bone: 'LeftHand', child: 'LeftHandMiddle1', axis: [0, 0, 1], deg: -45, minRigid: 100, girth: 0.8 }, // wrist
    { bone: 'LeftUpLeg', child: 'LeftLeg', axis: [1, 0, 0], deg: -60, minRigid: 300, girth: 0.85 },      // hip: leg forward
    { bone: 'LeftLeg', child: 'LeftFoot', axis: [1, 0, 0], deg: 90, minRigid: 200, girth: 0.85 },        // knee
    { bone: 'LeftFoot', child: 'LeftToeBase', axis: [1, 0, 0], deg: -30, minRigid: 60, girth: 0.8 },     // ankle
    { bone: 'LeftHandIndex1', child: 'LeftHandIndex2', axis: [0, 0, 1], deg: -60, minRigid: 10, girth: 0.7 }, // finger
  ];
  let kit: { g: Gltf; bin: Buffer };
  beforeAll(() => { kit = readKit('player_m.gltf'); });

  it.each(JOINTS)('$bone bend: chain vertices move rigidly, others stay, mid-segment girth is kept', (j) => {
    const { g, bin } = kit;
    const lod0 = g.meshes.find(m => m.name === 'LOD0')!; const skin = lod0.primitives[0];
    const bi = BONE_INDEX.get(j.bone)!, ci = BONE_INDEX.get(j.child)!;
    const q = new Quaternion().setFromAxisAngle(new Vector3(...j.axis), (j.deg * Math.PI) / 180);
    const { pos, out, heads, chainW, n } = poseChain(g, bin, skin, bi, q);
    const head = heads[bi], tail = heads[ci]; const axis = tail.clone().sub(head); const len = axis.length(); axis.divideScalar(len);
    const axis1 = axis.clone().applyQuaternion(q);
    let rigid = 0, maxRigidErr = 0, maxOtherMove = 0; const ring: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const p0 = new Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]), p1 = new Vector3(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]);
      if (chainW[i] > 0.995) { rigid++; maxRigidErr = Math.max(maxRigidErr, Math.abs(p0.distanceTo(head) - p1.distanceTo(head))); }
      else if (chainW[i] < 1e-6) maxOtherMove = Math.max(maxOtherMove, p0.distanceTo(p1));
      const along = p0.clone().sub(head).dot(axis);
      if (chainW[i] > 0.95 && Math.abs(along - len * 0.5) < Math.max(0.01, len * 0.08)) {
        const r0 = p0.clone().sub(head).addScaledVector(axis, -along).length();
        const along1 = p1.clone().sub(head).dot(axis1); const r1 = p1.clone().sub(head).addScaledVector(axis1, -along1).length();
        ring.push([r0, r1]);
      }
    }
    expect(rigid, 'rigid vertex count').toBeGreaterThan(j.minRigid);
    expect(maxRigidErr, 'rigid distance error').toBeLessThan(5e-3);     // uint8 weights ⇒ ≤ 0.4 % residual blend on a ≤ 1 m lever
    expect(maxOtherMove, 'unweighted vertices moved').toBeLessThan(1e-6);
    expect(ring.length, 'mid-segment ring vertices').toBeGreaterThan(4);
    const before = ring.reduce((a, r) => a + r[0], 0) / ring.length, after = ring.reduce((a, r) => a + r[1], 0) / ring.length;
    expect(after / before, 'girth retention').toBeGreaterThan(j.girth);
  });

  it('every LOD0 vertex has normalised weights on real bones', () => {
    const { g, bin } = kit;
    const lod0 = g.meshes.find(m => m.name === 'LOD0')!;
    for (const prim of lod0.primitives) {
      const joints = read(g, bin, prim.attributes.JOINTS_0), weights = read(g, bin, prim.attributes.WEIGHTS_0); const n = joints.length / 4;
      for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 4; k++) { s += weights[i * 4 + k]; expect(joints[i * 4 + k]).toBeLessThan(BONES.length); } expect(Math.abs(s - 1)).toBeLessThan(0.01); }
    }
  });

  it.each([
    { bone: 'LeftLeg', axis: [1, 0, 0] as [number, number, number], deg: 90, what: 'jeans at the knee' },
    { bone: 'LeftArm', axis: [0, 0, 1] as [number, number, number], deg: -60, what: 't-shirt sleeve at the shoulder' },
  ])('the casual outfit follows the body: $what (no garment drift from the skin beneath)', ({ bone, axis: ax, deg }) => {
    const { g, bin } = kit;
    const lod0 = g.meshes.find(m => m.name === 'LOD0')!; const skin = lod0.primitives[0];
    const outfit = g.meshes.find(m => m.name === 'OUTFIT_casual')!;
    const fa = BONE_INDEX.get(bone)!; const q = new Quaternion().setFromAxisAngle(new Vector3(...ax), (deg * Math.PI) / 180);
    const body = poseChain(g, bin, skin, fa, q);
    // body vertices in the left forearm region (rest), with a coarse grid for nearest lookups
    const cell = 0.03; const grid = new Map<string, number[]>(); const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
    for (let i = 0; i < body.n; i++) { if (body.chainW[i] < 0.5) continue; const k = key(body.pos[i * 3], body.pos[i * 3 + 1], body.pos[i * 3 + 2]); (grid.get(k) ?? grid.set(k, []).get(k)!).push(i); }
    let checked = 0, drift = 0, maxDrift = 0;
    for (const prim of outfit.primitives) {
      const garment = poseChain(g, bin, prim, fa, q);
      for (let i = 0; i < garment.n; i++) {
        if (garment.chainW[i] < 0.5) continue;
        const gx = garment.pos[i * 3], gy = garment.pos[i * 3 + 1], gz = garment.pos[i * 3 + 2];
        let best = -1, bd = Infinity;
        const cx = Math.floor(gx / cell), cy = Math.floor(gy / cell), cz = Math.floor(gz / cell);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (const bi of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
          const d = (body.pos[bi * 3] - gx) ** 2 + (body.pos[bi * 3 + 1] - gy) ** 2 + (body.pos[bi * 3 + 2] - gz) ** 2; if (d < bd) { bd = d; best = bi; }
        }
        if (best < 0) continue; checked++;
        const d0 = Math.sqrt(bd);
        const d1 = Math.hypot(body.out[best * 3] - garment.out[i * 3], body.out[best * 3 + 1] - garment.out[i * 3 + 1], body.out[best * 3 + 2] - garment.out[i * 3 + 2]);
        const dd = Math.abs(d1 - d0); maxDrift = Math.max(maxDrift, dd); if (dd > 0.02) drift++;
      }
    }
    expect(checked).toBeGreaterThan(50);
    expect(drift / checked, 'fraction of garment vertices drifting > 2 cm from the skin beneath').toBeLessThan(0.02);
    expect(maxDrift).toBeLessThan(0.05);
  });
});
