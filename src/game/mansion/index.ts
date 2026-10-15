/**
 * JAG House — the player's estate. Built procedurally at runtime on the reserved, terraced site in
 * North Heights: perimeter wall + gate, drive, gardens, pool, staff quarters, generator house, carport
 * with the family cars, and the two-storey mansion with a furnished interior and roof terrace.
 */
import * as THREE from 'three';
import { CollisionWorld } from '../collision';
import { makeMaterials, type MatDef, type MatId } from './materials';
import { MeshKit } from './kit';
import { Door, Slider, Fan, Screen, ShiftedCollision, type DoorSpec } from './dynamic';
import { buildHouse } from './house';
import { buildCompound } from './compound';

export interface LightSpot { pos: [number, number, number]; color: number; intensity: number; distance: number; room: string; outdoor?: boolean }
export interface Spot { pos: [number, number, number]; yaw: number }
export interface MansionInteractable { id: string; prompt: () => string; pos: [number, number, number]; radius: number; action: () => void; enabled?: () => boolean }

export interface MansionContext {
  K: MeshKit;
  mats: Record<MatId, MatDef>;
  sink: ShiftedCollision;
  group: THREE.Group;
  door(spec: DoorSpec): Door;
  slider(spec: ConstructorParameters<typeof Slider>[0], mesh: THREE.Object3D): Slider;
  light(l: LightSpot): void;
  spot(id: string, x: number, y: number, z: number, yaw: number): void;
  interact(i: MansionInteractable): void;
  /** dig a rectangular pit (pool): collision floor + terrain hole */
  pit(x0: number, z0: number, x1: number, z1: number, y: number): void;
  screen(center: [number, number, number], rot: number, w: number, h: number): Screen;
  fan(x: number, y: number, z: number): Fan;
  /** named room volumes (local) for "which room am I in" */
  room(name: string, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void;
}

export interface Mansion {
  group: THREE.Group;
  origin: [number, number, number];
  doors: Door[]; sliders: Slider[]; fans: Fan[]; screens: Screen[];
  lights: LightSpot[]; spots: Record<string, Spot>; interactables: MansionInteractable[];
  /** local rects dug below ground level (pools) */
  pits: [number, number, number, number][];
  update(dt: number): void;
  /** local rect of the compound */
  bounds: [number, number, number, number];
  inCompound(x: number, z: number): boolean;
  roomAt(x: number, y: number, z: number): string | null;
  toWorld(x: number, y: number, z: number): [number, number, number];
}

export function buildMansion(o: { origin: [number, number, number]; collision: CollisionWorld; shadows: boolean; textureSize?: number; mats?: Record<MatId, MatDef> }): Mansion {
  const [ox, oy, oz] = o.origin;
  const mats = o.mats ?? makeMaterials(o.textureSize ?? 256);
  const sink = new ShiftedCollision(o.collision, ox, oy, oz);
  const K = new MeshKit(mats, sink);
  const group = new THREE.Group(); group.name = 'mansion'; group.position.set(ox, oy, oz);
  const doors: Door[] = [], sliders: Slider[] = [], fans: Fan[] = [], screens: Screen[] = [], lights: LightSpot[] = [], interactables: MansionInteractable[] = [];
  const spots: Record<string, Spot> = {};
  const pits: [number, number, number, number][] = [];
  const rooms: { name: string; x0: number; z0: number; x1: number; z1: number; y0: number; y1: number }[] = [];
  const toWorld = (x: number, y: number, z: number): [number, number, number] => [ox + x, oy + y, oz + z];
  const ctx: MansionContext = {
    K, mats, sink, group,
    door(spec) {
      const d = new Door(spec, mats, sink); doors.push(d); group.add(d.group);
      const h = d.handle;
      interactables.push({ id: `door:${doors.length}`, prompt: () => d.prompt, pos: toWorld(h[0], h[1], h[2]), radius: 1.7, action: () => d.toggle() });
      return d;
    },
    slider(spec, mesh) { const s = new Slider(spec, mesh, sink); sliders.push(s); group.add(s.group); return s; },
    light(l) { lights.push({ ...l, pos: toWorld(l.pos[0], l.pos[1], l.pos[2]) }); },
    spot(id, x, y, z, yaw) { spots[id] = { pos: toWorld(x, y, z), yaw }; },
    interact(i) { interactables.push({ ...i, pos: toWorld(i.pos[0], i.pos[1], i.pos[2]) }); },
    pit(x0, z0, x1, z1, y) { pits.push([x0, z0, x1, z1]); o.collision.addPit(ox + x0, oz + z0, ox + x1, oz + z1, oy + y); },
    screen(center, rot, w, h) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), mats.screen.material); mesh.position.set(center[0], center[1], center[2]); mesh.rotation.y = rot;
      group.add(mesh); const s = new Screen(mesh); screens.push(s); return s;
    },
    fan(x, y, z) { const f = new Fan(x, y, z, mats); fans.push(f); group.add(f.group); return f; },
    room(name, x0, z0, x1, z1, y0, y1) { rooms.push({ name, x0, z0, x1, z1, y0, y1 }); },
  };

  const bounds: [number, number, number, number] = [0, 0, 66, 76];
  buildCompound(ctx, bounds);
  buildHouse(ctx);
  const staticGroup = K.build({ shadows: o.shadows, name: 'mansion-static' });
  group.add(staticGroup);

  return {
    group, origin: o.origin, doors, sliders, fans, screens, lights, spots, interactables, pits, bounds,
    update(dt) { for (const d of doors) d.update(dt); for (const s of sliders) s.update(dt); for (const f of fans) f.update(dt); for (const s of screens) s.update(dt); },
    inCompound(x, z) { const lx = x - ox, lz = z - oz; return lx >= bounds[0] && lx <= bounds[2] && lz >= bounds[1] && lz <= bounds[3]; },
    roomAt(x, y, z) { const lx = x - ox, ly = y - oy, lz = z - oz; for (const r of rooms) if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1 && ly >= r.y0 - 0.3 && ly <= r.y1) return r.name; return null; },
    toWorld,
  };
}
