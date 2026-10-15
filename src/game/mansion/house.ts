/** The mansion building: plan, walls, floors, stairs, roof terrace and furnishing (local coordinates). */
import { rgb, type Opening, type RGB } from './kit';
import type { MansionContext } from './index';
import * as F from './furniture';
import type { DoorSpec } from './dynamic';

export const HOUSE = { X0: 16, X1: 50, Z0: 20, Z1: 44, GF: 0.45, F1: 3.85, RF: 7.25, H: 3.4, SLAB: 0.25, TE: 0.3, TI: 0.15 };
const { X0, X1, Z0, Z1, GF, F1, RF, H, SLAB, TE, TI } = HOUSE;
const EXT = rgb('#ebe3d2'), INT = rgb('#f7f4ee'), TRIM: RGB = rgb('#2b2f36'), STONE = rgb('#8a847c'), DARK = rgb('#3a3a3a');
const win = (u0: number, u1: number, y0 = 0.9, y1 = 2.4): Opening => ({ u0, u1, y0, y1, kind: 'window' });
const dr = (u0: number, u1: number, h = 2.2): Opening => ({ u0, u1, y0: 0, y1: h, kind: 'door' });
const arch = (u0: number, u1: number, h = 2.6): Opening => ({ u0, u1, y0: 0, y1: h, kind: 'open' });

export function buildHouse(c: MansionContext): void {
  const { K } = c;
  /** wall with automatic glazing for window openings; openings y are relative to the wall base */
  const wall = (mat: 'plaster' | 'plasterDark' | 'stone', ax: number, az: number, bx: number, bz: number, y: number, h: number, t: number, color: RGB, ops: Opening[] = []) => {
    const abs = ops.map(o => ({ ...o, y0: o.y0 + y, y1: o.y1 + y }));
    K.wall(mat, ax, az, bx, bz, y, h, t, color, abs);
    for (const o of abs) if (o.kind === 'window') K.glazing(ax, az, bx, bz, o, TRIM, t, o.u1 - o.u0 > 2.2 ? 2 : 1);
  };
  const hinged = (x: number, y: number, z: number, along: number, width: number, o: Partial<DoorSpec> = {}) => c.door({ x, y, z, along, width, height: o.height ?? 2.1, thick: 0.05, style: o.style ?? 'door', mat: o.mat ?? 'woodDark', color: o.color ?? '#b08a60', swing: o.swing ?? 1, label: o.label ?? 'door', openAngle: o.openAngle, glassMat: o.glassMat, open: o.open });
  /** double door: two leaves hinged at both jambs of an X-wall opening [a,b] at z */
  const doubleX = (a: number, b: number, y: number, z: number, o: Partial<DoorSpec> = {}) => { const w = (b - a) / 2; hinged(a, y, z, 0, w, o); hinged(b, y, z, Math.PI, w, { ...o, swing: (o.swing ?? 1) * -1 as 1 | -1 }); };
  /** glass balustrade with collision */
  const rail = (x0: number, z0: number, x1: number, z1: number, y: number, h = 1.05) => {
    const len = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.round(len / 1.5)); const dx = (x1 - x0) / len, dz = (z1 - z0) / len; const rot = Math.atan2(dx, dz);
    for (let i = 0; i <= n; i++) K.box('metalDark', x0 + dx * (i / n) * len, y + h / 2, z0 + dz * (i / n) * len, 0.05, h, 0.05, DARK);
    K.box('metalDark', (x0 + x1) / 2, y + h, (z0 + z1) / 2, 0.06, 0.05, len, DARK, rot);
    K.box('glass', (x0 + x1) / 2, y + h / 2 - 0.02, (z0 + z1) / 2, 0.012, h - 0.12, len, [0.8, 0.9, 0.95], rot);
    c.sink.addSegment(x0, z0, x1, z1, y, y + h);
  };

  // ───────────────────────── plinth, veranda, floors ─────────────────────────
  K.box('stone', (X0 + X1) / 2, 0.12, (Z0 - 0.3 + Z1 + 3.3) / 2, X1 - X0 + 0.6, 0.64, Z1 - Z0 + 3.6, STONE, 0, { collide: false });
  // front veranda + steps
  K.slab('marble', X0, Z1, X1, Z1 + 3, GF, 0.02, rgb('#e8e2d6'));
  K.stair('stone', 29.5, 36.5, Z1 + 4.05, -1, 0, 3, 0.15, 0.35, STONE);
  c.sink.addSegment(X0, Z1 + 3, 29.5, Z1 + 3, 0, GF); c.sink.addSegment(36.5, Z1 + 3, X1, Z1 + 3, 0, GF); // veranda edge (step-up only via the stairs)
  c.sink.addSegment(X0, Z1, X0, Z1 + 3, 0, GF); c.sink.addSegment(X1, Z1, X1, Z1 + 3, 0, GF);
  // columns under the balcony
  for (const x of [17, 23.5, 29.5, 36.5, 42.5, 49]) { K.box('stone', x, GF + H / 2, Z1 + 2.55, 0.45, H, 0.45, STONE, 0, { collide: true }); K.box('stone', x, GF + 0.1, Z1 + 2.55, 0.6, 0.2, 0.6, STONE); }
  // GF floors (per room, so each has its own finish)
  const floors: [string, 'marble' | 'wood' | 'tile', number, number, number, number][] = [
    ['living', 'wood', 16, 32, 27, 44], ['hall', 'marble', 27, 32, 39, 44], ['dining', 'marble', 39, 34, 50, 44], ['kitchen', 'tile', 39, 20, 50, 34],
    ['office', 'wood', 16, 20, 27, 32], ['lounge', 'wood', 30, 20, 39, 32], ['wc', 'tile', 27, 20, 30, 26], ['store', 'tile', 27, 26, 30, 32],
  ];
  const floorCol: Record<string, RGB> = { marble: rgb('#ece7dd'), wood: rgb('#b08456'), tile: rgb('#d6d2ca') };
  for (const [, mat, x0, z0, x1, z1] of floors) K.slab(mat, x0, z0, x1, z1, GF, 0.3, floorCol[mat], { under: 'stone', underColor: STONE });
  // F1 floors (holes: stairwell)
  const f1floors: [string, 'marble' | 'wood' | 'tile', number, number, number, number, [number, number, number, number][]?][] = [
    ['master', 'wood', 16, 27, 30, 33.9], ['dressing', 'wood', 16, 20, 22, 27], ['ensuite', 'tile', 22, 20, 30, 27], ['bed2', 'wood', 16, 33.9, 27, 44],
    ['stairhall', 'marble', 27, 33.9, 30, 44, [[27, 38.7, 30, 42.6]]], ['landing', 'marble', 30, 36, 39, 44], ['corridor', 'marble', 30, 20, 36, 36],
    ['bath', 'tile', 36, 29, 42, 36], ['ensuite3', 'tile', 42, 29, 50, 36], ['bed3', 'wood', 39, 36, 50, 44], ['bed4', 'wood', 36, 20, 50, 29],
  ];
  for (const [, mat, x0, z0, x1, z1, holes] of f1floors) K.slab(mat, x0, z0, x1, z1, F1, SLAB, floorCol[mat], { holes });
  // the stair hall at F1 under flight 2 is the flight itself; the landing edge next to the hole gets rails
  rail(30, 38.7, 30, 42.6, F1); rail(27, 42.6, 30, 42.6, F1);
  rail(30, 33.9, 30, 38.7, F1); // alongside flight 2
  // balcony
  K.slab('tile', X0, Z1, X1, Z1 + 2.6, F1, SLAB, rgb('#d9d4cb'));
  rail(X0, Z1 + 2.6, X1, Z1 + 2.6, F1); rail(X0, Z1, X0, Z1 + 2.6, F1); rail(X1, Z1, X1, Z1 + 2.6, F1);
  // roof terrace
  K.slab('tile', X0, Z0, X1, Z1, RF, SLAB, rgb('#cfcac0'), { holes: [[27, 33.9, 30, 38.7]] });
  // parapet
  for (const [ax, az, bx, bz] of [[X0, Z0, X1, Z0], [X1, Z0, X1, Z1], [X1, Z1, X0, Z1], [X0, Z1, X0, Z0]] as [number, number, number, number][]) wall('plaster', ax, az, bx, bz, RF, 1.1, TE, EXT);
  K.box('stone', (X0 + X1) / 2, RF + 1.14, Z0 - 0.0, X1 - X0 + 0.5, 0.08, 0.5, STONE); K.box('stone', (X0 + X1) / 2, RF + 1.14, Z1, X1 - X0 + 0.5, 0.08, 0.5, STONE);
  K.box('stone', X0, RF + 1.14, (Z0 + Z1) / 2, 0.5, 0.08, Z1 - Z0 + 0.5, STONE); K.box('stone', X1, RF + 1.14, (Z0 + Z1) / 2, 0.5, 0.08, Z1 - Z0 + 0.5, STONE);

  // ───────────────────────── exterior walls ─────────────────────────
  // ground floor
  wall('plaster', X0, Z1, X1, Z1, GF, H, TE, EXT, [win(1.5, 4.5, 0.5, 2.6), win(6, 9, 0.5, 2.6), win(12, 14), dr(15.8, 18.2, 2.6), win(20, 22), win(25, 28, 0.5, 2.6), win(29.5, 32.5, 0.5, 2.6)]);
  wall('plaster', X0, Z0, X1, Z0, GF, H, TE, EXT, [win(2, 5), win(7, 10), win(11.5, 12.5, 1.6, 2.2), win(15, 17), dr(18, 19.2), win(20, 22), win(25, 28, 1.0, 2.2), dr(30, 31)]);
  wall('plaster', X0, Z0, X0, Z1, GF, H, TE, EXT, [win(3, 6), win(14, 17, 0.5, 2.6), win(19, 22, 0.5, 2.6)]);
  wall('plaster', X1, Z0, X1, Z1, GF, H, TE, EXT, [win(3, 6, 1.0, 2.2), win(8, 11, 1.0, 2.2), win(16, 19, 0.5, 2.6), win(20, 23, 0.5, 2.6)]);
  // first floor
  wall('plaster', X0, Z1, X1, Z1, F1, H, TE, EXT, [dr(3.5, 4.5), win(6, 9), win(12, 14), dr(15.8, 18.2, 2.4), win(20, 22), dr(28, 29), win(30.5, 32.5)]);
  wall('plaster', X0, Z0, X1, Z0, F1, H, TE, EXT, [win(2, 4, 1.4, 2.2), win(8, 11, 1.4, 2.2), win(16, 18), win(22, 25), win(28, 31)]);
  wall('plaster', X0, Z0, X0, Z1, F1, H, TE, EXT, [win(1, 3, 1.4, 2.2), win(8, 13, 0.6, 2.4), win(16, 18), win(20, 22)]);
  wall('plaster', X1, Z0, X1, Z1, F1, H, TE, EXT, [win(2, 7), win(10, 12, 1.4, 2.2), win(17, 19), win(20, 23)]);
  // string course between floors, window hoods
  K.box('stone', (X0 + X1) / 2, F1 - 0.05, Z1 + 0.18, X1 - X0 + 0.4, 0.12, 0.1, STONE); K.box('stone', (X0 + X1) / 2, F1 - 0.05, Z0 - 0.18, X1 - X0 + 0.4, 0.12, 0.1, STONE);
  K.box('stone', X0 - 0.18, F1 - 0.05, (Z0 + Z1) / 2, 0.1, 0.12, Z1 - Z0 + 0.4, STONE); K.box('stone', X1 + 0.18, F1 - 0.05, (Z0 + Z1) / 2, 0.1, 0.12, Z1 - Z0 + 0.4, STONE);
  // exterior doors
  doubleX(31.8, 34.2, GF, Z1, { height: 2.6, style: 'door', color: '#6a4426', label: 'front door', open: true });
  hinged(34, GF, Z0, 0, 1.2, { style: 'glass', color: '#2b2f36', mat: 'metalDark', label: 'garden door', swing: 1, open: true });
  hinged(46, GF, Z0, 0, 1.0, { color: '#a07a50', label: 'kitchen door', swing: 1, open: true });
  doubleX(31.8, 34.2, F1, Z1, { height: 2.4, style: 'glass', mat: 'metalDark', color: '#2b2f36', label: 'balcony door' });
  hinged(19.5, F1, Z1, 0, 1.0, { style: 'glass', mat: 'metalDark', color: '#2b2f36', label: 'balcony door' });
  hinged(44, F1, Z1, 0, 1.0, { style: 'glass', mat: 'metalDark', color: '#2b2f36', label: 'balcony door' });
  // wall lights at the entrance and along the veranda
  for (const x of [30.6, 35.4]) c.light({ pos: F.wallLight(K, { x, y: GF + 2.2, z: Z1 + 0.18, rot: 0 }), color: 0xffd9a0, intensity: 0.8, distance: 8, room: 'porch', outdoor: true });

  // ───────────────────────── ground-floor interior ─────────────────────────
  wall('plaster', 27, Z0, 27, Z1, GF, H, TI, INT, [arch(16, 18.4)]);
  wall('plaster', 30, Z0, 30, 32, GF, H, TI, INT, [dr(2, 3), dr(8, 9)]);
  wall('plaster', 39, Z0, 39, Z1, GF, H, TI, INT, [dr(2, 3.2), arch(17, 20)]);
  wall('plaster', X0, 32, 27, 32, GF, H, TI, INT, [dr(8, 9)]);
  wall('plaster', 27, 32, 30, 32, GF, H, TI, INT);
  wall('plaster', 30, 32, 39, 32, GF, H, TI, INT, [arch(3, 6)]);
  wall('plaster', 27, 26, 30, 26, GF, H, TI, INT);
  wall('plaster', 39, 34, X1, 34, GF, H, TI, INT, [dr(5, 6)]);
  hinged(30, GF, 22, -Math.PI / 2, 1.0, { label: 'toilet door', swing: 1 });
  hinged(30, GF, 28, -Math.PI / 2, 1.0, { label: 'store door', swing: 1 });
  hinged(39, GF, 22, -Math.PI / 2, 1.2, { label: 'kitchen door', swing: 1, style: 'glass', mat: 'metalDark', color: '#2b2f36' });
  hinged(24, GF, 32, 0, 1.0, { label: 'office door', swing: -1, open: true });
  hinged(44, GF, 34, 0, 1.0, { label: 'kitchen door', swing: -1, open: true });
  // ceilings are the slab undersides; GF slab underside = F1 slab (built above)
  // stairs
  K.stair('marble', 27.15, 29.9, 43.5, -1, GF, 17, 0.2, 0.28, rgb('#ece7dd'), { rail: 'right' });
  K.stair('marble', 27.15, 29.9, 38.7, -1, F1, 17, 0.2, 0.28, rgb('#ece7dd'), { rail: 'right' });
  // stair penthouse on the roof
  wall('plaster', 26.85, 32.5, 30.15, 32.5, RF, 2.7, TE, EXT); wall('plaster', 26.85, 32.5, 26.85, 39.5, RF, 2.7, TE, EXT); wall('plaster', 26.85, 39.5, 30.15, 39.5, RF, 2.7, TE, EXT);
  wall('plaster', 30.15, 32.5, 30.15, 39.5, RF, 2.7, TE, EXT, [dr(3.5, 4.5)]);
  hinged(30.15, RF, 36, -Math.PI / 2, 1.0, { label: 'terrace door', swing: 1, color: '#8a6040', open: true });
  K.slab('roof', 26.7, 32.35, 30.3, 39.65, RF + 2.7 + 0.2, 0.2, rgb('#9a958c'), { walk: false });

  // rooms (for the HUD + light logic)
  c.room('Living room', 16, 32, 27, 44, GF, F1); c.room('Hall', 27, 32, 39, 44, GF, F1); c.room('Dining room', 39, 34, 50, 44, GF, F1); c.room('Kitchen', 39, 20, 50, 34, GF, F1);
  c.room('Study', 16, 20, 27, 32, GF, F1); c.room('Family lounge', 30, 20, 39, 32, GF, F1); c.room('Guest toilet', 27, 20, 30, 26, GF, F1); c.room('Store', 27, 26, 30, 32, GF, F1);
  c.room('Master bedroom', 16, 27, 30, 33.9, F1, RF); c.room('Dressing room', 16, 20, 22, 27, F1, RF); c.room('Master bathroom', 22, 20, 30, 27, F1, RF); c.room('Bedroom 2', 16, 33.9, 27, 44, F1, RF);
  c.room('Landing', 27, 33.9, 39, 44, F1, RF); c.room('Corridor', 30, 20, 36, 36, F1, RF); c.room('Bathroom', 36, 29, 42, 36, F1, RF); c.room('Bedroom 3', 39, 36, 50, 44, F1, RF); c.room('Bedroom 4', 36, 20, 50, 29, F1, RF);
  c.room('Roof terrace', 16, 20, 50, 44, RF, RF + 4); c.room('Balcony', 16, 44, 50, 46.6, F1, RF); c.room('Veranda', 16, 44, 50, 47, GF, F1);

  // living room
  F.rug(K, { x: 20.5, y: GF, z: 38 }, 4.2, 3.4, rgb('#6b4a3a'));
  const tv1 = F.tvWall(K, { x: 16.4, y: GF, z: 38, rot: Math.PI / 2 }, 2.1); const scr1 = c.screen(tv1.screen, tv1.rot, tv1.w, tv1.h);
  F.sofa(K, { x: 22.4, y: GF, z: 38, rot: -Math.PI / 2 }, 3.2, rgb('#4c5a68'));
  F.sofa(K, { x: 19.6, y: GF, z: 34.9, rot: 0 }, 2.4, rgb('#4c5a68'));
  F.armchair(K, { x: 18.6, y: GF, z: 41.3, rot: Math.PI }, rgb('#8a5a3a')); F.armchair(K, { x: 21.6, y: GF, z: 41.3, rot: Math.PI }, rgb('#8a5a3a'));
  F.coffeeTable(K, { x: 19.6, y: GF, z: 38 });
  F.plant(K, { x: 26.3, y: GF, z: 43.2 }, 1.1); F.plant(K, { x: 16.8, y: GF, z: 32.8 }, 0.9);
  F.painting(K, { x: 23.5, y: GF + 1.7, z: Z1 - 0.17, rot: Math.PI }, 1.6, 1.0, rgb('#b8562e'));
  F.painting(K, { x: 21.5, y: GF + 1.7, z: 32.17, rot: 0 }, 1.2, 0.9, rgb('#2f6f8a'));
  F.curtain(K, { x: 19, y: GF, z: Z1 - 0.3, rot: Math.PI }, 3.4, 2.75); F.curtain(K, { x: 23.5, y: GF, z: Z1 - 0.3, rot: Math.PI }, 3.4, 2.75);
  F.curtain(K, { x: X0 + 0.3, y: GF, z: 35.5, rot: Math.PI / 2 }, 3.4, 2.75); F.curtain(K, { x: X0 + 0.3, y: GF, z: 40.5, rot: Math.PI / 2 }, 3.4, 2.75);
  c.light({ pos: F.ceilingLamp(K, { x: 21.5, y: GF + H - SLAB, z: 36 }), color: 0xfff1dc, intensity: 1.2, distance: 11, room: 'Living room' });
  F.ceilingLamp(K, { x: 21.5, y: GF + H - SLAB, z: 41 }); F.floorLamp(K, { x: 26.3, y: GF, z: 33 });
  c.fan(21.5, GF + H - SLAB, 38.5); F.acUnit(K, { x: 24, y: GF + 2.75, z: 32.25, rot: 0 });
  c.interact({ id: 'tv1', prompt: () => scr1.on ? 'Turn off TV' : 'Watch TV', pos: [19.6, GF, 38], radius: 2.2, action: () => scr1.toggle() });
  c.spot('sofa', 22.0, GF, 38.0, -Math.PI / 2); c.spot('living', 20.5, GF, 40, Math.PI);

  // hall
  F.rug(K, { x: 34.5, y: GF, z: 39 }, 3.0, 3.0, rgb('#4a3b5a'));
  c.light({ pos: F.chandelier(K, { x: 34.5, y: GF + H - SLAB, z: 39.5 }, 0.6), color: 0xfff1dc, intensity: 1.4, distance: 12, room: 'Hall' });
  F.sideboard(K, { x: 37, y: GF, z: 32.35, rot: 0 }, 1.6); F.painting(K, { x: 37, y: GF + 1.75, z: 32.17, rot: 0 }, 1.2, 0.8, rgb('#c9a24a'));
  F.plant(K, { x: 38.4, y: GF, z: 43.3 }, 1.0); F.plant(K, { x: 30.6, y: GF, z: 43.3 }, 0.8);
  F.painting(K, { x: 27.17, y: GF + 1.9, z: 35, rot: Math.PI / 2 }, 1.0, 1.3, rgb('#6a8a3a'));

  // dining room
  F.diningSet(K, { x: 44.5, y: GF, z: 39, rot: Math.PI / 2 }, 8);
  F.sideboard(K, { x: X1 - 0.32, y: GF, z: 36.8, rot: -Math.PI / 2 }, 1.8);
  c.light({ pos: F.chandelier(K, { x: 44.5, y: GF + H - SLAB, z: 39 }, 0.55), color: 0xfff1dc, intensity: 1.2, distance: 10, room: 'Dining room' });
  F.painting(K, { x: 44.5, y: GF + 1.7, z: 34.17, rot: 0 }, 1.8, 1.0, rgb('#8a3a5a'));
  F.curtain(K, { x: 42.5, y: GF, z: Z1 - 0.3, rot: Math.PI }, 3.4, 2.75); F.curtain(K, { x: 47, y: GF, z: Z1 - 0.3, rot: Math.PI }, 3.4, 2.75);
  F.plant(K, { x: 40, y: GF, z: 43.2 }, 1.0);
  c.spot('dining', 42.6, GF, 39.6, Math.PI / 2);

  // kitchen
  F.kitchenRun(K, { x: X1 - 0.32, y: GF, z: 27, rot: -Math.PI / 2 }, 10, { sink: -2, hob: 2 });
  F.kitchenRun(K, { x: 42.5, y: GF, z: Z0 + 0.32, rot: 0 }, 5, { uppers: false });
  F.island(K, { x: 44.5, y: GF, z: 27 }, 2.4);
  F.appliance(K, { x: 49.5, y: GF, z: 21.2, rot: -Math.PI / 2 }, 0.9, 1.9, 0.75, rgb('#c9ccd0'));
  const fridge = hinged(49.12, GF, 20.75, -Math.PI / 2, 0.9, { height: 1.9, style: 'flat', mat: 'metal', color: '#c9ccd0', label: 'fridge', swing: -1, openAngle: 1.6 });
  c.interact({ id: 'eat', prompt: () => 'Eat something', pos: [48.6, GF, 21.2], radius: 1.6, action: () => {}, enabled: () => fridge.open });
  c.light({ pos: F.ceilingLamp(K, { x: 44.5, y: GF + H - SLAB, z: 24 }), color: 0xffffff, intensity: 1.1, distance: 10, room: 'Kitchen' });
  F.ceilingLamp(K, { x: 44.5, y: GF + H - SLAB, z: 30 }); c.fan(44.5, GF + H - SLAB, 27);
  c.spot('kitchen', 48.4, GF, 29, Math.PI / 2); c.spot('kitchen2', 44.5, GF, 29.2, Math.PI);

  // study
  F.rug(K, { x: 21.5, y: GF, z: 26 }, 3.6, 3.0, rgb('#3a4a6a'));
  F.desk(K, { x: 21.5, y: GF, z: 24.5, rot: Math.PI }); F.officeChair(K, { x: 21.5, y: GF, z: 23.4, rot: 0 });
  F.bookshelf(K, { x: X0 + 0.33, y: GF, z: 26, rot: Math.PI / 2 }, 2.4); F.bookshelf(K, { x: X0 + 0.33, y: GF, z: 29.5, rot: Math.PI / 2 }, 2.4);
  F.armchair(K, { x: 25.5, y: GF, z: 29.5, rot: -Math.PI * 0.75 }, rgb('#5a3a2a')); F.plant(K, { x: 26.3, y: GF, z: 20.8 }, 0.9);
  F.painting(K, { x: 23.5, y: GF + 1.7, z: 31.83, rot: Math.PI }, 1.2, 0.9, rgb('#a8762a'));
  c.light({ pos: F.ceilingLamp(K, { x: 21.5, y: GF + H - SLAB, z: 26 }), color: 0xfff1dc, intensity: 1.0, distance: 9, room: 'Study' });
  c.interact({ id: 'laptop', prompt: () => 'Use laptop', pos: [21.5, GF, 23.4], radius: 1.4, action: () => {} });
  c.spot('desk', 21.5, GF, 23.4, Math.PI);

  // family lounge
  const tv2 = F.tvWall(K, { x: 30.4, y: GF, z: 27, rot: Math.PI / 2 }, 1.6); const scr2 = c.screen(tv2.screen, tv2.rot, tv2.w, tv2.h);
  F.sofa(K, { x: 35, y: GF, z: 27, rot: -Math.PI / 2 }, 2.6, rgb('#6a4a3a')); F.coffeeTable(K, { x: 32.8, y: GF, z: 27 }, 1.0, 0.6); F.rug(K, { x: 33, y: GF, z: 27 }, 3.2, 2.8, rgb('#7a6a4a'));
  F.plant(K, { x: 38.4, y: GF, z: 20.8 }, 1.0); F.painting(K, { x: 38.83, y: GF + 1.7, z: 28, rot: -Math.PI / 2 }, 1.2, 0.9, rgb('#2a6a5a'));
  c.light({ pos: F.ceilingLamp(K, { x: 34.5, y: GF + H - SLAB, z: 26 }), color: 0xfff1dc, intensity: 1.0, distance: 9, room: 'Family lounge' });
  c.interact({ id: 'tv2', prompt: () => scr2.on ? 'Turn off TV' : 'Watch TV', pos: [32.8, GF, 27], radius: 2.0, action: () => scr2.toggle() });
  c.spot('lounge', 36, GF, 24, Math.PI / 2);

  // guest toilet & store
  F.toilet(K, { x: 28.5, y: GF, z: 20.6, rot: 0 }); F.basin(K, { x: 27.5, y: GF, z: 23.8, rot: Math.PI / 2 }, 0.7);
  F.ceilingLamp(K, { x: 28.5, y: GF + H - SLAB, z: 23 }, 0.15);
  F.bookshelf(K, { x: 27.33, y: GF, z: 29, rot: Math.PI / 2 }, 2.4, 2.0); F.appliance(K, { x: 29.5, y: GF, z: 31.4, rot: Math.PI }, 0.6, 0.85, 0.6, rgb('#e6e6e6'));
  F.ceilingLamp(K, { x: 28.5, y: GF + H - SLAB, z: 29 }, 0.15);

  // ───────────────────────── first-floor interior ─────────────────────────
  wall('plaster', 27, 33.9, 27, Z1, F1, H, TI, INT, [dr(6.1, 7.1)]);
  wall('plaster', 30, Z0, 30, 33.9, F1, H, TI, INT, [dr(10, 11)]);
  wall('plaster', 36, Z0, 36, 36, F1, H, TI, INT, [dr(4, 5), dr(12, 13)]);
  wall('plaster', 39, 36, 39, Z1, F1, H, TI, INT, [dr(4, 5)]);
  wall('plaster', 42, 29, 42, 36, F1, H, TI, INT);
  wall('plaster', 22, Z0, 22, 27, F1, H, TI, INT);
  wall('plaster', X0, 27, 30, 27, F1, H, TI, INT, [dr(2, 3), dr(9, 10)]);
  wall('plaster', X0, 33.9, 30, 33.9, F1, H, TI, INT);
  wall('plaster', 36, 29, X1, 29, F1, H, TI, INT);
  wall('plaster', 36, 36, X1, 36, F1, H, TI, INT, [dr(9, 10)]);
  hinged(27, F1, 40, -Math.PI / 2, 1.0, { label: 'bedroom door', swing: -1, open: true });
  hinged(30, F1, 30, -Math.PI / 2, 1.0, { label: 'bedroom door', swing: -1, open: true });
  hinged(36, F1, 24, -Math.PI / 2, 1.0, { label: 'bedroom door', swing: 1 });
  hinged(36, F1, 32, -Math.PI / 2, 0.9, { label: 'bathroom door', swing: 1, color: '#f0ece4', mat: 'white' });
  hinged(39, F1, 40, -Math.PI / 2, 1.0, { label: 'bedroom door', swing: 1 });
  hinged(18, F1, 27, 0, 1.0, { label: 'dressing room door', swing: -1 });
  hinged(25, F1, 27, 0, 1.0, { label: 'bathroom door', swing: -1, color: '#f0ece4', mat: 'white' });
  hinged(45, F1, 36, 0, 1.0, { label: 'bathroom door', swing: -1, color: '#f0ece4', mat: 'white' });

  // master bedroom
  F.rug(K, { x: 23, y: F1, z: 30.5 }, 4.4, 3.6, rgb('#5a4a6a'));
  F.bed(K, { x: 23, y: F1, z: 28.25, rot: 0 }, 2.0, 2.2, { duvet: rgb('#c9b9a0'), headboard: rgb('#3a2a20') });
  c.light({ pos: F.nightstand(K, { x: 21.65, y: F1, z: 27.5 }), color: 0xffd9a0, intensity: 0.5, distance: 5, room: 'Master bedroom' }); F.nightstand(K, { x: 24.35, y: F1, z: 27.5 });
  F.wardrobe(K, { x: X0 + 0.32, y: F1, z: 31.4, rot: Math.PI / 2 }, 2.6);
  const tv3 = F.tvWall(K, { x: 23, y: F1, z: 33.6, rot: Math.PI }, 1.6); const scr3 = c.screen(tv3.screen, tv3.rot, tv3.w, tv3.h);
  F.armchair(K, { x: 18.2, y: F1, z: 32.6, rot: Math.PI * 0.35 }, rgb('#7a5a4a')); F.dresser(K, { x: 28.4, y: F1, z: 33.3, rot: Math.PI });
  F.painting(K, { x: 23, y: F1 + 2.2, z: 27.17, rot: 0 }, 1.8, 0.9, rgb('#b8562e'));
  F.curtain(K, { x: X0 + 0.3, y: F1, z: 30.5, rot: Math.PI / 2 }, 5.4, 2.6);
  c.light({ pos: F.chandelier(K, { x: 23, y: F1 + H - SLAB, z: 30.5 }, 0.5), color: 0xfff1dc, intensity: 1.0, distance: 9, room: 'Master bedroom' });
  c.fan(23, F1 + H - SLAB, 29.5); F.acUnit(K, { x: 28, y: F1 + 2.75, z: 27.25, rot: 0 });
  c.interact({ id: 'bed', prompt: () => 'Sleep', pos: [23, F1, 29.8], radius: 1.8, action: () => {} });
  c.interact({ id: 'wardrobe', prompt: () => 'Change outfit', pos: [16.9, F1, 31.4], radius: 1.6, action: () => {} });
  c.interact({ id: 'tv3', prompt: () => scr3.on ? 'Turn off TV' : 'Watch TV', pos: [23, F1, 32.6], radius: 2.0, action: () => scr3.toggle() });
  c.spot('bedside', 23, F1, 30.6, Math.PI); c.spot('wake', 25.2, F1, 29.2, Math.PI / 2);

  // dressing room & master bathroom
  F.wardrobe(K, { x: X0 + 0.32, y: F1, z: 23.5, rot: Math.PI / 2 }, 4.2); F.wardrobe(K, { x: 19, y: F1, z: Z0 + 0.32, rot: 0 }, 3.4, 2.3, 0.6);
  F.dresser(K, { x: 21.4, y: F1, z: 24.5, rot: -Math.PI / 2 }); F.ceilingLamp(K, { x: 19, y: F1 + H - SLAB, z: 23.5 });
  F.bathtub(K, { x: 29.52, y: F1, z: 23, rot: Math.PI / 2 }); F.shower(K, { x: 23.0, y: F1, z: 21.0 }, 1.1);
  F.basin(K, { x: 26, y: F1, z: Z0 + 0.42, rot: 0 }, 1.6); F.toilet(K, { x: 23, y: F1, z: 26.4, rot: Math.PI }); F.plant(K, { x: 29.4, y: F1, z: 26.3 }, 0.7);
  c.light({ pos: F.ceilingLamp(K, { x: 26, y: F1 + H - SLAB, z: 23.5 }), color: 0xffffff, intensity: 0.9, distance: 7, room: 'Master bathroom' });

  // bedroom 2
  F.rug(K, { x: 20.5, y: F1, z: 38 }, 3.4, 3.0, rgb('#4a6a8a'));
  F.bed(K, { x: 20, y: F1, z: 35.2, rot: 0 }, 1.6, 2.0, { duvet: rgb('#6a8aa8') }); F.nightstand(K, { x: 18.9, y: F1, z: 34.4 }); F.nightstand(K, { x: 21.1, y: F1, z: 34.4 }, false);
  F.wardrobe(K, { x: 27 - 0.32, y: F1, z: 37.5, rot: -Math.PI / 2 }, 2.4); F.desk(K, { x: X0 + 0.72, y: F1, z: 41.2, rot: Math.PI / 2 }); F.officeChair(K, { x: 17.8, y: F1, z: 41.2, rot: -Math.PI / 2 });
  F.painting(K, { x: 20, y: F1 + 2.1, z: 34.07, rot: 0 }, 1.2, 0.8, rgb('#3a8a6a')); F.curtain(K, { x: 23.5, y: F1, z: Z1 - 0.3, rot: Math.PI }, 3.2, 2.6);
  c.light({ pos: F.ceilingLamp(K, { x: 21.5, y: F1 + H - SLAB, z: 38.5 }), color: 0xfff1dc, intensity: 0.9, distance: 8, room: 'Bedroom 2' }); c.fan(21.5, F1 + H - SLAB, 38.5);

  // bedroom 3
  F.rug(K, { x: 44.5, y: F1, z: 40.5 }, 3.4, 3.0, rgb('#8a6a4a'));
  F.bed(K, { x: 44.5, y: F1, z: 37.3, rot: 0 }, 1.8, 2.1, { duvet: rgb('#d8b8a0') }); F.nightstand(K, { x: 43.2, y: F1, z: 36.5 }); F.nightstand(K, { x: 45.8, y: F1, z: 36.5 }, false);
  F.wardrobe(K, { x: 48.2, y: F1, z: 36.32, rot: 0 }, 2.4); F.armchair(K, { x: 40.6, y: F1, z: 42.4, rot: Math.PI * 0.75 }, rgb('#5a6a4a')); F.plant(K, { x: 49.3, y: F1, z: 43.3 }, 0.8);
  F.curtain(K, { x: 47.5, y: F1, z: Z1 - 0.3, rot: Math.PI }, 3.2, 2.6);
  c.light({ pos: F.ceilingLamp(K, { x: 44.5, y: F1 + H - SLAB, z: 40 }), color: 0xfff1dc, intensity: 0.9, distance: 8, room: 'Bedroom 3' }); c.fan(44.5, F1 + H - SLAB, 40);
  // en-suite 3 + family bathroom
  F.shower(K, { x: 49.35, y: F1, z: 29.65, rot: -Math.PI / 2 }, 1.1); F.basin(K, { x: 44.5, y: F1, z: 29.42, rot: 0 }, 1.0); F.toilet(K, { x: 47.3, y: F1, z: 29.6, rot: 0 }); F.bathtub(K, { x: 45, y: F1, z: 35.5, rot: 0 });
  F.ceilingLamp(K, { x: 46, y: F1 + H - SLAB, z: 32.5 });
  F.bathtub(K, { x: 39, y: F1, z: 29.6, rot: 0 }); F.basin(K, { x: 41.5, y: F1, z: 33, rot: -Math.PI / 2 }, 1.0); F.toilet(K, { x: 37, y: F1, z: 35.4, rot: Math.PI }); F.shower(K, { x: 36.65, y: F1, z: 29.65 }, 1.1);
  c.light({ pos: F.ceilingLamp(K, { x: 39, y: F1 + H - SLAB, z: 32.5 }), color: 0xffffff, intensity: 0.8, distance: 6, room: 'Bathroom' });

  // bedroom 4 (guest)
  F.rug(K, { x: 43, y: F1, z: 24.5 }, 3.6, 3.0, rgb('#6a4a5a'));
  F.bed(K, { x: 43, y: F1, z: 21.3, rot: 0 }, 1.8, 2.1, { duvet: rgb('#b8c8a0') }); F.nightstand(K, { x: 41.7, y: F1, z: 20.5 }); F.nightstand(K, { x: 44.3, y: F1, z: 20.5 }, false);
  F.wardrobe(K, { x: 36.32, y: F1, z: 26.5, rot: Math.PI / 2 }, 2.4); F.desk(K, { x: X1 - 0.72, y: F1, z: 24.5, rot: -Math.PI / 2 }); F.officeChair(K, { x: 48.3, y: F1, z: 24.5, rot: Math.PI / 2 });
  F.armchair(K, { x: 38, y: F1, z: 21.2, rot: Math.PI / 4 }, rgb('#4a5a6a')); F.painting(K, { x: 43, y: F1 + 2.1, z: Z0 + 0.17, rot: 0 }, 1.4, 0.9, rgb('#8a3a2a'));
  c.light({ pos: F.ceilingLamp(K, { x: 43, y: F1 + H - SLAB, z: 24.5 }), color: 0xfff1dc, intensity: 0.9, distance: 8, room: 'Bedroom 4' }); c.fan(43, F1 + H - SLAB, 24.5);

  // landing + corridor
  F.sideboard(K, { x: 37.4, y: F1, z: Z1 - 0.32, rot: Math.PI }, 1.6); F.plant(K, { x: 30.8, y: F1, z: 43.3 }, 0.9); F.plant(K, { x: 35.3, y: F1, z: 20.8 }, 0.9);
  F.painting(K, { x: 35.83, y: F1 + 1.7, z: 28, rot: -Math.PI / 2 }, 1.0, 0.8, rgb('#5a7aa0')); F.painting(K, { x: 30.17, y: F1 + 1.7, z: 26, rot: Math.PI / 2 }, 1.0, 0.8, rgb('#a05a3a'));
  F.rug(K, { x: 33, y: F1, z: 28 }, 1.4, 10, rgb('#6a4a3a'));
  c.light({ pos: F.ceilingLamp(K, { x: 34.5, y: F1 + H - SLAB, z: 40 }), color: 0xfff1dc, intensity: 1.0, distance: 9, room: 'Landing' });
  F.ceilingLamp(K, { x: 33, y: F1 + H - SLAB, z: 30 }); F.ceilingLamp(K, { x: 33, y: F1 + H - SLAB, z: 23 });

  // roof terrace
  F.pergola(K, { x: 39, y: RF, z: 40 }, 9, 6); for (const x of [36.5, 39, 41.5]) F.sunLounger(K, { x, y: RF, z: 40.5, rot: Math.PI }); F.coffeeTable(K, { x: 39, y: RF, z: 38.2 }, 1.0, 0.6);
  for (const x of [18, 21, 24]) F.plant(K, { x, y: RF, z: 21.5 }, 1.3); F.bench(K, { x: 20, y: RF, z: 42.6, rot: Math.PI }, 2.0); F.umbrella(K, { x: 21, y: RF, z: 36 });
  F.waterTank(K, { x: 45.5, y: RF, z: 23.5 }, 2.6); F.waterTank(K, { x: 48.2, y: RF, z: 23.5 }, 2.6);
  for (const [x, z] of [[34, 22], [37, 22]]) F.acOutdoor(K, { x, y: RF + 0.35, z });
  c.light({ pos: F.wallLight(K, { x: 30.4, y: RF + 2.2, z: 36.8, rot: Math.PI / 2 }), color: 0xffd9a0, intensity: 0.6, distance: 8, room: 'Roof terrace', outdoor: true });
  c.spot('roof', 39, RF, 36.5, 0);

  // balcony furniture
  F.bench(K, { x: 22, y: F1, z: 45.9, rot: 0 }, 1.8); F.plant(K, { x: 17, y: F1, z: 45.8 }, 0.9); F.plant(K, { x: 49, y: F1, z: 45.8 }, 0.9); F.coffeeTable(K, { x: 44, y: F1, z: 45.6 }, 0.8, 0.6);
  // veranda
  F.bench(K, { x: 20, y: GF, z: 46.3, rot: 0 }, 1.8); F.bench(K, { x: 46, y: GF, z: 46.3, rot: 0 }, 1.8); F.plant(K, { x: 29, y: GF, z: 46.4 }, 1.2); F.plant(K, { x: 37, y: GF, z: 46.4 }, 1.2);
  c.spot('porch', 36.2, GF, 45.5, 0);
}
