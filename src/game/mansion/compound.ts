/** The estate around the house: wall, gate, drive, gardens, pool, staff quarters, generator, carport. */
import * as THREE from 'three';
import { MeshKit, rgb, type RGB } from './kit';
import type { MansionContext } from './index';
import * as F from './furniture';
import { car, CAR_COLORS, type CarKind } from './cars';
import { HOUSE } from './house';

const WALL = rgb('#e6dfcf'), STONE = rgb('#8a847c'), PAVE = rgb('#a8a39a'), LAWN = rgb('#86a85a'), DARK = rgb('#2a2a2a');

export function buildCompound(c: MansionContext, b: [number, number, number, number]): void {
  const { K } = c; const [bx0, bz0, bx1, bz1] = b;
  const W0 = bx0 + 0.3, W1 = bx1 - 0.3, D0 = bz0 + 0.3, D1 = bz1 - 0.3; // wall centre lines
  const GATE_X0 = 23.5, GATE_X1 = 30.5, PED_X0 = 21.6, PED_X1 = 22.7;

  // ground: lawn over the whole terrace, paved areas on top. All of it is walkable collision surface, so
  // the feet follow the visible paving exactly (the terrace terrain underneath is flat at local 0; the
  // slabs sit 2–5 cm above it and win the ground query).
  K.slab('grass', bx0, bz0, bx1, bz1, 0.02, 0.02, LAWN, { under: 'soil', holes: [[34, 5, 48, 13]] });
  // drive + forecourt + walkways
  K.slab('paving', 22.5, 56, 32.5, D1 + 0.3, 0.05, 0.05, PAVE);
  K.slab('paving', 10, 47.2, 56, 56.5, 0.05, 0.05, PAVE);
  K.slab('paving', 53, 56.5, W1, 74, 0.05, 0.05, rgb('#9e9990'));
  K.slab('paving', 2, 58, 14, 74, 0.05, 0.05, rgb('#9e9990'));
  K.slab('paving', 50.5, 20, 56, 47.2, 0.05, 0.05, PAVE); K.slab('paving', 10, 20, 15.7, 47.2, 0.05, 0.05, PAVE);
  // rear terrace & pool deck (raised 0.15)
  K.slab('tile', 12, 1.5, 54, 20, 0.15, 0.15, rgb('#d8d2c6'), { under: 'stone', underColor: STONE, holes: [[34, 5, 48, 13]] });
  c.sink.addSegment(12, 1.5, 12, 20, 0, 0.15); c.sink.addSegment(54, 1.5, 54, 20, 0, 0.15); c.sink.addSegment(12, 1.5, 54, 1.5, 0, 0.15); // deck edge (low kerb, steppable? no: 0.15 < 0.42 so walkable)
  K.stair('stone', 32.5, 37.5, 19.3, 1, 0.15, 2, 0.15, 0.35, STONE);
  c.sink.addSegment(HOUSE.X0, 20, 32.5, 20, 0.15, HOUSE.GF); c.sink.addSegment(37.5, 20, HOUSE.X1, 20, 0.15, HOUSE.GF);
  // pool: basin 1.3 m deep, tiled, with steps at the east end; water surface
  const PX0 = 34, PZ0 = 5, PX1 = 48, PZ1 = 13, PY = 0.15 - 1.3;
  K.box('poolTile', (PX0 + PX1) / 2, PY - 0.05, (PZ0 + PZ1) / 2, PX1 - PX0, 0.1, PZ1 - PZ0, [0.85, 0.95, 1], 0, { faces: ['py'] });
  for (const [ax, az, bxx, bzz] of [[PX0, PZ0, PX1, PZ0], [PX1, PZ0, PX1, PZ1], [PX1, PZ1, PX0, PZ1], [PX0, PZ1, PX0, PZ0]] as [number, number, number, number][]) {
    K.wall('poolTile', ax, az, bxx, bzz, PY, 1.3, 0.1, [0.85, 0.95, 1]);
  }
  // pit: inside the pool the ground is the basin floor (you can wade in and climb out by the steps)
  c.pit(PX0, PZ0, PX1, PZ1, PY);
  // four steps at the east end; the top one reaches the pool wall so there is no strip of deep water
  // between it and the deck (a foot sampled there used to drop into the pit for a frame)
  for (let i = 0; i < 4; i++) { const sx0 = PX1 - 0.6 - i * 0.4, sx1 = i === 0 ? PX1 : PX1 - 0.2 - i * 0.4; K.box('poolTile', (sx0 + sx1) / 2, PY + (4 - i) * 0.3 / 2, (PZ0 + PZ1) / 2, sx1 - sx0, (4 - i) * 0.3, PZ1 - PZ0 - 0.2, [0.9, 0.97, 1], 0, { collide: true }); } // solid: you climb them one at a time, never walk through them
  for (let i = 0; i < 4; i++) { const sx0 = PX1 - 0.6 - i * 0.4, sx1 = i === 0 ? PX1 + 0.05 : PX1 - 0.2 - i * 0.4; c.sink.addSurface(sx0 - 0.03, PZ0 + 0.1, sx1, PZ1 - 0.1, PY + (4 - i) * 0.3); }
  K.box('stone', (PX0 + PX1) / 2, 0.16, PZ0 - 0.2, PX1 - PX0 + 0.8, 0.06, 0.4, rgb('#ddd8ce')); K.box('stone', (PX0 + PX1) / 2, 0.16, PZ1 + 0.2, PX1 - PX0 + 0.8, 0.06, 0.4, rgb('#ddd8ce'));
  K.box('stone', PX0 - 0.2, 0.16, (PZ0 + PZ1) / 2, 0.4, 0.06, PZ1 - PZ0 + 0.8, rgb('#ddd8ce')); K.box('stone', PX1 + 0.2, 0.16, (PZ0 + PZ1) / 2, 0.4, 0.06, PZ1 - PZ0 + 0.8, rgb('#ddd8ce'));
  K.box('water', (PX0 + PX1) / 2, 0.15 - 0.22, (PZ0 + PZ1) / 2, PX1 - PX0 - 0.02, 0.02, PZ1 - PZ0 - 0.02, [0.55, 0.85, 1], 0, { faces: ['py'] });
  for (const x of [36, 38.5, 41, 43.5, 46]) F.sunLounger(K, { x, y: 0.15, z: 15.2, rot: Math.PI });
  F.umbrella(K, { x: 39.7, y: 0.15, z: 16.6 }); F.umbrella(K, { x: 44.7, y: 0.15, z: 16.6 });
  for (const x of [33, 49]) { F.plant(K, { x, y: 0.15, z: 3.2 }, 1.4); F.plant(K, { x, y: 0.15, z: 15 }, 1.4); }
  // outdoor dining under a pergola on the deck
  F.pergola(K, { x: 22, y: 0.15, z: 10 }, 7, 6); F.diningSet(K, { x: 22, y: 0.15, z: 10 }, 6);
  c.spot('poolside', 34.6, 0.15, 14.0, 0); c.spot('deck', 25, 0.15, 10, -Math.PI / 2);
  for (const x of [30, 52]) c.light({ pos: F.lampPost(K, { x, y: 0.15, z: 3 }, 2.6), color: 0xffe2b0, intensity: 0.8, distance: 12, room: 'garden', outdoor: true });
  c.light({ pos: [41, 0.3, 9], color: 0x6fc7ff, intensity: 1.2, distance: 14, room: 'pool', outdoor: true });

  // ───────── perimeter wall with pilasters, coping and electric fence ─────────
  // The terrace is cut into the hillside at the grade of the street in front of the gate; the streets
  // on the other three sides run above it. Each wall is therefore a retaining wall: its top is kept
  // at least PARAPET above the highest outside ground along that side (and never below WALL_TOP), so
  // no side can be stepped over from the street and the earth face behind the wall is never visible.
  const WALL_TOP = 3.0, WALL_BASE = -0.5, PARAPET = 1.4;
  /** wall top for the side a→b whose outward normal is (nx, nz): highest ground just outside + parapet */
  const outsideTop = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
    let top = WALL_TOP;
    for (let t = 0; t <= 1.0001; t += 1 / 24) for (const d of [0.6, 2, 4, 7]) top = Math.max(top, c.sink.groundAt(ax + (bx - ax) * t + nx * d, az + (bz - az) * t + nz * d) + PARAPET);
    return Math.ceil(top * 10) / 10;
  };
  const TOP_N = outsideTop(W0, D0, W1, D0, 0, -1), TOP_E = outsideTop(W1, D0, W1, D1, 1, 0), TOP_W = outsideTop(W0, D0, W0, D1, -1, 0), TOP_S = WALL_TOP;
  const wallOps = (gate = false) => gate ? [{ u0: GATE_X0 - W0, u1: GATE_X1 - W0, y0: 0, y1: 3.0, kind: 'open' as const }, { u0: PED_X0 - W0, u1: PED_X1 - W0, y0: 0, y1: 2.3, kind: 'open' as const }] : [] as never[];
  K.wall('plaster', W0, D0, W1, D0, WALL_BASE, TOP_N - WALL_BASE, 0.3, WALL);                 // north
  K.wall('plaster', W1, D0, W1, D1, WALL_BASE, TOP_E - WALL_BASE, 0.3, WALL);                 // east
  K.wall('plaster', W0, D1, W0, D0, WALL_BASE, TOP_W - WALL_BASE, 0.3, WALL);                 // west
  K.wall('plaster', W0, D1, W1, D1, WALL_BASE, TOP_S - WALL_BASE, 0.3, WALL, wallOps(true));  // south (street side) with the gate opening
  const pil = (x: number, z: number, h = 3.3) => { K.box('stone', x, h / 2 - 0.4, z, 0.55, h + 0.4, 0.55, STONE, 0, { collide: true }); K.box('stone', x, h + 0.05, z, 0.7, 0.1, 0.7, STONE); };
  for (let x = W0; x <= W1 + 0.01; x += (W1 - W0) / 10) { pil(x, D0, TOP_N + 0.3); if (x < GATE_X0 - 1 || x > GATE_X1 + 1) pil(x, D1); }
  for (let z = D0; z <= D1 + 0.01; z += (D1 - D0) / 11) { pil(W0, z, z < D0 + 0.1 ? Math.max(TOP_N, TOP_W) + 0.3 : TOP_W + 0.3); pil(W1, z, z < D0 + 0.1 ? Math.max(TOP_N, TOP_E) + 0.3 : TOP_E + 0.3); }
  pil(GATE_X0 - 0.35, D1, 3.6); pil(GATE_X1 + 0.35, D1, 3.6); pil(PED_X0 - 0.35, D1, 3.4);
  // coping + three strands of electric fence on each side, following that side's wall top
  K.box('stone', (W0 + W1) / 2, TOP_N + 0.02, D0, W1 - W0, 0.08, 0.5, STONE); K.box('stone', W0, TOP_W + 0.02, (D0 + D1) / 2, 0.5, 0.08, D1 - D0, STONE); K.box('stone', W1, TOP_E + 0.02, (D0 + D1) / 2, 0.5, 0.08, D1 - D0, STONE);
  K.box('stone', (W0 + GATE_X0) / 2, TOP_S + 0.02, D1, GATE_X0 - W0 - 0.6, 0.08, 0.5, STONE); K.box('stone', (GATE_X1 + W1) / 2, TOP_S + 0.02, D1, W1 - GATE_X1 - 0.6, 0.08, 0.5, STONE);
  for (let k = 1; k <= 3; k++) { const dy = 0.05 + k * 0.18; K.segmentBox('metalDark', [W0, TOP_N + dy, D0 + 0.05], [W1, TOP_N + dy, D0 + 0.05], 0.015, DARK); K.segmentBox('metalDark', [W1 - 0.05, TOP_E + dy, D0], [W1 - 0.05, TOP_E + dy, D1], 0.015, DARK); K.segmentBox('metalDark', [W0 + 0.05, TOP_W + dy, D0], [W0 + 0.05, TOP_W + dy, D1], 0.015, DARK); }
  // gate name plate
  K.box('black', GATE_X1 + 0.35, 1.7, D1 - 0.3, 0.5, 0.3, 0.02, rgb('#c9a24a'));
  // sliding gate (steel panels) + pedestrian gate
  const gateMesh = gatePanel(c, GATE_X1 - GATE_X0 + 0.4, 2.6);
  const gate = c.slider({ x: GATE_X0 - 0.2, y: 0.05, z: D1 - 0.45, along: 0, width: GATE_X1 - GATE_X0 + 0.4, height: 2.6, thick: 0.1, travel: 7.4, label: 'gate' }, gateMesh);
  c.interact({ id: 'gate', prompt: () => gate.prompt, pos: [27, 0, D1 - 0.5], radius: 4.5, action: () => gate.toggle() });
  c.door({ x: PED_X1, y: 0, z: D1, along: Math.PI, width: PED_X1 - PED_X0, height: 2.2, thick: 0.05, style: 'flat', mat: 'metalDark', color: '#2a2a2a', swing: -1, label: 'side gate' });
  // gate rail
  K.box('metalDark', (GATE_X0 + GATE_X1 + 7) / 2, 0.06, D1 - 0.45, 15, 0.04, 0.06, DARK);

  // gatehouse
  gatehouse(c, 32.6, 70.6, 36.6, 74.6);
  c.spot('gate', 29.5, 0, 72.8, Math.PI); c.spot('gatehouse', 34.6, 0.15, 72.6, 0);
  for (const x of [20, 35]) c.light({ pos: F.lampPost(K, { x, y: 0, z: 74.2 }, 3.2), color: 0xffe2b0, intensity: 0.9, distance: 12, room: 'gate', outdoor: true });

  // drive: hedges + lamp posts + palms, fountain roundel on the forecourt
  for (const z of [60, 66, 72]) { F.hedge(K, { x: 21.6, y: 0, z, rot: Math.PI / 2 }, 5, 0.9); F.hedge(K, { x: 33.4, y: 0, z, rot: Math.PI / 2 }, 5, 0.9); }
  for (const z of [59, 69]) for (const x of [21.0, 34.0]) c.light({ pos: F.lampPost(K, { x, y: 0, z }, 3.0), color: 0xffe2b0, intensity: 0.8, distance: 11, room: 'drive', outdoor: true });
  F.fountain(K, { x: 33, y: 0.05, z: 52 }); c.sink.addCylinder(33, 52, 2.7, 0, 1);
  for (const [x, z] of [[14, 50], [14, 54], [52, 50], [52, 54]]) F.palm(K, { x, y: 0, z }, 6 + ((x + z) % 3), 0.08);
  for (const [x, z] of [[4, 56], [4, 44], [4, 32], [62, 32], [62, 44], [62, 54]]) F.palm(K, { x, y: 0, z }, 7 + ((x * 3 + z) % 4), 0.1);
  for (const [x, z] of [[8, 38], [58, 38], [6, 8], [60, 8], [60, 17]]) F.tree(K, { x, y: 0, z }, 6.5 + ((x + z) % 3), 2.6);
  F.flowerBed(K, { x: 33, y: 0.05, z: 46.6 }, 14, 1.0); F.flowerBed(K, { x: 8, y: 0.05, z: 60, rot: Math.PI / 2 }, 12, 1.0);
  F.flowerBed(K, { x: 60, y: 0.05, z: 42, rot: Math.PI / 2 }, 14, 1.0); F.flowerBed(K, { x: 6, y: 0.05, z: 30, rot: Math.PI / 2 }, 14, 1.0);
  for (const [x, z] of [[12, 44], [12, 36], [12, 28], [54, 36], [54, 28]]) F.shrub(K, { x, y: 0, z }, 0.7);
  F.hedge(K, { x: 33, y: 0, z: D0 + 0.9 }, 60, 1.2, 0.8); F.hedge(K, { x: W0 + 0.9, y: 0, z: 38, rot: Math.PI / 2 }, 70, 1.1, 0.7); F.hedge(K, { x: W1 - 0.9, y: 0, z: 30, rot: Math.PI / 2 }, 50, 1.1, 0.7);
  F.gazebo(K, { x: 8, y: 0, z: 14 }, 2.8); F.bench(K, { x: 8, y: 0.2, z: 15.6, rot: Math.PI }, 1.6);
  c.spot('garden', 10, 0, 26, Math.PI); c.spot('gazebo', 8, 0.2, 13, 0);

  // carport with the family cars
  F.pergola(K, { x: 59.2, y: 0.05, z: 65, rot: 0 }, 11, 16.5, 3.1);
  const bays: [CarKind, number][] = [['gclass', 59.5], ['range', 63.5], ['saloon', 67.5], ['coupe', 71.5]];
  for (const [kind, z] of bays) car(K, { x: 59.2, y: 0.05, z, rot: Math.PI / 2 }, kind, CAR_COLORS[kind]);
  car(K, { x: 8.5, y: 0.05, z: 66, rot: Math.PI / 2 }, 'pickup');
  car(K, { x: 4.6, y: 0.05, z: 72.5, rot: Math.PI / 2 }, 'danfo');
  car(K, { x: 12.5, y: 0.05, z: 71.5, rot: Math.PI * 0.6 }, 'okada');
  for (const [kind, z] of bays) c.interact({ id: `car:${kind}`, prompt: () => 'Drive', pos: [56.5, 0, z], radius: 2.2, action: () => {} });
  c.interact({ id: 'car:pickup', prompt: () => 'Drive', pos: [11.5, 0, 66], radius: 2.2, action: () => {} }); c.interact({ id: 'car:danfo', prompt: () => 'Drive', pos: [7.5, 0, 72.5], radius: 2.2, action: () => {} }); c.interact({ id: 'car:okada', prompt: () => 'Ride', pos: [12.5, 0, 69.8], radius: 1.8, action: () => {} });
  c.spot('carport', 56, 0, 61.5, -Math.PI / 2); c.spot('driver', 56.5, 0, 65.5, Math.PI / 2);
  c.light({ pos: [59, 2.9, 65], color: 0xfff1dc, intensity: 0.9, distance: 12, room: 'carport', outdoor: true });

  // boys' quarters (staff) + generator house + water tower (north-west corner)
  staffQuarters(c, 2, 2, 14, 9);
  genHouse(c, 2, 11.5, 6.6, 15.5);
  F.waterTank(K, { x: 9.5, y: 0, z: 13 - 1 }, 4);
  c.spot('bq', 8, 0.15, 10.2, 0);
}


function gatePanel(c: MansionContext, w: number, h: number): THREE.Object3D {
  const k = new MeshKit(c.mats); const dark = rgb('#1f2226'), gold = rgb('#c9a24a');
  k.box('metalDark', w / 2, h * 0.21, 0, w, h * 0.42, 0.08, dark);                     // solid lower part
  k.box('metalDark', w / 2, 0.06, 0, w, 0.12, 0.12, dark); k.box('metalDark', w / 2, h - 0.04, 0, w, 0.08, 0.1, dark);
  for (let x = 0.08; x <= w; x += 0.16) k.box('metalDark', x, h * 0.42 + (h * 0.58) / 2, 0, 0.03, h * 0.58, 0.03, dark);  // bars
  for (let x = 0.12; x <= w; x += 0.16) k.box('metal', x, h - 0.02, 0, 0.05, 0.1, 0.05, gold);                              // spear tips
  k.box('metalDark', w / 2, h * 0.42 + 0.02, 0, w, 0.05, 0.1, dark); k.box('metalDark', w / 2, h * 0.75, 0, w, 0.05, 0.08, dark);
  k.box('metal', w / 2, h * 0.6, 0.06, 0.6, 0.6, 0.02, gold); // emblem
  for (const x of [0.4, w - 0.4]) { k.cylinder('rubber', x, 0, 0, 0.08, 0.1, rgb('#111'), 10); }
  return k.build({ shadows: true, name: 'gate' });
}

function gatehouse(c: MansionContext, x0: number, z0: number, x1: number, z1: number) {
  const { K } = c; const y = 0.15, h = 2.8; const wallC = rgb('#e6dfcf');
  K.slab('tile', x0, z0, x1, z1, y, 0.15, rgb('#cfcac0'), { under: 'stone' });
  c.sink.addSegment(x0, z0, x0, z1, 0, y); // kerb (low)
  K.wall('plaster', x0, z0, x1, z0, y, h, 0.2, wallC, [{ u0: 1.0, u1: 2.0, y0: y, y1: y + 2.1, kind: 'door' }]);        // north wall: door (to the compound)
  K.wall('plaster', x0, z0, x0, z1, y, h, 0.2, wallC, [{ u0: 0.8, u1: 3.2, y0: y + 0.9, y1: y + 2.1, kind: 'window' }]); // west: window to the drive
  K.glazing(x0, z0, x0, z1, { u0: 0.8, u1: 3.2, y0: y + 0.9, y1: y + 2.1 }, rgb('#2b2f36'), 0.2, 2);
  K.wall('plaster', x1, z0, x1, z1, y, h, 0.2, wallC);
  K.wall('plaster', x0, z1, x1, z1, y, h, 0.2, wallC, [{ u0: 1.2, u1: 2.8, y0: y + 1.0, y1: y + 2.0, kind: 'window' }]);
  K.glazing(x0, z1, x1, z1, { u0: 1.2, u1: 2.8, y0: y + 1.0, y1: y + 2.0 }, rgb('#2b2f36'), 0.2, 1);
  K.slab('roof', x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, y + h + 0.2, 0.2, rgb('#9a958c'), { walk: false });
  c.door({ x: x0 + 1.0, y, z: z0, along: 0, width: 1.0, height: 2.1, style: 'door', mat: 'woodDark', color: '#9a7050', swing: -1, label: 'gatehouse door', open: true });
  F.desk(K, { x: x0 + 1.0, y, z: z0 + 2.6, rot: -Math.PI / 2 }); F.officeChair(K, { x: x0 + 1.9, y, z: z0 + 2.6, rot: Math.PI / 2 });
  F.bench(K, { x: x1 - 0.6, y, z: z0 + 2.2, rot: -Math.PI / 2 }, 1.6); F.ceilingLamp(K, { x: (x0 + x1) / 2, y: y + h, z: (z0 + z1) / 2 }, 0.15);
  F.bench(K, { x: x0 - 1.6, y: 0, z: z1 - 1.0, rot: Math.PI / 2 }, 1.6); // gateman's bench outside
}

function staffQuarters(c: MansionContext, x0: number, z0: number, x1: number, z1: number) {
  const { K } = c; const y = 0.15, h = 3.0; const wallC = rgb('#e3d9c3');
  K.slab('tile', x0, z0, x1, z1 + 2, y, 0.15, rgb('#cfcac0'), { under: 'stone' });
  const mid = (x0 + x1) / 2;
  K.wall('plaster', x0, z0, x1, z0, y, h, 0.2, wallC, [{ u0: 2, u1: 3.5, y0: y + 1.0, y1: y + 2.1, kind: 'window' }, { u0: x1 - x0 - 3.5, u1: x1 - x0 - 2, y0: y + 1.0, y1: y + 2.1, kind: 'window' }]);
  K.glazing(x0, z0, x1, z0, { u0: 2, u1: 3.5, y0: y + 1.0, y1: y + 2.1 }, rgb('#2b2f36'), 0.2); K.glazing(x0, z0, x1, z0, { u0: x1 - x0 - 3.5, u1: x1 - x0 - 2, y0: y + 1.0, y1: y + 2.1 }, rgb('#2b2f36'), 0.2);
  K.wall('plaster', x0, z0, x0, z1, y, h, 0.2, wallC); K.wall('plaster', x1, z0, x1, z1, y, h, 0.2, wallC); K.wall('plaster', mid, z0, mid, z1, y, h, 0.15, wallC);
  K.wall('plaster', x0, z1, x1, z1, y, h, 0.2, wallC, [{ u0: 1.0, u1: 2.0, y0: y, y1: y + 2.1, kind: 'door' }, { u0: 3.0, u1: 4.5, y0: y + 1.0, y1: y + 2.1, kind: 'window' }, { u0: x1 - x0 - 2.0, u1: x1 - x0 - 1.0, y0: y, y1: y + 2.1, kind: 'door' }, { u0: x1 - x0 - 4.5, u1: x1 - x0 - 3.0, y0: y + 1.0, y1: y + 2.1, kind: 'window' }]);
  K.glazing(x0, z1, x1, z1, { u0: 3.0, u1: 4.5, y0: y + 1.0, y1: y + 2.1 }, rgb('#2b2f36'), 0.2); K.glazing(x0, z1, x1, z1, { u0: x1 - x0 - 4.5, u1: x1 - x0 - 3.0, y0: y + 1.0, y1: y + 2.1 }, rgb('#2b2f36'), 0.2);
  c.door({ x: x0 + 1.0, y, z: z1, along: 0, width: 1.0, height: 2.1, style: 'door', mat: 'woodDark', color: '#9a7050', swing: 1, label: 'staff room door', open: true });
  c.door({ x: x1 - 2.0, y, z: z1, along: 0, width: 1.0, height: 2.1, style: 'door', mat: 'woodDark', color: '#9a7050', swing: 1, label: 'staff room door' });
  // veranda roof on posts
  K.slab('roof', x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 2.2, y + h + 0.2, 0.2, rgb('#8a5a3a'), { walk: false });
  for (const x of [x0 + 0.3, mid, x1 - 0.3]) K.box('woodDark', x, y + h / 2, z1 + 1.9, 0.18, h, 0.18, rgb('#4a2e18'), 0, { collide: true });
  // simple furnishing
  F.bed(K, { x: x0 + 1.2, y, z: z0 + 1.3, rot: 0 }, 1.2, 2.0, { duvet: rgb('#8aa0b8') }); F.bed(K, { x: x1 - 1.2, y, z: z0 + 1.3, rot: 0 }, 1.2, 2.0, { duvet: rgb('#b8a08a') });
  F.wardrobe(K, { x: mid - 0.45, y, z: z0 + 4.5, rot: -Math.PI / 2 }, 1.2, 2.0, 0.55); F.wardrobe(K, { x: mid + 0.45, y, z: z0 + 4.5, rot: Math.PI / 2 }, 1.2, 2.0, 0.55);
  F.bench(K, { x: mid - 2.5, y, z: z1 + 1.0, rot: 0 }, 1.6); F.plant(K, { x: x1 - 0.8, y, z: z1 + 1.2 }, 0.8);
  F.ceilingLamp(K, { x: x0 + 3, y: y + h, z: (z0 + z1) / 2 }, 0.15); F.ceilingLamp(K, { x: x1 - 3, y: y + h, z: (z0 + z1) / 2 }, 0.15);
  c.light({ pos: F.wallLight(K, { x: mid, y: y + 2.3, z: z1 + 0.12, rot: 0 }), color: 0xffd9a0, intensity: 0.6, distance: 7, room: 'bq', outdoor: true });
}

function genHouse(c: MansionContext, x0: number, z0: number, x1: number, z1: number) {
  const { K } = c; const y = 0.15, h = 2.6; const wallC = rgb('#d9d2c0');
  K.slab('concrete', x0, z0, x1, z1, y, 0.15, rgb('#b9b5ad'), { under: 'stone' });
  K.wall('plaster', x0, z0, x1, z0, y, h, 0.2, wallC); K.wall('plaster', x0, z0, x0, z1, y, h, 0.2, wallC); K.wall('plaster', x1, z0, x1, z1, y, h, 0.2, wallC, [{ u0: 1.0, u1: 3.0, y0: y + 0.6, y1: y + 2.2, kind: 'open' }]);
  K.wall('plaster', x0, z1, x1, z1, y, h, 0.2, wallC, [{ u0: 1.4, u1: 3.2, y0: y, y1: y + 2.2, kind: 'door' }]);
  // louvre on the east opening
  for (let k = 0; k < 8; k++) K.box('metalDark', x1, y + 0.7 + k * 0.2, z0 + 2.0, 0.08, 0.06, 2.0, rgb('#555'));
  K.slab('roof', x0 - 0.2, z0 - 0.2, x1 + 0.2, z1 + 0.2, y + h + 0.15, 0.15, rgb('#8a8a8a'), { walk: false });
  c.door({ x: x0 + 1.4, y, z: z1, along: 0, width: 0.9, height: 2.2, style: 'flat', mat: 'metalDark', color: '#3a3f44', swing: 1, label: 'generator house' });
  c.door({ x: x0 + 3.2, y, z: z1, along: Math.PI, width: 0.9, height: 2.2, style: 'flat', mat: 'metalDark', color: '#3a3f44', swing: -1, label: 'generator house' });
  F.generator(K, { x: (x0 + x1) / 2 + 0.3, y, z: (z0 + z1) / 2 - 0.2, rot: 0 });
  c.interact({ id: 'generator', prompt: () => 'Start generator', pos: [(x0 + x1) / 2, y, z1 - 0.5], radius: 2.2, action: () => {} });
  // exhaust stack through the roof
  K.cylinder('metalDark', x1 - 0.8, y + h, z0 + 0.8, 0.08, 1.2, rgb('#444'), 8);
}

export const COMPOUND_SPOTS = ['gate', 'gatehouse', 'carport', 'driver', 'garden', 'gazebo', 'poolside', 'deck', 'bq'] as const;
export type RGBx = RGB;
