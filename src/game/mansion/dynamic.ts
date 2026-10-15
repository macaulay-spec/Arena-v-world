/** Animated pieces of the mansion: hinged doors, sliding gate, fans, screens; with collision updates. */
import * as THREE from 'three';
import type { CollisionWorld, Blocker } from '../collision';
import type { MatDef, MatId } from './materials';

/** collision sink in local (mansion) coordinates */
export class ShiftedCollision {
  constructor(public world: CollisionWorld, public ox: number, public oy: number, public oz: number) {}
  addSegment(ax: number, az: number, bx: number, bz: number, y0: number, y1: number) { return this.world.addSegment(ax + this.ox, az + this.oz, bx + this.ox, bz + this.oz, y0 + this.oy, y1 + this.oy); }
  addBox(minX: number, minZ: number, maxX: number, maxZ: number, y0: number, y1: number) { return this.world.addBox(minX + this.ox, minZ + this.oz, maxX + this.ox, maxZ + this.oz, y0 + this.oy, y1 + this.oy); }
  addCylinder(x: number, z: number, r: number, y0: number, y1: number) { return this.world.addCylinder(x + this.ox, z + this.oz, r, y0 + this.oy, y1 + this.oy); }
  addPolygon(poly: [number, number][], y0: number, y1: number) { this.world.addPolygon(poly.map(p => [p[0] + this.ox, p[1] + this.oz] as [number, number]), y0 + this.oy, y1 + this.oy); }
  addSurface(minX: number, minZ: number, maxX: number, maxZ: number, y: number) { return this.world.addSurface(minX + this.ox, minZ + this.oz, maxX + this.ox, maxZ + this.oz, y + this.oy); }
  remove(b: Blocker) { this.world.remove(b); }
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function panelGeometry(w: number, h: number, t: number, style: 'door' | 'glass' | 'flat' | 'cabinet'): THREE.BufferGeometry {
  const key = `${w}|${h}|${t}|${style}`; let g = geoCache.get(key); if (g) return g;
  const parts: THREE.BufferGeometry[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number) => { const b = new THREE.BoxGeometry(sx, sy, sz); b.translate(x, y, z); parts.push(b); };
  // leaf centred at x = w/2 (hinge at x = 0), y from 0..h
  if (style === 'glass') {
    const f = 0.08; box(f / 2, h / 2, 0, f, h, t); box(w - f / 2, h / 2, 0, f, h, t); box(w / 2, f / 2, 0, w, f, t); box(w / 2, h - f / 2, 0, w, f, t);
    const pane = new THREE.BoxGeometry(w - 2 * f, h - 2 * f, t * 0.3); pane.translate(w / 2, h / 2, 0); parts.push(pane);
  } else {
    box(w / 2, h / 2, 0, w, h, t);
    if (style === 'door') { // raised panels
      const inset = 0.09; const ph = (h - inset * 3) / 2;
      for (const side of [1, -1]) { for (let k = 0; k < 2; k++) { const py = inset + ph / 2 + k * (ph + inset); const p = new THREE.BoxGeometry(w - inset * 2, ph, t * 0.3); p.translate(w / 2, py, side * t * 0.55); parts.push(p); } }
      // handle
      for (const side of [1, -1]) { const hd = new THREE.BoxGeometry(0.12, 0.03, 0.03); hd.translate(w - 0.1, h * 0.48, side * (t / 2 + 0.03)); parts.push(hd); }
    }
    if (style === 'cabinet') { const hd = new THREE.BoxGeometry(0.02, 0.14, 0.03); hd.translate(w - 0.06, h * 0.5, t / 2 + 0.02); parts.push(hd); }
  }
  // merge
  let count = 0; for (const p of parts) count += p.getAttribute('position').count;
  const pos = new Float32Array(count * 3), nrm = new Float32Array(count * 3), uv = new Float32Array(count * 2), col = new Float32Array(count * 3); const idx: number[] = [];
  let off = 0;
  parts.forEach((p, i) => {
    const pa = p.getAttribute('position'), na = p.getAttribute('normal'), ua = p.getAttribute('uv'); const n = pa.count;
    pos.set(pa.array as Float32Array, off * 3); nrm.set(na.array as Float32Array, off * 3); uv.set(ua.array as Float32Array, off * 2);
    const paneLike = style === 'glass' && i === parts.length - 1; const shade = paneLike ? 0.75 : 1;
    for (let k = 0; k < n; k++) { col[(off + k) * 3] = shade; col[(off + k) * 3 + 1] = shade; col[(off + k) * 3 + 2] = shade; }
    const ia = p.getIndex()!; for (let k = 0; k < ia.count; k++) idx.push(ia.getX(k) + off);
    off += n;
  });
  g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
  geoCache.set(key, g); return g;
}

export interface DoorSpec { x: number; y: number; z: number; /** direction the leaf runs from the hinge when closed (radians, THREE rotation.y) */ along: number; width: number; height: number; thick?: number; style?: 'door' | 'glass' | 'flat' | 'cabinet'; mat: MatId; color: string; /** +1 swings toward +local z of the leaf frame, -1 the other way */ swing?: 1 | -1; label?: string; collide?: boolean; openAngle?: number; glassMat?: MatId; /** start open */ open?: boolean }

export class Door {
  group = new THREE.Group();
  open = false; private angle = 0; private target = 0;
  private blocker: Blocker | null = null;
  readonly label: string;
  constructor(public spec: DoorSpec, mats: Record<MatId, MatDef>, private sink: ShiftedCollision | null) {
    const t = spec.thick ?? 0.05;
    const geo = panelGeometry(spec.width, spec.height, t, spec.style ?? 'door');
    const mat = (mats[spec.mat].material as THREE.MeshStandardMaterial);
    const mesh = new THREE.Mesh(geo, mat);
    if (spec.style === 'glass') {
      // frame uses mat, the pane uses the glass material via a second mesh (same geometry, pane only is simplest as separate box)
      const pane = new THREE.Mesh(new THREE.BoxGeometry(spec.width - 0.16, spec.height - 0.16, t * 0.3), mats[spec.glassMat ?? 'glass'].material); pane.position.set(spec.width / 2, spec.height / 2, 0); pane.renderOrder = 5; this.group.add(pane);
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    // tint via vertex colour attribute multiply: emulate by a per-mesh material clone when the colour differs from white
    const c = new THREE.Color(spec.color); if (c.r !== 1 || c.g !== 1 || c.b !== 1) { const m2 = mat.clone(); m2.color.copy(c); mesh.material = m2; }
    this.group.add(mesh);
    this.group.position.set(spec.x, spec.y, spec.z); this.group.rotation.y = spec.along;
    this.label = spec.label ?? 'door';
    if (spec.open) { this.toggle(true); this.angle = this.target; this.group.rotation.y = spec.along + this.angle; }
    this.updateBlocker();
  }
  /** world-space (mansion-local) leaf end point for the current angle */
  private leafEnd(angle: number): [number, number] {
    const a = this.spec.along + angle; return [this.spec.x + Math.cos(a) * this.spec.width, this.spec.z - Math.sin(a) * this.spec.width];
  }
  private updateBlocker() {
    if (!this.sink || this.spec.collide === false) return;
    if (this.blocker) { this.sink.remove(this.blocker); this.blocker = null; }
    const e = this.leafEnd(this.angle);
    this.blocker = this.sink.addSegment(this.spec.x, this.spec.z, e[0], e[1], this.spec.y, this.spec.y + this.spec.height);
  }
  toggle(force?: boolean) { this.open = force ?? !this.open; this.target = this.open ? (this.spec.openAngle ?? Math.PI / 2 * 0.95) * (this.spec.swing ?? 1) : 0; }
  get prompt() { return `${this.open ? 'Close' : 'Open'} ${this.label}`; }
  /** handle position (local) */
  get handle(): [number, number, number] { const e = this.leafEnd(this.angle); return [(this.spec.x + e[0]) / 2, this.spec.y + 1, (this.spec.z + e[1]) / 2]; }
  update(dt: number) {
    if (Math.abs(this.angle - this.target) < 1e-3) return;
    const k = Math.min(1, dt * 6); this.angle += (this.target - this.angle) * k;
    if (Math.abs(this.angle - this.target) < 0.01) this.angle = this.target;
    this.group.rotation.y = this.spec.along + this.angle;
    this.updateBlocker();
  }
}

/** sliding panel (gate / wardrobe) moving along its own x axis */
export class Slider {
  group = new THREE.Group();
  open = false; private t = 0; private target = 0;
  private blocker: Blocker | null = null;
  constructor(public spec: { x: number; y: number; z: number; along: number; width: number; height: number; thick: number; travel: number; label: string; collide?: boolean }, mesh: THREE.Object3D, private sink: ShiftedCollision | null) {
    this.group.add(mesh); this.group.position.set(spec.x, spec.y, spec.z); this.group.rotation.y = spec.along; this.updateBlocker();
  }
  private updateBlocker() {
    if (!this.sink || this.spec.collide === false) return;
    if (this.blocker) { this.sink.remove(this.blocker); this.blocker = null; }
    const a = this.spec.along; const off = this.t * this.spec.travel;
    const x0 = this.spec.x + Math.cos(a) * off, z0 = this.spec.z - Math.sin(a) * off;
    const x1 = x0 + Math.cos(a) * this.spec.width, z1 = z0 - Math.sin(a) * this.spec.width;
    this.blocker = this.sink.addSegment(x0, z0, x1, z1, this.spec.y, this.spec.y + this.spec.height);
  }
  toggle(force?: boolean) { this.open = force ?? !this.open; this.target = this.open ? 1 : 0; }
  get prompt() { return `${this.open ? 'Close' : 'Open'} ${this.spec.label}`; }
  update(dt: number) {
    if (Math.abs(this.t - this.target) < 1e-4) return;
    const speed = dt / 3.2; this.t += Math.max(-speed, Math.min(speed, this.target - this.t));
    const a = this.spec.along, off = this.t * this.spec.travel;
    this.group.position.set(this.spec.x + Math.cos(a) * off, this.spec.y, this.spec.z - Math.sin(a) * off);
    this.updateBlocker();
  }
}

/** ceiling fan: hub + blades rotating when on */
export class Fan {
  group = new THREE.Group(); on = true; private speed = 0;
  constructor(x: number, y: number, z: number, mats: Record<MatId, MatDef>, color = 0x3a2a1a) {
    const metal = mats.metalDark.material; const wood = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 8), metal); rod.position.y = 0.175; this.group.add(rod);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.12, 12), metal); hub.position.y = -0.02; this.group.add(hub);
    for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.13), wood); b.position.set(0.14 + 0.31, -0.03, 0); const pivot = new THREE.Group(); pivot.rotation.y = (i / 4) * Math.PI * 2; pivot.add(b); hub.add(pivot); }
    this.group.position.set(x, y - 0.35, z);
  }
  update(dt: number) { this.speed += ((this.on ? 9 : 0) - this.speed) * Math.min(1, dt * 0.8); this.group.children[1].rotation.y += this.speed * dt; }
}

/** TV / laptop screen that flickers colour when on */
export class Screen {
  material: THREE.MeshStandardMaterial; on = false; private t = 0; private hue = 0.6;
  constructor(public mesh: THREE.Mesh) { this.material = (mesh.material as THREE.MeshStandardMaterial).clone(); mesh.material = this.material; this.material.emissive.set(0x000000); }
  toggle(force?: boolean) { this.on = force ?? !this.on; if (!this.on) { this.material.emissive.set(0x000000); this.material.emissiveIntensity = 0; this.material.color.set(0x0a0a0a); } }
  update(dt: number) {
    if (!this.on) return; this.t += dt;
    if (this.t > 0.35) { this.t = 0; this.hue = (this.hue + 0.07 + Math.random() * 0.3) % 1; }
    this.material.color.set(0x111111); this.material.emissive.setHSL(this.hue, 0.5, 0.55 + Math.sin(performance.now() * 0.01) * 0.08); this.material.emissiveIntensity = 1.3;
  }
}
