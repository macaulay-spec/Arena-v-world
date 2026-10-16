/**
 * Rig: builds a Mixamo-compatible humanoid skeleton (mixamorig naming, T-pose bind) from the
 * MakeHuman joints of a morphed body, merges MakeHuman's 139 weighted bones into it and re-poses the
 * mesh from MakeHuman's A-pose into the T-pose so Mixamo-style clips retarget cleanly later.
 */
import { Vector3, Quaternion } from 'three';
import { loadSkeleton, loadWeights, jointPosition, type MhSkeleton } from './mh/load';
import { base, DM } from './body';

export const BONES: { name: string; parent: string | null }[] = [];
{
  const add = (n: string, p: string | null) => BONES.push({ name: n, parent: p });
  add('Hips', null); add('Spine', 'Hips'); add('Spine1', 'Spine'); add('Spine2', 'Spine1'); add('Neck', 'Spine2'); add('Head', 'Neck'); add('HeadTop_End', 'Head');
  add('Jaw', 'Head'); add('LeftEye', 'Head'); add('RightEye', 'Head');
  for (const s of ['Left', 'Right']) {
    add(`${s}Shoulder`, 'Spine2'); add(`${s}Arm`, `${s}Shoulder`); add(`${s}ForeArm`, `${s}Arm`); add(`${s}Hand`, `${s}ForeArm`);
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) { add(`${s}Hand${f}1`, `${s}Hand`); add(`${s}Hand${f}2`, `${s}Hand${f}1`); add(`${s}Hand${f}3`, `${s}Hand${f}2`); add(`${s}Hand${f}4`, `${s}Hand${f}3`); }
  }
  for (const s of ['Left', 'Right']) { add(`${s}UpLeg`, 'Hips'); add(`${s}Leg`, `${s}UpLeg`); add(`${s}Foot`, `${s}Leg`); add(`${s}ToeBase`, `${s}Foot`); add(`${s}Toe_End`, `${s}ToeBase`); }
}
export const BONE_INDEX = new Map(BONES.map((b, i) => [b.name, i]));
export const BONE_PARENT = BONES.map(b => (b.parent ? BONE_INDEX.get(b.parent)! : -1));
export const N_BONES = BONES.length;

/** MakeHuman bone → Mixamo bone for weights (prefix match, longest wins; face bones handled by ancestry). */
const WEIGHT_MAP: [string, string][] = [
  ['root', 'Hips'], ['pelvis.L', 'Hips'], ['pelvis.R', 'Hips'], ['spine05', 'Hips'], ['spine04', 'Hips'], ['spine03', 'Spine'], ['spine02', 'Spine1'], ['spine01', 'Spine2'],
  ['breast.L', 'Spine2'], ['breast.R', 'Spine2'], ['neck01', 'Neck'], ['neck02', 'Neck'], ['neck03', 'Neck'], ['head', 'Head'], ['jaw', 'Jaw'], ['eye.L', 'LeftEye'], ['eye.R', 'RightEye'],
];
for (const [s, S] of [['L', 'Left'], ['R', 'Right']] as const) {
  WEIGHT_MAP.push([`clavicle.${s}`, `${S}Shoulder`], [`shoulder01.${s}`, `${S}Shoulder`], [`upperarm01.${s}`, `${S}Arm`], [`upperarm02.${s}`, `${S}Arm`],
    [`lowerarm01.${s}`, `${S}ForeArm`], [`lowerarm02.${s}`, `${S}ForeArm`], [`wrist.${s}`, `${S}Hand`],
    [`metacarpal1.${s}`, `${S}Hand`], [`metacarpal2.${s}`, `${S}Hand`], [`metacarpal3.${s}`, `${S}Hand`], [`metacarpal4.${s}`, `${S}Hand`],
    [`upperleg01.${s}`, `${S}UpLeg`], [`upperleg02.${s}`, `${S}UpLeg`], [`lowerleg01.${s}`, `${S}Leg`], [`lowerleg02.${s}`, `${S}Leg`], [`foot.${s}`, `${S}Foot`]);
  const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
  for (let f = 1; f <= 5; f++) for (let k = 1; k <= 3; k++) WEIGHT_MAP.push([`finger${f}-${k}.${s}`, `${S}Hand${fingers[f - 1]}${k}`]);
  for (let t = 1; t <= 5; t++) for (let k = 1; k <= 3; k++) WEIGHT_MAP.push([`toe${t}-${k}.${s}`, `${S}ToeBase`]);
}
const WEIGHT_LOOKUP = new Map(WEIGHT_MAP);

export interface Rig {
  /** bind (T-pose) joint positions, metres */
  heads: Float32Array;     // N_BONES * 3
  /** per vertex: 4 bone indices + 4 weights (all 19158 MakeHuman vertices) */
  joints: Uint8Array; weights: Float32Array;
  /** vertex positions re-posed into the T-pose (metres, all vertices) */
  pos: Float32Array;
  /** world rotation applied to each bone to reach the T-pose (for debugging / helpers) */
  tposeRot: Quaternion[];
  /** A-pose joint positions the re-pose started from (metres) */
  headsA: Float32Array;
}

/**
 * Re-pose another A-pose vertex set (e.g. a morph variant of the same body) with the rig's bone
 * rotations, so it lands in the same T-pose frame as `rig.pos` and can be diffed into morph targets.
 */
export function reposeWithRig(rig: Rig, posA: Float32Array): Float32Array {
  const n = posA.length / 3; const pos = new Float32Array(posA.length);
  const { joints, weights, headsA, heads, tposeRot: rot } = rig;
  const v = new Vector3(), acc = new Vector3(), tmp = new Vector3();
  for (let vi = 0; vi < n; vi++) {
    v.set(posA[vi * 3], posA[vi * 3 + 1], posA[vi * 3 + 2]); acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = weights[vi * 4 + k]; if (w <= 0) continue;
      const b = joints[vi * 4 + k];
      tmp.set(v.x - headsA[b * 3], v.y - headsA[b * 3 + 1], v.z - headsA[b * 3 + 2]).applyQuaternion(rot[b]);
      tmp.x += heads[b * 3]; tmp.y += heads[b * 3 + 1]; tmp.z += heads[b * 3 + 2];
      acc.addScaledVector(tmp, w);
    }
    pos[vi * 3] = acc.x; pos[vi * 3 + 1] = acc.y; pos[vi * 3 + 2] = acc.z;
  }
  return pos;
}

let skelCache: MhSkeleton | null = null; let weightCache: Map<string, [number, number][]> | null = null;
function skel(): MhSkeleton { return (skelCache ??= loadSkeleton()); }
function mhWeights() { return (weightCache ??= loadWeights()); }

function mapBone(mh: string): string {
  const s = skel();
  let cur: string | null = mh;
  while (cur) {
    const m = WEIGHT_LOOKUP.get(cur); if (m) return m;
    cur = s.bones.get(cur)?.parent ?? null;
  }
  return 'Hips';
}

/** Merge MakeHuman weights into the Mixamo bones; vertices without weights copy their nearest weighted vertex. */
function buildWeights(pos: Float32Array): { joints: Uint8Array; weights: Float32Array } {
  const n = base().nVerts;
  const acc: Map<number, number>[] = new Array(n);
  for (const [bone, list] of mhWeights()) {
    const bi = BONE_INDEX.get(mapBone(bone))!;
    for (const [vi, w] of list) { (acc[vi] ??= new Map()).set(bi, ((acc[vi]?.get(bi)) ?? 0) + w); }
  }
  const joints = new Uint8Array(n * 4); const weights = new Float32Array(n * 4);
  const weighted: number[] = [];
  const fill = (vi: number, m: Map<number, number>) => {
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0; for (const [, w] of arr) s += w;
    for (let k = 0; k < 4; k++) { joints[vi * 4 + k] = arr[k]?.[0] ?? 0; weights[vi * 4 + k] = arr[k] ? arr[k][1] / s : 0; }
  };
  for (let vi = 0; vi < n; vi++) if (acc[vi] && acc[vi].size) { fill(vi, acc[vi]); weighted.push(vi); }
  // nearest weighted vertex for the rest (helpers without weights) — coarse grid for speed
  const cell = 0.05; const grid = new Map<string, number[]>();
  const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const vi of weighted) { const k = key(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(vi); }
  for (let vi = 0; vi < n; vi++) {
    if (acc[vi] && acc[vi].size) continue;
    const x = pos[vi * 3], y = pos[vi * 3 + 1], z = pos[vi * 3 + 2];
    let best = -1, bd = Infinity;
    for (let r = 1; r <= 6 && best < 0; r++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
        const a = grid.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!a) continue;
        for (const wi of a) { const d = (pos[wi * 3] - x) ** 2 + (pos[wi * 3 + 1] - y) ** 2 + (pos[wi * 3 + 2] - z) ** 2; if (d < bd) { bd = d; best = wi; } }
      }
    }
    if (best < 0) best = weighted[0];
    for (let k = 0; k < 4; k++) { joints[vi * 4 + k] = joints[best * 4 + k]; weights[vi * 4 + k] = weights[best * 4 + k]; }
  }
  return { joints, weights };
}

/** Joint positions of the Mixamo bones from the morphed (A-pose) MakeHuman mesh, metres. */
function mixamoHeads(posM: Float32Array, groundDm: number): Float32Array {
  const s = skel();
  const dm = new Float64Array(posM.length);
  for (let i = 0; i < posM.length; i += 3) { dm[i] = posM[i] / DM; dm[i + 1] = posM[i + 1] / DM + groundDm; dm[i + 2] = posM[i + 2] / DM; }
  const J = (joint: string): Vector3 => { const idx = s.joints.get(joint); if (!idx) throw new Error(`no joint ${joint}`); const p = jointPosition(dm, idx); return new Vector3(p[0] * DM, (p[1] - groundDm) * DM, p[2] * DM); };
  const head = (bone: string) => J(s.bones.get(bone)!.head); const tail = (bone: string) => J(s.bones.get(bone)!.tail);
  const H = new Map<string, Vector3>();
  H.set('Hips', head('spine05')); H.set('Spine', head('spine03')); H.set('Spine1', head('spine02')); H.set('Spine2', head('spine01'));
  H.set('Neck', head('neck01')); H.set('Head', head('head')); H.set('HeadTop_End', tail('head')); H.set('Jaw', head('jaw'));
  H.set('LeftEye', head('eye.L')); H.set('RightEye', head('eye.R'));
  const fingers = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
  for (const [s1, S] of [['L', 'Left'], ['R', 'Right']] as const) {
    H.set(`${S}Shoulder`, head(`clavicle.${s1}`)); H.set(`${S}Arm`, head(`upperarm01.${s1}`)); H.set(`${S}ForeArm`, head(`lowerarm01.${s1}`)); H.set(`${S}Hand`, head(`wrist.${s1}`));
    for (let f = 1; f <= 5; f++) { for (let k = 1; k <= 3; k++) H.set(`${S}Hand${fingers[f - 1]}${k}`, head(`finger${f}-${k}.${s1}`)); H.set(`${S}Hand${fingers[f - 1]}4`, tail(`finger${f}-3.${s1}`)); }
    H.set(`${S}UpLeg`, head(`upperleg01.${s1}`)); H.set(`${S}Leg`, head(`lowerleg01.${s1}`)); H.set(`${S}Foot`, head(`foot.${s1}`));
    const tb = new Vector3(), te = new Vector3();
    for (let t = 1; t <= 5; t++) { tb.add(head(`toe${t}-1.${s1}`)); te.add(tail(`toe${t}-${t === 1 ? 2 : 3}.${s1}`)); }
    H.set(`${S}ToeBase`, tb.multiplyScalar(0.2)); H.set(`${S}Toe_End`, te.multiplyScalar(0.2));
  }
  const out = new Float32Array(N_BONES * 3);
  for (let i = 0; i < N_BONES; i++) { const v = H.get(BONES[i].name); if (!v) throw new Error(`no head for ${BONES[i].name}`); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
  return out;
}

/** T-pose alignment list: bone → desired world direction of (child − head), processed in hierarchy order. */
const ALIGN: { bone: string; child: string; dir: [number, number, number] }[] = [];
for (const [S, sx] of [['Left', 1], ['Right', -1]] as const) {
  ALIGN.push({ bone: `${S}Arm`, child: `${S}ForeArm`, dir: [sx, 0, 0] }, { bone: `${S}ForeArm`, child: `${S}Hand`, dir: [sx, 0, 0] }, { bone: `${S}Hand`, child: `${S}HandMiddle1`, dir: [sx, 0, 0] });
  ALIGN.push({ bone: `${S}UpLeg`, child: `${S}Leg`, dir: [0, -1, 0] }, { bone: `${S}Leg`, child: `${S}Foot`, dir: [0, -1, 0] });
}

function subtree(bone: number): number[] {
  const out: number[] = [];
  const stack = [bone];
  while (stack.length) { const b = stack.pop()!; out.push(b); for (let i = 0; i < N_BONES; i++) if (BONE_PARENT[i] === b) stack.push(i); }
  return out;
}

export function buildRig(posA: Float32Array, groundDm: number): Rig {
  const headsA = mixamoHeads(posA, groundDm);
  const { joints, weights } = buildWeights(posA);
  const n = base().nVerts;
  // world rotation per bone accumulated while re-posing
  const rot: Quaternion[] = []; for (let i = 0; i < N_BONES; i++) rot.push(new Quaternion());
  const heads = Float32Array.from(headsA);
  const H = (i: number) => new Vector3(heads[i * 3], heads[i * 3 + 1], heads[i * 3 + 2]);
  const applyRot = (bone: number, q: Quaternion) => {
    const pivot = H(bone);
    for (const b of subtree(bone)) {
      rot[b].premultiply(q);
      if (b !== bone) { const p = H(b).sub(pivot).applyQuaternion(q).add(pivot); heads[b * 3] = p.x; heads[b * 3 + 1] = p.y; heads[b * 3 + 2] = p.z; }
    }
  };
  for (const a of ALIGN) {
    const bi = BONE_INDEX.get(a.bone)!, ci = BONE_INDEX.get(a.child)!;
    const cur = H(ci).sub(H(bi)).normalize(); const want = new Vector3(...a.dir);
    applyRot(bi, new Quaternion().setFromUnitVectors(cur, want));
  }
  // palm roll: rotate each whole arm about its own axis so the palm faces down (−Y) like Mixamo's T-pose
  for (const [S, sx] of [['Left', 1], ['Right', -1]] as const) {
    const hand = BONE_INDEX.get(`${S}Hand`)!, arm = BONE_INDEX.get(`${S}Arm`)!;
    const i1 = BONE_INDEX.get(`${S}HandIndex1`)!, p1 = BONE_INDEX.get(`${S}HandPinky1`)!, m1 = BONE_INDEX.get(`${S}HandMiddle1`)!, m3 = BONE_INDEX.get(`${S}HandMiddle3`)!, m2 = BONE_INDEX.get(`${S}HandMiddle2`)!;
    // palm normal: hand plane normal, signed so it points to the side the middle finger curls towards
    const across = H(i1).sub(H(p1)); const along = H(m1).sub(H(hand));
    const nrm = new Vector3().crossVectors(along, across).normalize();
    const curl = H(m3).sub(H(m2)).sub(H(m2).sub(H(m1))); // second difference ≈ curl direction
    if (curl.dot(nrm) < 0) nrm.negate();
    const axis = new Vector3(sx, 0, 0);
    // project the palm normal onto the plane ⟂ axis and rotate it onto −Y
    const np = nrm.clone().sub(axis.clone().multiplyScalar(nrm.dot(axis))).normalize();
    const target = new Vector3(0, -1, 0);
    let ang = Math.atan2(new Vector3().crossVectors(np, target).dot(axis), np.dot(target));
    applyRot(arm, new Quaternion().setFromAxisAngle(axis, ang));
  }
  // skin all vertices from A-pose into the T-pose with the accumulated rigid bone transforms
  const pos = new Float32Array(posA.length);
  const v = new Vector3(), acc = new Vector3(), tmp = new Vector3();
  for (let vi = 0; vi < n; vi++) {
    v.set(posA[vi * 3], posA[vi * 3 + 1], posA[vi * 3 + 2]); acc.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = weights[vi * 4 + k]; if (w <= 0) continue;
      const b = joints[vi * 4 + k];
      tmp.set(v.x - headsA[b * 3], v.y - headsA[b * 3 + 1], v.z - headsA[b * 3 + 2]).applyQuaternion(rot[b]);
      tmp.x += heads[b * 3]; tmp.y += heads[b * 3 + 1]; tmp.z += heads[b * 3 + 2];
      acc.addScaledVector(tmp, w);
    }
    pos[vi * 3] = acc.x; pos[vi * 3 + 1] = acc.y; pos[vi * 3 + 2] = acc.z;
  }
  return { heads, joints, weights, pos, tposeRot: rot, headsA };
}

/** Bone length helper (metres) in the bind pose. */
export function boneLength(rig: Rig, bone: string, child: string): number {
  const a = BONE_INDEX.get(bone)!, b = BONE_INDEX.get(child)!;
  return Math.hypot(rig.heads[a * 3] - rig.heads[b * 3], rig.heads[a * 3 + 1] - rig.heads[b * 3 + 1], rig.heads[a * 3 + 2] - rig.heads[b * 3 + 2]);
}
