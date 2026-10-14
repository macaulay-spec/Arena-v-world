/**
 * Assemble one character: body morph → rig → garments (with hidden skin) → glTF on disk.
 */
import { join } from 'node:path';
import { morph, type BodyParams } from './body';
import { buildRig, BONE_INDEX, type Rig } from './rig';
import { buildBody } from './bodyparts';
import { GltfBuilder } from './gltf';
import { triCount, vertexCount, type Part } from './mesh';
import { buildGarment, combineByMaterial, garmentCtx, type OutfitItem, type GarmentMaterial } from './garments';
import { linear } from './fabrics';

export interface CharacterSpec {
  id: string;
  name?: string; role?: string; district?: string; tags?: string[];
  sex: 'f' | 'm'; age: number;
  body: BodyParams;
  skin: string;          // shared skin detail texture name (SKIN_VARIANTS[].name)
  tone: string;          // sRGB hex skin tone
  eyes?: 'brown' | 'dark' | 'hazel';
  outfit: OutfitItem[];
  /** extra builders (hair, props) that receive the rig and return parts + materials */
  extras?: ((rig: Rig, ctx: ReturnType<typeof garmentCtx>) => { parts: Part[]; materials: GarmentMaterial[]; hide?: Set<number> })[];
}

export interface CharacterOutput { id: string; file: string; height: number; tris: number; verts: number; bytes: number; draws: number; rig: Rig; parts: Part[] }

export function assembleCharacter(spec: CharacterSpec, outDir: string, opts: { lods?: (parts: Part[], rig: Rig) => { level: number; parts: Part[] }[] } = {}): CharacterOutput {
  const m = morph(spec.body); const rig = buildRig(m.pos, m.groundDm);
  const ctx = garmentCtx(rig);
  const garments = spec.outfit.map(item => buildGarment(ctx, item));
  const extras = (spec.extras ?? []).map(fn => fn(rig, ctx));
  const combined = combineByMaterial(garments);
  for (const e of extras) { if (e.hide) for (const h of e.hide) combined.hide.add(h); }
  const body = buildBody(rig, { hidden: combined.hide, skinMaterial: 'skin', eyeMaterial: 'eye', mouthMaterial: 'mouth' });

  const g = new GltfBuilder({ id: spec.id, role: spec.role, district: spec.district });
  g.skeleton(rig.heads);
  const tone = linear(spec.tone);
  const mats: Record<string, number> = {
    skin: g.material({ name: 'skin', baseColor: [tone[0], tone[1], tone[2], 1], texture: g.image(`textures/${spec.skin}.png`), roughness: 0.62 }),
    eye: g.material({ name: 'eye', texture: g.image(`textures/eye_${spec.eyes ?? 'brown'}.png`), roughness: 0.25 }),
    mouth: g.material({ name: 'mouth', texture: g.image('textures/plain.png'), roughness: 0.5 }),
  };
  const allMats: GarmentMaterial[] = [...combined.materials, ...extras.flatMap(e => e.materials)];
  for (const gm of allMats) if (!(gm.name in mats)) mats[gm.name] = g.material({ name: gm.name, baseColor: gm.baseColor, texture: g.image(gm.texture), roughness: gm.roughness, doubleSided: gm.doubleSided });
  const parts: Part[] = [body.skin, body.eyes, body.mouth, ...combined.parts, ...extras.flatMap(e => e.parts)].filter(p => p.idx.length);
  g.skinnedMesh('LOD0', parts, mats, { lod: 0 });
  if (opts.lods) for (const l of opts.lods(parts, rig)) g.skinnedMesh(`LOD${l.level}`, l.parts, mats, { lod: l.level });
  const r = g.write(join(outDir, `${spec.id}.gltf`));
  const tris = parts.reduce((a, p) => a + triCount(p), 0), verts = parts.reduce((a, p) => a + vertexCount(p), 0);
  return { id: spec.id, file: `${spec.id}.gltf`, height: +rig.heads[BONE_INDEX.get('HeadTop_End')! * 3 + 1].toFixed(3), tris, verts, bytes: r.binBytes, draws: parts.length, rig, parts };
}
