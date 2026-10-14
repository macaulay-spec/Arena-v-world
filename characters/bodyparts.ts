/**
 * Body parts: skin mesh (with hidden-under-clothes faces removed and baked cavity shading),
 * procedural eyeballs and the mouth interior (teeth, tongue) from MakeHuman helper geometry.
 */
import { base } from './body';
import { BONE_INDEX, type Rig } from './rig';
import { partFromFaces, faceNormals, newPart, type Part, type SkinSource } from './mesh';
import type { MhFace } from './mh/load';

export interface BodyBuild { skin: Part; eyes: Part; mouth: Part; src: SkinSource; cavity: Float32Array; normals: Float32Array }

/** Per-vertex cavity term (0 = flat/convex, 1 = deep concavity) for faces of the body group. */
export function cavity(rig: Rig, faces: MhFace[], normals: Float32Array): Float32Array {
  const b = base(); const n = b.nVerts; const P = rig.pos;
  const nb: Map<number, Set<number>> = new Map();
  for (const f of faces) for (let i = 0; i < f.v.length; i++) { const a = f.v[i], c = f.v[(i + 1) % f.v.length]; (nb.get(a) ?? nb.set(a, new Set()).get(a)!).add(c); (nb.get(c) ?? nb.set(c, new Set()).get(c)!).add(a); }
  const out = new Float32Array(n);
  for (const [v, set] of nb) {
    let mx = 0, my = 0, mz = 0, len = 0;
    for (const u of set) { mx += P[u * 3]; my += P[u * 3 + 1]; mz += P[u * 3 + 2]; len += Math.hypot(P[u * 3] - P[v * 3], P[u * 3 + 1] - P[v * 3 + 1], P[u * 3 + 2] - P[v * 3 + 2]); }
    const k = set.size; mx = mx / k - P[v * 3]; my = my / k - P[v * 3 + 1]; mz = mz / k - P[v * 3 + 2]; len /= k || 1;
    const d = (mx * normals[v * 3] + my * normals[v * 3 + 1] + mz * normals[v * 3 + 2]) / (len || 1); // >0 concave
    out[v] = Math.max(0, Math.min(1, d * 6));
  }
  // one smoothing pass
  const sm = new Float32Array(n);
  for (const [v, set] of nb) { let s = out[v] * 2, c = 2; for (const u of set) { s += out[u]; c++; } sm[v] = s / c; }
  return sm;
}

/** Build a UV sphere eyeball with the iris on the +Z pole. */
function eyeball(cx: number, cy: number, cz: number, r: number, bone: number, mat: string, name: string): Part {
  const p = newPart(name, mat); const seg = 16, rings = 10;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings, phi = t * Math.PI; // 0 at +Z pole (iris) … π at back
    for (let j = 0; j <= seg; j++) {
      const th = (j / seg) * Math.PI * 2;
      const x = Math.sin(phi) * Math.cos(th), y = Math.sin(phi) * Math.sin(th), z = Math.cos(phi);
      // slight corneal bulge on the front cap
      const bulge = 1 + 0.06 * Math.max(0, Math.cos(phi * 2.2));
      p.pos.push(cx + x * r * bulge, cy + y * r * bulge, cz + z * r * bulge); p.nrm.push(x, y, z);
      p.uv.push(j / seg, t); p.joints.push(bone, 0, 0, 0); p.weights.push(1, 0, 0, 0); p.src!.push(-1);
    }
  }
  for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
    const a = i * (seg + 1) + j, bq = a + seg + 1;
    p.idx.push(a, bq, a + 1, a + 1, bq, bq + 1);
  }
  return p;
}

export function buildBody(rig: Rig, opts: { hidden?: Set<number>; skinMaterial: string; eyeMaterial: string; mouthMaterial: string }): BodyBuild {
  const b = base(); const faces = b.byGroup.get('body')!;
  const normals = faceNormals(rig.pos, faces, b.nVerts);
  const cav = cavity(rig, faces, normals);
  const src: SkinSource = { pos: rig.pos, nrm: normals, uv: b.uv, joints: rig.joints, weights: rig.weights };
  const hidden = opts.hidden ?? new Set<number>();
  const skin = partFromFaces('skin', opts.skinMaterial, src, faces, {
    keep: f => !f.v.every(v => hidden.has(v)),
    color: vi => { const k = 1 - 0.55 * cav[vi]; return [k, k, k]; },
  });
  // eyes
  const eyes = newPart('eyes', opts.eyeMaterial);
  for (const [side, grp] of [['Left', 'helper-l-eye'], ['Right', 'helper-r-eye']] as const) {
    const bi = BONE_INDEX.get(`${side}Eye`)!;
    const cx = rig.heads[bi * 3], cy = rig.heads[bi * 3 + 1], cz = rig.heads[bi * 3 + 2];
    // radius from the helper sphere
    let r = 0, n = 0; for (const f of b.byGroup.get(grp)!) for (const v of f.v) { r += Math.hypot(rig.pos[v * 3] - cx, rig.pos[v * 3 + 1] - cy, rig.pos[v * 3 + 2] - cz); n++; }
    r = (r / (n || 1)) * 0.98;
    const e = eyeball(cx, cy, cz, r, bi, opts.eyeMaterial, `eye_${side}`);
    const off = eyes.pos.length / 3; eyes.pos.push(...e.pos); eyes.nrm.push(...e.nrm); eyes.uv.push(...e.uv); eyes.joints.push(...e.joints); eyes.weights.push(...e.weights); eyes.src!.push(...e.src!); for (const i of e.idx) eyes.idx.push(i + off);
  }
  // mouth interior: teeth + tongue from helpers, coloured by vertex colour
  const mouthFaces = [...b.byGroup.get('helper-upper-teeth')!, ...b.byGroup.get('helper-lower-teeth')!, ...b.byGroup.get('helper-tongue')!];
  const tongueVerts = new Set<number>(); for (const f of b.byGroup.get('helper-tongue')!) for (const v of f.v) tongueVerts.add(v);
  const mNormals = faceNormals(rig.pos, mouthFaces, b.nVerts);
  const head = BONE_INDEX.get('Head')!, jaw = BONE_INDEX.get('Jaw')!;
  const lowerVerts = new Set<number>(); for (const f of [...b.byGroup.get('helper-lower-teeth')!, ...b.byGroup.get('helper-tongue')!]) for (const v of f.v) lowerVerts.add(v);
  const mj = new Uint8Array(rig.joints), mw = new Float32Array(rig.weights);
  for (const f of mouthFaces) for (const v of f.v) { const bone = lowerVerts.has(v) ? jaw : head; mj[v * 4] = bone; mw[v * 4] = 1; for (let k = 1; k < 4; k++) { mj[v * 4 + k] = 0; mw[v * 4 + k] = 0; } }
  const mouth = partFromFaces('mouth', opts.mouthMaterial, { pos: rig.pos, nrm: mNormals, uv: b.uv, joints: mj, weights: mw }, mouthFaces, {
    color: vi => tongueVerts.has(vi) ? [0.72, 0.28, 0.3] : [0.96, 0.94, 0.88],
  });
  return { skin, eyes, mouth, src, cavity: cav, normals };
}
