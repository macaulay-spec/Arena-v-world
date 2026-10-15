/**
 * Geometry kit: boxes, cylinders, extruded profiles and architectural helpers (walls with openings,
 * slabs with holes, stairs) merged per material into a handful of meshes. All sizes in metres.
 */
import * as THREE from 'three';
import type { MatId, MatDef } from './materials';

/** anything that accepts blockers/surfaces (the collision world or a shifted proxy of it) */
export interface ColliderSink {
  addSegment(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): unknown;
  addBox(minX: number, minZ: number, maxX: number, maxZ: number, y0: number, y1: number): unknown;
  addCylinder(x: number, z: number, r: number, y0: number, y1: number): unknown;
  addPolygon(poly: [number, number][], y0: number, y1: number): void;
  addSurface(minX: number, minZ: number, maxX: number, maxZ: number, y: number): unknown;
}

interface Buf { pos: number[]; nrm: number[]; uv: number[]; col: number[]; idx: number[] }
const _c = new THREE.Color();
export type RGB = [number, number, number];
export const rgb = (hex: string | number): RGB => { _c.set(hex as any); return [_c.r, _c.g, _c.b]; };

export interface Opening { u0: number; u1: number; y0: number; y1: number; kind?: 'door' | 'window' | 'open' }

export class MeshKit {
  private bufs = new Map<MatId, Buf>();
  constructor(public mats: Record<MatId, MatDef>, public collision?: ColliderSink) {}
  private buf(m: MatId): Buf { let b = this.bufs.get(m); if (!b) { b = { pos: [], nrm: [], uv: [], col: [], idx: [] }; this.bufs.set(m, b); } return b; }

  /** quad (a,b,c,d counter-clockwise seen from the normal side) */
  quad(mat: MatId, a: number[], b: number[], c: number[], d: number[], color: RGB, uvs?: number[][]): void {
    const B = this.buf(mat); const base = B.pos.length / 3;
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2])).normalize();
    const s = this.mats[mat].uvScale;
    // planar UVs: project on the dominant plane
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    const uvOf = (p: number[]) => uvs ? null : ay >= ax && ay >= az ? [p[0] * s, p[2] * s] : ax >= az ? [p[2] * s, p[1] * s] : [p[0] * s, p[1] * s];
    [a, b, c, d].forEach((p, i) => { B.pos.push(p[0], p[1], p[2]); B.nrm.push(n.x, n.y, n.z); const uv = uvs ? uvs[i] : uvOf(p)!; B.uv.push(uv[0], uv[1]); B.col.push(color[0], color[1], color[2]); });
    B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  tri(mat: MatId, a: number[], b: number[], c: number[], color: RGB): void {
    const B = this.buf(mat); const base = B.pos.length / 3;
    const n = new THREE.Vector3().crossVectors(new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])).normalize();
    const s = this.mats[mat].uvScale;
    [a, b, c].forEach(p => { B.pos.push(p[0], p[1], p[2]); B.nrm.push(n.x, n.y, n.z); B.uv.push(p[0] * s + p[2] * s * 0.3, p[1] * s + p[2] * s); B.col.push(color[0], color[1], color[2]); });
    B.idx.push(base, base + 1, base + 2);
  }

  /** axis-aligned box rotated by `rotY` about its centre */
  box(mat: MatId, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: RGB, rotY = 0, o: { faces?: ('px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz')[]; collide?: boolean } = {}): void {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2; const cs = Math.cos(rotY), sn = Math.sin(rotY);
    const P = (x: number, y: number, z: number) => [cx + x * cs + z * sn, cy + y, cz - x * sn + z * cs];
    const faces = o.faces;
    const f = (k: 'px' | 'nx' | 'py' | 'ny' | 'pz' | 'nz') => !faces || faces.includes(k);
    if (f('py')) this.quad(mat, P(-hx, hy, -hz), P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), color);
    if (f('ny')) this.quad(mat, P(-hx, -hy, hz), P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), color);
    if (f('pz')) this.quad(mat, P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), color);
    if (f('nz')) this.quad(mat, P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), color);
    if (f('px')) this.quad(mat, P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), color);
    if (f('nx')) this.quad(mat, P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), color);
    if (o.collide && this.collision) {
      if (Math.abs(Math.sin(rotY)) < 1e-3 || Math.abs(Math.cos(rotY)) < 1e-3) { const swap = Math.abs(Math.cos(rotY)) < 1e-3; const ex = swap ? hz : hx, ez = swap ? hx : hz; this.collision.addBox(cx - ex, cz - ez, cx + ex, cz + ez, cy - hy, cy + hy); }
      else { const c = [P(-hx, 0, -hz), P(hx, 0, -hz), P(hx, 0, hz), P(-hx, 0, hz)]; this.collision.addPolygon(c.map(p => [p[0], p[2]] as [number, number]), cy - hy, cy + hy); }
    }
  }
  /** vertical cylinder (y axis) */
  cylinder(mat: MatId, cx: number, y0: number, cz: number, r: number, h: number, color: RGB, seg = 12, o: { caps?: boolean; collide?: boolean; rTop?: number } = {}): void {
    const B = this.buf(mat); const rt = o.rTop ?? r; const s = this.mats[mat].uvScale;
    const base = B.pos.length / 3;
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      B.pos.push(cx + c * r, y0, cz + sn * r, cx + c * rt, y0 + h, cz + sn * rt);
      B.nrm.push(c, 0, sn, c, 0, sn); B.uv.push((i / seg) * Math.PI * 2 * r * s, 0, (i / seg) * Math.PI * 2 * r * s, h * s);
      B.col.push(color[0], color[1], color[2], color[0], color[1], color[2]);
    }
    for (let i = 0; i < seg; i++) { const a = base + i * 2; B.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    if (o.caps !== false) {
      for (const [y, rr, up] of [[y0 + h, rt, 1], [y0, r, -1]] as [number, number, number][]) {
        const c0 = B.pos.length / 3; B.pos.push(cx, y, cz); B.nrm.push(0, up, 0); B.uv.push(cx * s, cz * s); B.col.push(color[0], color[1], color[2]);
        for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2; B.pos.push(cx + Math.cos(a) * rr, y, cz + Math.sin(a) * rr); B.nrm.push(0, up, 0); B.uv.push((cx + Math.cos(a) * rr) * s, (cz + Math.sin(a) * rr) * s); B.col.push(color[0], color[1], color[2]); }
        for (let i = 0; i < seg; i++) { if (up > 0) B.idx.push(c0, c0 + 2 + i, c0 + 1 + i); else B.idx.push(c0, c0 + 1 + i, c0 + 2 + i); }
      }
    }
    if (o.collide && this.collision) this.collision.addCylinder(cx, cz, Math.max(r, rt), y0, y0 + h);
  }
  /** sphere-ish blob (for foliage, cushions) */
  sphere(mat: MatId, cx: number, cy: number, cz: number, r: number, color: RGB, seg = 8, squash = 1): void {
    const B = this.buf(mat); const base = B.pos.length / 3; const s = this.mats[mat].uvScale;
    for (let j = 0; j <= seg; j++) { const v = (j / seg) * Math.PI; for (let i = 0; i <= seg * 2; i++) { const u = (i / (seg * 2)) * Math.PI * 2; const nx = Math.sin(v) * Math.cos(u), ny = Math.cos(v), nz = Math.sin(v) * Math.sin(u); B.pos.push(cx + nx * r, cy + ny * r * squash, cz + nz * r); B.nrm.push(nx, ny, nz); B.uv.push(u * r * s, v * r * s); B.col.push(color[0], color[1], color[2]); } }
    const W = seg * 2 + 1;
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg * 2; i++) { const a = base + j * W + i; B.idx.push(a, a + 1, a + W, a + 1, a + W + 1, a + W); }
  }
  /** prism: 2D profile in the (z, y) plane extruded along x from x0 to x1 (profile counter-clockwise in z→y) */
  prism(mat: MatId, profile: [number, number][], x0: number, x1: number, color: RGB, origin: [number, number, number] = [0, 0, 0], rotY = 0): void {
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    const P = (x: number, y: number, z: number) => [origin[0] + x * cs + z * sn, origin[1] + y, origin[2] - x * sn + z * cs];
    const tris = THREE.ShapeUtils.triangulateShape(profile.map(p => new THREE.Vector2(p[0], p[1])), []);
    const B = this.buf(mat); const s = this.mats[mat].uvScale;
    const cap = (x: number, flip: boolean) => {
      const base = B.pos.length / 3; const nn = flip ? -1 : 1; const n = P(nn, 0, 0); const o = P(0, 0, 0); const nx = n[0] - o[0], nz = n[2] - o[2];
      for (const p of profile) { const q = P(x, p[1], p[0]); B.pos.push(q[0], q[1], q[2]); B.nrm.push(nx, 0, nz); B.uv.push(p[0] * s, p[1] * s); B.col.push(color[0], color[1], color[2]); }
      for (const t of tris) { if (flip) B.idx.push(base + t[0], base + t[2], base + t[1]); else B.idx.push(base + t[0], base + t[1], base + t[2]); }
    };
    cap(x1, false); cap(x0, true);
    for (let i = 0; i < profile.length; i++) {
      const a = profile[i], b = profile[(i + 1) % profile.length];
      this.quad(mat, P(x0, a[1], a[0]), P(x0, b[1], b[0]), P(x1, b[1], b[0]), P(x1, a[1], a[0]), color);
    }
  }

  /**
   * Wall from (ax,az) to (bx,bz), base `y0`, height `h`, thickness `t`, with openings along its length
   * (u measured from a). Full-height pieces and sills become collision blockers.
   */
  wall(mat: MatId, ax: number, az: number, bx: number, bz: number, y0: number, h: number, t: number, color: RGB, openings: Opening[] = [], o: { collide?: boolean; colorIn?: RGB } = {}): void {
    const len = Math.hypot(bx - ax, bz - az); if (len < 1e-4) return;
    const dx = (bx - ax) / len, dz = (bz - az) / len; const rot = Math.atan2(dx, dz); // box local +z along the wall
    const ops = openings.filter(op => op.u1 > 0 && op.u0 < len).sort((p, q) => p.u0 - q.u0);
    const piece = (u0: number, u1: number, py0: number, py1: number, collide: boolean) => {
      if (u1 - u0 < 1e-3 || py1 - py0 < 1e-3) return;
      const um = (u0 + u1) / 2; const cx = ax + dx * um, cz = az + dz * um;
      this.box(mat, cx, (py0 + py1) / 2, cz, t, py1 - py0, u1 - u0, color, rot);
      if (collide && o.collide !== false && this.collision) {
        this.collision.addSegment(ax + dx * u0, az + dz * u0, ax + dx * u1, az + dz * u1, py0, py1);
      }
    };
    let u = 0;
    for (const op of ops) {
      piece(u, Math.max(u, op.u0), y0, y0 + h, true);
      piece(Math.max(u, op.u0), Math.min(len, op.u1), y0, op.y0, op.y0 - y0 > 0.3);           // sill
      piece(Math.max(u, op.u0), Math.min(len, op.u1), op.y1, y0 + h, false);                   // lintel
      u = Math.max(u, op.u1);
    }
    piece(u, len, y0, y0 + h, true);
  }
  /** window glazing + frame inside an opening of a wall running a→b */
  glazing(ax: number, az: number, bx: number, bz: number, op: Opening, frame: RGB, t = 0.06, bars = 1): void {
    const len = Math.hypot(bx - ax, bz - az); const dx = (bx - ax) / len, dz = (bz - az) / len; const rot = Math.atan2(dx, dz);
    const um = (op.u0 + op.u1) / 2, w = op.u1 - op.u0, hgt = op.y1 - op.y0, ym = (op.y0 + op.y1) / 2;
    const cx = ax + dx * um, cz = az + dz * um;
    this.box('glass', cx, ym, cz, 0.012, hgt - 0.08, w - 0.08, [0.75, 0.85, 0.9], rot);
    const fw = 0.06;
    this.box('metalDark', ax + dx * (op.u0 + fw / 2), ym, az + dz * (op.u0 + fw / 2), t, hgt, fw, frame, rot);
    this.box('metalDark', ax + dx * (op.u1 - fw / 2), ym, az + dz * (op.u1 - fw / 2), t, hgt, fw, frame, rot);
    this.box('metalDark', cx, op.y1 - fw / 2, cz, t, fw, w, frame, rot);
    this.box('metalDark', cx, op.y0 + fw / 2, cz, t, fw, w, frame, rot);
    for (let i = 1; i <= bars; i++) { const uu = op.u0 + (w * i) / (bars + 1); this.box('metalDark', ax + dx * uu, ym, az + dz * uu, t * 0.6, hgt, 0.04, frame, rot); }
  }
  /** horizontal slab (top in `mat`, sides/underside in `under`); `holes` are cut out as rectangles */
  slab(mat: MatId, x0: number, z0: number, x1: number, z1: number, y: number, thick: number, color: RGB, o: { under?: MatId; underColor?: RGB; holes?: [number, number, number, number][]; walk?: boolean } = {}): void {
    const rects: [number, number, number, number][] = [[Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]];
    for (const h of o.holes ?? []) {
      const next: [number, number, number, number][] = [];
      for (const r of rects) {
        const [rx0, rz0, rx1, rz1] = r; const [hx0, hz0, hx1, hz1] = [Math.max(rx0, h[0]), Math.max(rz0, h[1]), Math.min(rx1, h[2]), Math.min(rz1, h[3])];
        if (hx1 <= hx0 || hz1 <= hz0) { next.push(r); continue; }
        if (hz0 > rz0) next.push([rx0, rz0, rx1, hz0]);
        if (hz1 < rz1) next.push([rx0, hz1, rx1, rz1]);
        if (hx0 > rx0) next.push([rx0, hz0, hx0, hz1]);
        if (hx1 < rx1) next.push([hx1, hz0, rx1, hz1]);
      }
      rects.length = 0; rects.push(...next);
    }
    for (const [rx0, rz0, rx1, rz1] of rects) {
      const cx = (rx0 + rx1) / 2, cz = (rz0 + rz1) / 2;
      this.box(mat, cx, y - 0.002, cz, rx1 - rx0, 0.004, rz1 - rz0, color, 0, { faces: ['py'] });
      this.box(o.under ?? 'plaster', cx, y - thick / 2, cz, rx1 - rx0, thick, rz1 - rz0, o.underColor ?? [1, 1, 1], 0, { faces: ['ny', 'px', 'nx', 'pz', 'nz'] });
      if (o.walk !== false && this.collision) this.collision.addSurface(rx0, rz0, rx1, rz1, y);
    }
  }
  /** straight stair: bottom edge at (x, z0) running towards +dz (dz = ±1), `width` along x */
  stair(mat: MatId, x0: number, x1: number, zStart: number, dz: 1 | -1, yBase: number, steps: number, rise: number, run: number, color: RGB, o: { rail?: 'left' | 'right' | 'both'; railColor?: RGB } = {}): { top: [number, number]; topY: number } {
    const w = x1 - x0, cx = (x0 + x1) / 2;
    for (let i = 0; i < steps; i++) {
      const z0 = zStart + dz * i * run, z1 = zStart + dz * (i + 1) * run; const y1 = yBase + (i + 1) * rise;
      const cz = (z0 + z1) / 2;
      this.box(mat, cx, (yBase + y1) / 2, cz, w, y1 - yBase, run, color, 0, { faces: ['py', dz > 0 ? 'nz' : 'pz', 'px', 'nx'] });
      // riser face facing the climber
      if (this.collision) this.collision.addSurface(Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), y1);
    }
    const zEnd = zStart + dz * steps * run;
    // handrail(s): posts + rail
    const rails = o.rail === 'both' ? ['left', 'right'] : o.rail ? [o.rail] : [];
    const rc = o.railColor ?? [0.1, 0.1, 0.1];
    for (const side of rails) {
      const rx = side === 'left' ? x0 + 0.05 : x1 - 0.05;
      for (let i = 0; i <= steps; i += 3) { const z = zStart + dz * Math.min(i, steps) * run + dz * 0.1; const y = yBase + Math.min(i, steps) * rise; this.box('metalDark', rx, y + 0.5, z, 0.04, 1.0, 0.04, rc); }
      const zA = zStart, zB = zEnd, yA = yBase + 1.0, yB = yBase + steps * rise + 1.0;
      const len = Math.hypot(zB - zA, yB - yA);
      // rail as a thin prism along the slope
      const prof: [number, number][] = [[0, -0.025], [len, -0.025], [len, 0.025], [0, 0.025]];
      const ang = Math.atan2(yB - yA, (zB - zA) * dz);
      const B = this.buf('metalDark'); void B;
      // build rail from small boxes to keep it simple
      const n = Math.ceil(len / 0.5);
      for (let i = 0; i < n; i++) { const t0 = i / n, t1 = (i + 1) / n; const za = zA + (zB - zA) * t0, zb = zA + (zB - zA) * t1, ya = yA + (yB - yA) * t0, yb = yA + (yB - yA) * t1; this.segmentBox('metalDark', [rx, ya, za], [rx, yb, zb], 0.05, rc); }
      void prof; void ang;
      if (this.collision) this.collision.addSegment(rx, zA, rx, zB, yBase, yBase + steps * rise + 1);
    }
    return { top: [cx, zEnd], topY: yBase + steps * rise };
  }
  /** thin box between two points (rails, pipes, wires) */
  segmentBox(mat: MatId, a: [number, number, number], b: [number, number, number], th: number, color: RGB): void {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = d.length(); if (len < 1e-4) return;
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(...a), new THREE.Vector3(...b), new THREE.Vector3(0, 1, 0));
    const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const h = th / 2;
    const corners = [[-h, -h, -len / 2], [h, -h, -len / 2], [h, h, -len / 2], [-h, h, -len / 2], [-h, -h, len / 2], [h, -h, len / 2], [h, h, len / 2], [-h, h, len / 2]].map(p => { const v = new THREE.Vector3(p[0], p[1], p[2]).applyMatrix4(m); return [v.x + c[0], v.y + c[1], v.z + c[2]]; });
    const [p0, p1, p2, p3, p4, p5, p6, p7] = corners;
    this.quad(mat, p4, p5, p6, p7, color); this.quad(mat, p1, p0, p3, p2, color);
    this.quad(mat, p0, p4, p7, p3, color); this.quad(mat, p5, p1, p2, p6, color);
    this.quad(mat, p3, p7, p6, p2, color); this.quad(mat, p0, p1, p5, p4, color);
  }

  /** finalize into meshes (one per material) */
  build(o: { shadows?: boolean; name?: string } = {}): THREE.Group {
    const g = new THREE.Group(); g.name = o.name ?? 'kit';
    for (const [id, B] of this.bufs) {
      if (!B.idx.length) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
      geo.setIndex(B.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.mats[id].material); mesh.name = `${g.name}:${id}`;
      const transparent = id === 'glass' || id === 'glassDark' || id === 'water';
      mesh.castShadow = !!o.shadows && !transparent; mesh.receiveShadow = !transparent;
      if (transparent) mesh.renderOrder = 5;
      g.add(mesh);
    }
    this.bufs.clear();
    return g;
  }
  get empty() { for (const b of this.bufs.values()) if (b.idx.length) return false; return true; }
}
