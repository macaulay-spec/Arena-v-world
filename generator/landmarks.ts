/** Hand-authored landmark complexes placed on reserved sites. */
import type { Parcel, BuildingMass, MassFeature, Prop, Vec2, LandmarkRole } from '../src/shared/types';
import { RNG } from '../src/shared/rng';
import { frameOf, wideFrame, placeMass, world, parkingRows, r2, type Frame, type Spec } from './archetypes';
import { ZONES } from './config';

type P = Omit<Prop, 'y'>;
export interface LandmarkResult { frame: Frame; specs: Spec[]; props: P[]; role?: LandmarkRole; name: string; description: string; plateau?: { polygon: Vec2[]; y: number; /** ground point the terrace is levelled to (e.g. the street outside the gate); default = mean ground over the site */ anchor?: Vec2 } }

const flat = (parapet = 1, tile = 'roof-concrete'): BuildingMass['roof'] => ({ type: 'flat', tile, parapet });
const F = (kind: MassFeature['kind'], extra: Partial<MassFeature> = {}): MassFeature => ({ kind, ...extra });

function rowTrees(f: Frame, cu0: number, cu1: number, cv: number, step: number, t: Prop['t'], props: P[], s = 1) {
  for (let cu = cu0; cu <= cu1 + 0.01; cu += step) { const p = world(f, cu, cv); props.push({ t, x: p[0], z: p[1], r: 0, s }); }
}
function ringProps(f: Frame, cu: number, cv: number, radius: number, n: number, t: Prop['t'], props: P[], extra: Partial<P> = {}) {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; const p = world(f, cu + Math.cos(a) * radius, cv + Math.sin(a) * radius); props.push({ t, x: p[0], z: p[1], r: f.rot + a + Math.PI / 2, ...extra }); }
}
function ucenter(f: Frame): number { return (f.umin + f.umax) / 2; }

const WIDE = new Set(['city-hall', 'meridian-tower', 'cultural-centre', 'secretariat', 'vora-mall', 'police-fire', 'hospital', 'grand-market', 'terminal', 'ot-market', 'harbour', 'works', 'port', 'stadium', 'mosque']);

export function buildLandmark(zoneId: string, parcel: Parcel, rng: RNG): LandmarkResult | null {
  const f = WIDE.has(zoneId) ? wideFrame(parcel) : frameOf(parcel); if (!f) return null;
  const zone = ZONES.find(z => z.id === zoneId)!;
  const r = rng.fork('lm-' + zoneId);
  const props: P[] = [];
  const specs: Spec[] = [];
  const uc = ucenter(f), W = f.width, D = f.depth;
  const spec = (use: Spec['use'], archetype: string, masses: (BuildingMass | null)[], name: string, tags: string[], extra: Partial<Spec> = {}): Spec | null => {
    const ms = masses.filter((m): m is BuildingMass => !!m);
    if (!ms.length) return null;
    const s: Spec = { use, archetype, masses: ms, name, tags: ['landmark', ...tags], fence: null, gateU: 0, ...extra };
    specs.push(s); return s;
  };

  switch (zoneId) {
    case 'jag-house': {
      // the estate is built by the game runtime (procedural mansion); the city only reserves the terraced site.
      // The terrace is levelled to the street outside the gate (gate = 27 m from the site's west edge on
      // its south, street-facing side — see src/game/mansion/compound.ts) so the drive meets the road at grade.
      const poly = parcel.polygon.map(p => [r2(p[0]), r2(p[1])] as Vec2);
      const minX = Math.min(...poly.map(p => p[0])), maxZ = Math.max(...poly.map(p => p[1]));
      return { frame: f, specs, props, role: 'residence', name: zone.name, description: zone.description!, plateau: { polygon: poly, y: 0, anchor: [r2(minX + 27), r2(maxZ + 2)] } };
    }
    case 'city-hall': {
      const fd = Math.min(22, Math.max(10, D - 36 - 6));
      const main = placeMass(f, uc, fd + 17, Math.min(W - 30, 70), 34, { floors: 4, fh: 4.3, roof: flat(1.4, 'roof-gravel'), facade: { tile: 'stone', bayWidth: 3.6, groundTile: 'colonnade', groundHeight: 6, color: '#d8cfc0', trim: '#2b2b2b' }, features: [F('portico', { side: 0, p: [26, 6, 15, 8] }), F('flagpoles', { side: 0, p: [3] }), F('clock', { side: 0 }), F('sign', { side: 0, text: 'VORA CITY HALL', color: '#2b2b2b', p: [1] })] });
      const drum = main ? placeMass(f, uc, fd + 17, 16, 16, { floors: 1, fh: 6, roof: { type: 'dome', tile: 'roof-metal', color: '#3d6b5a' }, facade: { tile: 'stone', bayWidth: 3.6, color: '#d8cfc0', trim: '#2b2b2b' }, features: [], noShrink: true }) : null;
      if (drum) (drum as any).onTop = 1;
      const wings = [-1, 1].map(s => placeMass(f, uc + s * (Math.min(W - 30, 70) / 2 + 13), fd + 22, 24, 28, { floors: 3, fh: 4.3, roof: flat(1.2), facade: { tile: 'stone', bayWidth: 3.6, color: '#d8cfc0', trim: '#2b2b2b' }, features: [] }));
      spec('government', 'city-hall', [main, drum, ...wings], zone.name, ['civic', 'government'], { fence: null });
      const fc = world(f, uc, fd / 2); props.push({ t: 'fountain', x: fc[0], z: fc[1], r: 0, s: 1.6 });
      if (fd > 16) ringProps(f, uc, fd / 2, Math.min(14, fd / 2 - 2), 10, 'bench', props);
      rowTrees(f, uc - 40, uc + 40, 4, 8, 'tree-palm', props, 1.2);
      for (let cu = uc - 44; cu <= uc + 44; cu += 4) { const p = world(f, cu, 1.2); props.push({ t: 'bollard', x: p[0], z: p[1], r: 0 }); }
      return { frame: f, specs, props, role: 'civic-landmark', name: zone.name, description: zone.description! };
    }
    case 'meridian-tower': {
      const pd = Math.min(52, D - 14 - 6);
      const pod = placeMass(f, uc, 14 + pd / 2, Math.min(W - 16, 72), pd, { floors: 4, fh: 4.4, roof: flat(1.2, 'roof-gravel'), facade: { tile: 'glass-curtain', bayWidth: 3, groundTile: 'colonnade', groundHeight: 6, color: '#6f8fa6', trim: '#1e1e1e' }, features: [F('canopy', { side: 0, p: [6, 5.8, 0.5, 1, 1] }), F('sign', { side: 0, text: 'MERIDIAN TOWER', color: '#1d5c8a', p: [1] }), F('skylight')] });
      const tower = pod ? placeMass(f, uc, 14 + pd / 2 + 1, 38, Math.min(32, pd - 10), { floors: 42, fh: 3.9, roof: flat(2.4), facade: { tile: 'glass-curtain', bayWidth: 3, color: '#5d7c93', trim: '#1e1e1e' }, features: [F('fins', { p: [1] }), F('crown', { p: [2] }), F('helipad')], noShrink: true }) : null;
      if (tower) (tower as any).onTop = 1;
      spec('office-tower', 'landmark-tower', [pod, tower], zone.name, ['commercial', 'office', 'skyline']);
      rowTrees(f, uc - 30, uc + 30, 5, 7.5, 'tree-palm', props, 1.1);
      const sc = world(f, uc - 22, 8); props.push({ t: 'sculpture', x: sc[0], z: sc[1], r: f.rot, s: 1.4 });
      for (const s of [-1, 1]) { const p = world(f, uc + s * 14, 7); props.push({ t: 'flag', x: p[0], z: p[1], r: 0 }); }
      for (let cu = uc - 36; cu <= uc + 36; cu += 4) { const p = world(f, cu, 1.2); props.push({ t: 'bollard', x: p[0], z: p[1], r: 0 }); }
      return { frame: f, specs, props, role: 'landmark-office', name: zone.name, description: zone.description! };
    }
    case 'cultural-centre': {
      const foyer = placeMass(f, uc, 14 + 16, Math.min(W - 20, 64), 30, { floors: 2, fh: 6, roof: flat(1.2, 'roof-membrane'), facade: { tile: 'glass-green', bayWidth: 3, color: '#7a95a8', trim: '#1e1e1e' }, features: [F('canopy', { side: 0, p: [5, 6, 0.5, 1, 1] }), F('sign', { side: 0, text: 'V CULTURAL CENTRE', color: '#6b2d8b', p: [1] }), F('columns', { side: 0, p: [8, 11, 0, 1] })] });
      const fly = placeMass(f, uc, Math.min(D - 14, 14 + 30 + 14), 30, Math.min(26, D - 14 - 30 - 4), { floors: 1, fh: 24, roof: flat(1, 'roof-membrane'), facade: { tile: 'plaster-plain', bayWidth: 4, color: '#8a5a3a', trim: '#5a4a3a' }, features: [F('sign', { side: 0, text: 'NATIONAL THEATRE', color: '#f1d8a4' })] });
      const gallery = placeMass(f, uc - 40, Math.min(D - 20, 14 + 36), 22, Math.min(36, D - 20), { floors: 2, fh: 4.5, roof: flat(1), facade: { tile: 'concrete-strip', bayWidth: 4, color: '#c2bdb4', trim: '#333' }, features: [] });
      spec('cultural', 'cultural-centre', [foyer, fly, gallery], zone.name, ['civic', 'culture']);
      const am = world(f, uc + 38, Math.min(D - 18, 14 + 44)); props.push({ t: 'stairs', x: am[0], z: am[1], r: f.rot + Math.PI, p: [16, 6] });
      rowTrees(f, uc - 40, uc + 40, 5, 10, 'tree-broad', props, 1.1);
      ringProps(f, uc, 7, 9, 8, 'bench', props);
      const sc = world(f, uc, 7); props.push({ t: 'sculpture', x: sc[0], z: sc[1], r: f.rot, s: 1.8, v: 1 });
      return { frame: f, specs, props, role: 'cultural-centre', name: zone.name, description: zone.description! };
    }
    case 'secretariat': {
      const sec = placeMass(f, uc, 16 + 12, Math.min(W - 20, 96), 24, { floors: 6, fh: 3.8, roof: flat(1.2), facade: { tile: 'concrete-strip', bayWidth: 4, groundTile: 'colonnade', groundHeight: 5, color: '#c2bdb4', trim: '#2b2b2b' }, features: [F('canopy', { side: 0, p: [4, 4.6, 0.4] }), F('flagpoles', { side: 0, p: [3] }), F('sign', { side: 0, text: 'STATE SECRETARIAT', color: '#2b2b2b', p: [1] }), F('antenna')] });
      const court = placeMass(f, uc + 20, Math.min(D - 17, 16 + 24 + 26 + 16), 44, Math.min(30, D - 16 - 24 - 20), { floors: 3, fh: 4.5, roof: flat(1.2), facade: { tile: 'stone', bayWidth: 3.6, color: '#d8cfc0', trim: '#2b2b2b' }, features: [F('portico', { side: 2, p: [20, 5, 12, 6] }), F('sign', { side: 2, text: 'HIGH COURT OF V', color: '#2b2b2b', p: [1] }), F('flagpoles', { side: 2, p: [2] })] });
      spec('government', 'secretariat', [sec, court], zone.name, ['civic', 'government']);
      props.push(...parkingRows(f, r, 12, Math.min(W - 24, 70)));
      rowTrees(f, uc - 46, uc + 46, 15, 9, 'tree-broad', props);
      return { frame: f, specs, props, role: 'government', name: zone.name, description: zone.description! };
    }
    case 'vora-mall': {
      const park = Math.max(12, Math.min(26, D * 0.42));
      const md = Math.min(54, D - park - 4);
      const mall = placeMass(f, uc, park + md / 2, Math.min(W - 12, 112), md, { floors: 2, fh: 5.6, roof: flat(1.4, 'roof-membrane'), facade: { tile: 'panel-industrial', bayWidth: 4, groundTile: 'shopfront', groundHeight: 5.6, color: '#e6dccb', trim: '#2b2b2b' }, features: [F('canopy', { side: 0, p: [6, 5.4, 0.5, 1, 1] }), F('sign', { side: 0, text: 'PALM CRESCENT MALL', color: '#b3261e', p: [1] }), F('skylight'), F('ac', { p: [0.3] }), F('sign', { side: 1, text: 'CINEMA', color: '#1d5c8a' })] });
      spec('mall', 'shopping-mall', [mall], zone.name, ['commercial', 'retail', 'parking']);
      props.push(...parkingRows(f, r, park - 2, Math.min(W - 12, 104)));
      rowTrees(f, uc - 50, uc + 50, park - 1, 12.5, 'tree-palm', props);
      const bb = world(f, uc + 52, 3); props.push({ t: 'billboard', x: bb[0], z: bb[1], r: f.rot, v: 0, text: 'PALM CRESCENT MALL' });
      return { frame: f, specs, props, role: 'shopping-complex', name: zone.name, description: zone.description! };
    }
    case 'police-fire': {
      const sx = Math.min(1, W / 120);
      const police = placeMass(f, uc - 32 * sx, 12 + 12, 46 * sx, 24, { floors: 3, fh: 3.6, roof: flat(1), facade: { tile: 'concrete-grid', bayWidth: 3.4, color: '#c9bda9', trim: '#1d5c8a' }, features: [F('sign', { side: 0, text: 'VORA CITY POLICE HQ', color: '#1d5c8a' }), F('flagpoles', { side: 0, p: [2] }), F('canopy', { side: 0, p: [3, 3.6, 0.3] }), F('antenna')] });
      const fire = placeMass(f, uc + 34 * sx, 12 + 11, 38 * sx, 22, { floors: 2, fh: 4.4, roof: flat(0.9), facade: { tile: 'block-win', bayWidth: 4, groundTile: 'garage-door', groundHeight: 4.6, color: '#e3c0a0', trim: '#b3261e' }, features: [F('rollerdoor', { side: 0, p: [4], color: '#b3261e' }), F('sign', { side: 0, text: 'VORA FIRE SERVICE', color: '#b3261e' })] });
      const tower = placeMass(f, uc + 50 * sx, 12 + 22 + 5, 4.5, 4.5, { floors: 1, fh: 16, roof: flat(0.4), facade: { tile: 'plaster-plain', bayWidth: 4, color: '#e3c0a0', trim: '#b3261e' }, features: [], noShrink: true });
      spec('police', 'police-headquarters', [police], 'Vora City Police Headquarters', ['civic', 'security']);
      spec('fire-station', 'fire-station', [fire, tower], 'Central Fire Station', ['civic', 'emergency']);
      props.push(...parkingRows(f, r, 10, 50).map(p => ({ ...p, v: p.t === 'car' ? 8 : p.v })));
      return { frame: f, specs, props, role: 'government', name: zone.name, description: zone.description! };
    }
    case 'cathedral': {
      const nave = placeMass(f, uc, 12 + 28, 22, 56, { floors: 1, fh: 15, roof: { type: 'gable', tile: 'roof-metal', color: '#5f4030', pitch: 0.7, overhang: 0.6 }, facade: { tile: 'church', bayWidth: 3.2, color: '#e3d9c5', trim: '#5a4a3a' }, features: [F('cross', { p: [1] }), F('arch', { side: 0, p: [5, 8] })] });
      const transept = placeMass(f, uc, 12 + 38, 46, 14, { floors: 1, fh: 14, roof: { type: 'gable', tile: 'roof-metal', color: '#5f4030', pitch: 0.7, overhang: 0.6 }, facade: { tile: 'church', bayWidth: 3.2, color: '#e3d9c5', trim: '#5a4a3a' }, features: [], rot: Math.PI / 2 });
      const towers = [-1, 1].map(s => placeMass(f, uc + s * 9, 12 + 3.5, 7, 7, { floors: 1, fh: 30, roof: { type: 'hip', tile: 'roof-metal', color: '#5f4030', pitch: 1.6, overhang: 0.3 }, facade: { tile: 'stone', bayWidth: 3.6, color: '#e3d9c5', trim: '#5a4a3a' }, features: [F('spire', { p: [8] })], noShrink: true }));
      spec('church', 'cathedral', [nave, transept, ...towers], zone.name, ['civic', 'religious']);
      rowTrees(f, uc - 40, uc + 40, 6, 10, 'tree-broad', props);
      ringProps(f, uc, 6, 7, 6, 'bench', props);
      return { frame: f, specs, props, role: 'religious', name: zone.name, description: zone.description! };
    }
    case 'hospital': {
      const main = placeMass(f, uc, 20 + 12, Math.min(W - 12, 60), 24, { floors: 6, fh: 3.6, roof: flat(1.2), facade: { tile: 'hospital', bayWidth: 3.6, color: '#f4f1ea', trim: '#1f7a4d' }, features: [F('helipad'), F('cross', { side: 0 }), F('canopy', { side: 0, p: [8, 4.5, 0.5, 1, 1] }), F('sign', { side: 0, text: 'VORA GENERAL HOSPITAL', color: '#1f7a4d', p: [1] }), F('antenna')] });
      const wd = Math.min(40, Math.max(16, D - 20 - 24 - 6));
      const wings = [-1, 1].map(s => placeMass(f, uc + s * 18, 20 + 24 + wd / 2 + 1, 20, wd, { floors: 4, fh: 3.6, roof: flat(1), facade: { tile: 'hospital', bayWidth: 3.6, color: '#f4f1ea', trim: '#1f7a4d' }, features: [F('rooftank', { p: [3] })] }));
      spec('hospital', 'hospital', [main, ...wings], zone.name, ['civic', 'health']);
      props.push(...parkingRows(f, r, 16, Math.min(W - 16, 50)).map(p => ({ ...p, v: p.t === 'car' ? 9 : p.v })));
      rowTrees(f, uc - 30, uc + 30, 18, 12, 'tree-neem', props);
      return { frame: f, specs, props, role: 'hospital', name: zone.name, description: zone.description!, };
    }
    case 'grand-market': {
      const front = placeMass(f, uc, 6 + 6, Math.min(W - 10, 110), 12, { floors: 2, fh: 3.8, roof: flat(0.9), facade: { tile: 'plaster-win2', bayWidth: 4.2, groundTile: 'shopfront-shutter', groundHeight: 4, color: '#d6a77a', trim: '#2b2b2b' }, features: [F('sign', { side: 0, text: 'ADANSE GRAND MARKET', color: '#b3261e', p: [1] }), F('awning', { side: 0, p: [1.6], color: '#d98a1f' }), F('arch', { side: 0, p: [6, 6] })] });
      const halls: (BuildingMass | null)[] = [];
      const hw = Math.min((W - 24) / 2, 50), hd = Math.min(24, Math.max(12, (D - 12 - 12 - 14 - 8) / 2));
      for (const i of [-1, 1]) for (const j of [0, 1]) {
        halls.push(placeMass(f, uc + i * (hw / 2 + 6), 6 + 12 + 12 + hd / 2 + j * (hd + 14), hw, hd, { floors: 1, fh: 5.5, roof: { type: 'gable', tile: 'roof-zinc', color: j ? '#8f3b2d' : '#466a55', pitch: 0.3, overhang: 1.2 }, facade: { tile: 'open', bayWidth: 4, color: '#c9b89b', trim: '#444' }, features: [F('columns', { side: 0, p: [8, 5.5, 0, 1] }), F('columns', { side: 2, p: [8, 5.5, 0, 1] }), F('columns', { side: 1, p: [4, 5.5, 0, 1] }), F('columns', { side: 3, p: [4, 5.5, 0, 1] }), F('clerestory', { p: [0.5] })] }));
      }
      spec('market-hall', 'market-complex', [front, ...halls], zone.name, ['commercial', 'market']);
      for (const h of halls) hallStalls(h, r, props);
      // stall rows in the central aisle and courtyards
      for (let j = 0; j < 2; j++) for (let k = -5; k <= 5; k++) { const p = world(f, uc + k * 3.2, 6 + 24 + 6 + 24 + 7 + j * 3.4 + (j ? 24 : 0) * 0); props.push({ t: 'stall', x: p[0], z: p[1], r: f.rot, v: r.int(0, 5) }); }
      for (let k = -8; k <= 8; k++) { const p = world(f, uc + k * 3.4, 6 + 12 + 6); props.push({ t: 'stall', x: p[0], z: p[1], r: f.rot, v: r.int(0, 5) }); }
      for (let i = 0; i < 4; i++) { const p = world(f, uc - hw - 10 + i * 2, D - 8); props.push({ t: 'truck', x: p[0], z: p[1], r: f.rot, v: r.int(0, 3) }); }
      for (let k = -6; k <= 6; k++) { const p = world(f, uc + k * 7, D - 4); props.push({ t: 'umbrella', x: p[0], z: p[1], r: 0, c: ['#b3261e', '#d98a1f', '#1f7a4d', '#1d5c8a'][Math.abs(k) % 4] }); }
      return { frame: f, specs, props, role: 'market-complex', name: zone.name, description: zone.description! };
    }
    case 'terminal': {
      const hall = placeMass(f, uc, 10 + 12, Math.min(W - 12, 96), 24, { floors: 1, fh: 9, roof: { type: 'barrel', tile: 'roof-metal', color: '#8e949a' }, facade: { tile: 'glass-curtain', bayWidth: 3, groundTile: 'colonnade', groundHeight: 5, color: '#7a95a8', trim: '#1e1e1e' }, features: [F('canopy', { side: 0, p: [8, 6, 0.6, 1, 1] }), F('clock', { side: 0 }), F('sign', { side: 0, text: 'VORA CENTRAL TERMINAL', color: '#1d5c8a', p: [1] })] });
      const bayStep = Math.min(22, Math.max(14, (D - 10 - 24 - 10 - 6) / 2));
      const bays = [0, 1].map(i => placeMass(f, uc, 10 + 24 + 10 + i * bayStep, Math.min(W - 12, 100), Math.min(11, bayStep - 4), { floors: 1, fh: 5, roof: flat(0.5, 'roof-metal'), facade: { tile: 'open', bayWidth: 4, color: '#8e949a', trim: '#444' }, features: [F('columns', { side: 0, p: [10, 5, 0, 1] }), F('columns', { side: 2, p: [10, 5, 0, 1] })] }));
      const clock = placeMass(f, uc + Math.min(W - 12, 96) / 2 + 4, 10 + 3, 5, 5, { floors: 1, fh: 22, roof: flat(0.5), facade: { tile: 'concrete-strip', bayWidth: 4, color: '#c2bdb4', trim: '#333' }, features: [F('clock', { side: 0 })], noShrink: true });
      spec('terminal', 'bus-terminal', [hall, ...bays, clock], zone.name, ['civic', 'transport']);
      for (const i of [0, 1]) for (let k = -7; k <= 7; k++) { if (r.chance(0.35)) continue; const cv = 10 + 24 + 10 + i * bayStep + (k % 2 ? 1 : -1) * (bayStep / 2 - 2); if (cv > D - 4) continue; const p = world(f, uc + k * 6.4, cv); props.push({ t: 'minibus', x: p[0], z: p[1], r: f.rot + Math.PI / 2, v: r.int(0, 3) }); }
      for (let k = -5; k <= 5; k++) { const p = world(f, uc + k * 4.2, 4); props.push({ t: 'car', x: p[0], z: p[1], r: f.rot + Math.PI / 2, v: 10 }); }
      for (let k = -2; k <= 2; k++) { const p = world(f, uc + k * 18, 2); props.push({ t: 'busshelter', x: p[0], z: p[1], r: f.rot + Math.PI }); }
      return { frame: f, specs, props, role: 'transport-terminal', name: zone.name, description: zone.description! };
    }
    case 'kesari-court': {
      const ochre = '#c9a27a';
      const roof = (pitch = 0.9): BuildingMass['roof'] => ({ type: 'hip', tile: 'roof-tile', color: '#5f4030', pitch, overhang: 1.4 });
      const gate = placeMass(f, uc, 6 + 4, 14, 8, { floors: 2, fh: 3.2, roof: roof(1.0), facade: { tile: 'mud-traditional', bayWidth: 3.2, color: ochre, trim: '#5a4a3a' }, features: [F('arch', { side: 0, p: [4, 4.5] }), F('veranda', { side: 0, p: [1.8] })], noShrink: true });
      const hall = placeMass(f, uc, 6 + 8 + 14 + 11, 32, 22, { floors: 1, fh: 6, roof: roof(1.1), facade: { tile: 'mud-traditional', bayWidth: 3.2, color: ochre, trim: '#5a4a3a' }, features: [F('columns', { side: 0, p: [8, 4, 1, 1] }), F('veranda', { side: 0, p: [2.4] }), F('veranda', { side: 1, p: [2] }), F('veranda', { side: 3, p: [2] })] });
      const houses = [[-1, 0], [1, 0], [0, 1]].map(([i, j]) => placeMass(f, uc + i * 26, 6 + 8 + 14 + 11 + j * 26, i ? 14 : 30, i ? 26 : 12, { floors: 1, fh: 3.3, roof: roof(0.8), facade: { tile: 'mud-traditional', bayWidth: 3.2, color: ochre, trim: '#5a4a3a' }, features: [F('veranda', { side: i === -1 ? 1 : i === 1 ? 3 : 0, p: [1.8] })] }));
      spec('palace', 'royal-court', [gate, hall, ...houses], zone.name, ['civic', 'historic'], { fence: 'wall', gateU: uc, gateWidth: 6 });
      const sc = world(f, uc, 6 + 8 + 5); props.push({ t: 'sculpture', x: sc[0], z: sc[1], r: f.rot, s: 1.2, v: 2 });
      for (const s of [-1, 1]) { const p = world(f, uc + s * 12, 6 + 8 + 6); props.push({ t: 'tree-broad', x: p[0], z: p[1], r: 0, s: 1.5 }); }
      return { frame: f, specs, props, role: 'historic-building', name: zone.name, description: zone.description! };
    }
    case 'mosque': {
      const hall = placeMass(f, uc, 12 + 17, Math.min(W - 16, 40), 34, { floors: 1, fh: 8.5, roof: { type: 'dome', tile: 'roof-metal', color: '#2e7d5b' }, facade: { tile: 'plaster-arch', bayWidth: 3.4, groundTile: 'arcade', groundHeight: 4.6, color: '#f4f1ea', trim: '#2e7d5b' }, features: [F('minaret', { p: [42, 0] }), F('minaret', { p: [42, 1] }), F('crescent'), F('arch', { side: 0, p: [6, 7] })] });
      const ablution = placeMass(f, uc - 28, 12 + 30, 12, 8, { floors: 1, fh: 3.2, roof: flat(0.5), facade: { tile: 'plaster-plain', bayWidth: 4, color: '#f4f1ea', trim: '#2e7d5b' }, features: [] });
      spec('mosque', 'central-mosque', [hall, ablution], zone.name, ['civic', 'religious'], { fence: 'wall', gateU: uc, gateWidth: 7 });
      rowTrees(f, uc - 30, uc + 30, 5, 10, 'tree-palm', props, 1.2);
      return { frame: f, specs, props, role: 'religious', name: zone.name, description: zone.description! };
    }
    case 'ot-market':
    case 'harbour': {
      const isHarbour = zoneId === 'harbour';
      const hd = Math.min(18, Math.max(10, D * 0.4));
      const halls = [0, 1].map(i => placeMass(f, uc + (i ? 1 : -1) * Math.min(W / 4, 22), 6 + hd / 2, Math.min(W / 2 - 6, 40), hd, { floors: 1, fh: 5, roof: { type: 'gable', tile: 'roof-zinc-rust', color: i ? '#8f3b2d' : '#7b7f83', pitch: 0.3, overhang: 1.2 }, facade: { tile: 'open', bayWidth: 4, color: '#c9b89b', trim: '#444' }, features: [F('columns', { side: 0, p: [6, 5, 0, 1] }), F('columns', { side: 2, p: [6, 5, 0, 1] }), F('columns', { side: 1, p: [3, 5, 0, 1] }), F('columns', { side: 3, p: [3, 5, 0, 1] })] }));
      const office = placeMass(f, uc, Math.min(D - 6, 6 + hd + 10), 16, 9, { floors: 1, fh: 3.4, roof: flat(0.6), facade: { tile: 'block-win', bayWidth: 4, color: '#d7b089', trim: '#333' }, features: [F('sign', { side: 0, text: isHarbour ? 'OLD HARBOUR FISH MARKET' : 'OLD TOWN MARKET', color: '#1d5c8a' })] });
      spec('market-hall', isHarbour ? 'fish-market' : 'neighbourhood-market', [...halls, office], zone.name, ['commercial', 'market']);
      for (const h of halls) hallStalls(h, r, props);
      for (let k = -6; k <= 6; k++) for (const row of [0, 1]) { const cv = 6 + hd + 3 + row * 3.4; if (cv > D - 3) continue; const p = world(f, uc + k * 3.4 + (k < 0 ? -12 : 12), cv); props.push({ t: 'stall', x: p[0], z: p[1], r: f.rot, v: r.int(0, 5) }); }
      for (let k = -4; k <= 4; k++) { const p = world(f, uc + k * 5, 3); props.push({ t: 'umbrella', x: p[0], z: p[1], r: 0, c: ['#b3261e', '#d98a1f', '#1f7a4d', '#1d5c8a', '#e0b323'][Math.abs(k) % 5] }); }
      if (isHarbour) {
        const pier = world(f, uc, D + 6); props.push({ t: 'pier', x: pier[0], z: pier[1], r: f.rot, p: [48, 5] });
        for (let i = 0; i < 7; i++) { const p = world(f, uc + (i - 3) * 9 + r.range(-2, 2), D + 14 + r.range(0, 30)); props.push({ t: 'boat', x: p[0], z: p[1], r: r.range(0, 6.28), v: r.int(0, 2) }); }
        for (let i = 0; i < 3; i++) { const p = world(f, uc - 20 + i * 6, D - 6); props.push({ t: 'truck', x: p[0], z: p[1], r: f.rot, v: 1 }); }
      }
      return { frame: f, specs, props, role: 'market', name: zone.name, description: zone.description! };
    }
    case 'stadium': {
      const bowl = placeMass(f, uc, D / 2, Math.min(W - 30, 150), Math.min(D - 40, 118), { floors: 1, fh: 22, roof: { type: 'flat', tile: 'roof-metal', parapet: 0 }, facade: { tile: 'concrete-strip', bayWidth: 4, color: '#c2bdb4', trim: '#1d5c8a' }, features: [F('pitchlights', { p: [4] }), F('sign', { side: 0, text: 'VORA NATIONAL STADIUM', color: '#1d5c8a' })] });
      spec('stadium', 'stadium', [bowl], zone.name, ['civic', 'sport'], { fence: 'railing', gateU: uc, gateWidth: 12 });
      if (bowl) { // floodlight masts just outside the four corners of the bowl
        const c = Math.cos(bowl.rot), sn = Math.sin(bowl.rot);
        for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const lx = sx * (bowl.w / 2 + 7), lz = sz * (bowl.d / 2 + 7); props.push({ t: 'floodlight', x: r2(bowl.x + lx * c - lz * sn), z: r2(bowl.z + lx * sn + lz * c), r: 0, p: [38] }); }
      }
      props.push(...parkingRows(f, r, 16, Math.min(W - 20, 120)));
      for (let k = -5; k <= 5; k++) { const p = world(f, uc + k * 6, 3); props.push({ t: 'flag', x: p[0], z: p[1], r: 0 }); }
      rowTrees(f, uc - 60, uc + 60, 18, 12, 'tree-palm', props, 1.2);
      return { frame: f, specs, props, role: 'stadium', name: zone.name, description: zone.description! };
    }
    case 'works': {
      const turbine = placeMass(f, uc, 20 + 16, 64, 32, { floors: 1, fh: 15, roof: { type: 'gable', tile: 'roof-metal', color: '#7a8187', pitch: 0.18, overhang: 0.5 }, facade: { tile: 'panel-industrial', bayWidth: 4, color: '#9aa5b1', trim: '#444' }, features: [F('stack', { p: [55, 2] }), F('sign', { side: 0, text: 'MUNICIPAL POWER STATION', color: '#1d5c8a' }), F('clerestory', { p: [0.5] })] });
      const control = placeMass(f, uc - 46, 20 + 8, 22, 14, { floors: 2, fh: 3.6, roof: flat(0.9), facade: { tile: 'concrete-grid', bayWidth: 3.4, color: '#c2bdb4', trim: '#333' }, features: [F('antenna'), F('flagpoles', { side: 0, p: [1] })] });
      const treatment = placeMass(f, uc + 40, Math.min(D - 12, 20 + 40 + 12), 36, 20, { floors: 1, fh: 6, roof: flat(0.6, 'roof-membrane'), facade: { tile: 'warehouse', bayWidth: 5, color: '#b8b2a8', trim: '#444' }, features: [F('sign', { side: 0, text: 'WATER TREATMENT WORKS', color: '#1f7a4d' })] });
      spec('utility', 'power-and-water-works', [turbine, control, treatment], zone.name, ['industrial', 'utility'], { fence: 'fence', gateU: uc - 20, gateWidth: 10 });
      for (let i = 0; i < 3; i++) { const p = world(f, uc - 40 + i * 14, Math.min(D - 10, 20 + 48)); props.push({ t: 'tank', x: p[0], z: p[1], r: 0, s: [6, 9, 6], v: 1 }); }
      for (let i = 0; i < 2; i++) { const p = world(f, uc + 20 + i * 24, Math.min(D - 16, 20 + 76)); props.push({ t: 'tank', x: p[0], z: p[1], r: 0, s: [14, 3, 14], v: 2 }); }
      const wt = world(f, uc + 60, 14); props.push({ t: 'tank', x: wt[0], z: wt[1], r: 0, s: [7, 30, 7], v: 3 });
      let prev: Vec2 | null = null;
      for (let i = 0; i < 4; i++) { const p = world(f, uc - 60 + i * 36, D - 10); props.push({ t: 'pylon', x: p[0], z: p[1], r: f.rot, s: 1 }); if (prev) props.push({ t: 'wire', x: prev[0], z: prev[1], r: 0, e: p, p: [28, 2.5] }); prev = p; }
      return { frame: f, specs, props, role: 'utility', name: zone.name, description: zone.description! };
    }
    case 'port': {
      const sheds = [-1, 0, 1].map(i => placeMass(f, uc + i * 58, 14 + 12, 48, 24, { floors: 1, fh: 9, roof: { type: 'barrel', tile: 'roof-metal', color: '#7a8187' }, facade: { tile: 'warehouse', bayWidth: 5, color: ['#7c8a96', '#8c7f73', '#9aa5b1'][i + 1], trim: '#444' }, features: [F('rollerdoor', { side: 0, p: [3] }), F('rollerdoor', { side: 2, p: [3] }), F('sign', { side: 0, text: ['VORA PORT AUTHORITY', 'TRANSIT SHED 2', 'COLD STORE'][i + 1], color: '#1d5c8a' })] }));
      const customs = placeMass(f, uc - 80, 14 + 10, 26, 16, { floors: 3, fh: 3.6, roof: flat(1), facade: { tile: 'concrete-strip', bayWidth: 4, color: '#c2bdb4', trim: '#1d5c8a' }, features: [F('flagpoles', { side: 0, p: [2] }), F('sign', { side: 0, text: 'CUSTOMS & PILOT STATION', color: '#1d5c8a' }), F('antenna')] });
      spec('port', 'container-port', [...sheds, customs], zone.name, ['industrial', 'port'], { fence: 'fence', gateU: uc - 40, gateWidth: 12 });
      for (let i = -8; i <= 8; i++) for (let j = 0; j < 3; j++) { if (r.chance(0.25)) continue; const cv = 14 + 24 + 14 + j * 3.2; if (cv > D - 14) continue; const p = world(f, uc + i * 6.6, cv); props.push({ t: 'container', x: p[0], z: p[1], r: f.rot, v: r.int(0, 5), p: [r.int(1, 3)] }); }
      for (let i = -1; i <= 1; i++) { const p = world(f, uc + i * 60, D - 8); props.push({ t: 'quaycrane', x: p[0], z: p[1], r: f.rot, p: [36] }); }
      const quay = world(f, uc, D - 1); props.push({ t: 'pier', x: quay[0], z: quay[1], r: f.rot, p: [Math.min(W - 10, 200), 8], v: 1 });
      const ship = world(f, uc + 10, D + 26); props.push({ t: 'boat', x: ship[0], z: ship[1], r: f.rot, v: 2 });
      for (let i = 0; i < 4; i++) { const p = world(f, uc - 60 + i * 8, 6); props.push({ t: 'truck', x: p[0], z: p[1], r: f.rot + Math.PI / 2, v: 2 }); }
      for (let i = -2; i <= 2; i++) { const p = world(f, uc + i * 45, 14 + 24 + 8); props.push({ t: 'floodlight', x: p[0], z: p[1], r: 0, p: [30] }); }
      return { frame: f, specs, props, role: 'port', name: zone.name, description: zone.description! };
    }
    case 'unity-square': {
      const c = world(f, uc, D / 2); props.push({ t: 'monument', x: c[0], z: c[1], r: f.rot, p: [34] });
      ringProps(f, uc, D / 2, 16, 12, 'bench', props);
      ringProps(f, uc, D / 2, 11, 16, 'bollard', props);
      const fo = world(f, uc, D / 2 + 26); props.push({ t: 'fountain', x: fo[0], z: fo[1], r: 0, s: 2.2 });
      const fo2 = world(f, uc, D / 2 - 26); props.push({ t: 'fountain', x: fo2[0], z: fo2[1], r: 0, s: 2.2 });
      for (let k = -4; k <= 4; k++) { const p = world(f, uc + k * 9, 4); props.push({ t: 'flag', x: p[0], z: p[1], r: 0 }); }
      rowTrees(f, uc - 44, uc + 44, D - 5, 8, 'tree-palm', props, 1.2);
      rowTrees(f, uc - 44, uc - 44, 10, 1, 'tree-palm', props, 1.2);
      for (const s of [-1, 1]) rowTrees(f, uc + s * 44, uc + s * 44, 10, 1, 'tree-palm', props, 1.2);
      for (const s of [-1, 1]) for (let cv = 10; cv <= D - 10; cv += 8) { const p = world(f, uc + s * 44, cv); props.push({ t: 'tree-palm', x: p[0], z: p[1], r: 0, s: 1.2 }); }
      for (const s of [-1, 1]) for (let cv = 14; cv <= D - 14; cv += 12) { const p = world(f, uc + s * 30, cv); props.push({ t: 'lamp-double', x: p[0], z: p[1], r: f.rot }); }
      const sc = world(f, uc + 30, D / 2); props.push({ t: 'sculpture', x: sc[0], z: sc[1], r: f.rot, s: 1.6, v: 1 });
      return { frame: f, specs, props, role: 'city-square', name: zone.name, description: zone.description! };
    }
    case 'kesari-square': {
      const c = world(f, uc, D / 2); props.push({ t: 'fountain', x: c[0], z: c[1], r: 0, s: 1.1, v: 1 });
      ringProps(f, uc, D / 2, 12, 8, 'bench', props);
      ringProps(f, uc, D / 2, 22, 10, 'tree-neem', props, { s: 1.5 });
      for (let k = -3; k <= 3; k++) { const p = world(f, uc + k * 4.5, D - 6); props.push({ t: 'stall', x: p[0], z: p[1], r: f.rot, v: r.int(0, 5) }); }
      const sc = world(f, uc, 8); props.push({ t: 'sculpture', x: sc[0], z: sc[1], r: f.rot, s: 1.3, v: 2 });
      for (const s of [-1, 1]) { const p = world(f, uc + s * 20, D / 2); props.push({ t: 'lamp-double', x: p[0], z: p[1], r: f.rot }); }
      return { frame: f, specs, props, role: undefined, name: zone.name, description: zone.description! };
    }
    case 'central-park':
    case 'heights-park':
    case 'ge-park': {
      const big = zoneId === 'central-park';
      const pr = parkProps(f, r, big ? 'central' : zoneId === 'ge-park' ? 'play' : 'view');
      props.push(...pr);
      if (big) {
        const band = placeMass(f, uc + 30, D * 0.65, 9, 9, { floors: 1, fh: 4, roof: { type: 'dome', tile: 'roof-metal', color: '#3d6b5a' }, facade: { tile: 'open', bayWidth: 4, color: '#efe6d6', trim: '#2b2b2b' }, features: [F('columns', { side: 0, p: [3, 4, 1, 1] }), F('columns', { side: 2, p: [3, 4, 1, 1] }), F('columns', { side: 1, p: [3, 4, 1, 1] }), F('columns', { side: 3, p: [3, 4, 1, 1] })], noShrink: true });
        spec('community', 'bandstand', [band], 'Liberty Park Bandstand', ['park']);
        const kiosk = placeMass(f, uc - 40, 10, 8, 6, { floors: 1, fh: 3.2, roof: { type: 'hip', tile: 'roof-zinc', color: '#466a55', pitch: 0.4, overhang: 0.8 }, facade: { tile: 'shopfront', bayWidth: 5, color: '#e6d6b8', trim: '#466a55' }, features: [F('sign', { side: 0, text: 'PARK CAFE', color: '#1f7a4d' })], noShrink: true });
        spec('restaurant', 'park-cafe', [kiosk], 'Liberty Park Cafe', ['park', 'food']);
      }
      return { frame: f, specs, props, role: zone.role, name: zone.name, description: zone.description! };
    }
  }
  return null;
}


/** rows of stalls under an open market hall (mass local coords: x along width, z along depth; front = -z) */
function hallStalls(m: BuildingMass | null, r: RNG, props: P[]) {
  if (!m) return;
  const c = Math.cos(m.rot), sn = Math.sin(m.rot);
  const W = (x: number, z: number): Vec2 => [r2(m.x + x * c - z * sn), r2(m.z + x * sn + z * c)];
  // stall rows run along the hall's long axis, with a 3 m aisle between facing pairs
  const along = m.w >= m.d;
  const L = along ? m.w : m.d, T = along ? m.d : m.w;
  const nRows = Math.max(1, Math.floor((T - 2) / 6.4));
  for (let row = 0; row < nRows; row++) {
    const t0 = -T / 2 + 1.5 + row * 6.4;
    for (const side of [0, 1]) {
      const t = t0 + side * 3.0 + 0.5;
      if (t > T / 2 - 1.2) continue;
      for (let l = -L / 2 + 2.5; l <= L / 2 - 2.5; l += 3.3) {
        if (!r.chance(0.82)) continue;
        const x = along ? l : t, z = along ? t : l;
        const p = W(x, z);
        // stalls face the aisle: side 0 faces +t, side 1 faces -t
        const face = along ? (side ? 0 : Math.PI) : (side ? Math.PI / 2 : -Math.PI / 2);
        props.push({ t: 'stall', x: p[0], z: p[1], r: m.rot + face, v: r.int(0, 5) });
      }
    }
  }
}

export function parkProps(f: Frame, r: RNG, kind: 'central' | 'play' | 'view' | 'plain'): P[] {
  const props: P[] = [];
  const uc = (f.umin + f.umax) / 2, W = f.width, D = f.depth;
  // cross paths
  const px = world(f, uc, D / 2); props.push({ t: 'path', x: px[0], z: px[1], r: f.rot, s: [W - 6, 0.1, 3] });
  const pz = world(f, uc, D / 2); props.push({ t: 'path', x: pz[0], z: pz[1], r: f.rot + Math.PI / 2, s: [D - 6, 0.1, 3] });
  const diag = Math.min(W, D) * 0.75;
  props.push({ t: 'path', x: px[0], z: px[1], r: f.rot + Math.PI / 4, s: [diag, 0.1, 2.4] });
  props.push({ t: 'path', x: px[0], z: px[1], r: f.rot - Math.PI / 4, s: [diag, 0.1, 2.4] });
  // trees (clustered, keeping off the paths)
  const n = Math.round((W * D) / 260);
  for (let i = 0; i < n; i++) {
    const cu = uc + r.range(-W / 2 + 3, W / 2 - 3), cv = r.range(3, D - 3);
    if (Math.abs(cu - uc) < 2.5 || Math.abs(cv - D / 2) < 2.5) continue;
    if (Math.abs((cu - uc) - (cv - D / 2)) < 2.2 || Math.abs((cu - uc) + (cv - D / 2)) < 2.2) continue;
    if (Math.hypot(cu - uc, cv - D / 2) < 9) continue;
    const p = world(f, cu, cv);
    props.push({ t: r.weighted([['tree-broad', 4], ['tree-neem', 3], ['tree-palm', 2], ['tree-small', 2]]), x: p[0], z: p[1], r: r.range(0, 6.28), s: r.range(0.85, 1.4) });
  }
  // benches and lamps along the main paths
  for (let cu = uc - W / 2 + 8; cu < uc + W / 2 - 6; cu += 11) { for (const s of [-1, 1]) { const p = world(f, cu, D / 2 + s * 2.6); props.push({ t: 'bench', x: p[0], z: p[1], r: f.rot + (s > 0 ? Math.PI : 0) }); } const l = world(f, cu + 5, D / 2 + 2.4); props.push({ t: 'lamp', x: l[0], z: l[1], r: 0, v: 1 }); const b = world(f, cu + 2, D / 2 - 2.4); props.push({ t: 'bin', x: b[0], z: b[1], r: 0 }); }
  for (let cv = 8; cv < D - 6; cv += 12) { const l = world(f, uc + 2.4, cv); props.push({ t: 'lamp', x: l[0], z: l[1], r: 0, v: 1 }); }
  const c = world(f, uc, D / 2);
  if (kind === 'central') { props.push({ t: 'monument', x: c[0], z: c[1], r: f.rot, p: [28] }); ringProps(f, uc, D / 2, 7, 8, 'bench', props); const pg = world(f, uc - W / 4, D * 0.25); props.push({ t: 'playground', x: pg[0], z: pg[1], r: f.rot }); const fo = world(f, uc + W / 4, D * 0.25); props.push({ t: 'fountain', x: fo[0], z: fo[1], r: 0, s: 1.4 }); }
  else if (kind === 'play') { props.push({ t: 'playground', x: c[0], z: c[1], r: f.rot }); const g = world(f, uc + W / 4, D * 0.72); props.push({ t: 'goalpost', x: g[0], z: g[1], r: f.rot, p: [Math.min(W * 0.4, 30), Math.min(D * 0.35, 18)] }); }
  else if (kind === 'view') { props.push({ t: 'fountain', x: c[0], z: c[1], r: 0, s: 1.1 }); const sc = world(f, uc, D * 0.8); props.push({ t: 'sculpture', x: sc[0], z: sc[1], r: f.rot, s: 1.2 }); }
  return props;
}
