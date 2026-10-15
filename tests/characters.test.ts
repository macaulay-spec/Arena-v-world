/**
 * Verification of the character pipeline: deterministic population, rig conventions, glTF validity,
 * triangle / draw-call / byte budgets per LOD, garments outside the body, animation clips with feet
 * on the ground, and the committed data/characters.json manifest.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { population, DISTRICT_NAMES, type PopulationEntry } from '../characters/population';
import { assembleCharacter, type CharacterOutput } from '../characters/assemble';
import { morph } from '../characters/body';
import { base } from '../characters/body';
import { buildRig, BONES, BONE_INDEX, N_BONES } from '../characters/rig';
import { faceNormals } from '../characters/mesh';
import { CLIPS, sampleClip, fk } from '../characters/anim';

const BODY_VERTS = 13380; // MakeHuman "body" group: vertices 0 … 13379

let people: PopulationEntry[];
beforeAll(() => { people = population(); });

describe('population', () => {
  it('is deterministic with stable ids and valid roles / districts', () => {
    const again = population();
    expect(JSON.stringify(again.map(p => ({ ...p, extras: undefined })))).toBe(JSON.stringify(people.map(p => ({ ...p, extras: undefined }))));
    const ids = new Set(people.map(p => p.id));
    expect(ids.size).toBe(people.length);
    expect(people.length).toBeGreaterThanOrEqual(50);
    for (const p of people) {
      expect(p.id).toMatch(/^chr_[a-z_]+_\d+$/);
      expect(p.name).toBeTruthy(); expect(p.role).toBeTruthy(); expect(p.roleId).toBeTruthy();
      expect(p.districts.length).toBeGreaterThan(0);
      for (const d of p.districts) expect(DISTRICT_NAMES[d]).toBeTruthy();
      expect(p.outfit.length).toBeGreaterThan(0);
      expect(['f', 'm']).toContain(p.sex);
      expect(p.age).toBeGreaterThanOrEqual(5); expect(p.age).toBeLessThanOrEqual(90);
      expect(p.idle.length).toBeGreaterThan(0); expect(p.moving).toBeTruthy();
    }
  });
  it('covers every district', () => {
    const covered = new Set(people.flatMap(p => p.districts));
    for (const d of Object.keys(DISTRICT_NAMES)) expect(covered.has(d as keyof typeof DISTRICT_NAMES)).toBe(true);
  });
});

describe('rig', () => {
  it('has the 65 Mixamo bones (+ jaw and eyes) in T-pose with normalised skin weights', () => {
    expect(N_BONES).toBe(68); // 65 Mixamo bones + Jaw, LeftEye, RightEye
    expect(BONES[0].name).toBe('Hips');
    for (const n of ['Hips', 'Spine2', 'Neck', 'Head', 'LeftArm', 'RightHand', 'LeftUpLeg', 'RightToe_End', 'LeftHandThumb3', 'Jaw', 'LeftEye']) expect(BONE_INDEX.has(n)).toBe(true);
    const m = morph(people[0].body); const rig = buildRig(m.pos, m.groundDm);
    expect(rig.heads.length).toBe(68 * 3);
    const H = (n: string) => { const i = BONE_INDEX.get(n)! * 3; return [rig.heads[i], rig.heads[i + 1], rig.heads[i + 2]]; };
    // +X is the character's left, arms horizontal, legs down, head on top
    expect(H('LeftArm')[0]).toBeGreaterThan(0.08); expect(H('RightArm')[0]).toBeLessThan(-0.08);
    expect(Math.abs(H('LeftHand')[1] - H('LeftArm')[1])).toBeLessThan(0.12);
    expect(H('LeftFoot')[1]).toBeLessThan(0.15); expect(H('LeftFoot')[1]).toBeGreaterThan(0);
    expect(H('HeadTop_End')[1]).toBeGreaterThan(1.3); expect(H('HeadTop_End')[1]).toBeLessThan(2.1);
    // weights: 4 per vertex, sum to one, indices in range
    let minY = 1e9;
    for (let v = 0; v < BODY_VERTS; v++) {
      let s = 0; for (let k = 0; k < 4; k++) { s += rig.weights[v * 4 + k]; expect(rig.joints[v * 4 + k]).toBeLessThan(68); }
      expect(Math.abs(s - 1)).toBeLessThan(1e-3);
      minY = Math.min(minY, rig.pos[v * 3 + 1]);
    }
    // feet on the ground
    expect(Math.abs(minY)).toBeLessThan(0.02);
  });
});

describe('assembled characters', () => {
  let dir: string; const outs: CharacterOutput[] = []; const picks: PopulationEntry[] = [];
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'vw-chars-'));
    const want = ['market_woman', 'office_worker', 'schoolchild'];
    for (const w of want) { const p = people.find(p => p.roleId === w); if (p) picks.push(p); }
    expect(picks.length).toBe(3);
    for (const p of picks) outs.push(assembleCharacter(p, dir, { lods: true }));
  }, 120000);

  it('stays within the triangle, draw-call and byte budgets per LOD', () => {
    for (const o of outs) {
      expect(o.lodTris[0]).toBeLessThanOrEqual(34000);
      expect(o.lodTris[1]).toBeLessThanOrEqual(15000);
      expect(o.lodTris[2]).toBeLessThanOrEqual(6000);
      expect(o.lodTris[1]).toBeLessThan(o.lodTris[0] * 0.5);
      expect(o.lodTris[2]).toBeLessThan(o.lodTris[1] * 0.5);
      expect(o.draws).toBeLessThanOrEqual(14);
      expect(o.bytes).toBeLessThanOrEqual(1.4 * 1024 * 1024);
      expect(o.height).toBeGreaterThan(1.0); expect(o.height).toBeLessThan(2.1);
    }
  });

  it('writes valid glTF 2.0 with a 68-joint skin, LOD nodes and in-range accessors', () => {
    for (const o of outs) {
      const g = JSON.parse(readFileSync(join(dir, o.file), 'utf8'));
      expect(g.asset.version).toBe('2.0');
      expect(g.skins.length).toBe(1); expect(g.skins[0].joints.length).toBe(68);
      const names = new Set((g.nodes as { name?: string }[]).map(n => n.name));
      for (const l of ['LOD0', 'LOD1', 'LOD2']) expect(names.has(l)).toBe(true);
      const binPath = join(dir, g.buffers[0].uri); expect(existsSync(binPath)).toBe(true);
      expect(statSync(binPath).size).toBe(g.buffers[0].byteLength);
      for (const bv of g.bufferViews) expect(bv.byteOffset + bv.byteLength).toBeLessThanOrEqual(g.buffers[bv.buffer].byteLength);
      for (const a of g.accessors) { if (a.bufferView !== undefined) { const bv = g.bufferViews[a.bufferView]; expect(bv).toBeTruthy(); } expect(a.count).toBeGreaterThan(0); }
      for (const mesh of g.meshes) for (const p of mesh.primitives) {
        for (const k of ['POSITION', 'NORMAL', 'JOINTS_0', 'WEIGHTS_0']) expect(p.attributes[k]).toBeTypeOf('number');
        expect(p.indices).toBeTypeOf('number');
        const n = g.accessors[p.attributes.POSITION].count; const idx = g.accessors[p.indices];
        expect(idx.count % 3).toBe(0);
        expect(idx.max === undefined || idx.max[0] < n).toBe(true);
      }
    }
  });

  it('is byte-for-byte deterministic', () => {
    const d2 = mkdtempSync(join(tmpdir(), 'vw-chars2-'));
    try {
      const o = assembleCharacter(picks[0], d2, { lods: true });
      const a = readFileSync(join(dir, o.file.replace('.gltf', '.bin'))), b = readFileSync(join(d2, o.file.replace('.gltf', '.bin')));
      expect(a.equals(b)).toBe(true);
      expect(readFileSync(join(dir, o.file), 'utf8')).toBe(readFileSync(join(d2, o.file), 'utf8'));
    } finally { rmSync(d2, { recursive: true, force: true }); }
  }, 60000);

  it('keeps garments outside the body surface', () => {
    const b = base(); const bodyFaces = b.byGroup.get('body')!;
    for (const o of outs) {
      const nrm = faceNormals(o.rig.pos, bodyFaces, b.nVerts);
      // coarse grid over body vertices for nearest-neighbour lookups
      const cell = 0.03; const grid = new Map<string, number[]>();
      const key = (x: number, y: number, z: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
      for (let v = 0; v < BODY_VERTS; v++) { const k = key(o.rig.pos[v * 3], o.rig.pos[v * 3 + 1], o.rig.pos[v * 3 + 2]); const arr = grid.get(k) ?? []; arr.push(v); grid.set(k, arr); }
      let checked = 0, inside = 0, worst = 0;
      for (const part of o.parts) {
        // garment parts carry 'g_' materials; footwear is excluded (soles sit under the foot surface by design)
        if (!part.material.startsWith('g_') || /^(sandals|shoes|slippers|boots|heels|sneakers|flipflops|loafers)/.test(part.name)) continue;
        for (let i = 0; i < part.pos.length; i += 3 * 7) {
          const x = part.pos[i], y = part.pos[i + 1], z = part.pos[i + 2];
          // signed distance to the skin = median over the 6 nearest body vertices (robust in concave areas such as
          // between the thighs or under the arm where a single vertex normal is misleading)
          const near: { d: number; v: number }[] = [];
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const arr = grid.get(`${Math.floor(x / cell) + dx},${Math.floor(y / cell) + dy},${Math.floor(z / cell) + dz}`); if (!arr) continue;
            for (const v of arr) near.push({ d: (o.rig.pos[v * 3] - x) ** 2 + (o.rig.pos[v * 3 + 1] - y) ** 2 + (o.rig.pos[v * 3 + 2] - z) ** 2, v });
          }
          if (near.length < 3) continue;
          near.sort((a, b) => a.d - b.d);
          const sds = near.slice(0, 6).map(({ v }) => (x - o.rig.pos[v * 3]) * nrm[v * 3] + (y - o.rig.pos[v * 3 + 1]) * nrm[v * 3 + 1] + (z - o.rig.pos[v * 3 + 2]) * nrm[v * 3 + 2]).sort((a, b) => a - b);
          const sd = sds[Math.floor(sds.length / 2)];
          checked++; if (sd < -0.004) inside++; worst = Math.min(worst, sd);
        }
      }
      expect(checked).toBeGreaterThan(100);
      // ≥ 98 % of sampled garment vertices sit on or outside the skin, none deeper than 1.5 cm
      expect(inside / checked).toBeLessThan(0.02);
      expect(worst).toBeGreaterThan(-0.015);
    }
  });

  it('removes the temp dir', () => { rmSync(dir, { recursive: true, force: true }); expect(existsSync(dir)).toBe(false); });
});

describe('animation clips', () => {
  it('sample to normalised quaternion tracks on known bones and keep the feet near the ground', () => {
    const m = morph(people.find(p => p.sex === 'm')!.body); const rig = buildRig(m.pos, m.groundDm);
    const footBones = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase', 'LeftToe_End', 'RightToe_End'].map(n => BONE_INDEX.get(n)!);
    const footRest = Math.min(...footBones.map(i => rig.heads[i * 3 + 1]));
    expect(CLIPS.map(c => c.name)).toEqual(['idle', 'idle_talk', 'walk', 'walk_carry', 'run', 'sit', 'phone', 'wave', 'sell']);
    for (const def of CLIPS) {
      const clip = sampleClip(def, 30, 1);
      expect(clip.times.length).toBeGreaterThan(1);
      for (const t of clip.tracks) {
        expect(BONE_INDEX.has(t.bone)).toBe(true);
        const q = t.rotation!; for (let i = 0; i < q.length; i += 4) { const l = Math.hypot(q[i], q[i + 1], q[i + 2], q[i + 3]); expect(Math.abs(l - 1)).toBeLessThan(1e-3); }
      }
      if (def.name === 'sit') continue; // seated pose is authored for a bench, feet forward
      let lowest = 1e9, highest = -1e9;
      for (let k = 0; k <= 20; k++) {
        const pose = def.pose((k / 20) * def.duration, 1);
        const world = fk(rig.heads, pose);
        for (const i of footBones) { lowest = Math.min(lowest, world[i * 3 + 1]); highest = Math.max(highest, world[i * 3 + 1]); }
      }
      // no sinking through the pavement, no floating: the lowest foot joint stays within 3 cm of its rest height
      expect(lowest).toBeGreaterThan(footRest - 0.03);
      expect(lowest).toBeLessThan(footRest + 0.03);
      // swing feet lift but never above knee height (running kicks the heel higher)
      expect(highest).toBeLessThan(def.name === 'run' ? 0.75 : 0.45);
    }
  });
});

describe('data/characters.json', () => {
  it('is a valid committed manifest with stable ids, roles and district affinity', () => {
    const path = 'data/characters.json';
    expect(existsSync(path)).toBe(true);
    const d = JSON.parse(readFileSync(path, 'utf8'));
    expect(d.seed).toBe(20260419);
    expect(d.clips).toContain('walk');
    const ids = new Set<string>();
    for (const c of d.characters) {
      expect(ids.has(c.id)).toBe(false); ids.add(c.id);
      expect(c.id).toMatch(/^(chr_[a-z_]+_\d+|body_(fe)?male)$/);
      expect(c.file).toBe(c.id + '.gltf');
      expect(c.height).toBeGreaterThan(1.0); expect(c.height).toBeLessThan(1.98);
      if (c.age >= 18) expect(c.height).toBeGreaterThan(1.45);
      expect(c.lodTris.length).toBe(3);
      if (c.id.startsWith('chr_')) {
        expect(c.role).toBeTruthy(); expect(c.name).toBeTruthy();
        for (const n of c.districtNames) expect(Object.values(DISTRICT_NAMES)).toContain(n);
        expect(c.outfit.length).toBeGreaterThan(0);
        expect(c.idle.length).toBeGreaterThan(0);
        expect(d.clips).toContain(c.moving);
      }
    }
    // every generated population member is in the manifest
    for (const p of people) expect(ids.has(p.id)).toBe(true);
  });
});
