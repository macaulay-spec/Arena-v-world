/**
 * Loaders for the packed CC0 MakeHuman source data in assets/source/makehuman/.
 * Units in the source are decimetres, +Y up, +Z front.  Everything here keeps those units;
 * body.ts converts to metres.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

export const MH_DIR = join(process.cwd(), 'assets', 'source', 'makehuman');

export interface MhFace { v: number[]; t: number[]; g: number }
export interface MhMesh {
  /** vertex positions, dm (x,y,z interleaved) */
  pos: Float64Array;
  nVerts: number;
  /** uvs (u,v interleaved), v already flipped so 0 = top (glTF convention) */
  uv: Float32Array;
  faces: MhFace[];
  groups: string[];
  /** faces by group name */
  byGroup: Map<string, MhFace[]>;
}

function readGz(name: string): Buffer { return gunzipSync(readFileSync(join(MH_DIR, name))); }

export function loadBaseMesh(): MhMesh {
  const text = readGz('base.obj.gz').toString('latin1');
  const pos: number[] = []; const uv: number[] = []; const faces: MhFace[] = []; const groups: string[] = [];
  const byGroup = new Map<string, MhFace[]>();
  let g = -1;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 2) continue;
    const c0 = line.charCodeAt(0), c1 = line.charCodeAt(1);
    if (c0 === 118 /* v */ && c1 === 32) {
      const p = line.split(/\s+/); pos.push(+p[1], +p[2], +p[3]);
    } else if (c0 === 118 && c1 === 116 /* vt */) {
      const p = line.split(/\s+/); uv.push(+p[1], 1 - +p[2]);
    } else if (c0 === 103 /* g */) {
      const name = line.slice(2).trim();
      let idx = groups.indexOf(name);
      if (idx < 0) { idx = groups.length; groups.push(name); byGroup.set(name, []); }
      g = idx;
    } else if (c0 === 102 /* f */ && c1 === 32) {
      const p = line.trim().split(/\s+/); const v: number[] = []; const t: number[] = [];
      for (let k = 1; k < p.length; k++) { const s = p[k].split('/'); v.push(+s[0] - 1); t.push(s[1] ? +s[1] - 1 : -1); }
      const f = { v, t, g }; faces.push(f); byGroup.get(groups[g])!.push(f);
    }
  }
  return { pos: Float64Array.from(pos), nVerts: pos.length / 3, uv: Float32Array.from(uv), faces, groups, byGroup };
}

export interface MhTarget { name: string; count: number; idx: Uint16Array; d: Float32Array }
export type TargetLib = Map<string, MhTarget>;

export function loadTargets(): TargetLib {
  const buf = readGz('targets.bin.gz');
  const hlen = buf.readUInt32LE(0);
  const header = JSON.parse(buf.subarray(4, 4 + hlen).toString('utf8')) as { targets: { name: string; count: number; scale: number; offset: number }[] };
  const base = 4 + hlen;
  const lib: TargetLib = new Map();
  for (const t of header.targets) {
    const o = base + t.offset;
    const idx = new Uint16Array(t.count); const d = new Float32Array(t.count * 3);
    for (let i = 0; i < t.count; i++) idx[i] = buf.readUInt16LE(o + i * 2);
    const o2 = o + t.count * 2;
    for (let i = 0; i < t.count * 3; i++) d[i] = buf.readInt16LE(o2 + i * 2) * t.scale;
    lib.set(t.name, { name: t.name, count: t.count, idx, d });
  }
  return lib;
}

/** out += w * target (positions in dm) */
export function applyTarget(out: Float64Array, t: MhTarget, w: number): void {
  if (Math.abs(w) < 1e-6) return;
  const { idx, d } = t;
  for (let i = 0, n = idx.length; i < n; i++) {
    const vi = idx[i] * 3, di = i * 3;
    out[vi] += d[di] * w; out[vi + 1] += d[di + 1] * w; out[vi + 2] += d[di + 2] * w;
  }
}

export interface MhBone { name: string; parent: string | null; head: string; tail: string; children: string[] }
export interface MhSkeleton {
  bones: Map<string, MhBone>;
  order: string[];               // parents before children
  joints: Map<string, number[]>; // joint name -> helper vertex indices (centroid = joint position)
}

export function loadSkeleton(): MhSkeleton {
  const j = JSON.parse(readGz('default.mhskel.gz').toString('utf8')) as { bones: Record<string, { head: string; tail: string; parent: string | null }>; joints: Record<string, number[]> };
  const bones = new Map<string, MhBone>();
  for (const [name, b] of Object.entries(j.bones)) bones.set(name, { name, parent: b.parent, head: b.head, tail: b.tail, children: [] });
  for (const b of bones.values()) if (b.parent) bones.get(b.parent)!.children.push(b.name);
  const order: string[] = [];
  const visit = (n: string) => { order.push(n); for (const c of bones.get(n)!.children) visit(c); };
  for (const b of bones.values()) if (!b.parent) visit(b.name);
  const joints = new Map<string, number[]>(Object.entries(j.joints));
  return { bones, order, joints };
}

/** bone name -> list of [vertexIndex, weight] */
export function loadWeights(): Map<string, [number, number][]> {
  const j = JSON.parse(readGz('default_weights.mhw.gz').toString('utf8')) as { weights: Record<string, [number, number][]> };
  return new Map(Object.entries(j.weights));
}

export function jointPosition(pos: Float64Array, idx: number[]): [number, number, number] {
  let x = 0, y = 0, z = 0;
  for (const i of idx) { x += pos[i * 3]; y += pos[i * 3 + 1]; z += pos[i * 3 + 2]; }
  const n = idx.length || 1; return [x / n, y / n, z / n];
}
