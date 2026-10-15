/**
 * Lightweight collision world for a walking character:
 *  - blockers: vertical wall segments, upright boxes (AABB) and cylinders, each with a height range
 *  - surfaces: horizontal walkable rectangles (floors, stair treads, terraces) above the terrain
 * Everything lives in a uniform spatial hash; the character is a vertical capsule approximated by
 * a circle at foot level plus a height. Camera occlusion uses the same blockers via a 2D ray test.
 */
export interface Segment { kind: 'seg'; ax: number; az: number; bx: number; bz: number; y0: number; y1: number }
export interface Box { kind: 'box'; minX: number; minZ: number; maxX: number; maxZ: number; y0: number; y1: number }
export interface Cylinder { kind: 'cyl'; x: number; z: number; r: number; y0: number; y1: number }
export type Blocker = Segment | Box | Cylinder;
export interface Surface { minX: number; minZ: number; maxX: number; maxZ: number; y: number }

const CELL = 6;
/**
 * Highest ledge a walker steps onto without jumping (metres). Blockers whose top is within this of
 * the feet are ignored by `resolve` (you step over/onto them) and surfaces within it are reachable by
 * `groundAt` — the two must agree, or a stair tread becomes a wall. Two 0.2125 m risers are 0.425 m,
 * so the first two treads of every flight can be entered from the side.
 */
export const STEP_UP = 0.45;

export class CollisionWorld {
  private cells = new Map<number, Blocker[]>();
  private surfCells = new Map<number, Surface[]>();
  /** hash cells each blocker currently lives in (so dynamic blockers can be moved without scanning the world) */
  private where = new Map<Blocker, number[]>();
  blockers: Blocker[] = [];
  surfaces: Surface[] = [];
  /** pits (pools, basements): inside the rect the terrain is replaced by the pit floor */
  pits: Surface[] = [];
  /** terrain / city ground height */
  constructor(public terrain: (x: number, z: number) => number) {}

  private key(ix: number, iz: number) { return ix * 73856093 ^ iz * 19349663; }
  private insert<T>(map: Map<number, T[]>, item: T, minX: number, minZ: number, maxX: number, maxZ: number, keys?: number[]) {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL), z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const k = this.key(ix, iz); let arr = map.get(k); if (!arr) { arr = []; map.set(k, arr); } arr.push(item); keys?.push(k); }
  }
  private insertBlocker(b: Blocker, minX: number, minZ: number, maxX: number, maxZ: number) {
    const keys: number[] = []; this.insert(this.cells, b, minX, minZ, maxX, maxZ, keys); this.where.set(b, keys);
  }
  private static bounds(b: Blocker): [number, number, number, number] {
    if (b.kind === 'seg') return [Math.min(b.ax, b.bx) - 0.5, Math.min(b.az, b.bz) - 0.5, Math.max(b.ax, b.bx) + 0.5, Math.max(b.az, b.bz) + 0.5];
    if (b.kind === 'box') return [b.minX - 0.5, b.minZ - 0.5, b.maxX + 0.5, b.maxZ + 0.5];
    return [b.x - b.r - 0.5, b.z - b.r - 0.5, b.x + b.r + 0.5, b.z + b.r + 0.5];
  }
  private static cellRange(bb: [number, number, number, number]): [number, number, number, number] {
    return [Math.floor(bb[0] / CELL), Math.floor(bb[1] / CELL), Math.floor(bb[2] / CELL), Math.floor(bb[3] / CELL)];
  }
  private query<T>(map: Map<number, T[]>, minX: number, minZ: number, maxX: number, maxZ: number, out: T[]) {
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL), z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    out.length = 0;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) { const arr = map.get(this.key(ix, iz)); if (arr) for (const a of arr) if (!out.includes(a)) out.push(a); }
    return out;
  }

  addSegment(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): Segment {
    const s: Segment = { kind: 'seg', ax, az, bx, bz, y0, y1 }; this.blockers.push(s);
    this.insertBlocker(s, ...CollisionWorld.bounds(s)); return s;
  }
  addBox(minX: number, minZ: number, maxX: number, maxZ: number, y0: number, y1: number): Box {
    const b: Box = { kind: 'box', minX: Math.min(minX, maxX), minZ: Math.min(minZ, maxZ), maxX: Math.max(minX, maxX), maxZ: Math.max(minZ, maxZ), y0, y1 }; this.blockers.push(b);
    this.insertBlocker(b, ...CollisionWorld.bounds(b)); return b;
  }
  addCylinder(x: number, z: number, r: number, y0: number, y1: number): Cylinder {
    const c: Cylinder = { kind: 'cyl', x, z, r, y0, y1 }; this.blockers.push(c);
    this.insertBlocker(c, ...CollisionWorld.bounds(c)); return c;
  }
  /** closed polygon outline as wall segments */
  addPolygon(poly: [number, number][], y0: number, y1: number) {
    for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; this.addSegment(a[0], a[1], b[0], b[1], y0, y1); }
  }
  addSurface(minX: number, minZ: number, maxX: number, maxZ: number, y: number): Surface {
    const s: Surface = { minX: Math.min(minX, maxX), minZ: Math.min(minZ, maxZ), maxX: Math.max(minX, maxX), maxZ: Math.max(minZ, maxZ), y }; this.surfaces.push(s);
    this.insert(this.surfCells, s, s.minX, s.minZ, s.maxX, s.maxZ); return s;
  }
  addPit(minX: number, minZ: number, maxX: number, maxZ: number, y: number): Surface { const s: Surface = { minX, minZ, maxX, maxZ, y }; this.pits.push(s); return s; }
  /** detach a blocker from the index (only its own cells are touched) */
  remove(b: Blocker) {
    const keys = this.where.get(b); if (!keys) return;
    this.where.delete(b);
    for (const k of keys) { const arr = this.cells.get(k); if (!arr) continue; const j = arr.indexOf(b); if (j >= 0) { arr[j] = arr[arr.length - 1]; arr.pop(); } if (!arr.length) this.cells.delete(k); }
    const i = this.blockers.lastIndexOf(b); if (i >= 0) { this.blockers[i] = this.blockers[this.blockers.length - 1]; this.blockers.pop(); }
  }
  /**
   * Move a segment in place (doors, gates): coordinates are updated directly and the hash is only
   * touched when the segment's cell range actually changes — a swinging door normally stays inside
   * the same one or two cells, so an animation frame costs nothing beyond the coordinate write.
   */
  moveSegment(s: Segment, ax: number, az: number, bx: number, bz: number): Segment {
    const before = CollisionWorld.cellRange(CollisionWorld.bounds(s));
    s.ax = ax; s.az = az; s.bx = bx; s.bz = bz;
    const bb = CollisionWorld.bounds(s), after = CollisionWorld.cellRange(bb);
    if (!this.where.has(s)) { this.blockers.push(s); this.insertBlocker(s, ...bb); return s; }
    if (before[0] !== after[0] || before[1] !== after[1] || before[2] !== after[2] || before[3] !== after[3]) {
      const keys = this.where.get(s)!;
      for (const k of keys) { const arr = this.cells.get(k); if (!arr) continue; const j = arr.indexOf(s); if (j >= 0) { arr[j] = arr[arr.length - 1]; arr.pop(); } if (!arr.length) this.cells.delete(k); }
      keys.length = 0; this.insert(this.cells, s, bb[0], bb[1], bb[2], bb[3], keys);
    }
    return s;
  }
  /** number of occupied hash cells (diagnostics) */
  get cellCount() { return this.cells.size; }
  /** diagnostics / tests: [cells recorded for b, cells that actually contain b] — equal while indexed, 0/0 once removed */
  audit(b: Blocker): [number, number] { let n = 0; for (const arr of this.cells.values()) if (arr.includes(b)) n++; return [this.where.get(b)?.length ?? 0, n]; }

  private tmpB: Blocker[] = []; private tmpS: Surface[] = [];

  /** highest walkable height at (x, z) not more than `stepUp` above the current foot height `y` */
  groundAt(x: number, z: number, y: number, stepUp = STEP_UP): number {
    let g = this.terrain(x, z);
    for (const p of this.pits) if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) g = p.y;
    for (const s of this.query(this.surfCells, x, z, x, z, this.tmpS)) {
      if (x < s.minX || x > s.maxX || z < s.minZ || z > s.maxZ) continue;
      if (s.y <= y + stepUp && s.y > g) g = s.y;
    }
    return g;
  }

  /** push a circle (feet at y, radius r, body height h) out of blockers; returns the corrected position */
  resolve(x: number, z: number, y: number, r: number, h: number, out: [number, number]): [number, number] {
    let px = x, pz = z;
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (const b of this.query(this.cells, px - r, pz - r, px + r, pz + r, this.tmpB)) {
        // vertical overlap: feet below the blocker top (minus a step allowance) and head above its bottom
        if (y + STEP_UP >= b.y1 || y + h <= b.y0) continue;
        let nx = 0, nz = 0, depth = 0;
        if (b.kind === 'seg') {
          const abx = b.bx - b.ax, abz = b.bz - b.az; const l2 = abx * abx + abz * abz || 1;
          const t = Math.max(0, Math.min(1, ((px - b.ax) * abx + (pz - b.az) * abz) / l2));
          const cx = b.ax + abx * t, cz = b.az + abz * t; const dx = px - cx, dz = pz - cz; const d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d > 1e-6) { nx = dx / d; nz = dz / d; } else { const l = Math.sqrt(l2); nx = -abz / l; nz = abx / l; }
          depth = r - d;
        } else if (b.kind === 'box') {
          const cx = Math.max(b.minX, Math.min(b.maxX, px)), cz = Math.max(b.minZ, Math.min(b.maxZ, pz));
          const dx = px - cx, dz = pz - cz; const d = Math.hypot(dx, dz);
          if (d >= r) continue;
          if (d > 1e-6) { nx = dx / d; nz = dz / d; depth = r - d; }
          else { // centre inside the box: exit through the nearest face
            const dl = px - b.minX, dr = b.maxX - px, dn = pz - b.minZ, ds = b.maxZ - pz; const m = Math.min(dl, dr, dn, ds);
            if (m === dl) { nx = -1; depth = dl + r; } else if (m === dr) { nx = 1; depth = dr + r; } else if (m === dn) { nz = -1; depth = dn + r; } else { nz = 1; depth = ds + r; }
          }
        } else {
          const dx = px - b.x, dz = pz - b.z; const d = Math.hypot(dx, dz); const rr = r + b.r;
          if (d >= rr) continue;
          if (d > 1e-6) { nx = dx / d; nz = dz / d; } else { nx = 1; }
          depth = rr - d;
        }
        px += nx * (depth + 0.001); pz += nz * (depth + 0.001); moved = true;
      }
      if (!moved) break;
    }
    out[0] = px; out[1] = pz; return out;
  }

  /** fraction (0..1) along the ray from (ax,az) to (bx,bz) at height band [y0,y1] where the first blocker is hit (1 = clear) */
  rayFraction(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): number {
    let best = 1;
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    const dx = bx - ax, dz = bz - az;
    const segHit = (sx: number, sz: number, ex: number, ez: number) => {
      const rx = ex - sx, rz = ez - sz; const den = dx * rz - dz * rx; if (Math.abs(den) < 1e-9) return;
      const t = ((sx - ax) * rz - (sz - az) * rx) / den, u = ((sx - ax) * dz - (sz - az) * dx) / den;
      if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t < best) best = t;
    };
    for (const b of this.query(this.cells, minX, minZ, maxX, maxZ, this.tmpB)) {
      if (b.y0 >= y1 || b.y1 <= y0) continue;
      if (b.kind === 'seg') segHit(b.ax, b.az, b.bx, b.bz);
      else if (b.kind === 'box') { segHit(b.minX, b.minZ, b.maxX, b.minZ); segHit(b.maxX, b.minZ, b.maxX, b.maxZ); segHit(b.maxX, b.maxZ, b.minX, b.maxZ); segHit(b.minX, b.maxZ, b.minX, b.minZ); }
      else {
        // ray vs circle
        const fx = ax - b.x, fz = az - b.z; const A = dx * dx + dz * dz, B = 2 * (fx * dx + fz * dz), C = fx * fx + fz * fz - b.r * b.r;
        const disc = B * B - 4 * A * C; if (disc < 0 || A < 1e-9) continue;
        const t = (-B - Math.sqrt(disc)) / (2 * A); if (t >= 0 && t <= 1 && t < best) best = t;
      }
    }
    return best;
  }
}
