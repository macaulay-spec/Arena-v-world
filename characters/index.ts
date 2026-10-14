/**
 * V-WORLD character pipeline entry: `npm run characters`
 * Generates shared textures, the character population (glTF) and data/characters.json.
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { morph, defaultBody } from './body';
import { buildRig } from './rig';
import { skinMasks, paintSkin, SKIN_VARIANTS } from './skin';
import { paintEye, paintHair, paintCoils, paintPlain } from './textures';

const OUT = join(process.cwd(), 'public', 'assets', 'characters');
const TEX = join(OUT, 'textures');
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

mkdirSync(TEX, { recursive: true });

// ---- shared textures -------------------------------------------------------------------------
const onlyIf = (name: string, fn: () => void) => { if (process.env.SKIP_TEXTURES && existsSync(join(TEX, name))) return; fn(); };
onlyIf('eye_brown.png', () => { paintEye([0.36, 0.2, 0.09]).save(join(TEX, 'eye_brown.png')); paintEye([0.2, 0.11, 0.06]).save(join(TEX, 'eye_dark.png')); paintEye([0.45, 0.32, 0.12]).save(join(TEX, 'eye_hazel.png')); });
onlyIf('hair.png', () => { paintHair().save(join(TEX, 'hair.png')); paintCoils().save(join(TEX, 'coils.png')); paintPlain().save(join(TEX, 'plain.png')); });
log('small textures');

// reference bodies for the shared skin textures (features are UV-space; only the brow/beard zones read positions)
function refRig(sex: 'f' | 'm', age: 'child' | 'young' | 'old') {
  const p = defaultBody(); p.gender = sex === 'm' ? 1 : 0; p.ageYears = age === 'child' ? 9 : age === 'old' ? 70 : 28; p.african = 1; p.asian = 0; p.caucasian = 0;
  const m = morph(p); return buildRig(m.pos, m.groundDm);
}
onlyIf('skin_f_young.png', () => {
  const rigs = { f: refRig('f', 'young'), m: refRig('m', 'young'), c: refRig('f', 'child') };
  const masks = { f: skinMasks(rigs.f), m: skinMasks(rigs.m), c: skinMasks(rigs.c) };
  for (const v of SKIN_VARIANTS) {
    const k = v.age === 'child' ? 'c' : v.sex;
    const size = process.env.SKIN_SIZE ? +process.env.SKIN_SIZE : 1024;
    paintSkin(rigs[k], masks[k], v, size).save(join(TEX, `${v.name}.png`));
    log('painted', v.name);
  }
});

// ---- fabric textures -----------------------------------------------------------------------
import { FABRICS } from './fabrics';
import { assembleCharacter, type CharacterSpec } from './assemble';
for (const f of Object.values(FABRICS)) onlyIf(`fabric_${f.name}.png`, () => f.paint(256).save(join(TEX, `fabric_${f.name}.png`)));
log('fabrics');

// ---- test characters (body sheet + first outfits) --------------------------------------------
const tests: CharacterSpec[] = [];
{
  const f = defaultBody(); f.gender = 0; f.ageYears = 27; f.african = 0.95; f.asian = 0.05; f.caucasian = 0; f.weight = 0.5; f.height = 0.5;
  const m = defaultBody(); m.gender = 1; m.ageYears = 34; m.african = 0.95; m.asian = 0; m.caucasian = 0.05; m.muscle = 0.6; m.height = 0.55;
  tests.push({ id: 'test_female', sex: 'f', age: 27, body: f, skin: 'skin_f_young', tone: '#5A3A28', tags: ['body'], outfit: [{ id: 'briefs', look: { fabric: 'cotton', colour: '#F2F2F2' } }, { id: 'tank', look: { fabric: 'cotton', colour: '#F2F2F2' } }] });
  tests.push({ id: 'test_male', sex: 'm', age: 34, body: m, skin: 'skin_m_stubble', tone: '#3C2319', tags: ['body'], outfit: [{ id: 'briefs', look: { fabric: 'cotton', colour: '#2B2B2B' } }] });
  tests.push({ id: 'test_male_street', sex: 'm', age: 34, body: m, skin: 'skin_m_stubble', tone: '#3C2319', tags: ['street'], outfit: [{ id: 'tshirt', look: { fabric: 'cotton', colour: '#C62828' } }, { id: 'jeans', look: { fabric: 'denim', colour: '#3A5A8C' } }, { id: 'sneakers', look: { fabric: 'leather', colour: '#F5F5F5' } }] });
  tests.push({ id: 'test_female_ankara', sex: 'f', age: 27, body: f, skin: 'skin_f_young', tone: '#5A3A28', tags: ['street'], outfit: [{ id: 'dress', look: { fabric: 'ankara_0', seed: 3 } }, { id: 'sandals', look: { fabric: 'leather', colour: '#5D4037' } }] });
  tests.push({ id: 'test_male_kaftan', sex: 'm', age: 34, body: m, skin: 'skin_m_stubble', tone: '#3C2319', tags: ['street'], outfit: [{ id: 'senator', look: { fabric: 'polyester', colour: '#2E4A7D' } }, { id: 'sokoto', look: { fabric: 'polyester', colour: '#2E4A7D' } }, { id: 'shoes', look: { fabric: 'leather', colour: '#1B1B1B' } }] });
  tests.push({ id: 'test_male_agbada', sex: 'm', age: 34, body: m, skin: 'skin_m_stubble', tone: '#3C2319', tags: ['street'], outfit: [{ id: 'agbada', look: { fabric: 'aso_oke' } }, { id: 'sokoto', look: { fabric: 'cotton', colour: '#F2F2F2' } }, { id: 'slides', look: { fabric: 'leather', colour: '#3E2723' } }] });
  tests.push({ id: 'test_female_irobuba', sex: 'f', age: 27, body: f, skin: 'skin_f_young', tone: '#5A3A28', tags: ['street'], outfit: [{ id: 'iro_buba', look: { fabric: 'ankara_2', seed: 1 } }, { id: 'slides', look: { fabric: 'leather', colour: '#1B1B1B' } }] });
  tests.push({ id: 'test_female_hivis', sex: 'f', age: 27, body: f, skin: 'skin_f_young', tone: '#5A3A28', tags: ['uniform'], outfit: [{ id: 'shirt_long', look: { fabric: 'cotton', colour: '#9FC5E8' } }, { id: 'trousers', look: { fabric: 'cotton', colour: '#1F2933' } }, { id: 'hivis', look: { fabric: 'hivis' } }, { id: 'boots', look: { fabric: 'leather', colour: '#3E2723' } }] });
}
const only = process.env.ONLY?.split(',');
const manifest: any[] = [];
for (const t of tests) {
  if (only && !only.includes(t.id)) continue;
  const r = assembleCharacter(t, OUT);
  manifest.push({ id: r.id, file: r.file, height: r.height, tris: r.tris, bytes: r.bytes, sex: t.sex, age: t.age, tags: t.tags, role: t.role, district: t.district });
  log(t.id, 'tris', r.tris, 'verts', r.verts, 'draws', r.draws, 'bin', (r.bytes / 1024).toFixed(0) + 'kB');
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ characters: manifest }, null, 1));
log('done');
