/** Camera controls: orbit (default), fly and walk modes with keyboard, mouse and touch input. */
import * as THREE from 'three';

export type Mode = 'orbit' | 'walk';

export class CityControls {
  mode: Mode = 'orbit';
  target = new THREE.Vector3(0, 12, 0);
  distance = 320;
  yaw = -0.6;       // radians around Y
  pitch = 0.62;     // radians above horizontal (orbit) / look pitch (walk)
  walkPos = new THREE.Vector3(0, 1.7, 0);
  eyeHeight = 1.7;
  speed = 1;
  private keys = new Set<string>();
  private dragging: 0 | 1 | 2 = 0;
  private last = { x: 0, y: 0 };
  private touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private pointerLocked = false;
  minDistance = 6; maxDistance = 2200;
  bounds = { minX: -1150, maxX: 1150, minZ: -900, maxZ: 900 };
  onChange?: () => void;

  constructor(readonly camera: THREE.PerspectiveCamera, readonly dom: HTMLElement, readonly groundHeight: (x: number, z: number) => number) {
    dom.style.touchAction = 'none';
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('keydown', e => { if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return; this.keys.add(e.code); if (e.code === 'Space') e.preventDefault(); });
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => { this.pointerLocked = document.pointerLockElement === dom; });
  }

  setMode(m: Mode) {
    if (m === this.mode) return;
    if (m === 'walk') {
      // step down to the ground at the current target
      this.walkPos.set(this.target.x, 0, this.target.z);
      this.walkPos.y = this.groundHeight(this.walkPos.x, this.walkPos.z) + this.eyeHeight;
      this.pitch = 0.02;
    } else {
      this.target.set(this.walkPos.x, this.groundHeight(this.walkPos.x, this.walkPos.z) + 6, this.walkPos.z);
      this.distance = 120; this.pitch = 0.5;
      if (this.pointerLocked) document.exitPointerLock();
    }
    this.mode = m;
    this.onChange?.();
  }

  lookAt(pos: [number, number, number], tgt: [number, number, number]) {
    const p = new THREE.Vector3(...pos), t = new THREE.Vector3(...tgt);
    this.mode = 'orbit';
    this.target.copy(t);
    const d = p.clone().sub(t);
    this.distance = THREE.MathUtils.clamp(d.length(), this.minDistance, this.maxDistance);
    this.yaw = Math.atan2(d.x, d.z);
    this.pitch = Math.asin(THREE.MathUtils.clamp(d.y / d.length(), -0.99, 0.99));
    this.onChange?.();
  }

  teleport(x: number, z: number) {
    if (this.mode === 'walk') { this.walkPos.set(x, this.groundHeight(x, z) + this.eyeHeight, z); }
    else { this.target.set(x, this.groundHeight(x, z) + 6, z); }
    this.onChange?.();
  }

  private onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') { this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (this.touches.size === 2) { const [a, b] = [...this.touches.values()]; this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y); } return; }
    this.dragging = e.button === 2 || e.button === 1 || e.shiftKey ? 2 : 1;
    this.last = { x: e.clientX, y: e.clientY };
    if (this.mode === 'walk' && e.button === 0 && !this.pointerLocked && this.dom.requestPointerLock) { try { this.dom.requestPointerLock(); } catch { /* ignore */ } }
  };
  private onPointerMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      const prev = this.touches.get(e.pointerId); if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (this.touches.size === 1) { this.rotate(cur.x - prev.x, cur.y - prev.y); }
      else if (this.touches.size === 2) {
        this.touches.set(e.pointerId, cur);
        const [a, b] = [...this.touches.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.zoom((this.pinchDist - d) * 0.01);
        this.pinchDist = d;
        // two-finger pan: average movement
        this.pan((cur.x - prev.x) * 0.5, (cur.y - prev.y) * 0.5);
        return;
      }
      this.touches.set(e.pointerId, cur);
      return;
    }
    if (this.pointerLocked && this.mode === 'walk') { this.rotate(e.movementX, e.movementY); return; }
    if (!this.dragging) return;
    const dx = e.clientX - this.last.x, dy = e.clientY - this.last.y; this.last = { x: e.clientX, y: e.clientY };
    if (this.dragging === 1) this.rotate(dx, dy); else this.pan(dx, dy);
  };
  private onPointerUp = (e: PointerEvent) => { if (e.pointerType === 'touch') { this.touches.delete(e.pointerId); this.pinchDist = 0; return; } this.dragging = 0; };
  private onWheel = (e: WheelEvent) => { e.preventDefault(); this.zoom(Math.sign(e.deltaY) * 0.12); };

  private rotate(dx: number, dy: number) {
    const k = 0.0045;
    if (this.mode === 'orbit') { this.yaw -= dx * k; this.pitch = THREE.MathUtils.clamp(this.pitch + dy * k, 0.05, 1.5); }
    else { this.yaw -= dx * k * 0.6; this.pitch = THREE.MathUtils.clamp(this.pitch - dy * k * 0.6, -1.3, 1.3); }
    this.onChange?.();
  }
  private zoom(amount: number) {
    if (this.mode === 'orbit') { this.distance = THREE.MathUtils.clamp(this.distance * (1 + amount), this.minDistance, this.maxDistance); }
    else { this.speed = THREE.MathUtils.clamp(this.speed * (1 - amount), 0.3, 4); }
    this.onChange?.();
  }
  private pan(dx: number, dy: number) {
    const f = this.mode === 'orbit' ? this.distance * 0.0012 : 0.02;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const p = this.mode === 'orbit' ? this.target : this.walkPos;
    p.addScaledVector(right, dx * f).addScaledVector(fwd, dy * f);
    this.clamp(p);
    this.onChange?.();
  }
  private clamp(p: THREE.Vector3) { p.x = THREE.MathUtils.clamp(p.x, this.bounds.minX, this.bounds.maxX); p.z = THREE.MathUtils.clamp(p.z, this.bounds.minZ, this.bounds.maxZ); }

  update(dt: number) {
    const k = this.keys;
    const fast = k.has('ShiftLeft') || k.has('ShiftRight');
    const fwdIn = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const rightIn = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const upIn = (k.has('KeyE') || k.has('PageUp') ? 1 : 0) - (k.has('KeyQ') || k.has('PageDown') ? 1 : 0);
    if (this.mode === 'orbit') {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const sp = this.distance * 0.9 * (fast ? 3 : 1) * dt;
      if (fwdIn || rightIn) { this.target.addScaledVector(fwd, fwdIn * sp).addScaledVector(right, rightIn * sp); this.clamp(this.target); this.onChange?.(); }
      if (upIn) { this.distance = THREE.MathUtils.clamp(this.distance * (1 - upIn * dt * 1.5), this.minDistance, this.maxDistance); this.onChange?.(); }
      // keep the target above the ground
      const g = this.groundHeight(this.target.x, this.target.z);
      if (this.target.y < g + 2) this.target.y = g + 2;
      if (this.target.y > g + 60 && !fwdIn) this.target.y += (g + 12 - this.target.y) * Math.min(1, dt * 2);
      const cp = Math.cos(this.pitch), spch = Math.sin(this.pitch);
      const pos = new THREE.Vector3(this.target.x + Math.sin(this.yaw) * cp * this.distance, this.target.y + spch * this.distance, this.target.z + Math.cos(this.yaw) * cp * this.distance);
      // camera must not go under the terrain
      const gc = this.groundHeight(pos.x, pos.z) + 2.5;
      if (pos.y < gc) pos.y = gc;
      this.camera.position.copy(pos);
      this.camera.lookAt(this.target);
    } else {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
      const sp = 6 * this.speed * (fast ? 3.2 : 1) * dt;
      if (fwdIn || rightIn) { this.walkPos.addScaledVector(fwd, fwdIn * sp).addScaledVector(right, rightIn * sp); this.clamp(this.walkPos); }
      if (k.has('Space')) this.eyeHeight = Math.min(60, this.eyeHeight + 12 * dt); else if (k.has('KeyC')) this.eyeHeight = Math.max(1.7, this.eyeHeight - 12 * dt);
      const g = this.groundHeight(this.walkPos.x, this.walkPos.z) + this.eyeHeight;
      this.walkPos.y += (g - this.walkPos.y) * Math.min(1, dt * 10);
      this.camera.position.copy(this.walkPos);
      const look = new THREE.Vector3(this.walkPos.x + fwd.x * Math.cos(this.pitch), this.walkPos.y + Math.sin(this.pitch), this.walkPos.z + fwd.z * Math.cos(this.pitch));
      this.camera.lookAt(look);
      if (fwdIn || rightIn) this.onChange?.();
    }
  }

  /** point of interest for LOD / shadows */
  focus(): THREE.Vector3 { return this.mode === 'orbit' ? this.target : this.walkPos; }
}
