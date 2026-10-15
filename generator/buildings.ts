/** Parcels → buildings (procedural archetypes + authored landmarks), fences, gates and landmark records. */
import type { Block, Parcel, Building, BuildingMass, Landmark, Prop, Vec2, DistrictCode, RoadEdge } from '../src/shared/types';
import { CLASS_RANK } from '../src/shared/types';
import { v2, rectCorners, centroid } from '../src/shared/geom';
import { RNG } from '../src/shared/rng';
import { Ground } from '../src/shared/ground';
import { ARCHETYPES, frameOf, wideFrame, type Archetype, type Ctx, type Spec, type Frame, world } from './archetypes';
import { buildLandmark } from './landmarks';
import { ZONES } from './config';

type P = Omit<Prop, 'y'>;
export interface BuildingsResult { buildings: Building[]; landmarks: Landmark[]; props: P[]; }

const A = ARCHETYPES;

interface Quota { [district: string]: { [archetype: string]: number } }
const QUOTAS: Quota = {
  CD: { hotel: 3, bank: 4, construction: 2, church: 1, residentialTower: 2, restaurant: 4 },
  MQ: { supermarket: 3, school: 1, clinic: 1, church: 1, mosque: 1, restaurant: 5, fuelStation: 1 },
  NH: { school: 1, clinic: 1, shop: 3, church: 1, fuelStation: 1, restaurant: 1 },
  OT: { school: 1, clinic: 2, mosque: 2, church: 1, workshop: 4, shop: 6, restaurant: 3, fuelStation: 1 },
  ID: { fuelStation: 1, construction: 1, workshop: 10, supermarket: 1 },
  GE: { school: 2, clinic: 2, church: 2, mosque: 1, community: 2, shop: 5, apartments: 6, fuelStation: 1, construction: 1, restaurant: 2 },
};

function candidates(d: DistrictCode, p: Parcel, block: Block, f: Frame, frontRank: number, r: RNG): Archetype[] {
  const big = f.width >= 30 && f.depth >= 28, mid = f.width >= 16 && f.depth >= 16;
  switch (d) {
    case 'CD':
      if (block.use === 'commercial') {
        const towerOk = f.width >= 24 && f.depth >= 22 && frontRank >= CLASS_RANK.secondary;
        const pTower = Math.max(0.25, 0.85 - Math.hypot(centroid(p.polygon)[0], centroid(p.polygon)[1]) / 500);
        if (towerOk && r.chance(pTower)) return [A.officeTower, A.hotel, A.office, A.bank, A.apartments, A.restaurant, A.shop];
        return big ? r.shuffle([A.office, A.hotel, A.bank]).concat([A.apartments, A.restaurant, A.shop]) : [A.office, A.bank, A.apartments, A.restaurant, A.shop];
      }
      if (f.width >= 24 && f.depth >= 22 && r.chance(0.35)) return [A.residentialTower, A.apartments, A.office, A.restaurant, A.shop];
      return r.chance(0.5) ? [A.apartments, A.office, A.restaurant, A.shop] : [A.office, A.apartments, A.restaurant, A.shop];
    case 'MQ':
      if (block.use === 'market') return [A.shophouse, A.restaurant, A.shop];
      return big ? r.shuffle([A.supermarket, A.warehouse, A.office]).concat([A.shophouse, A.workshop, A.shop]) : [A.shophouse, A.workshop, A.shop];
    case 'NH':
      if (f.width >= 28 && f.depth >= 26) return r.chance(0.4) ? [A.mansion, A.villa, A.duplex] : [A.villa, A.mansion, A.duplex];
      if (mid) return r.chance(0.6) ? [A.villa, A.duplex, A.bungalow] : [A.duplex, A.villa, A.bungalow];
      return [A.duplex, A.bungalow, A.semi];
    case 'OT':
      if (block.use === 'mixed' && frontRank >= CLASS_RANK.secondary) return [A.shophouse, A.courtyardHouse, A.restaurant, A.shop];
      if (block.use === 'mixed') return r.chance(0.5) ? [A.shophouse, A.courtyardHouse, A.bungalow, A.shop] : [A.courtyardHouse, A.shophouse, A.bungalow];
      return r.chance(0.55) ? [A.courtyardHouse, A.bungalow, A.duplex, A.terrace] : r.chance(0.5) ? [A.bungalow, A.courtyardHouse, A.semi] : [A.duplex, A.terrace, A.bungalow, A.courtyardHouse];
    case 'ID':
      if (p.area > 3600 && r.chance(0.45)) return [A.factory, A.warehouse, A.workshop];
      if (p.area > 1800) return [A.warehouse, A.factory, A.workshop];
      return [A.workshop, A.warehouse];
    case 'GE':
      if (block.use === 'civic') return [A.school, A.clinic, A.community, A.church];
      if (frontRank >= CLASS_RANK.secondary && big) return [A.apartments, A.semi, A.terrace];
      return r.weighted([[[A.semi, A.terrace, A.bungalow], 4], [[A.terrace, A.semi, A.duplex], 3], [[A.bungalow, A.semi, A.duplex], 3], [[A.duplex, A.semi, A.bungalow], 2]]);
    case 'HL':
      return r.chance(0.72) ? [A.bungalow, A.shop] : r.chance(0.5) ? [A.workshop, A.bungalow] : [A.shop, A.bungalow];
    default:
      return [A.bungalow];
  }
}

function quotaCandidates(d: DistrictCode, quota: Record<string, number>, f: Frame, frontRank: number, block: Block, isCorner: boolean): Archetype[] {
  const out: Archetype[] = [];
  const want = (name: keyof typeof A, cond: boolean) => { if (cond && (quota[name] ?? 0) > 0) out.push(A[name]); };
  want('fuelStation', isCorner && frontRank >= CLASS_RANK.secondary && f.width >= 24 && f.depth >= 20);
  want('school', f.width >= 36 && f.depth >= 36 && frontRank <= CLASS_RANK.secondary);
  want('hotel', f.width >= 28 && f.depth >= 26 && frontRank >= CLASS_RANK.secondary);
  want('supermarket', f.width >= 24 && f.depth >= 26);
  want('residentialTower', f.width >= 26 && f.depth >= 22 && block.use !== 'commercial');
  want('clinic', f.width >= 16 && f.depth >= 16);
  want('mosque', f.width >= 22 && f.depth >= 22);
  want('church', f.width >= 16 && f.depth >= 24);
  want('community', f.width >= 16 && f.depth >= 14);
  want('bank', f.width >= 20 && f.depth >= 18 && frontRank >= CLASS_RANK.secondary);
  want('construction', f.width >= 18 && f.depth >= 18);
  want('apartments', f.width >= 16 && f.depth >= 14 && frontRank >= CLASS_RANK.secondary);
  want('restaurant', f.width >= 12 && f.depth >= 12 && frontRank >= CLASS_RANK.local);
  want('workshop', f.width >= 9 && f.depth >= 9 && (d === 'ID' || frontRank <= CLASS_RANK.local));
  want('shop', f.width >= 8 && f.depth >= 8 && frontRank >= CLASS_RANK.local);
  return out;
}

const ARCHETYPE_NAME = new Map<Archetype, string>(Object.entries(A).map(([k, v]) => [v as Archetype, k]));

export function buildBuildings(blocks: Block[], parcels: Parcel[], edgeById: Map<string, RoadEdge>, ground: Ground, rng: RNG, nodes: { x: number; z: number; edges: string[] }[]): BuildingsResult {
  const buildings: Building[] = [];
  const landmarks: Landmark[] = [];
  const props: P[] = [];
  const blockById = new Map(blocks.map(b => [b.id, b]));
  let bid = 0;

  const finalize = (spec: Spec, parcel: Parcel, f: Frame, landmark = false): Building => {
    const block = blockById.get(parcel.blockId)!;
    // elevations
    let minBase = Infinity;
    const podiumTop = new Map<number, number>();
    spec.masses.forEach((m, i) => {
      const samples: Vec2[] = [...m.footprint, [m.x, m.z], ...m.footprint.map((p, k) => v2.lerp(p, m.footprint[(k + 1) % 4], 0.5))];
      let hi = -Infinity, lo = Infinity;
      for (const s of samples) { const h = ground.height(s[0], s[1]); hi = Math.max(hi, h); lo = Math.min(lo, h); }
      if ((m as any).onTop && i > 0) {
        const base = spec.masses[0];
        m.baseY = r2(base.baseY + base.floors * base.floorHeight);
        m.plinthBottom = m.baseY;
      } else {
        m.baseY = r2(hi + 0.12); m.plinthBottom = r2(lo - 0.9);
      }
      delete (m as any).onTop;
      minBase = Math.min(minBase, m.baseY);
      podiumTop.set(i, m.baseY + m.floors * m.floorHeight);
    });
    let height = 0, floors = 0;
    for (const m of spec.masses) { const top = m.baseY + m.floors * m.floorHeight + (m.roof.type === 'flat' || m.roof.type === 'parapet' ? (m.roof.parapet ?? 0) : (m.roof.type === 'dome' ? Math.min(m.w, m.d) * 0.45 : Math.min(m.w, m.d) * 0.5 * (m.roof.pitch ?? 0.4))); height = Math.max(height, top - minBase); floors = Math.max(floors, m.floors + (m.baseY > minBase + 1 ? Math.round((m.baseY - minBase) / 3.6) : 0)); }
    const m0 = spec.masses[0];
    const front = v2.sub([m0.x, m0.z], v2.scale(f.vin, m0.d / 2));
    const b: Building = {
      id: `B${bid++}`, parcelId: parcel.id, blockId: parcel.blockId, districtId: parcel.districtId, archetype: spec.archetype, use: spec.use,
      name: spec.name || parcel.address, address: parcel.address, masses: spec.masses, height: r2(height), floors,
      entrance: { x: r2(front[0]), z: r2(front[1]), dir: [r2(-f.vin[0]), r2(-f.vin[1])] }, landmark: landmark || undefined, tags: spec.tags,
    };
    buildings.push(b);
    parcel.buildingId = b.id;
    parcel.use = 'building';
    parcel.fence = spec.fence ?? null;
    if (spec.fence && spec.fence !== 'hedge') {
      const gu = Math.max(f.umin + 3, Math.min(f.umax - 3, spec.gateU ?? 0));
      const g = world(f, gu, 0);
      parcel.gate = { x: g[0], z: g[1], dir: [r2(-f.vin[0]), r2(-f.vin[1])], width: spec.gateWidth ?? 3.6 };
    } else if (spec.fence === 'hedge') {
      const gu = Math.max(f.umin + 2, Math.min(f.umax - 2, spec.gateU ?? 0));
      const g = world(f, gu, 0);
      parcel.gate = { x: g[0], z: g[1], dir: [r2(-f.vin[0]), r2(-f.vin[1])], width: 2.4 };
    }
    if (spec.props) props.push(...spec.props);
    void block;
    return b;
  };

  // ── landmarks on reserved sites ──
  const zoneParcels = parcels.filter(p => { const b = blockById.get(p.blockId)!; return b.reservedFor && (p.use === 'open' || p.use === 'park' || p.use === 'plaza' || p.use === 'stalls'); }).sort((a, b) => b.area - a.area);
  const doneZones = new Set<string>();
  for (const p of zoneParcels) {
    const b = blockById.get(p.blockId)!;
    const zoneId = b.reservedFor!;
    if (doneZones.has(zoneId)) continue;
    const res = buildLandmark(zoneId, p, rng);
    if (!res) continue;
    const f = res.frame;
    doneZones.add(zoneId);
    const ids: string[] = [];
    for (const s of res.specs) { const bb = finalize(s, p, f, true); ids.push(bb.id); }
    // the reserved parcel keeps its public character
    const zone = ZONES.find(z => z.id === zoneId)!;
    p.use = zone.use === 'plaza' ? 'plaza' : zone.use === 'park' ? 'park' : zone.use === 'market' ? 'stalls' : zone.use === 'transport' ? 'parking' : 'open';
    if (ids.length) { p.buildingId = ids[0]; }
    props.push(...res.props);
    if (res.role) {
      const c = centroid(p.polygon);
      const d = Math.max(90, Math.sqrt(p.area) * 1.3);
      const lm: Landmark = { id: `L-${zoneId}`, role: res.role, name: res.name, districtId: p.districtId, x: r2(c[0]), z: r2(c[1]), buildingIds: ids, description: res.description, view: { pos: [r2(c[0] + d * 0.7), r2(d * 0.55 + 20), r2(c[1] + d * 0.7)], target: [r2(c[0]), 10, r2(c[1])] } };
      if (res.plateau) {
        // terrace height = mean graded ground over the site (sampled on a grid), rounded to 0.1 m
        const bb = p.polygon.reduce((a, q) => ({ minX: Math.min(a.minX, q[0]), maxX: Math.max(a.maxX, q[0]), minZ: Math.min(a.minZ, q[1]), maxZ: Math.max(a.maxZ, q[1]) }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
        let sum = 0, n = 0;
        for (let x = bb.minX; x <= bb.maxX; x += 4) for (let z = bb.minZ; z <= bb.maxZ; z += 4) { sum += ground.height(x, z); n++; }
        lm.plateau = { polygon: res.plateau.polygon, y: Math.round((sum / Math.max(1, n)) * 10) / 10 };
        lm.view = { pos: [r2(c[0] + 40), r2(lm.plateau.y + 26), r2(c[1] + 70)], target: [r2(c[0]), r2(lm.plateau.y + 4), r2(c[1])] };
      }
      landmarks.push(lm);
    }
  }

  // ── procedural buildings ──
  const quotas: Quota = JSON.parse(JSON.stringify(QUOTAS));
  const byDistrict = new Map<string, Parcel[]>();
  for (const p of parcels) { if (p.use !== 'building' || p.buildingId) continue; const arr = byDistrict.get(p.districtId) ?? []; arr.push(p); byDistrict.set(p.districtId, arr); }
  const junctionPts = nodes.filter(n => n.edges.length >= 3).map(n => [n.x, n.z] as Vec2);
  const lastByBlock = new Map<string, string[]>();

  for (const [district, list] of byDistrict) {
    const d = district as DistrictCode;
    const quota = quotas[d] ?? {};
    // big parcels first so institutions find room; order is deterministic
    const ordered = list.slice().sort((a, b) => b.area - a.area);
    for (const p of ordered) {
      const block = blockById.get(p.blockId)!;
      const f = frameOf(p); if (!f) { p.use = 'garden'; continue; }
      const edge = edgeById.get(p.frontageEdgeId!)!;
      const frontRank = CLASS_RANK[edge.cls];
      const r = rng.fork('bld-' + p.id);
      const c = centroid(p.polygon);
      const isCorner = junctionPts.some(j => v2.dist(j, c) < 38);
      const ctx: Ctx = { f, rng: r, district: d, distToCenter: Math.hypot(c[0], c[1]), frontCls: edge.cls, blockUse: block.use };
      const tail: Archetype[] = block.use === 'residential' || d === 'NH' ? [A.cottage, A.kioskShop] : block.use === 'industrial' ? [A.workshop, A.kioskShop, A.cottage] : [A.kioskShop, A.cottage];
      let chain = [...quotaCandidates(d, quota, f, frontRank, block, isCorner), ...candidates(d, p, block, f, frontRank, r), ...tail];
      // variety: avoid repeating the previous archetype in the same block when alternatives exist
      const recent = lastByBlock.get(p.blockId) ?? [];
      if (recent.length && chain.length > 1) {
        const last = recent[recent.length - 1];
        const idx = chain.findIndex(a => ARCHETYPE_NAME.get(a) !== last);
        if (idx > 0 && !(last === 'shophouse' || last === 'terrace')) { const [alt] = chain.splice(idx, 1); chain.unshift(alt); }
      }
      let spec: Spec | null = null; let used = '';
      for (const arch of chain) {
        spec = arch(ctx);
        if (spec) { used = ARCHETYPE_NAME.get(arch)!; break; }
      }
      if (!spec) {
        // too small for a building: garden / parking / kiosks
        p.use = d === 'MQ' || d === 'OT' ? 'stalls' : d === 'ID' ? 'yard' : d === 'CD' ? 'parking' : 'garden';
        continue;
      }
      if (quota[used] !== undefined) quota[used]--;
      finalize(spec, p, f);
      recent.push(used); lastByBlock.set(p.blockId, recent.slice(-3));
    }
  }

  // gateway landmark (prop based) and bridge records
  landmarks.push({ id: 'L-north-gate', role: 'gateway', name: 'North Gate', districtId: 'GE', x: 0, z: -690, buildingIds: [], description: 'The monumental gateway on Meridian Avenue welcoming travellers from the north.', view: { pos: [60, 40, -770], target: [0, 12, -690] } });
  landmarks.push({ id: 'L-unity-bridge', role: 'bridge', name: 'Unity Bridge', districtId: 'CD', x: 462, z: 0, buildingIds: [], description: 'Cable-stayed crossing of the Ose River linking the city centre to the Industrial District.', view: { pos: [380, 60, 120], target: [462, 12, 0] } });
  return { buildings, landmarks, props };
}

export function r2(v: number, d = 2): number { const m = Math.pow(10, d); return Math.round(v * m) / m; }
export { rectCorners, type BuildingMass };
