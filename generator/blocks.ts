/** Faces of the road graph → city blocks with buildable polygons and land use. */
import type { Block, BlockUse, Polygon, Vec2, RoadEdge, RoadNode } from '../src/shared/types';
import { corridorHalfWidth, CLASS_RANK } from '../src/shared/types';
import { insetPolygon, centroid, area, dedupe, pointInPolygon, bbox, clipHalfPlane, v2, simplifyPolygon } from '../src/shared/geom';
import { Terrain, distToRiver, shorelineZ } from '../src/shared/terrain';
import { RNG } from '../src/shared/rng';
import type { RoadBuild } from './roads';
import { districtAt, zoneAt } from './roads';
import { HINTERLAND } from './config';

export const BUILDING_LINE = 0.5;

export function buildBlocks(rb: RoadBuild, terrain: Terrain, rng: RNG): Block[] {
  const edgeOutIds: Map<number, string> = (rb.graph as any).edgeOutIds;
  const blocks: Block[] = [];
  let bi = 0;
  for (const f of rb.faces) {
    // polygon with per-side edge ids (dedupe consecutive duplicates while keeping side mapping)
    const pts: Vec2[] = []; const sides: string[] = [];
    for (let i = 0; i < f.polygon.length; i++) {
      const p = f.polygon[i];
      if (pts.length && v2.dist(pts[pts.length - 1], p) < 0.05) continue;
      pts.push(p); sides.push(edgeOutIds.get(f.sideEdge[i])!);
    }
    if (pts.length > 1 && v2.dist(pts[0], pts[pts.length - 1]) < 0.05) { pts.pop(); sides.pop(); }
    if (pts.length < 3) continue;
    const a = area(pts);
    if (a < 150) continue;
    const c = centroid(pts);
    const d = districtAt(c);
    const districtId = d ? d.code : HINTERLAND.code;
    const edgeIds = [...new Set(sides)];
    // inset distances per side
    const dists = sides.map(id => { const e = rb.edgeById.get(id)!; return corridorHalfWidth(e.cls) + BUILDING_LINE; });
    let buildable: Polygon | null = insetPolygon(pts, dists);
    // roundabout corners: cut the corner back behind the circle
    if (buildable) {
      for (const n of rb.nodes) {
        if (n.kind !== 'roundabout') continue;
        const np: Vec2 = [n.x, n.z];
        if (!pts.some(p => v2.dist(p, np) < 1)) continue;
        const dir = v2.norm(v2.sub(c, np));
        const o = v2.add(np, v2.scale(dir, (n.radius ?? 15) + 7));
        buildable = clipHalfPlane(buildable, o, dir);
        if (buildable.length < 3 || area(buildable) < 40) { buildable = null; break; }
      }
    }
    if (buildable) buildable = simplifyPolygon(dedupe(buildable, 0.02), 0.03);
    if (buildable && (buildable.length < 3 || area(buildable) < 60)) buildable = null;

    // water fraction
    const bb = bbox(pts); let wet = 0, tot = 0, lowBank = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const p: Vec2 = [bb.minX + (bb.maxX - bb.minX) * ((i + 0.5) / 6), bb.minZ + (bb.maxZ - bb.minZ) * ((j + 0.5) / 6)];
      if (!pointInPolygon(p, pts)) continue;
      tot++;
      if (terrain.height(p[0], p[1]) < 0.3) wet++;
      else if (distToRiver(p[0], p[1]) < 60 || p[1] > shorelineZ(p[0]) - 60) lowBank++;
    }
    const wetFrac = tot ? wet / tot : 0, bankFrac = tot ? lowBank / tot : 0;

    const zone = zoneAt(c, -1);
    let use: BlockUse;
    const edgeClasses = edgeIds.map(id => rb.edgeById.get(id)!.cls);
    const maxRank = Math.max(...edgeClasses.map(cl => CLASS_RANK[cl]));
    if (zone) use = zone.use;
    else if (wetFrac > 0.5) use = 'water';
    else if (wetFrac > 0.12 || bankFrac > 0.6) use = 'park';
    else if (districtId === 'HL') use = 'farmland';
    else if (!buildable) use = 'open';
    else {
      const r = rng.fork('use-' + bi).next();
      switch (districtId) {
        case 'CD': use = maxRank >= CLASS_RANK.arterial ? 'commercial' : (r < 0.35 ? 'commercial' : 'mixed'); break;
        case 'MQ': use = edgeClasses.includes('service') || edgeClasses.includes('waterfront') ? 'commercial' : (r < 0.72 ? 'market' : 'commercial'); break;
        case 'NH': use = 'residential'; break;
        case 'OT': use = maxRank >= CLASS_RANK.secondary && r < 0.5 ? 'mixed' : (r < 0.8 ? 'residential' : 'mixed'); break;
        case 'ID': use = 'industrial'; break;
        case 'GE': use = r < 0.12 ? 'civic' : 'residential'; break;
        default: use = 'open';
      }
    }
    blocks.push({ id: `b${bi++}`, districtId, polygon: pts.map(p => [r2(p[0]), r2(p[1])]), buildable: buildable ? buildable.map(p => [r2(p[0]), r2(p[1])]) : null, use, area: Math.round(a), edgeIds, reservedFor: zone?.id });
  }
  return blocks;
}

export function r2(v: number): number { return Math.round(v * 100) / 100; }
export type { RoadEdge, RoadNode };
