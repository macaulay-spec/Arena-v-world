/**
 * Procedural animation clips for the Mixamo-convention rig.  All bind-pose bone frames are
 * world-aligned (x = character's left, y = up, z = forward), so each bone's local rotation is
 * authored as ordered rotations about those axes.  Clips are sampled at 30 fps and exported to
 * one shared glTF library; runtimes retarget the Hips translation by character height.
 */
import { BONES, BONE_INDEX, BONE_PARENT, N_BONES } from './rig';
import type { AnimClip, AnimTrack } from './gltf';

export type Quat = [number, number, number, number]; // x y z w
const D = Math.PI / 180;
export const qId = (): Quat => [0, 0, 0, 1];
export function qAxis(axis: 'x' | 'y' | 'z', deg: number): Quat { const h = deg * D * 0.5, s = Math.sin(h); return [axis === 'x' ? s : 0, axis === 'y' ? s : 0, axis === 'z' ? s : 0, Math.cos(h)]; }
export function qMul(a: Quat, b: Quat): Quat { // a ⊗ b (apply b first, then a)
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0], a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
/** ordered world-axis rotations: rot('z', -75, 'x', 20) applies z first, then x */
export function rot(...args: (string | number)[]): Quat { let q = qId(); for (let i = 0; i + 1 < args.length; i += 2) q = qMul(qAxis(args[i] as 'x' | 'y' | 'z', args[i + 1] as number), q); return q; }
export function qRotate(q: Quat, v: number[]): number[] { const [x, y, z, w] = q; const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2], iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2]; return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x]; }

export interface Pose { rot: Map<string, Quat>; hips: [number, number, number] } // hips = translation offset from rest (metres, 1.75 m reference)
const L = (name: string) => `Left${name}`, R = (name: string) => `Right${name}`;
const sm = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const tri = (p: number) => 1 - Math.abs(((p % 1) + 1) % 1 * 2 - 1); // 0..1..0

/** Arms hanging naturally (T-pose → rest); `spread` degrees away from the body, `fwd` forward tilt. */
function armsDown(p: Pose, o: { spread?: number; fwd?: number; elbow?: number; swingL?: number; swingR?: number; elbowL?: number; elbowR?: number } = {}): void {
  const spread = o.spread ?? 12, fwd = o.fwd ?? 4, elbow = o.elbow ?? 14;
  p.rot.set(L('Arm'), rot('z', -(90 - spread), 'x', -(fwd + (o.swingL ?? 0))));
  p.rot.set(R('Arm'), rot('z', 90 - spread, 'x', -(fwd + (o.swingR ?? 0))));
  p.rot.set(L('ForeArm'), rot('y', -(o.elbowL ?? elbow)));
  p.rot.set(R('ForeArm'), rot('y', o.elbowR ?? elbow));
  p.rot.set(L('Hand'), rot('z', -6)); p.rot.set(R('Hand'), rot('z', 6));
  fingers(p, 18);
}
function fingers(p: Pose, curl: number, thumb = 8): void {
  for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) { p.rot.set(L(`Hand${f}${k}`), rot('z', -curl * (k === 1 ? 0.8 : 1))); p.rot.set(R(`Hand${f}${k}`), rot('z', curl * (k === 1 ? 0.8 : 1))); }
  for (let k = 1; k <= 3; k++) { p.rot.set(L(`HandThumb${k}`), rot('y', -thumb)); p.rot.set(R(`HandThumb${k}`), rot('y', thumb)); }
}
function legs(p: Pose, o: { thighL: number; thighR: number; kneeL: number; kneeR: number; footL?: number; footR?: number; spreadDeg?: number; toeL?: number; toeR?: number }): void {
  const spread = o.spreadDeg ?? 2;
  p.rot.set(L('UpLeg'), rot('x', -o.thighL, 'z', spread)); p.rot.set(R('UpLeg'), rot('x', -o.thighR, 'z', -spread));
  p.rot.set(L('Leg'), rot('x', o.kneeL)); p.rot.set(R('Leg'), rot('x', o.kneeR));
  p.rot.set(L('Foot'), rot('x', o.footL ?? 0)); p.rot.set(R('Foot'), rot('x', o.footR ?? 0));
  // toes bend up at push-off so the toe segment stays flat on the ground while the heel lifts
  p.rot.set(L('ToeBase'), rot('x', -(o.toeL ?? 0))); p.rot.set(R('ToeBase'), rot('x', -(o.toeR ?? 0)));
}
function lerpCurve(pts: [number, number][], x: number): number {
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return y0 + (y1 - y0) * ((x - x0) / (x1 - x0 || 1)); }
  return pts[pts.length - 1][1];
}
/**
 * Foot and toe angles for one leg of a gait cycle. q = gait phase of that foot (0 = heel strike, ≈0.5 = toe-off,
 * 0.5–1 = swing). The foot is driven to a world pitch (toes-down positive) — flat during stance, heel rising into
 * push-off, toes up before the next heel strike — by subtracting the shank pitch (thigh back + knee flex).
 * Toes bend up during push-off so the toe segment stays on the ground while the heel lifts.
 */
const WALK_PITCH: [number, number][] = [[0, -12], [0.12, 0], [0.38, 0], [0.5, 28], [0.6, 22], [0.8, -5], [1, -12]];
function footAngles(thighFwd: number, knee: number, q: number, scale = 1): { foot: number; toe: number } {
  const qq = ((q % 1) + 1) % 1;
  const world = lerpCurve(WALK_PITCH, qq) * scale;
  const foot = world - (-thighFwd + knee);
  const onGround = qq < 0.33 ? 0 : qq < 0.42 ? (qq - 0.33) / 0.09 : qq < 0.55 ? 1 : qq < 0.65 ? 1 - (qq - 0.55) / 0.1 : 0;
  return { foot, toe: Math.max(0, world - 2) * onGround };
}
function breathing(p: Pose, t: number, period = 3.4, amp = 1): void {
  const b = Math.sin((t / period) * Math.PI * 2);
  p.rot.set('Spine1', qMul(p.rot.get('Spine1') ?? qId(), rot('x', -1.2 * amp * b)));
  p.rot.set('Spine2', qMul(p.rot.get('Spine2') ?? qId(), rot('x', 1.0 * amp * b)));
  p.rot.set('Neck', qMul(p.rot.get('Neck') ?? qId(), rot('x', 0.6 * amp * b)));
}

// ---- clip definitions (t in seconds) -------------------------------------------------------------
export interface ClipDef { name: string; duration: number; loop: boolean; pose: (t: number, seed: number) => Pose }
const base = (): Pose => ({ rot: new Map(), hips: [0, 0, 0] });

export const CLIPS: ClipDef[] = [
  {
    name: 'idle', duration: 4, loop: true, pose: (t, s) => {
      const p = base(); const w = Math.sin((t / 4) * Math.PI * 2 + s), w2 = Math.sin((t / 4) * Math.PI * 4 + s * 1.7);
      armsDown(p, { spread: 11 + w * 1.2, fwd: 5, elbow: 16 + w2 * 2 });
      legs(p, { thighL: 1 + w * 1.0, thighR: -1 - w * 1.0, kneeL: 3, kneeR: 3, spreadDeg: 4 });
      p.rot.set('Hips', rot('z', w * 1.6, 'y', w2 * 1.0)); p.hips = [w * 0.006, -0.002 + 0.002 * w2, 0];
      p.rot.set('Spine', rot('z', -w * 1.2)); p.rot.set('Spine1', rot('x', 1.5)); p.rot.set('Spine2', rot('x', 1.0));
      p.rot.set('Neck', rot('x', 2)); p.rot.set('Head', rot('y', Math.sin(t * 0.7 + s) * 6, 'x', Math.sin(t * 0.5 + s * 2) * 2.5, 'z', w * 1.5));
      breathing(p, t);
      return p;
    },
  },
  {
    name: 'idle_talk', duration: 4, loop: true, pose: (t, s) => {
      const p = CLIPS[0].pose(t, s);
      const g = Math.max(0, Math.sin((t / 2) * Math.PI * 2 + s)); const beat = Math.sin(t * 7 + s) * 0.5 + 0.5;
      // right arm gestures at waist height, left arm subtle
      p.rot.set(R('Arm'), rot('z', 70, 'x', -25 - g * 15, 'y', 10)); p.rot.set(R('ForeArm'), rot('y', 75 + g * 30 + beat * 10, 'z', -10));
      p.rot.set(R('Hand'), rot('z', 10 - beat * 25, 'x', -20));
      p.rot.set(L('Arm'), rot('z', -78, 'x', -10 - g * 6)); p.rot.set(L('ForeArm'), rot('y', -(45 + g * 25)));
      p.rot.set('Head', rot('y', Math.sin(t * 1.3 + s) * 8, 'x', -3 + Math.sin(t * 5.1 + s) * 3.5, 'z', Math.sin(t * 0.9) * 3));
      p.rot.set('Spine2', rot('x', 1.5, 'y', Math.sin(t * 1.3 + s) * 3));
      fingers(p, 10);
      return p;
    },
  },
  {
    name: 'walk', duration: 1.1, loop: true, pose: (t, s) => {
      const p = base(); const ph = (t / 1.1) % 1; const c = Math.cos(ph * Math.PI * 2), sn = Math.sin(ph * Math.PI * 2);
      const thigh = 23; const thL = c * thigh + 3, thR = -c * thigh + 3;
      // knee flexes during swing (when the thigh moves forward) and slightly at contact
      const kneeOf = (phase: number) => { const sw = Math.max(0, Math.sin(phase * Math.PI * 2)); return 7 + 46 * sw * sw; };
      const kL = kneeOf(ph + 0.5), kR = kneeOf(ph);
      const aL = footAngles(thL, kL, ph), aR = footAngles(thR, kR, ph + 0.5);
      legs(p, { thighL: thL, thighR: thR, kneeL: kL, kneeR: kR, footL: aL.foot, footR: aR.foot, spreadDeg: 2, toeL: aL.toe, toeR: aR.toe });
      armsDown(p, { spread: 9, fwd: 2, swingL: -c * 20, swingR: c * 20, elbowL: 18 + Math.max(0, -c) * 16, elbowR: 18 + Math.max(0, c) * 16 });
      const bob = -0.016 - 0.016 * Math.cos(ph * Math.PI * 4);
      p.hips = [sn * 0.012, bob, 0];
      p.rot.set('Hips', rot('y', -sn * 5, 'z', sn * 3, 'x', 2)); p.rot.set('Spine', rot('y', sn * 2.5, 'z', -sn * 2)); p.rot.set('Spine1', rot('x', 1, 'y', sn * 2.5)); p.rot.set('Spine2', rot('y', sn * 3, 'x', 1));
      p.rot.set('Neck', rot('y', -sn * 3)); p.rot.set('Head', rot('x', Math.cos(ph * Math.PI * 4) * 1.5, 'y', -sn * 2 + Math.sin(t * 0.6 + s) * 4));
      return p;
    },
  },
  {
    name: 'walk_carry', duration: 1.1, loop: true, pose: (t, s) => {
      const p = CLIPS[2].pose(t, s); const ph = (t / 1.1) % 1; const c = Math.cos(ph * Math.PI * 2);
      // left hand steadies a load on the head; right arm swings lightly
      p.rot.set(L('Arm'), rot('z', 50, 'x', 0, 'y', 15)); p.rot.set(L('ForeArm'), rot('z', 90, 'y', -30)); p.rot.set(L('Hand'), rot('z', 25, 'x', -10));
      p.rot.set(R('Arm'), rot('z', 80, 'x', -(4 + c * 8))); p.rot.set(R('ForeArm'), rot('y', 20));
      p.hips = [p.hips[0] * 0.5, p.hips[1] * 0.6, 0]; // steadier gait
      p.rot.set('Head', rot('x', 0)); p.rot.set('Neck', rot('x', 0)); p.rot.set('Spine2', rot('x', -2));
      return p;
    },
  },
  {
    name: 'run', duration: 0.72, loop: true, pose: (t, s) => {
      const p = base(); const ph = (t / 0.72) % 1; const c = Math.cos(ph * Math.PI * 2), sn = Math.sin(ph * Math.PI * 2);
      const thigh = 40; const kneeOf = (phase: number) => { const sw = Math.max(0, Math.sin(phase * Math.PI * 2)); return 15 + 85 * sw * sw; };
      const thL = c * thigh + 8, thR = -c * thigh + 8, kL = kneeOf(ph + 0.5), kR = kneeOf(ph);
      const aL = footAngles(thL, kL, ph, 1.3), aR = footAngles(thR, kR, ph + 0.5, 1.3);
      legs(p, { thighL: thL, thighR: thR, kneeL: kL, kneeR: kR, footL: aL.foot, footR: aR.foot, toeL: aL.toe, toeR: aR.toe });
      p.rot.set(L('Arm'), rot('z', -72, 'x', -(10 - c * 35))); p.rot.set(R('Arm'), rot('z', 72, 'x', -(10 + c * 35)));
      p.rot.set(L('ForeArm'), rot('y', -95)); p.rot.set(R('ForeArm'), rot('y', 95)); fingers(p, 45);
      p.hips = [0, -0.06 + 0.05 * Math.abs(Math.sin(ph * Math.PI * 2)), 0];
      p.rot.set('Hips', rot('x', 8, 'y', -sn * 8)); p.rot.set('Spine', rot('x', 4, 'y', sn * 4)); p.rot.set('Spine1', rot('x', 3)); p.rot.set('Spine2', rot('x', 3, 'y', sn * 5));
      p.rot.set('Neck', rot('x', -8)); p.rot.set('Head', rot('x', -6));
      return p;
    },
  },
  {
    name: 'sit', duration: 4, loop: true, pose: (t, s) => {
      const p = base(); const w = Math.sin((t / 4) * Math.PI * 2 + s);
      legs(p, { thighL: 86, thighR: 84, kneeL: 88, kneeR: 86, footL: 2, footR: 2, spreadDeg: 8 });
      p.hips = [0, -0.42, -0.03];
      p.rot.set('Spine', rot('x', 4)); p.rot.set('Spine1', rot('x', 3)); p.rot.set('Spine2', rot('x', 2 + w));
      p.rot.set(L('Arm'), rot('z', -68, 'x', -36)); p.rot.set(R('Arm'), rot('z', 68, 'x', -36)); p.rot.set(L('ForeArm'), rot('y', -40)); p.rot.set(R('ForeArm'), rot('y', 40)); fingers(p, 25);
      p.rot.set('Head', rot('y', Math.sin(t * 0.6 + s) * 10, 'x', 3));
      breathing(p, t);
      return p;
    },
  },
  {
    name: 'phone', duration: 4, loop: true, pose: (t, s) => {
      const p = CLIPS[0].pose(t, s);
      p.rot.set(R('Arm'), rot('z', 80, 'x', -90, 'y', 15)); p.rot.set(R('ForeArm'), rot('y', 135, 'z', -20)); p.rot.set(R('Hand'), rot('z', -30, 'x', 15));
      for (let k = 1; k <= 3; k++) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) p.rot.set(R(`Hand${f}${k}`), rot('z', 55));
      p.rot.set('Head', rot('z', -9, 'y', 6 + Math.sin(t * 0.8 + s) * 4, 'x', 3));
      return p;
    },
  },
  {
    name: 'wave', duration: 2, loop: true, pose: (t, s) => {
      const p = CLIPS[0].pose(t, s); const w = Math.sin(t * Math.PI * 2 * 1.5 + s);
      p.rot.set(R('Arm'), rot('z', -40, 'y', 0, 'x', -10)); p.rot.set(R('ForeArm'), rot('z', -60 + w * 22, 'y', 10)); p.rot.set(R('Hand'), rot('z', -w * 18));
      for (let k = 1; k <= 3; k++) for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) p.rot.set(R(`Hand${f}${k}`), rot('z', 4));
      p.rot.set('Head', rot('y', -8, 'x', -2, 'z', 2));
      return p;
    },
  },
  {
    name: 'sell', duration: 3, loop: true, pose: (t, s) => {
      const p = CLIPS[0].pose(t, s); const w = Math.sin((t / 3) * Math.PI * 2 + s), w2 = Math.sin((t / 3) * Math.PI * 4 + s);
      // both hands presenting goods at waist height, palms up, body turning to customers
      p.rot.set(L('Arm'), rot('z', -72, 'x', -30, 'y', -8)); p.rot.set(R('Arm'), rot('z', 72, 'x', -30 - Math.max(0, w) * 18, 'y', 8));
      p.rot.set(L('ForeArm'), rot('y', -85, 'x', 30)); p.rot.set(R('ForeArm'), rot('y', 85 + w2 * 8, 'x', -30));
      p.rot.set(L('Hand'), rot('x', 60)); p.rot.set(R('Hand'), rot('x', 60)); fingers(p, 12);
      p.rot.set('Spine1', rot('y', w * 10)); p.rot.set('Head', rot('y', w * 22, 'x', 4 + w2 * 3));
      return p;
    },
  },
];

// ---- sampling / export -------------------------------------------------------------------------
export function sampleClip(def: ClipDef, fps = 30, seed = 0): AnimClip {
  const n = Math.max(2, Math.round(def.duration * fps) + 1); const times = new Float32Array(n);
  const rots = new Map<string, Float32Array>(); const hips = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const t = def.loop ? (i / (n - 1)) * def.duration : (i / (n - 1)) * def.duration; times[i] = t;
    const pose = def.pose(def.loop && i === n - 1 ? 0 : t, seed);
    for (const [bone, q] of pose.rot) { let arr = rots.get(bone); if (!arr) { arr = new Float32Array(n * 4); for (let k = 0; k < n; k++) arr[k * 4 + 3] = 1; rots.set(bone, arr); } arr.set(q, i * 4); }
    hips.set(pose.hips, i * 3);
  }
  // keep quaternion continuity (avoid sign flips between frames)
  for (const arr of rots.values()) for (let i = 1; i < n; i++) { let d = 0; for (let k = 0; k < 4; k++) d += arr[i * 4 + k] * arr[(i - 1) * 4 + k]; if (d < 0) for (let k = 0; k < 4; k++) arr[i * 4 + k] *= -1; }
  const tracks: AnimTrack[] = [];
  for (const [bone, rotation] of rots) { if (!BONE_INDEX.has(bone)) throw new Error('unknown bone ' + bone); tracks.push({ bone, rotation }); }
  return { name: def.name, times, tracks, hipsOffset: hips };
}

/** Forward kinematics for tests / debugging: world joint positions for a pose. */
export function fk(heads: Float32Array, pose: Pose): Float32Array {
  const out = new Float32Array(N_BONES * 3); const worldQ: Quat[] = [];
  for (let i = 0; i < N_BONES; i++) {
    const p = BONE_PARENT[i]; const local = pose.rot.get(BONES[i].name) ?? qId();
    const t = p < 0 ? [heads[0] + pose.hips[0], heads[1] + pose.hips[1], heads[2] + pose.hips[2]] : [heads[i * 3] - heads[p * 3], heads[i * 3 + 1] - heads[p * 3 + 1], heads[i * 3 + 2] - heads[p * 3 + 2]];
    if (p < 0) { worldQ[i] = local; out.set(t, 0); }
    else { const r = qRotate(worldQ[p], t); worldQ[i] = qMul(worldQ[p], local); out[i * 3] = out[p * 3] + r[0]; out[i * 3 + 1] = out[p * 3 + 1] + r[1]; out[i * 3 + 2] = out[p * 3 + 2] + r[2]; }
  }
  return out;
}
