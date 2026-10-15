/**
 * Player: appearance (kit glTF with toggleable hair/outfit nodes, skin tone, body/face morph targets,
 * bone-length height), animation (shared clip library retargeted to the kit skeleton) and
 * third-person locomotion with collision.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { libraryFrom, retargetAll, type AnimLibrary } from '../characters/retarget';
import { STEP_UP, type CollisionWorld } from './collision';
import type { InputState } from './input';
import { setSkinnedBounds } from '../characters/bounds';
export { setSkinnedBounds };

/** face sliders (−1 … 1); each is backed by a `face_<key>_neg` / `face_<key>_pos` morph target pair in the kit */
export const FACE_KEYS = ['jaw', 'chin', 'nose_width', 'nose_length', 'eye_spacing', 'eye_size', 'lips', 'mouth_width', 'cheeks'] as const;
export type FaceKey = typeof FACE_KEYS[number];
export const FACE_LABEL: Record<FaceKey, string> = { jaw: 'Jaw', chin: 'Chin', nose_width: 'Nose width', nose_length: 'Nose length', eye_spacing: 'Eye spacing', eye_size: 'Eye size', lips: 'Lips', mouth_width: 'Mouth', cheeks: 'Cheeks' };

export interface Appearance {
  sex: 'f' | 'm'; tone: number; hair: string; outfit: string; name: string;
  /** 0 … 1 sliders, 0.5 = the kit's baked body */
  height: number; build: number; muscle: number;
  /** −1 … 1 per face key (missing = 0) */
  face: Partial<Record<FaceKey, number>>;
}
export interface KitInfo { sex: 'f' | 'm'; file: string; height: number; skin: string[]; hair: { id: string; name: string }[]; outfits: { id: string; name: string }[]; morphs?: string[] }
export const DEFAULT_APPEARANCE: Appearance = { sex: 'm', tone: 2, hair: 'low_cut', outfit: 'casual', height: 0.5, build: 0.5, muscle: 0.5, face: {}, name: 'Jag' };

const clamp01 = (v: unknown, d = 0.5) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);
const clamp11 = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0);

/** Coerce anything (old saves, user input) into a complete, in-range Appearance. */
export function normalizeAppearance(a: Partial<Appearance> | null | undefined, kits?: KitInfo[]): Appearance {
  const src = a && typeof a === 'object' ? a : {};
  const sex: 'f' | 'm' = src.sex === 'f' ? 'f' : 'm';
  const kit = kits?.find(k => k.sex === sex);
  let hair = typeof src.hair === 'string' ? src.hair : DEFAULT_APPEARANCE.hair;
  let outfit = typeof src.outfit === 'string' ? src.outfit : DEFAULT_APPEARANCE.outfit;
  if (kit) { if (!kit.hair.some(h => h.id === hair)) hair = kit.hair[0]?.id ?? hair; if (!kit.outfits.some(o => o.id === outfit)) outfit = kit.outfits[0]?.id ?? outfit; }
  const toneMax = (kit?.skin.length ?? 8) - 1;
  const tone = typeof src.tone === 'number' && Number.isFinite(src.tone) ? Math.max(0, Math.min(toneMax, Math.round(src.tone))) : Math.min(toneMax, DEFAULT_APPEARANCE.tone);
  const face: Partial<Record<FaceKey, number>> = {};
  if (src.face && typeof src.face === 'object') for (const k of FACE_KEYS) { const v = clamp11((src.face as Record<string, unknown>)[k]); if (v !== 0) face[k] = v; }
  const name = typeof src.name === 'string' ? src.name.replace(/[\u0000-\u001f<>]/g, '').slice(0, 14) : '';
  return { sex, tone, hair, outfit, name, height: clamp01(src.height), build: clamp01(src.build), muscle: clamp01(src.muscle), face };
}

/** bone-length multiplier for the height slider (±6 % of leg/torso/arm segment lengths) */
export function heightScale(height: number): number { return 1 + (clamp01(height) - 0.5) * 0.12; }

/** morph-target influences by name for an appearance (bipolar sliders feed one of a −/+ pair) */
export function morphInfluences(a: Appearance): Record<string, number> {
  const out: Record<string, number> = {};
  // the MakeHuman macro deltas are modest (≈3 cm at the belly), so the heavy end extrapolates a little
  const pair = (key: string, v: number, gainLo = 1, gainHi = 1) => { out[`${key}_lo`] = Math.max(0, -v) * gainLo; out[`${key}_hi`] = Math.max(0, v) * gainHi; };
  pair('shape_weight', (clamp01(a.build) - 0.5) * 2, 1.1, 1.35);
  pair('shape_muscle', (clamp01(a.muscle) - 0.5) * 2, 1, 1.15);
  for (const k of FACE_KEYS) { const v = clamp11(a.face?.[k]); out[`face_${k}_neg`] = Math.max(0, -v); out[`face_${k}_pos`] = Math.max(0, v); }
  return out;
}

/** bones whose rest translation (= the parent segment's length) scales with height */
export const HEIGHT_BONES = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand'];

const loader = new GLTFLoader();
const kitCache = new Map<string, Promise<GLTF>>();
let libPromise: Promise<AnimLibrary> | null = null;
export const ASSETS = 'assets/characters/';

export function loadKit(base: string, sex: 'f' | 'm'): Promise<GLTF> {
  const url = `${base}player_${sex}.gltf`;
  let p = kitCache.get(url); if (!p) { p = loader.loadAsync(url); p.catch(() => kitCache.delete(url)); kitCache.set(url, p); } return p;
}
export function loadAnimLibrary(base: string): Promise<AnimLibrary> {
  if (!libPromise) { libPromise = loader.loadAsync(`${base}animations.gltf`).then(libraryFrom); libPromise.catch(() => { libPromise = null; }); }
  return libPromise;
}
export async function loadKitInfo(base: string): Promise<KitInfo[]> {
  const j = await (await fetch(`${base}player.json`)).json();
  return j.kits as KitInfo[];
}

export interface AvatarLoaders { kit: (base: string, sex: 'f' | 'm') => Promise<GLTF>; lib: (base: string) => Promise<AnimLibrary> }

/** Visual avatar built from a player kit; `setAppearance` swaps nodes/colours/morphs without reloading. */
export class Avatar {
  readonly root = new THREE.Group();
  model: THREE.Object3D | null = null;
  mixer: THREE.AnimationMixer | null = null;
  actions = new Map<string, THREE.AnimationAction>();
  current: THREE.AnimationAction | null = null;
  currentName = '';
  kitHeight = 1.7;
  /** applied height multiplier (bone lengths) */
  scale = 1;
  /** last appearance actually applied */
  applied: Appearance | null = null;
  /** monotonically increasing request id; a finished load whose id is stale is dropped */
  private version = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private sex: 'f' | 'm' | null = null;
  private skinMat: THREE.MeshStandardMaterial | null = null;
  private nodes = new Map<string, THREE.Object3D>();
  private morphMeshes: THREE.Mesh[] = [];
  private bones = new Map<string, THREE.Bone>();
  private hipsRestY = 0.95;
  /** `loaders` can be replaced for tests (synthetic kits, controlled timing, failures) */
  constructor(private base: string, private shadows: boolean, private loaders: AvatarLoaders = { kit: loadKit, lib: loadAnimLibrary }) {}

  /**
   * Apply an appearance. Calls are serialised and versioned: while a kit is still loading, newer
   * calls supersede older ones (the stale result is never attached), and only the newest appearance
   * is applied at the end. Resolves `true` when this call's appearance ended up on screen.
   */
  setAppearance(a: Appearance, info: KitInfo[]): Promise<boolean> {
    const my = ++this.version;
    const run = this.queue.then(async () => {
      if (my !== this.version) return false; // superseded before it even started
      try { await this.apply(normalizeAppearance(a, info), info, my); return my === this.version; }
      catch (e) { console.warn('[avatar] appearance failed', e); return false; }
    });
    this.queue = run; // failures are swallowed inside, so the chain never breaks
    return run;
  }

  private async apply(a: Appearance, info: KitInfo[], my: number): Promise<void> {
    if (this.sex !== a.sex) {
      const [gltf, lib, { clone }] = await Promise.all([this.loaders.kit(this.base, a.sex), this.loaders.lib(this.base), import('three/examples/jsm/utils/SkeletonUtils.js')]);
      if (my !== this.version) return; // a newer request is queued behind us: leave the current model alone
      // SkeletonUtils clone keeps the cached gltf intact for re-use (creation screen ↔ game)
      const model = clone(gltf.scene) as THREE.Object3D;
      const nodes = new Map<string, THREE.Object3D>(); const morphMeshes: THREE.Mesh[] = []; const bones = new Map<string, THREE.Bone>();
      let skin: THREE.MeshStandardMaterial | null = null;
      model.traverse(o => {
        if (/^(LOD0|HAIR_[a-z_]+|OUTFIT_[a-z_]+)$/.test(o.name)) nodes.set(o.name, o);
        if ((o as THREE.Bone).isBone) { const b = o as THREE.Bone; bones.set(b.name.replace(/^mixamorig:/, ''), b); b.userData.rest = b.position.clone(); }
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = this.shadows; m.receiveShadow = false;
          if (m.morphTargetDictionary && m.morphTargetInfluences) morphMeshes.push(m);
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats as THREE.MeshStandardMaterial[]) { if (mat.name === 'skin' && !skin) skin = mat.clone(); }
        }
      });
      if (skin) { const sk: THREE.MeshStandardMaterial = skin; model.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; if (Array.isArray(m.material)) m.material = m.material.map(x => (x as THREE.Material).name === 'skin' ? sk : x); else if ((m.material as THREE.Material).name === 'skin') m.material = sk; }); }
      const kit = info.find(k => k.sex === a.sex); const kitHeight = kit?.height ?? 1.7;
      setSkinnedBounds(model, kitHeight);
      const mixer = new THREE.AnimationMixer(model); const actions = new Map<string, THREE.AnimationAction>();
      for (const c of retargetAll(lib, model, kitHeight)) actions.set(c.name, mixer.clipAction(c));
      // swap: the old model is detached and its private resources released (geometry/textures are shared with the cache)
      this.disposeModel();
      this.model = model; this.nodes = nodes; this.morphMeshes = morphMeshes; this.bones = bones; this.skinMat = skin; this.kitHeight = kitHeight;
      this.hipsRestY = bones.get('Hips')?.position.y ?? 0.95;
      this.mixer = mixer; this.actions = actions; this.current = null; this.currentName = '';
      this.root.add(model); this.sex = a.sex;
      this.play('idle', 0);
    }
    const kit = info.find(k => k.sex === a.sex);
    for (const [name, node] of this.nodes) {
      if (name.startsWith('HAIR_')) node.visible = name === `HAIR_${a.hair}`;
      else if (name.startsWith('OUTFIT_')) node.visible = name === `OUTFIT_${a.outfit}`;
      else node.visible = true;
    }
    if (this.skinMat && kit) this.skinMat.color.setStyle(kit.skin[Math.max(0, Math.min(kit.skin.length - 1, a.tone))]);
    // body + face morph targets (only names the kit actually exports have any effect)
    const inf = morphInfluences(a);
    for (const m of this.morphMeshes) { const dict = m.morphTargetDictionary!, arr = m.morphTargetInfluences!; for (const name in dict) arr[dict[name]] = inf[name] ?? 0; }
    // height: lengthen the leg / torso / arm segments and lift the model so the feet stay on the ground
    const s = heightScale(a.height); this.scale = s;
    for (const name of HEIGHT_BONES) { const b = this.bones.get(name); const rest = b?.userData.rest as THREE.Vector3 | undefined; if (b && rest) b.position.copy(rest).multiplyScalar(s); }
    if (this.model) this.model.position.y = (s - 1) * this.hipsRestY;
    this.root.scale.setScalar(1);
    this.applied = a;
  }

  private disposeModel() {
    if (!this.model) return;
    this.root.remove(this.model);
    this.mixer?.stopAllAction(); if (this.mixer && this.model) this.mixer.uncacheRoot(this.model);
    this.skinMat?.dispose(); // our private clone; the kit's shared materials/geometries stay cached
    this.model = null; this.mixer = null; this.actions = new Map(); this.current = null; this.currentName = '';
    this.nodes = new Map(); this.morphMeshes = []; this.bones = new Map(); this.skinMat = null;
  }
  /** drop the model and release private GPU resources (quit to title, tests) */
  dispose() { this.version++; this.disposeModel(); this.sex = null; this.applied = null; }

  /** standing height in metres */
  get height() { return this.kitHeight * this.scale; }
  /** world position of the head centre (Head bone + offset; falls back to the kit height) */
  headWorld(out: THREE.Vector3): THREE.Vector3 {
    const h = this.bones.get('Head');
    if (h) { h.updateWorldMatrix(true, false); return out.setFromMatrixPosition(h.matrixWorld).setY(out.y + 0.09 * this.scale); }
    return out.copy(this.root.position).setY(this.root.position.y + this.height - 0.12);
  }

  play(name: string, fade = 0.18, opts: { once?: boolean; speed?: number } = {}) {
    if (name === this.currentName && !opts.once) { if (this.current && opts.speed !== undefined) this.current.timeScale = opts.speed; return; }
    const next = this.actions.get(name); if (!next) return;
    next.reset(); next.enabled = true; next.setEffectiveWeight(1); next.timeScale = opts.speed ?? 1;
    if (opts.once) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; } else next.setLoop(THREE.LoopRepeat, Infinity);
    if (this.current && this.current !== next) { next.crossFadeFrom(this.current, fade, true); }
    next.play(); this.current = next; this.currentName = name;
  }
  update(dt: number) { this.mixer?.update(dt); }
}

export interface Interactable { prompt: string | (() => string); pos: THREE.Vector3; radius: number; action: () => void; enabled?: () => boolean }
export const promptOf = (i: Interactable) => typeof i.prompt === 'function' ? i.prompt() : i.prompt;

/** minimal avatar surface the controller needs (lets tests run without three's loaders) */
export interface AvatarLike { root: THREE.Object3D; play(name: string, fade?: number, opts?: { once?: boolean; speed?: number }): void; update(dt: number): void }

export const JUMP_SPEED = 4.2, GRAVITY = 9.81;
const wrapAngle = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

/**
 * Third-person locomotion. The desired movement direction (camera-relative input) and the facing
 * direction are separate: the body translates along the input direction immediately while the
 * character turns towards it at a finite rate, so changing direction never drags the player along
 * the old heading. The jump impulse is applied in the same update that accepts the input.
 */
export class PlayerController {
  pos = new THREE.Vector3();
  yaw = 0;            // facing direction (radians, 0 = +z … THREE convention: rotation.y)
  /** unit horizontal movement direction (last non-zero input; the body decelerates along it) */
  moveDir = new THREE.Vector2(0, 1);
  vy = 0; grounded = true;
  /** seconds since the current jump started, −1 when not jumping (animation timer only) */
  jumpT = -1;
  readonly radius = 0.3; readonly bodyHeight = 1.7;
  walkSpeed = 1.6; runSpeed = 4.6;
  turnRate = 11; airTurnRate = 4; accel = 14; decel = 18; airAccel = 3;
  speed = 0;
  busy = false; // sitting / sleeping etc. (no locomotion)
  get moving() { return this.speed > 0.15; }
  constructor(public avatar: AvatarLike, public world: CollisionWorld) {}

  teleport(x: number, y: number, z: number, yaw = this.yaw) { this.pos.set(x, y, z); this.yaw = yaw; this.vy = 0; this.speed = 0; this.grounded = true; this.jumpT = -1; this.moveDir.set(Math.sin(yaw), Math.cos(yaw)); this.sync(); }
  /**
   * Put the feet on the walkable ground at the current x/z (used after restoring a saved position:
   * a save made on a different floor height must not leave the player buried in a slab or hovering).
   * Takes the highest walkable surface within `lift` metres above the stored height, otherwise the
   * ground below it — the player is pushed out of a floor, never lifted onto a roof.
   */
  settle(lift = 0.5): void {
    this.pos.y = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y, lift);
    this.vy = 0; this.grounded = true; this.sync();
  }
  private sync() { this.avatar.root.position.copy(this.pos); this.avatar.root.rotation.y = this.yaw; }

  /** world-space unit direction for a camera-relative input (exported for tests) */
  static inputDirection(moveX: number, moveY: number, camYaw: number): [number, number] {
    const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
    // camera looks along -(sin,cos) → forward = (-sin, -cos), right = (cos, -sin)
    let dx = -sy * moveY + cy * moveX, dz = -cy * moveY - sy * moveX;
    const l = Math.hypot(dx, dz); if (l > 1e-6) { dx /= l; dz /= l; } else { dx = 0; dz = 0; }
    return [dx, dz];
  }

  update(dt: number, inp: InputState, camYaw: number) {
    const a = this.avatar;
    if (this.busy) { this.sync(); a.update(dt); return; }
    const hasInput = inp.moveMag > 0.02;
    // desired speed and direction
    let want = 0;
    if (hasInput) {
      const [dx, dz] = PlayerController.inputDirection(inp.moveX, inp.moveY, camYaw);
      if (this.grounded) this.moveDir.set(dx, dz);
      else { // limited air control: steer the committed direction a little
        this.moveDir.x += (dx - this.moveDir.x) * Math.min(1, dt * 2); this.moveDir.y += (dz - this.moveDir.y) * Math.min(1, dt * 2);
        if (this.moveDir.lengthSq() > 1e-6) this.moveDir.normalize(); else this.moveDir.set(dx, dz);
      }
      want = inp.run || (inp.moveMag > 0.98 && !inp.touch) ? this.runSpeed : this.walkSpeed * (0.45 + 0.55 * inp.moveMag);
    }
    const rate = this.grounded ? (want > this.speed ? this.accel : this.decel) : this.airAccel;
    this.speed += Math.max(-rate * dt, Math.min(rate * dt, want - this.speed));
    // face the movement direction at a finite turn rate (the body already moves along it)
    if (hasInput) {
      const targetYaw = Math.atan2(this.moveDir.x, this.moveDir.y);
      const d = wrapAngle(targetYaw - this.yaw);
      const turn = (this.grounded ? this.turnRate : this.airTurnRate) * dt;
      this.yaw = wrapAngle(this.yaw + Math.max(-turn, Math.min(turn, d)));
    }
    // jump: impulse now, in the update that accepted it (the clip's anticipation is cosmetic only)
    if (inp.jumpPressed && this.grounded) { this.vy = JUMP_SPEED; this.grounded = false; this.jumpT = 0; }
    if (this.jumpT >= 0) { this.jumpT += dt; if (this.jumpT > 1.0 && this.grounded) this.jumpT = -1; }
    // integrate horizontally along the movement direction
    let nx = this.pos.x + this.moveDir.x * this.speed * dt, nz = this.pos.z + this.moveDir.y * this.speed * dt;
    const out: [number, number] = [0, 0];
    this.world.resolve(nx, nz, this.pos.y, this.radius, this.bodyHeight, out); nx = out[0]; nz = out[1];
    // vertical
    const g = this.world.groundAt(nx, nz, this.pos.y, this.grounded ? STEP_UP : 0.1);
    if (this.grounded) {
      if (this.pos.y - g > 0.5) { this.grounded = false; this.vy = 0; } // walked off a ledge → fall
      else this.pos.y = g;
    } else {
      this.vy -= GRAVITY * dt; this.pos.y += this.vy * dt;
      if (this.vy <= 0 && this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.grounded = true; this.jumpT = -1; }
    }
    this.pos.x = nx; this.pos.z = nz;
    this.sync();
    // animation
    if (this.jumpT >= 0 && this.jumpT < 1) a.play('jump', 0.08, { once: true });
    else if (!this.grounded) a.play('jump', 0.1, { once: true });
    else if (this.speed > 3.0) a.play('run', 0.15, { speed: this.speed / 3.1 });
    else if (this.speed > 0.15) a.play('walk', 0.15, { speed: Math.max(0.6, this.speed / 1.22) });
    else a.play('idle', 0.25);
    a.update(dt);
  }
}
