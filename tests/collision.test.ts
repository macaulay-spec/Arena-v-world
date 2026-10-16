/** Collision world: spatial index maintenance for dynamic blockers, ground queries, stair/landing overlap. */
import { describe, it, expect } from 'vitest';
import { CollisionWorld } from '../src/game/collision';
import { MeshKit, STAIR_PAD } from '../src/game/mansion/kit';
import type { MatDef, MatId } from '../src/game/mansion/materials';

const flat = () => new CollisionWorld(() => 0);
/** MeshKit only reads `uvScale` while building geometry; no textures (= no DOM canvas) needed here */
const MATERIALS = new Proxy({}, { get: () => ({ material: null, uvScale: 1 }) }) as unknown as Record<MatId, MatDef>;
const blocked = (w: CollisionWorld, x: number, z: number, r = 0.3) => { const out: [number, number] = [0, 0]; w.resolve(x, z, 0, r, 1.7, out); return Math.hypot(out[0] - x, out[1] - z) > 1e-6; };

describe('CollisionWorld dynamic segments', () => {
  it('moveSegment relocates a blocker without touching other cells and keeps the index consistent', () => {
    const w = flat();
    // a few static walls far apart, then one door leaf
    for (let i = 0; i < 20; i++) w.addSegment(i * 30, 0, i * 30 + 5, 0, 0, 3);
    const cellsBefore = w.cellCount;
    const leaf = w.addSegment(100, 100, 101, 100, 0, 2.1);
    expect(blocked(w, 100.5, 100.1)).toBe(true);
    // swing it through 90° in small steps (as Door.update does every frame)
    for (let k = 1; k <= 30; k++) { const a = (Math.PI / 2) * (k / 30); w.moveSegment(leaf, 100, 100, 100 + Math.cos(a), 100 + Math.sin(a)); }
    expect(blocked(w, 100.5, 100.1)).toBe(false);   // the old place is clear
    expect(blocked(w, 100.1, 100.5)).toBe(true);    // the new place blocks
    // no stale cell entries: the leaf is indexed exactly in the cells it records
    const [recorded, actual] = w.audit(leaf);
    expect(recorded).toBeGreaterThan(0); expect(actual).toBe(recorded);
    // the static walls were never touched
    for (let i = 0; i < 20; i++) expect(blocked(w, i * 30 + 2, 0.1)).toBe(true);
    w.remove(leaf);
    expect(blocked(w, 100.1, 100.5)).toBe(false);
    expect(w.audit(leaf)).toEqual([0, 0]);
    expect(w.cellCount).toBe(cellsBefore);
  });

  it('moveSegment within the same cells does not re-index (no allocation churn per frame)', () => {
    const w = flat();
    const s = w.addSegment(10, 10, 10.5, 10, 0, 2);
    const before = w.audit(s), cells = w.cellCount;
    w.moveSegment(s, 10, 10, 10.4, 10.3);
    expect(w.audit(s)).toEqual(before); expect(w.cellCount).toBe(cells);
    expect(s.bx).toBeCloseTo(10.4); expect(s.bz).toBeCloseTo(10.3);
  });

  it('removing one blocker leaves neighbours in the same cell intact', () => {
    const w = flat();
    const a = w.addBox(0, 0, 1, 1, 0, 2), b = w.addBox(1.5, 0, 2.5, 1, 0, 2);
    w.remove(a);
    expect(blocked(w, 0.5, 0.5)).toBe(false);
    expect(blocked(w, 2, 0.5)).toBe(true);
    w.remove(b);
    expect(blocked(w, 2, 0.5)).toBe(false);
  });
});

describe('ground queries', () => {
  it('a surface counts only when it is within reach (step-up) and above the terrain', () => {
    const w = flat();
    w.addSurface(0, 0, 10, 10, 1.0);
    expect(w.groundAt(5, 5, 0, 0.42)).toBe(0);      // 1 m up: not steppable from the ground
    expect(w.groundAt(5, 5, 0.7, 0.42)).toBe(1.0);  // from 0.7 it is
    expect(w.groundAt(20, 5, 5, 0.42)).toBe(0);     // outside the rect
  });
  it('a pit lowers the ground inside its rect and surfaces inside it still work (pool steps)', () => {
    const w = flat();
    w.addPit(0, 0, 10, 10, -1.2);
    w.addSurface(8, 0, 10, 10, -0.3);
    expect(w.groundAt(5, 5, 0, 0.42)).toBe(-1.2);
    expect(w.groundAt(9, 5, 0, 0.42)).toBe(-0.3);
    expect(w.groundAt(12, 5, 0, 0.42)).toBe(0);
  });
});

describe('MeshKit stairs', () => {
  it('treads overlap each other and the landing so a foot can never fall between them', () => {
    const w = flat();
    const K = new MeshKit(MATERIALS, w);
    // a flight from y=0 to y=3.4 running towards −z from z=10, landing slab at the top
    const steps = 16, rise = 3.4 / 16, run = 0.26;
    K.stair('marble', 0, 3, 10, -1, 0, steps, rise, run, [1, 1, 1]);
    const top = 10 - steps * run;
    K.slab('marble', 0, top - 2, 3, top, 3.4, 0.2, [1, 1, 1]);
    // walk up the centre line in 1 cm steps: the ground must be monotonic, rise by at most one riser and never drop
    let y = 0, prev = 0;
    for (let z = 10.2; z > top - 1.5; z -= 0.01) {
      const g = w.groundAt(1.5, z, y, 0.42);
      expect(g).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(g - prev).toBeLessThanOrEqual(rise + 1e-9);
      prev = g; y = g;
    }
    expect(y).toBeCloseTo(3.4, 6);
    // the top tread also overlaps a landing that starts exactly at the flight's edge in x
    K.slab('marble', 3, top - 2, 6, 10, 3.4, 0.2, [1, 1, 1]);
    for (const x of [2.95, 2.99, 3.0, 3.01, 3.05]) expect(w.groundAt(x, top + run / 2, 3.4, 0.42)).toBeCloseTo(3.4, 6);
    expect(STAIR_PAD).toBeGreaterThan(0.02);
  });

  it('railFrom leaves the first treads open on the rail side', () => {
    const w = flat();
    const K = new MeshKit(MATERIALS, w);
    K.stair('marble', 0, 3, 10, -1, 0, 16, 0.2125, 0.26, [1, 1, 1], { rail: 'right', railFrom: 4 });
    // standing beside the foot of the flight (east of x=3) at the first tread: nothing in the way
    expect(blocked(w, 3.0, 9.85)).toBe(false);
    // further up the balustrade (and the solid side of the higher treads) blocks the side
    expect(blocked(w, 3.0, 8.0)).toBe(true);
    expect(blocked(w, 3.0, 9.3)).toBe(true);
    // walk in from the side and up: resolve + ground every step, as the controller does
    let x = 3.5, z = 9.85, y = 0; const out: [number, number] = [0, 0];
    for (let i = 0; i < 400 && z > 5.9; i++) {
      const tx = x > 1.5 ? x - 0.02 : x, tz = x > 1.5 ? z : z - 0.02;
      w.resolve(tx, tz, y, 0.3, 1.7, out); x = out[0]; z = out[1];
      const g = w.groundAt(x, z, y);
      expect(g - y).toBeLessThanOrEqual(0.2125 + 1e-9); // one riser at a time, never a drop
      expect(g).toBeGreaterThanOrEqual(y);
      y = g;
    }
    expect(x).toBeLessThan(1.6); expect(z).toBeLessThan(6);
    expect(y).toBeCloseTo(3.4, 6);
  });
});
