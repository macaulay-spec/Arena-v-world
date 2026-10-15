/**
 * Minimal glTF 2.0 writer for skinned characters: .gltf JSON + external .bin, shared external
 * textures, KHR_mesh_quantization for compact normals/uvs/weights, animations with LINEAR samplers.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, basename } from 'node:path';
import type { Part } from './mesh';
import { BONES, BONE_PARENT, N_BONES } from './rig';

export interface GltfMaterial { name: string; baseColor?: [number, number, number, number]; texture?: number; roughness?: number; metallic?: number; doubleSided?: boolean; emissive?: [number, number, number]; alphaMode?: 'OPAQUE' | 'MASK' | 'BLEND'; alphaCutoff?: number }
export interface AnimTrack { bone: string; rotation?: Float32Array; translation?: Float32Array }
export interface AnimClip { name: string; times: Float32Array; tracks: AnimTrack[]; /** Hips translation offsets from rest (metres) */ hipsOffset?: Float32Array }

export class GltfBuilder {
  private json: any = { asset: { version: '2.0', generator: 'V-WORLD character pipeline' }, extensionsUsed: ['KHR_mesh_quantization'], extensionsRequired: ['KHR_mesh_quantization'], scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], skins: [], materials: [], textures: [], images: [], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }], accessors: [], bufferViews: [], buffers: [], animations: [] };
  private chunks: Buffer[] = []; private byteLength = 0;
  private materialIndex = new Map<string, number>();
  private imageIndex = new Map<string, number>();
  boneNodes: number[] = [];
  skinIndex = -1;
  constructor(public extras?: any) { if (extras) this.json.asset.extras = extras; }

  private pad(n: number): void { const r = n % 4; if (r) { this.chunks.push(Buffer.alloc(4 - r)); this.byteLength += 4 - r; } }
  private view(buf: Buffer, target?: number, byteStride?: number): number {
    this.pad(0); const idx = this.json.bufferViews.length;
    const bv: any = { buffer: 0, byteOffset: this.byteLength, byteLength: buf.length }; if (target) bv.target = target; if (byteStride) bv.byteStride = byteStride;
    this.json.bufferViews.push(bv); this.chunks.push(buf); this.byteLength += buf.length; this.pad(this.byteLength); return idx;
  }
  private accessor(bufferView: number, componentType: number, count: number, type: string, opts: { normalized?: boolean; min?: number[]; max?: number[] } = {}): number {
    const a: any = { bufferView, componentType, count, type }; if (opts.normalized) a.normalized = true; if (opts.min) a.min = opts.min; if (opts.max) a.max = opts.max;
    this.json.accessors.push(a); return this.json.accessors.length - 1;
  }

  image(uri: string): number {
    let t = this.imageIndex.get(uri); if (t !== undefined) return t;
    this.json.images.push({ uri }); this.json.textures.push({ sampler: 0, source: this.json.images.length - 1 });
    t = this.json.textures.length - 1; this.imageIndex.set(uri, t); return t;
  }
  material(m: GltfMaterial): number {
    const ex = this.materialIndex.get(m.name); if (ex !== undefined) return ex;
    const pbr: any = { baseColorFactor: m.baseColor ?? [1, 1, 1, 1], metallicFactor: m.metallic ?? 0, roughnessFactor: m.roughness ?? 0.8 };
    if (m.texture !== undefined) pbr.baseColorTexture = { index: m.texture, texCoord: 0 };
    const mat: any = { name: m.name, pbrMetallicRoughness: pbr, doubleSided: !!m.doubleSided };
    if (m.emissive) mat.emissiveFactor = m.emissive; if (m.alphaMode && m.alphaMode !== 'OPAQUE') { mat.alphaMode = m.alphaMode; if (m.alphaCutoff) mat.alphaCutoff = m.alphaCutoff; }
    this.json.materials.push(mat); const i = this.json.materials.length - 1; this.materialIndex.set(m.name, i); return i;
  }

  /** Create the bone hierarchy (rest rotation identity, translation = head − parent head) and the skin. */
  skeleton(heads: Float32Array, rootName = 'Armature'): number {
    const root = this.json.nodes.length; this.json.nodes.push({ name: rootName, children: [] });
    this.json.scenes[0].nodes.push(root);
    this.boneNodes = [];
    for (let i = 0; i < N_BONES; i++) {
      const p = BONE_PARENT[i];
      const t = p < 0 ? [heads[i * 3], heads[i * 3 + 1], heads[i * 3 + 2]] : [heads[i * 3] - heads[p * 3], heads[i * 3 + 1] - heads[p * 3 + 1], heads[i * 3 + 2] - heads[p * 3 + 2]];
      const idx = this.json.nodes.length; this.json.nodes.push({ name: `mixamorig:${BONES[i].name}`, translation: t });
      this.boneNodes.push(idx);
      if (p < 0) this.json.nodes[root].children.push(idx); else (this.json.nodes[this.boneNodes[p]].children ??= []).push(idx);
    }
    const ibm = new Float32Array(N_BONES * 16);
    for (let i = 0; i < N_BONES; i++) { ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -heads[i * 3], -heads[i * 3 + 1], -heads[i * 3 + 2], 1], i * 16); }
    const bv = this.view(Buffer.from(ibm.buffer)); const acc = this.accessor(bv, 5126, N_BONES, 'MAT4');
    this.json.skins.push({ name: 'Skin', inverseBindMatrices: acc, joints: this.boneNodes, skeleton: this.boneNodes[0] });
    this.skinIndex = this.json.skins.length - 1; this.rootNode = root;
    return root;
  }
  private rootNode = -1;

  /** Add a skinned mesh (one primitive per Part) as a child of the armature root. */
  skinnedMesh(name: string, parts: Part[], materials: Record<string, number>, extras?: any): number {
    const prims: any[] = [];
    for (const p of parts) {
      const n = p.pos.length / 3; if (!n || !p.idx.length) continue;
      const pos = Float32Array.from(p.pos);
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i * 3 + k]); max[k] = Math.max(max[k], pos[i * 3 + k]); }
      const nrm = new Int8Array(n * 4); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) nrm[i * 4 + k] = Math.round(Math.max(-1, Math.min(1, p.nrm[i * 3 + k])) * 127);
      // UVs inside [0,1] → normalised uint16; tiled planar UVs (garments, metres/tile) → float32
      let unit = true; for (let i = 0; i < n * 2; i++) if (p.uv[i] < 0 || p.uv[i] > 1) { unit = false; break; }
      const uv16 = unit ? new Uint16Array(n * 2) : null; if (uv16) for (let i = 0; i < n * 2; i++) uv16[i] = Math.round(Math.max(0, Math.min(1, p.uv[i])) * 65535);
      const uv32 = unit ? null : Float32Array.from(p.uv);
      const jo = new Uint8Array(n * 4); for (let i = 0; i < n * 4; i++) jo[i] = p.joints[i];
      const we = new Uint8Array(n * 4);
      for (let i = 0; i < n; i++) { // quantise weights so they still sum to 255
        const w = [0, 1, 2, 3].map(k => p.weights[i * 4 + k]); const s = w.reduce((a, b) => a + b, 0) || 1;
        const q = w.map(x => Math.round(x / s * 255)); let d = 255 - q.reduce((a, b) => a + b, 0); q[0] += d;
        for (let k = 0; k < 4; k++) we[i * 4 + k] = q[k];
      }
      const attrs: any = {
        POSITION: this.accessor(this.view(Buffer.from(pos.buffer), 34962), 5126, n, 'VEC3', { min, max }),
        NORMAL: this.accessor(this.view(Buffer.from(nrm.buffer), 34962, 4), 5120, n, 'VEC3', { normalized: true }),
        TEXCOORD_0: uv16 ? this.accessor(this.view(Buffer.from(uv16.buffer), 34962), 5123, n, 'VEC2', { normalized: true }) : this.accessor(this.view(Buffer.from(uv32!.buffer), 34962), 5126, n, 'VEC2'),
        JOINTS_0: this.accessor(this.view(Buffer.from(jo.buffer), 34962), 5121, n, 'VEC4'),
        WEIGHTS_0: this.accessor(this.view(Buffer.from(we.buffer), 34962), 5121, n, 'VEC4', { normalized: true }),
      };
      if (p.col) { const c = new Uint8Array(n * 4); for (let i = 0; i < n; i++) { for (let k = 0; k < 3; k++) c[i * 4 + k] = Math.round(Math.max(0, Math.min(1, p.col[i * 3 + k])) * 255); c[i * 4 + 3] = 255; } attrs.COLOR_0 = this.accessor(this.view(Buffer.from(c.buffer), 34962, 4), 5121, n, 'VEC3', { normalized: true }); }
      const big = n > 65535; const ib = big ? Uint32Array.from(p.idx) : Uint16Array.from(p.idx);
      const indices = this.accessor(this.view(Buffer.from(ib.buffer), 34963), big ? 5125 : 5123, p.idx.length, 'SCALAR');
      const mat = materials[p.material]; if (mat === undefined) throw new Error(`no material ${p.material}`);
      prims.push({ attributes: attrs, indices, material: mat, mode: 4, extras: { part: p.name } });
    }
    this.json.meshes.push({ name, primitives: prims });
    const node: any = { name, mesh: this.json.meshes.length - 1, skin: this.skinIndex }; if (extras) node.extras = extras;
    this.json.nodes.push(node); const ni = this.json.nodes.length - 1;
    this.json.nodes[this.rootNode].children.push(ni);
    return ni;
  }

  /** Static (unskinned) mesh node under the armature root, e.g. a prop pre-positioned in bind pose. */
  animation(clip: AnimClip, hipsRest?: number[]): void {
    const samplers: any[] = []; const channels: any[] = [];
    if (clip.hipsOffset && hipsRest) { const n = clip.times.length; const tr = new Float32Array(n * 3); for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) tr[i * 3 + k] = hipsRest[k] + clip.hipsOffset[i * 3 + k]; clip = { ...clip, tracks: [...clip.tracks.filter(t => t.bone !== 'Hips' || !t.translation), { bone: 'Hips', translation: tr, rotation: clip.tracks.find(t => t.bone === 'Hips')?.rotation }] }; }
    const tv = this.view(Buffer.from(clip.times.buffer.slice(clip.times.byteOffset, clip.times.byteOffset + clip.times.byteLength)));
    const tAcc = this.accessor(tv, 5126, clip.times.length, 'SCALAR', { min: [clip.times[0]], max: [clip.times[clip.times.length - 1]] });
    const boneIdx = new Map(BONES.map((b, i) => [b.name, i]));
    for (const tr of clip.tracks) {
      const bi = boneIdx.get(tr.bone); if (bi === undefined) throw new Error(`anim: unknown bone ${tr.bone}`);
      if (tr.rotation) {
        const q = new Int16Array(tr.rotation.length); for (let i = 0; i < q.length; i++) q[i] = Math.round(Math.max(-1, Math.min(1, tr.rotation[i])) * 32767);
        const acc = this.accessor(this.view(Buffer.from(q.buffer)), 5122, clip.times.length, 'VEC4', { normalized: true });
        samplers.push({ input: tAcc, output: acc, interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: this.boneNodes[bi], path: 'rotation' } });
      }
      if (tr.translation) {
        const acc = this.accessor(this.view(Buffer.from(tr.translation.buffer.slice(tr.translation.byteOffset, tr.translation.byteOffset + tr.translation.byteLength))), 5126, clip.times.length, 'VEC3');
        samplers.push({ input: tAcc, output: acc, interpolation: 'LINEAR' }); channels.push({ sampler: samplers.length - 1, target: { node: this.boneNodes[bi], path: 'translation' } });
      }
    }
    this.json.animations.push({ name: clip.name, samplers, channels });
  }

  write(gltfPath: string): { gltfBytes: number; binBytes: number } {
    mkdirSync(dirname(gltfPath), { recursive: true });
    const binName = basename(gltfPath).replace(/\.gltf$/, '.bin');
    const bin = Buffer.concat(this.chunks);
    this.json.buffers = [{ uri: binName, byteLength: bin.length }];
    if (!this.json.animations.length) delete this.json.animations;
    if (!this.json.skins.length) delete this.json.skins;
    const text = JSON.stringify(this.json);
    writeFileSync(gltfPath, text); writeFileSync(gltfPath.replace(/\.gltf$/, '.bin'), bin);
    return { gltfBytes: text.length, binBytes: bin.length };
  }
}
