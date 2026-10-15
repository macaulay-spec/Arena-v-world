/**
 * Player character kits for the game ("create your own" protagonist).
 *
 * One glTF per sex containing the base body (LOD0) plus every selectable hair style and outfit set as
 * separate skinned-mesh nodes (`HAIR_<style>`, `OUTFIT_<id>`) that the game toggles at runtime.
 * Skin tone is the `skin` material's base colour factor, so it is changed at runtime too; build and
 * height are runtime bone scales. Body faces hidden by *every* outfit are removed (never visible).
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { morph, defaultBody } from './body';
import { buildRig, BONE_INDEX } from './rig';
import { buildBody } from './bodyparts';
import { GltfBuilder } from './gltf';
import { triCount, type Part } from './mesh';
import { buildGarment, combineByMaterial, garmentCtx, type OutfitItem, type GarmentMaterial } from './garments';
import { linear } from './fabrics';
import { buildHair, type HairStyle } from './hair';

export interface OutfitSet { id: string; name: string; items: OutfitItem[] }
export interface PlayerKit { sex: 'f' | 'm'; file: string; height: number; skin: string[]; hair: { id: HairStyle; name: string }[]; outfits: { id: string; name: string }[]; tris: number }

export const PLAYER_TONES = ['#2E1A12', '#3C2319', '#4A2C1E', '#5A3A28', '#6B4530', '#8A5A3C', '#A97A58', '#C9A080'];
const HAIR_F: { id: HairStyle; name: string }[] = [
  { id: 'braids', name: 'Braids' }, { id: 'twists', name: 'Twists' }, { id: 'coils', name: 'Coils' }, { id: 'afro', name: 'Afro' }, { id: 'afro_big', name: 'Big afro' },
  { id: 'cornrows', name: 'Cornrows' }, { id: 'bun', name: 'Bun' }, { id: 'coils_fade', name: 'Fade' }, { id: 'low_cut', name: 'Low cut' },
];
const HAIR_M: { id: HairStyle; name: string }[] = [
  { id: 'low_cut', name: 'Low cut' }, { id: 'coils_fade', name: 'Fade' }, { id: 'coils', name: 'Coils' }, { id: 'twists', name: 'Twists' }, { id: 'afro', name: 'Afro' },
  { id: 'cornrows', name: 'Cornrows' }, { id: 'none', name: 'Bald' },
];
const look = (fabric: string, colour?: string, seed = 0) => ({ fabric, colour, seed });
const OUTFITS_F: OutfitSet[] = [
  { id: 'casual', name: 'Casual', items: [{ id: 'tshirt', look: look('cotton', '#F2F2F2') }, { id: 'jeans', look: look('denim', '#2F4A6B') }, { id: 'sneakers', look: look('leather', '#FFFFFF') }] },
  { id: 'smart', name: 'Office', items: [{ id: 'blouse', look: look('cotton', '#F6E7C8') }, { id: 'trousers', look: look('polyester', '#1F2933') }, { id: 'heels', look: look('leather', '#1A1A1A') }] },
  { id: 'ankara', name: 'Ankara', items: [{ id: 'iro_buba', look: look('ankara_3', undefined, 2) }, { id: 'slides', look: look('leather', '#3A2A1A') }] },
  { id: 'evening', name: 'Evening', items: [{ id: 'dress', look: look('lace', '#7A1E3A') }, { id: 'heels', look: look('leather', '#D4AF37') }] },
  { id: 'sport', name: 'Sport', items: [{ id: 'tank', look: look('polyester', '#111111') }, { id: 'shorts', look: look('polyester', '#3B3B3B') }, { id: 'sneakers', look: look('leather', '#E8E8E8') }] },
  { id: 'street', name: 'Street', items: [{ id: 'polo', look: look('cotton', '#E35D6A') }, { id: 'skirt_knee', look: look('denim', '#1E2F45') }, { id: 'sandals', look: look('leather', '#5B3A1E') }] },
];
const OUTFITS_M: OutfitSet[] = [
  { id: 'casual', name: 'Casual', items: [{ id: 'tshirt', look: look('cotton', '#F2F2F2') }, { id: 'jeans', look: look('denim', '#2B3F5C') }, { id: 'sneakers', look: look('leather', '#FFFFFF') }] },
  { id: 'smart', name: 'Office', items: [{ id: 'shirt_long', look: look('cotton', '#DCE8F5') }, { id: 'trousers', look: look('polyester', '#1F2933') }, { id: 'shoes', look: look('leather', '#2A1A10') }] },
  { id: 'senator', name: 'Senator', items: [{ id: 'senator', look: look('polyester', '#1B2A41') }, { id: 'sokoto', look: look('polyester', '#1B2A41') }, { id: 'shoes', look: look('leather', '#1A1A1A') }] },
  { id: 'agbada', name: 'Agbada', items: [{ id: 'agbada', look: look('aso_oke', undefined, 1) }, { id: 'sokoto', look: look('polyester', '#F0E6D2') }, { id: 'slides', look: look('leather', '#3A2A1A') }] },
  { id: 'sport', name: 'Sport', items: [{ id: 'jersey', look: look('jersey_green') }, { id: 'shorts', look: look('polyester', '#F2F2F2') }, { id: 'sneakers', look: look('leather', '#E8E8E8') }] },
  { id: 'street', name: 'Street', items: [{ id: 'polo', look: look('cotton', '#2C7A4B') }, { id: 'shorts', look: look('denim', '#3A4F6A') }, { id: 'slides', look: look('rubber', '#111111') }] },
];

export function buildPlayerKits(outDir: string, log: (...a: unknown[]) => void = () => {}): PlayerKit[] {
  const kits: PlayerKit[] = [];
  for (const sex of ['f', 'm'] as const) {
    const p = defaultBody(); p.gender = sex === 'm' ? 1 : 0; p.ageYears = sex === 'm' ? 30 : 26; p.african = 0.95; p.asian = 0.05; p.caucasian = 0;
    p.weight = 0.5; p.height = sex === 'm' ? 0.55 : 0.5; p.proportions = 0.72; if (sex === 'm') p.muscle = 0.62;
    const m = morph(p); const rig = buildRig(m.pos, m.groundDm);
    const ctx = garmentCtx(rig);
    const tone = '#5A3A28';
    const outfits = (sex === 'f' ? OUTFITS_F : OUTFITS_M).map(set => ({ set, combined: combineByMaterial(set.items.map(item => buildGarment(ctx, item))) }));
    // body faces hidden by every outfit
    let hidden = new Set<number>(outfits[0]?.combined.hide ?? []);
    for (const o of outfits.slice(1)) { const keep = new Set<number>(); for (const h of hidden) if (o.combined.hide.has(h)) keep.add(h); hidden = keep; }
    const body = buildBody(rig, { hidden, skinMaterial: 'skin', eyeMaterial: 'eye', mouthMaterial: 'mouth' });
    const hairs = (sex === 'f' ? HAIR_F : HAIR_M).map(h => ({ h, res: buildHair(rig, h.id, '#14100E', tone, 3) }));

    const g = new GltfBuilder({ id: `player_${sex}`, kind: 'player-kit', sex, tones: PLAYER_TONES, hair: hairs.map(x => x.h.id), outfits: outfits.map(o => o.set.id) });
    g.skeleton(rig.heads);
    const t = linear(tone);
    const mats: Record<string, number> = {
      skin: g.material({ name: 'skin', baseColor: [t[0], t[1], t[2], 1], texture: g.image(`textures/${sex === 'f' ? 'skin_f_young' : 'skin_m_stubble'}.png`), roughness: 0.62 }),
      eye: g.material({ name: 'eye', texture: g.image('textures/eye_dark.png'), roughness: 0.25 }),
      mouth: g.material({ name: 'mouth', texture: g.image('textures/plain.png'), roughness: 0.5 }),
    };
    const addMats = (list: GarmentMaterial[]) => { for (const gm of list) if (!(gm.name in mats)) mats[gm.name] = g.material({ name: gm.name, baseColor: gm.baseColor, texture: g.image(gm.texture), roughness: gm.roughness, doubleSided: gm.doubleSided }); };
    for (const o of outfits) addMats(o.combined.materials);
    for (const h of hairs) addMats(h.res.materials);
    const bodyParts: Part[] = [body.skin, body.eyes, body.mouth].filter(x => x.idx.length);
    g.skinnedMesh('LOD0', bodyParts, mats, { lod: 0, kind: 'body' });
    let tris = bodyParts.reduce((a, x) => a + triCount(x), 0);
    for (const h of hairs) { if (!h.res.parts.length) continue; g.skinnedMesh(`HAIR_${h.h.id}`, h.res.parts, mats, { kind: 'hair', id: h.h.id, name: h.h.name }); tris += h.res.parts.reduce((a, x) => a + triCount(x), 0); }
    for (const o of outfits) { g.skinnedMesh(`OUTFIT_${o.set.id}`, o.combined.parts, mats, { kind: 'outfit', id: o.set.id, name: o.set.name }); tris += o.combined.parts.reduce((a, x) => a + triCount(x), 0); }
    const r = g.write(join(outDir, `player_${sex}.gltf`));
    const height = +rig.heads[BONE_INDEX.get('HeadTop_End')! * 3 + 1].toFixed(3);
    kits.push({ sex, file: `player_${sex}.gltf`, height, skin: PLAYER_TONES, hair: hairs.filter(h => h.res.parts.length || h.h.id === 'none').map(h => h.h), outfits: outfits.map(o => ({ id: o.set.id, name: o.set.name })), tris });
    log(`player_${sex}`, 'tris', tris, 'bin', (r.binBytes / 1024).toFixed(0) + 'kB');
  }
  writeFileSync(join(outDir, 'player.json'), JSON.stringify({ kits }, null, 1));
  return kits;
}
