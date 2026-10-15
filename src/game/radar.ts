/** GTA-style radar: a rotating crop of a pre-rendered city plan centred on the player. */
import type { CityData } from '../shared/types';
import { shorelineZ } from '../shared/terrain';

export class Radar {
  private base: HTMLCanvasElement; private ctx: CanvasRenderingContext2D;
  private scale: number; private ox: number; private oz: number;
  private markers: { x: number; z: number; color: string }[] = [];
  constructor(readonly city: CityData, private canvas: HTMLCanvasElement, public zoom = 1.6 /* px per metre on the radar */) {
    const b = city.meta.terrain.cityBounds;
    this.scale = 0.8; // base plan resolution (px per metre)
    this.ox = b.minX - 200; this.oz = b.minZ - 200;
    this.base = document.createElement('canvas'); this.base.width = Math.ceil((b.maxX - b.minX + 400) * this.scale); this.base.height = Math.ceil((b.maxZ - b.minZ + 400) * this.scale);
    this.ctx = canvas.getContext('2d')!;
    this.drawBase();
  }
  private X(x: number) { return (x - this.ox) * this.scale; }
  private Z(z: number) { return (z - this.oz) * this.scale; }
  private drawBase() {
    const c = this.base.getContext('2d')!; const { city } = this;
    c.fillStyle = '#b5ad7f'; c.fillRect(0, 0, this.base.width, this.base.height);
    for (const d of city.districts) { c.beginPath(); d.polygon.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.closePath(); c.fillStyle = d.color + '66'; c.fill(); }
    c.fillStyle = '#4f86b8'; c.beginPath(); const b = city.meta.terrain.cityBounds;
    c.moveTo(this.X(b.minX - 300), this.Z(b.maxZ + 300)); for (let x = b.minX - 300; x <= b.maxX + 300; x += 10) c.lineTo(this.X(x), this.Z(shorelineZ(x))); c.lineTo(this.X(b.maxX + 300), this.Z(b.maxZ + 300)); c.closePath(); c.fill();
    const riv = city.water.river; c.strokeStyle = '#4f86b8'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 1; i < riv.points.length; i++) { c.lineWidth = Math.max(2, ((riv.widths[i - 1] + riv.widths[i]) / 2) * this.scale); c.beginPath(); c.moveTo(this.X(riv.points[i - 1][0]), this.Z(riv.points[i - 1][1])); c.lineTo(this.X(riv.points[i][0]), this.Z(riv.points[i][1])); c.stroke(); }
    for (const bl of city.blocks) if (bl.use === 'park') { c.beginPath(); bl.polygon.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.closePath(); c.fillStyle = '#5c8f45'; c.fill(); }
    c.fillStyle = 'rgba(70,60,50,0.6)';
    for (const bd of city.buildings) for (const m of bd.masses) { c.beginPath(); m.footprint.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.closePath(); c.fill(); }
    const widths: Record<string, number> = { arterial: 14, waterfront: 11, secondary: 10, service: 7, local: 6, access: 4, lane: 3 };
    for (const e of city.roads.edges) { c.lineWidth = Math.max(1.5, widths[e.cls] * this.scale); c.strokeStyle = e.cls === 'arterial' ? '#f3e2a5' : '#f1ece0'; c.beginPath(); e.points.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.stroke(); }
    for (const l of city.landmarks) { c.fillStyle = '#fff'; c.strokeStyle = '#b3261e'; c.lineWidth = 1.5; c.beginPath(); c.arc(this.X(l.x), this.Z(l.z), 3.5, 0, Math.PI * 2); c.fill(); c.stroke(); }
  }
  setMarkers(m: { x: number; z: number; color: string }[]) { this.markers = m; }
  update(x: number, z: number, yaw: number) {
    const cv = this.canvas, c = this.ctx; const W = cv.width, H = cv.height; const r = Math.min(W, H) / 2;
    c.clearRect(0, 0, W, H);
    c.save(); c.beginPath(); c.arc(W / 2, H / 2, r - 1, 0, Math.PI * 2); c.clip();
    c.fillStyle = '#9fb0c3'; c.fillRect(0, 0, W, H);
    const k = this.zoom / this.scale; // plan px → radar px
    c.translate(W / 2, H / 2); c.rotate(yaw + Math.PI); c.scale(k, k); c.translate(-this.X(x), -this.Z(z));
    c.drawImage(this.base, 0, 0);
    for (const m of this.markers) { c.fillStyle = m.color; c.beginPath(); c.arc(this.X(m.x), this.Z(m.z), 4 / k, 0, Math.PI * 2); c.fill(); }
    c.restore();
    // player arrow (always pointing up)
    c.save(); c.translate(W / 2, H / 2); c.fillStyle = '#fff'; c.strokeStyle = '#000'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(0, -9); c.lineTo(6, 7); c.lineTo(0, 4); c.lineTo(-6, 7); c.closePath(); c.fill(); c.stroke(); c.restore();
    c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = 2; c.beginPath(); c.arc(W / 2, H / 2, r - 1.5, 0, Math.PI * 2); c.stroke();
  }
}
