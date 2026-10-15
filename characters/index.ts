/**
 * V-WORLD character pipeline entry: `npm run characters`
 * Generates shared textures, the character population (glTF) and data/characters.json.
 */
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { morph, defaultBody } from './body';
import { buildRig } from './rig';
import { skinMasks, paintSkin, SKIN_VARIANTS } from './skin';
import { paintEye, paintHair, paintCoils, paintPlain, paintBraids, paintTwists } from './textures';

const OUT = join(process.cwd(), 'public', 'assets', 'characters');
const TEX = join(OUT, 'textures');
const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

mkdirSync(TEX, { recursive: true });

// ---- shared textures -------------------------------------------------------------------------
const onlyIf = (name: string, fn: () => void) => { if (process.env.SKIP_TEXTURES && existsSync(join(TEX, name))) return; fn(); };
onlyIf('eye_brown.png', () => { paintEye([0.16, 0.085, 0.04]).save(join(TEX, 'eye_brown.png')); paintEye([0.065, 0.035, 0.018]).save(join(TEX, 'eye_dark.png')); paintEye([0.3, 0.2, 0.08]).save(join(TEX, 'eye_hazel.png')); });
onlyIf('hair.png', () => { paintHair().save(join(TEX, 'hair.png')); paintCoils().save(join(TEX, 'coils.png')); paintPlain().save(join(TEX, 'plain.png')); });
onlyIf('braids.png', () => { paintBraids().save(join(TEX, 'braids.png')); paintTwists().save(join(TEX, 'twists.png')); });
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

// ---- population ---------------------------------------------------------------------------------
import { population, DISTRICT_NAMES, type PopulationEntry } from './population';
const specs: (CharacterSpec & Partial<PopulationEntry>)[] = [];
{
  // body sheet references (minimal clothing) — kept first so the viewer/screenshots can show the base bodies
  const f = defaultBody(); f.gender = 0; f.ageYears = 27; f.african = 0.95; f.asian = 0.05; f.caucasian = 0; f.weight = 0.5; f.height = 0.5; f.proportions = 0.7;
  const m = defaultBody(); m.gender = 1; m.ageYears = 34; m.african = 0.95; m.asian = 0; m.caucasian = 0.05; m.muscle = 0.6; m.height = 0.55; m.proportions = 0.7;
  specs.push({ id: 'body_female', name: 'Body sheet · female', role: 'reference', sex: 'f', age: 27, body: f, skin: 'skin_f_young', tone: '#5A3A28', tags: ['body'], hair: 'coils_fade', outfit: [{ id: 'briefs', look: { fabric: 'cotton', colour: '#F2F2F2' } }, { id: 'tank', look: { fabric: 'cotton', colour: '#F2F2F2' } }] });
  specs.push({ id: 'body_male', name: 'Body sheet · male', role: 'reference', sex: 'm', age: 34, body: m, skin: 'skin_m_stubble', tone: '#3C2319', tags: ['body'], hair: 'low_cut', outfit: [{ id: 'briefs', look: { fabric: 'cotton', colour: '#2B2B2B' } }] });
  specs.push(...population(20260419, +(process.env.PER_WEIGHT ?? 1)));
}
// ---- animation library (reference skeleton ≈ 1.75 m; runtimes retarget Hips translation by height) ----
import { CLIPS, sampleClip } from './anim';
import { GltfBuilder } from './gltf';
import { BONE_INDEX } from './rig';
{
  const refP = defaultBody(); refP.gender = 1; refP.ageYears = 30; refP.african = 1; refP.asian = 0; refP.caucasian = 0; refP.height = 0.35;
  const refM = morph(refP); const ref = buildRig(refM.pos, refM.groundDm);
  const refHeight = ref.heads[BONE_INDEX.get('HeadTop_End')! * 3 + 1];
  const g = new GltfBuilder({ reference_height: +refHeight.toFixed(3), hips_rest: [ref.heads[0], ref.heads[1], ref.heads[2]] });
  g.skeleton(ref.heads);
  for (const def of CLIPS) g.animation(sampleClip(def), [ref.heads[0], ref.heads[1], ref.heads[2]]);
  const r = g.write(join(OUT, 'animations.gltf'));
  log('animations', CLIPS.map(c => c.name).join(' '), 'ref height', refHeight.toFixed(3), (r.binBytes / 1024).toFixed(0) + 'kB');
}
const only = process.env.ONLY?.split(',');
const manifest: any[] = []; const data: any[] = [];
for (const t of specs) {
  if (only && !only.includes(t.id)) continue;
  const r = assembleCharacter(t, OUT, { lods: !process.env.NO_LODS });
  const entry = { id: r.id, file: r.file, name: t.name, height: r.height, tris: r.tris, lodTris: r.lodTris, bytes: r.bytes, sex: t.sex, age: t.age, tags: t.tags, role: t.role, district: t.district, districts: t.districts, idle: t.idle, moving: t.moving };
  manifest.push(entry);
  data.push({ ...entry, roleId: t.roleId, districtNames: (t.districts ?? []).map(d => DISTRICT_NAMES[d]), skinTone: t.tone, hair: t.hair, headwear: t.headwear, outfit: t.outfit.map(o => ({ garment: o.id, fabric: o.look.fabric, colour: o.look.colour })), props: t.props ?? [] });
  log(t.id, 'tris', r.lodTris.join('/'), 'verts', r.verts, 'draws', r.draws, 'bin', (r.bytes / 1024).toFixed(0) + 'kB');
}
const manifestJson = { generated: new Date().toISOString().slice(0, 10), seed: 20260419, animations: 'animations.gltf', clips: CLIPS.map(c => c.name), characters: manifest };
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifestJson, null, 1));
if (!only) { mkdirSync(join(process.cwd(), 'data'), { recursive: true }); writeFileSync(join(process.cwd(), 'data', 'characters.json'), JSON.stringify({ ...manifestJson, characters: data }, null, 1)); }
log('done', manifest.length, 'characters');
