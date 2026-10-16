/**
 * Ambient crowd: skinned pedestrians from the generated character library placed on the sidewalk
 * network around the camera. Placement + routing only (no life simulation).
 *
 *  - a "cast" of distinct characters is streamed in after the city is ready (budgeted per quality)
 *  - every agent is a SkeletonUtils clone of a cast member with its own AnimationMixer
 *  - agents walk along sidewalks (edge polyline offset by the kerb + half a sidewalk), pick the next
 *    edge at junctions, and occasionally stop for a role-appropriate idle clip
 *  - agents further than the despawn radius from the camera focus are recycled onto edges near the
 *    focus whose district matches the character's district affinity
 *  - LOD0/LOD1/LOD2 nodes baked in the glTF are switched by distance; far agents update slower
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { CityData, DistrictCode, RoadEdge, RoadNode, Vec2 } from '../shared/types';
import { carriagewayHalfWidth, ROAD_PROFILES } from '../shared/types';
import { pointInPolygon } from '../shared/geom';
import { profileHeightAt } from '../shared/roadgeom';
import { libraryFrom, retargetAll, type AnimLibrary } from '../characters/retarget';
import { setSkinnedBounds } from '../characters/bounds';

export interface ManifestEntry {
  id: string; file: string; name?: string; height: number; tris: number; tags?: string[]; role?: string;
  district?: string; districts?: string[]; idle?: string[]; moving?: string;
}
export interface Manifest { animations?: string; clips?: string[]; characters: ManifestEntry[] }

export interface CrowdOptions {
  /** number of distinct characters to stream in */
  cast: number;
  /** number of walking agents kept alive around the focus */
  agents: number;
  /** agents beyond this distance from the focus are recycled */
  radius: number;
  /** LOD switch distances (LOD0 below first, LOD1 below second, LOD2 beyond; hidden beyond `radius`) */
  lod: [number, number];
  shadows: boolean;
  assetsBase: string;
}

export const CROWD_PRESETS: Record<'lite' | 'low' | 'medium' | 'high', CrowdOptions> = {
  lite: { cast: 6, agents: 18, radius: 70, lod: [7, 16], shadows: false, assetsBase: 'assets/characters/' },
  low: { cast: 8, agents: 30, radius: 90, lod: [9, 22], shadows: false, assetsBase: 'assets/characters/' },
  medium: { cast: 16, agents: 64, radius: 130, lod: [14, 36], shadows: true, assetsBase: 'assets/characters/' },
  high: { cast: 24, agents: 120, radius: 170, lod: [18, 45], shadows: true, assetsBase: 'assets/characters/' },
};

const DISTRICT_CODE: Record<string, DistrictCode> = { central: 'CD', market: 'MQ', north: 'NH', oldtown: 'OT', industrial: 'ID', green: 'GE' };
const SPEED: Record<string, number> = { walk: 1.22, walk_carry: 1.02, run: 3.1 };
const WALK_Y = 0.15;

interface Lane { edge: RoadEdge; len: number; cum: number[]; offset: number; district: DistrictCode | null; mid: Vec2 }

interface CastMember { entry: ManifestEntry; gltf: GLTF; clips: THREE.AnimationClip[]; districts: Set<DistrictCode> }

interface Agent {
  member: CastMember;
  root: THREE.Object3D; lods: THREE.Object3D[]; mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>; current?: THREE.AnimationAction;
  lane: Lane | null; s: number; dir: 1 | -1; sideRel: 1 | -1; jitter: number;
  speed: number; state: 'walk' | 'idle'; timer: number; lod: number; alive: boolean; phase: number;
  pos: THREE.Vector3;
  /** smooth transition between sidewalk lines after a turn: start point + metres travelled since */
  blendFrom: THREE.Vector3 | null; blendDist: number;
}

export class Crowd {
  readonly group = new THREE.Group();
  private lanes: Lane[] = [];
  private lanesByNode = new Map<string, Lane[]>();
  private nodes = new Map<string, RoadNode>();
  cast: CastMember[] = [];
  agents: Agent[] = [];
  private lib: AnimLibrary | null = null;
  private loader = new GLTFLoader();
  private rng = mulberry(20260419);
  private tmp = new THREE.Vector3();
  private frustum = new THREE.Frustum();
  private sphere = new THREE.Sphere();
  private projView = new THREE.Matrix4();
  private frame = 0;
  private recycleTimer = 0;
  enabled = true;
  /** loading progress 0..1 (cast streamed) */
  progress = 0;
  stats = { visible: 0, lod0: 0, lod1: 0, lod2: 0 };

  constructor(private city: CityData, private heightAt: (x: number, z: number) => number, readonly opts: CrowdOptions) {
    this.group.name = 'crowd';
    for (const n of city.roads.nodes) this.nodes.set(n.id, n);
    for (const e of city.roads.edges) {
      if (e.points.length < 2) continue;
      const prof = ROAD_PROFILES[e.cls];
      const offset = carriagewayHalfWidth(e.cls) + (e.drain ? 0.6 : 0) + prof.sidewalk * 0.5;
      const cum = [0]; for (let i = 1; i < e.points.length; i++) cum.push(cum[i - 1] + Math.hypot(e.points[i][0] - e.points[i - 1][0], e.points[i][1] - e.points[i - 1][1]));
      const len = cum[cum.length - 1]; if (len < 6) continue;
      const mid = pointAt(e, cum, len / 2);
      const d = city.districts.find(d => pointInPolygon(mid, d.polygon));
      const lane: Lane = { edge: e, len, cum, offset, district: d ? d.code : null, mid };
      this.lanes.push(lane);
      for (const id of [e.a, e.b]) { const arr = this.lanesByNode.get(id) ?? []; arr.push(lane); this.lanesByNode.set(id, arr); }
    }
  }

  /** Stream the cast in; resolves when the first characters are usable (the rest keep loading). */
  async load(focus: THREE.Vector3): Promise<void> {
    const base = this.opts.assetsBase;
    let manifest: Manifest;
    try { manifest = await (await fetch(base + 'manifest.json')).json(); } catch { console.warn('[crowd] no character manifest – crowd disabled'); this.enabled = false; return; }
    const people = manifest.characters.filter(c => c.role && !(c.tags ?? []).includes('reference'));
    if (!people.length) { this.enabled = false; return; }
    if (manifest.animations) { try { this.lib = libraryFrom(await this.loader.loadAsync(base + manifest.animations)); } catch (e) { console.warn('[crowd] animation library failed', e); } }
    // pick the cast: round-robin over districts so every quarter has its own people
    const byDistrict = new Map<string, ManifestEntry[]>();
    for (const c of people) for (const d of c.districts ?? ['central']) { const arr = byDistrict.get(d) ?? []; arr.push(c); byDistrict.set(d, arr); }
    const order = ['market', 'central', 'oldtown', 'north', 'green', 'industrial'];
    const chosen: ManifestEntry[] = []; const used = new Set<string>();
    for (const arr of byDistrict.values()) shuffle(arr, this.rng);
    while (chosen.length < Math.min(this.opts.cast, people.length)) {
      let added = false;
      for (const d of order) { const arr = byDistrict.get(d); if (!arr) continue; const c = arr.find(x => !used.has(x.id)); if (c && chosen.length < this.opts.cast) { chosen.push(c); used.add(c.id); added = true; } }
      if (!added) break;
    }
    // load progressively; agents are created as members arrive so the street fills up gradually
    let done = 0;
    const perMember = Math.max(1, Math.ceil(this.opts.agents / chosen.length));
    const loadOne = async (entry: ManifestEntry) => {
      try {
        const gltf = await this.loader.loadAsync(base + entry.file);
        gltf.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = this.opts.shadows; m.receiveShadow = false; const mat = m.material as THREE.MeshStandardMaterial; if (mat.map) mat.map.anisotropy = 4; } });
        setSkinnedBounds(gltf.scene, entry.height); // explicit pose-independent bounds → the renderer's frustum culling stays on
        const clips = this.lib ? retargetAll(this.lib, gltf.scene, entry.height) : [];
        const member: CastMember = { entry, gltf, clips, districts: new Set((entry.districts ?? []).map(d => DISTRICT_CODE[d]).filter(Boolean)) };
        this.cast.push(member);
        for (let i = 0; i < perMember && this.agents.length < this.opts.agents; i++) this.spawnAgent(member, focus);
      } catch (e) { console.warn('[crowd] failed to load', entry.id, e); }
      done++; this.progress = done / chosen.length;
    };
    // two parallel streams keep the main thread responsive
    const queue = [...chosen];
    const worker = async () => { while (queue.length) await loadOne(queue.shift()!); };
    const first = loadOne(queue.shift()!);
    await first;
    void Promise.all([worker(), worker()]);
  }

  private spawnAgent(member: CastMember, focus: THREE.Vector3): void {
    const root = cloneSkinned(member.gltf.scene) as THREE.Object3D;
    const lods: THREE.Object3D[] = [];
    root.traverse(o => { if (/^LOD\d$/.test(o.name)) lods.push(o); });
    lods.sort((a, b) => a.name.localeCompare(b.name));
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map<string, THREE.AnimationAction>();
    for (const c of member.clips) actions.set(c.name, mixer.clipAction(c));
    const moving = member.entry.moving ?? 'walk';
    const agent: Agent = {
      member, root, lods, mixer, actions, lane: null, s: 0, dir: 1, sideRel: this.rng() < 0.5 ? 1 : -1, jitter: (this.rng() - 0.5) * 0.9,
      speed: (SPEED[moving] ?? 1.2) * (member.entry.height / 1.708) * (0.92 + this.rng() * 0.16), state: 'walk', timer: 0, lod: -1, alive: false, phase: this.rng(),
      pos: new THREE.Vector3(), blendFrom: null, blendDist: 0,
    };
    this.group.add(root);
    this.agents.push(agent);
    this.place(agent, focus, this.opts.radius * 0.5, true);
  }

  /** put the agent on a lane near the focus (district-compatible if possible, out of view if possible) */
  private place(agent: Agent, focus: THREE.Vector3, R: number, initial: boolean): void {
    const near: Lane[] = [], good: Lane[] = [];
    for (const l of this.lanes) {
      const d = Math.hypot(l.mid[0] - focus.x, l.mid[1] - focus.z);
      if (d > R * 0.95 || d < 6) continue;
      near.push(l); if (l.district && agent.member.districts.has(l.district)) good.push(l);
    }
    const pool = good.length >= 3 ? good : near;
    if (!pool.length) { agent.alive = false; agent.root.visible = false; return; }
    // length-weighted lane pick so long streets get proportionally more people
    let total = 0; for (const l of pool) total += l.len;
    const pick = () => { let r = this.rng() * total; for (const l of pool) { r -= l.len; if (r <= 0) return l; } return pool[pool.length - 1]; };
    // prefer spots the camera cannot see right now so people do not pop into view; visible spots are
    // only accepted far away (or on the first placement / after a teleport)
    for (let attempt = 0; attempt < 8; attempt++) {
      const lane = pick();
      agent.lane = lane; agent.s = this.rng() * lane.len; agent.dir = this.rng() < 0.5 ? 1 : -1; agent.blendFrom = null;
      this.advance(agent, 0);
      const d = Math.hypot(agent.pos.x - focus.x, agent.pos.z - focus.z);
      if (d < 7) continue;
      if (initial || !this.hasFrustum) break;
      if (!this.frustum.containsPoint(this.tmp.set(agent.pos.x, agent.pos.y + 1, agent.pos.z)) || d > R * 0.6) break;
    }
    agent.alive = true; agent.root.visible = true; agent.lod = -1;
    this.setState(agent, this.rng() < 0.2 ? 'idle' : 'walk');
  }
  private hasFrustum = false;
  private lastFocus = new THREE.Vector3(1e9, 0, 1e9);

  private setState(agent: Agent, state: 'walk' | 'idle'): void {
    agent.state = state;
    const idles = agent.member.entry.idle?.length ? agent.member.entry.idle : ['idle'];
    const name = state === 'walk' ? (agent.member.entry.moving ?? 'walk') : idles[Math.floor(this.rng() * idles.length)];
    agent.timer = state === 'walk' ? 12 + this.rng() * 40 : 4 + this.rng() * 10;
    const next = agent.actions.get(name) ?? agent.actions.get('idle') ?? [...agent.actions.values()][0];
    if (!next) return;
    if (agent.current === next) return;
    const prev = agent.current;
    next.reset().setEffectiveWeight(1).play(); next.time = agent.phase * next.getClip().duration;
    if (prev) { prev.crossFadeTo(next, 0.35, false); }
    agent.current = next;
  }

  private advance(agent: Agent, ds: number): void {
    const lane = agent.lane!;
    agent.s += ds * agent.dir;
    if (agent.s < 0 || agent.s > lane.len) {
      // junction: pick the next lane leaving this node
      const nodeId = agent.dir === 1 ? lane.edge.b : lane.edge.a;
      const options = (this.lanesByNode.get(nodeId) ?? []).filter(l => l !== lane);
      const next = options.length ? options[Math.floor(this.rng() * options.length)] : lane;
      const overshoot = agent.s < 0 ? -agent.s : agent.s - lane.len;
      agent.lane = next; agent.blendFrom = agent.pos.clone(); agent.blendDist = 0;
      if (next === lane) { agent.dir = agent.dir === 1 ? -1 : 1; agent.s = agent.dir === 1 ? overshoot : lane.len - overshoot; }
      else { agent.dir = next.edge.a === nodeId ? 1 : -1; agent.s = agent.dir === 1 ? Math.min(next.len, overshoot) : Math.max(0, next.len - overshoot); }
    }
    const l = agent.lane!; const e = l.edge;
    const s = Math.max(0, Math.min(l.len, agent.s));
    const [p, t] = pointAndTangent(e, l.cum, s);
    // side of the street: `sideRel` is the side relative to the walking direction (right-hand = 1)
    const side = agent.sideRel * agent.dir;
    const nx = -t[1] * side, nz = t[0] * side;
    const off = l.offset + agent.jitter;
    const x = p[0] + nx * off, z = p[1] + nz * off;
    const y = (e.bridge ? profileHeightAt(e, s) : this.heightAt(x, z)) + WALK_Y;
    let heading = Math.atan2(t[0] * agent.dir, t[1] * agent.dir);
    if (agent.blendFrom) {
      // after a turn, walk from the old sidewalk line to the new one over ~8 m instead of jumping
      agent.blendDist += Math.abs(ds); const k = Math.min(1, agent.blendDist / 8);
      const bx = agent.blendFrom.x + (x - agent.blendFrom.x) * k, bz = agent.blendFrom.z + (z - agent.blendFrom.z) * k;
      if (k < 1) { const dx = x - agent.blendFrom.x, dz = z - agent.blendFrom.z; if (Math.hypot(dx, dz) > 0.5) heading = Math.atan2(dx, dz); }
      else agent.blendFrom = null;
      agent.pos.set(bx, this.heightAt(bx, bz) + WALK_Y, bz);
    } else agent.pos.set(x, y, z);
    agent.root.position.copy(agent.pos);
    agent.root.rotation.y = heading;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, cameraDistance: number): void {
    if (!this.enabled || !this.agents.length) return;
    this.frame++;
    const farView = cameraDistance > this.opts.radius * 2.2;
    this.group.visible = !farView;
    if (farView) return;
    this.projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView); this.hasFrustum = true;
    // at street level people are concentrated closer to the player; from the air they spread wider
    const R = cameraDistance === 0 ? this.opts.radius * 0.5 : Math.max(this.opts.radius * 0.5, Math.min(this.opts.radius, cameraDistance * 1.2)), [l0, l1] = this.opts.lod;
    this.recycleTimer -= dt;
    const recycle = this.recycleTimer <= 0; if (recycle) this.recycleTimer = 0.7;
    const st = this.stats; st.visible = st.lod0 = st.lod1 = st.lod2 = 0;
    const camPos = (camera as THREE.PerspectiveCamera).position;
    // a teleport (landmark jump, minimap click) re-seeds the whole crowd around the new focus at once
    const jumped = this.lastFocus.distanceTo(focus) > 40; this.lastFocus.copy(focus);
    for (let i = 0; i < this.agents.length; i++) {
      const a = this.agents[i];
      if (jumped) { this.place(a, focus, R, true); continue; }
      if (!a.alive) { if (recycle && this.cast.length) this.place(a, focus, R, false); continue; }
      const dFocus = Math.hypot(a.pos.x - focus.x, a.pos.z - focus.z);
      if (dFocus > R && recycle) { this.place(a, focus, R, false); continue; }
      // behaviour
      a.timer -= dt;
      if (a.timer <= 0) this.setState(a, a.state === 'walk' ? 'idle' : 'walk');
      if (a.state === 'walk') this.advance(a, a.speed * dt);
      // visibility / LOD
      const d = camPos.distanceTo(a.pos);
      this.sphere.center.set(a.pos.x, a.pos.y + 1, a.pos.z); this.sphere.radius = 1.2;
      const visible = (d < this.opts.radius && this.frustum.intersectsSphere(this.sphere)) || d < 6;
      a.root.visible = visible || d < 3;
      if (!visible) continue;
      st.visible++;
      const lod = d < l0 ? 0 : d < l1 ? 1 : 2;
      if (lod !== a.lod && a.lods.length) { a.lod = lod; a.lods.forEach((o, k) => (o.visible = k === Math.min(lod, a.lods.length - 1))); }
      if (lod === 0) st.lod0++; else if (lod === 1) st.lod1++; else st.lod2++;
      // far agents animate at a lower rate
      const step = lod === 0 ? 1 : lod === 1 ? 2 : 4;
      if ((this.frame + i) % step === 0) a.mixer.update(dt * step);
    }
  }
}

function pointAt(e: RoadEdge, cum: number[], s: number): Vec2 { return pointAndTangent(e, cum, s)[0]; }

function pointAndTangent(e: RoadEdge, cum: number[], s: number): [Vec2, Vec2] {
  const pts = e.points; let i = 1;
  while (i < cum.length - 1 && cum[i] < s) i++;
  const a = pts[i - 1], b = pts[i]; const l = cum[i] - cum[i - 1] || 1;
  const t = Math.max(0, Math.min(1, (s - cum[i - 1]) / l));
  const tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
  return [[a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], [tx, tz]];
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function shuffle<T>(arr: T[], rng: () => number): void { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }
