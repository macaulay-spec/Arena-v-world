/** Minimap: static plan drawn once from the city data plus a live camera marker; click to travel. */
import type { CityData } from '../shared/types';
import { shorelineZ } from '../shared/terrain';

export class Minimap {
  canvas: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private scale: number; private ox: number; private oz: number;
  constructor(readonly city: CityData, size: number, onClick: (x: number, z: number) => void) {
    this.canvas = document.getElementById('minimap') as HTMLCanvasElement;
    const b = city.meta.terrain.cityBounds;
    const w = b.maxX - b.minX, h = b.maxZ - b.minZ;
    this.scale = size / Math.max(w, h);
    this.canvas.width = Math.round(w * this.scale); this.canvas.height = Math.round(h * this.scale);
    this.ox = b.minX; this.oz = b.minZ;
    this.base = document.createElement('canvas'); this.base.width = this.canvas.width; this.base.height = this.canvas.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.drawBase();
    this.canvas.addEventListener('click', e => { const r = this.canvas.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * this.canvas.width / this.scale + this.ox; const z = ((e.clientY - r.top) / r.height) * this.canvas.height / this.scale + this.oz; onClick(x, z); });
  }
  private X(x: number) { return (x - this.ox) * this.scale; }
  private Z(z: number) { return (z - this.oz) * this.scale; }
  private drawBase() {
    const c = this.base.getContext('2d')!; const { city } = this;
    c.fillStyle = '#b9b37f'; c.fillRect(0, 0, this.base.width, this.base.height);
    // districts
    for (const d of city.districts) { c.beginPath(); d.polygon.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.closePath(); c.fillStyle = d.color + 'aa'; c.fill(); }
    // water: lagoon (south of shoreline) and river
    c.fillStyle = '#5b8fbf'; c.beginPath(); const b = city.meta.terrain.cityBounds;
    c.moveTo(this.X(b.minX), this.Z(b.maxZ)); for (let x = b.minX; x <= b.maxX; x += 10) c.lineTo(this.X(x), this.Z(shorelineZ(x))); c.lineTo(this.X(b.maxX), this.Z(b.maxZ)); c.closePath(); c.fill();
    const riv = city.water.river; c.strokeStyle = '#5b8fbf'; c.lineCap = 'round'; c.lineJoin = 'round';
    for (let i = 1; i < riv.points.length; i++) { c.lineWidth = Math.max(2, ((riv.widths[i - 1] + riv.widths[i]) / 2) * this.scale); c.beginPath(); c.moveTo(this.X(riv.points[i - 1][0]), this.Z(riv.points[i - 1][1])); c.lineTo(this.X(riv.points[i][0]), this.Z(riv.points[i][1])); c.stroke(); }
    // parks
    for (const bl of city.blocks) if (bl.use === 'park') { c.beginPath(); bl.polygon.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.closePath(); c.fillStyle = '#4f8a3a'; c.fill(); }
    // buildings
    c.fillStyle = 'rgba(60,50,40,0.55)';
    for (const bd of city.buildings) for (const m of bd.masses) { c.beginPath(); m.footprint.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.closePath(); c.fill(); }
    // roads
    const widths: Record<string, number> = { arterial: 3.2, waterfront: 2.4, secondary: 2.2, service: 1.6, local: 1.2, access: 0.8, lane: 0.6 };
    for (const e of city.roads.edges) { c.lineWidth = Math.max(0.6, widths[e.cls] * this.scale * 2.2); c.strokeStyle = e.cls === 'arterial' ? '#f6e3a8' : e.cls === 'secondary' || e.cls === 'waterfront' ? '#f4f0e6' : '#e8e4dc'; c.beginPath(); e.points.forEach((p, i) => i ? c.lineTo(this.X(p[0]), this.Z(p[1])) : c.moveTo(this.X(p[0]), this.Z(p[1]))); c.stroke(); }
    // landmarks
    c.fillStyle = '#ffffff'; c.strokeStyle = '#b3261e'; c.lineWidth = 1.5;
    for (const l of city.landmarks) { c.beginPath(); c.arc(this.X(l.x), this.Z(l.z), 3, 0, Math.PI * 2); c.fill(); c.stroke(); }
  }
  update(x: number, z: number, yaw: number) {
    const c = this.ctx; c.clearRect(0, 0, this.canvas.width, this.canvas.height); c.drawImage(this.base, 0, 0);
    const px = this.X(x), pz = this.Z(z);
    c.save(); c.translate(px, pz); c.rotate(-yaw + Math.PI);
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-10, -16); c.lineTo(10, -16); c.closePath(); c.fill();
    c.restore();
    c.fillStyle = '#ff3b2f'; c.beginPath(); c.arc(px, pz, 3.5, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.stroke();
  }
}
