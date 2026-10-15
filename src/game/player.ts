/**
 * Player: appearance (kit glTF with toggleable hair/outfit nodes, skin tone, height), animation
 * (shared clip library retargeted to the kit skeleton) and third-person locomotion with collision.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { libraryFrom, retargetAll, type AnimLibrary } from '../characters/retarget';
import type { CollisionWorld } from './collision';
import type { InputState } from './input';

export interface Appearance { sex: 'f' | 'm'; tone: number; hair: string; outfit: string; height: number; name: string }
export interface KitInfo { sex: 'f' | 'm'; file: string; height: number; skin: string[]; hair: { id: string; name: string }[]; outfits: { id: string; name: string }[] }
export const DEFAULT_APPEARANCE: Appearance = { sex: 'm', tone: 2, hair: 'low_cut', outfit: 'casual', height: 0.5, name: 'Jag' };

const loader = new GLTFLoader();
const kitCache = new Map<string, Promise<GLTF>>();
let libPromise: Promise<AnimLibrary> | null = null;
export const ASSETS = 'assets/characters/';

export function loadKit(base: string, sex: 'f' | 'm'): Promise<GLTF> {
  const url = `${base}player_${sex}.gltf`;
  let p = kitCache.get(url); if (!p) { p = loader.loadAsync(url); kitCache.set(url, p); } return p;
}
export function loadAnimLibrary(base: string): Promise<AnimLibrary> {
  if (!libPromise) libPromise = loader.loadAsync(`${base}animations.gltf`).then(libraryFrom);
  return libPromise;
}
export async function loadKitInfo(base: string): Promise<KitInfo[]> {
  const j = await (await fetch(`${base}player.json`)).json();
  return j.kits as KitInfo[];
}

/** Visual avatar built from a player kit; `setAppearance` swaps nodes/colours without reloading. */
export class Avatar {
  readonly root = new THREE.Group();
  model: THREE.Object3D | null = null;
  mixer: THREE.AnimationMixer | null = null;
  actions = new Map<string, THREE.AnimationAction>();
  current: THREE.AnimationAction | null = null;
  currentName = '';
  kitHeight = 1.7;
  private sex: 'f' | 'm' | null = null;
  private skinMat: THREE.MeshStandardMaterial | null = null;
  private nodes = new Map<string, THREE.Object3D>();
  constructor(private base: string, private shadows: boolean) {}

  /** (re)build for the given sex; cheap when the sex is unchanged */
  async setAppearance(a: Appearance, info: KitInfo[]): Promise<void> {
    if (this.sex !== a.sex) {
      const [gltf, lib] = await Promise.all([loadKit(this.base, a.sex), loadAnimLibrary(this.base)]);
      if (this.model) this.root.remove(this.model);
      // SkeletonUtils clone keeps the cached gltf intact for re-use (creation screen ↔ game)
      const { clone } = await import('three/examples/jsm/utils/SkeletonUtils.js');
      const model = clone(gltf.scene) as THREE.Object3D;
      this.nodes.clear();
      let skin: THREE.MeshStandardMaterial | null = null;
      model.traverse(o => {
        if (/^(LOD0|HAIR_|OUTFIT_)/.test(o.name)) this.nodes.set(o.name, o);
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.castShadow = this.shadows; m.receiveShadow = false; m.frustumCulled = false;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats as THREE.MeshStandardMaterial[]) { if (mat.name === 'skin' && !skin) skin = mat.clone(); }
        }
      });
      this.skinMat = skin;
      if (skin) { const sk: THREE.MeshStandardMaterial = skin; model.traverse(o => { const m = o as THREE.Mesh; if (!m.isMesh) return; if (Array.isArray(m.material)) m.material = m.material.map(x => (x as THREE.Material).name === 'skin' ? sk : x); else if ((m.material as THREE.Material).name === 'skin') m.material = sk; }); }
      const kit = info.find(k => k.sex === a.sex); this.kitHeight = kit?.height ?? 1.7;
      this.mixer = new THREE.AnimationMixer(model); this.actions.clear(); this.current = null; this.currentName = '';
      for (const c of retargetAll(lib, model, this.kitHeight)) this.actions.set(c.name, this.mixer.clipAction(c));
      this.model = model; this.root.add(model); this.sex = a.sex;
    }
    const kit = info.find(k => k.sex === a.sex)!;
    for (const [name, node] of this.nodes) {
      if (name.startsWith('HAIR_')) node.visible = name === `HAIR_${a.hair}`;
      else if (name.startsWith('OUTFIT_')) node.visible = name === `OUTFIT_${a.outfit}`;
      else node.visible = true;
    }
    if (this.skinMat) this.skinMat.color.setStyle(kit.skin[Math.max(0, Math.min(kit.skin.length - 1, a.tone))]);
    const s = 0.94 + a.height * 0.12; // 0.94 … 1.06 of the kit height
    this.root.scale.setScalar(s);
  }
  /** standing height in metres */
  get height() { return this.kitHeight * this.root.scale.y; }

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

export interface Interactable { prompt: string; pos: THREE.Vector3; radius: number; action: () => void; enabled?: () => boolean }

/** Third-person locomotion: camera-relative joystick, acceleration, turning, jump, step-up, collision. */
export class PlayerController {
  pos = new THREE.Vector3();
  yaw = 0;            // facing direction (radians, 0 = +z … THREE convention: rotation.y)
  vel = new THREE.Vector3();
  vy = 0; grounded = true; jumpT = -1;
  readonly radius = 0.34; readonly bodyHeight = 1.7;
  walkSpeed = 1.6; runSpeed = 4.6;
  private speed = 0;
  busy = false; // sitting / sleeping etc. (no locomotion)
  constructor(public avatar: Avatar, public world: CollisionWorld) {}

  teleport(x: number, y: number, z: number, yaw = this.yaw) { this.pos.set(x, y, z); this.yaw = yaw; this.vy = 0; this.speed = 0; this.sync(); }
  private sync() { this.avatar.root.position.copy(this.pos); this.avatar.root.rotation.y = this.yaw; }

  update(dt: number, inp: InputState, camYaw: number) {
    const a = this.avatar;
    if (this.busy) { this.sync(); a.update(dt); return; }
    // desired direction in world space from the camera yaw
    let dx = 0, dz = 0;
    if (inp.moveMag > 0.02) {
      const sy = Math.sin(camYaw), cy = Math.cos(camYaw);
      // camera looks along -(sin,cos) → forward = (-sin, -cos)
      dx = -sy * inp.moveY + cy * inp.moveX; dz = -cy * inp.moveY - sy * inp.moveX;
      const l = Math.hypot(dx, dz); if (l > 0) { dx /= l; dz /= l; }
    }
    const want = inp.moveMag > 0.02 ? (inp.run || inp.moveMag > 0.98 && !inp.touch ? this.runSpeed : this.walkSpeed * (0.45 + 0.55 * inp.moveMag)) * (inp.touch && inp.moveMag > 0.9 && inp.run ? 1 : 1) : 0;
    const accel = want > this.speed ? 14 : 18;
    this.speed += Math.max(-accel * dt, Math.min(accel * dt, want - this.speed));
    if (inp.moveMag > 0.02) {
      const targetYaw = Math.atan2(dx, dz);
      let d = targetYaw - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      const turn = (this.grounded ? 11 : 4) * dt;
      this.yaw += Math.max(-turn, Math.min(turn, d));
      this.yaw += 0; // normalised lazily
    }
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    // jump
    if (inp.jumpPressed && this.grounded && this.jumpT < 0) { this.jumpT = 0; }
    if (this.jumpT >= 0) {
      this.jumpT += dt;
      if (this.jumpT >= 0.26 && this.grounded) { this.vy = 4.2; this.grounded = false; }
      if (this.jumpT > 1.0) this.jumpT = -1;
    }
    // integrate
    const moveSpeed = this.grounded ? this.speed : Math.max(this.speed, 1.2);
    let nx = this.pos.x + fx * moveSpeed * dt, nz = this.pos.z + fz * moveSpeed * dt;
    const out: [number, number] = [0, 0];
    this.world.resolve(nx, nz, this.pos.y, this.radius, this.bodyHeight, out); nx = out[0]; nz = out[1];
    // vertical
    const g = this.world.groundAt(nx, nz, this.pos.y, this.grounded ? 0.42 : 0.1);
    if (this.grounded) {
      this.pos.y = g;
      if (this.pos.y - g > 0.6) this.grounded = false; // walked off a ledge
    } else {
      this.vy -= 9.81 * dt; this.pos.y += this.vy * dt;
      if (this.pos.y <= g) { this.pos.y = g; this.vy = 0; this.grounded = true; }
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
