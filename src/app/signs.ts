/** Runtime text atlas for sign boards, street names and billboards. */
import * as THREE from 'three';
import { GLOBAL } from './materials';
import type { V3 } from './geom';

export interface TextSlot { u0: number; v0: number; u1: number; v1: number; aspect: number; }

export class TextAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: THREE.CanvasTexture;
  private slots = new Map<string, TextSlot>();
  private next = 0;
  readonly cols: number; readonly rows: number;
  readonly slotW: number; readonly slotH: number;
  private dirty = false;
  constructor(readonly width = 2048, readonly height = 4096, readonly scale = 1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * scale); this.canvas.height = Math.round(height * scale);
    this.ctx = this.canvas.getContext('2d')!;
    this.slotW = Math.round(256 * scale); this.slotH = Math.round(32 * scale);
    this.cols = Math.floor(this.canvas.width / this.slotW); this.rows = Math.floor(this.canvas.height / this.slotH);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.flipY = false; this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter; this.texture.magFilter = THREE.LinearFilter; this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
  }
  /** returns the slot for a string, rasterising it on first use; falls back to the first slot when the atlas is full */
  get(text: string, style: 'bold' | 'light' = 'bold'): TextSlot {
    const key = style + ':' + text;
    const hit = this.slots.get(key); if (hit) return hit;
    if (this.next >= this.cols * this.rows) { return this.slots.values().next().value ?? { u0: 0, v0: 0, u1: 1, v1: 1, aspect: 8 }; }
    const i = this.next++;
    const cx = (i % this.cols) * this.slotW, cy = Math.floor(i / this.cols) * this.slotH;
    const ctx = this.ctx;
    const fontPx = Math.round(this.slotH * 0.72);
    ctx.font = `${style === 'bold' ? '700' : '500'} ${fontPx}px "Segoe UI", Roboto, Helvetica, Arial, sans-serif`;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let w = ctx.measureText(text).width;
    const pad = Math.round(4 * this.scale);
    let drawText = text;
    while (w > this.slotW - pad * 2 && drawText.length > 2) { drawText = drawText.slice(0, -1); w = ctx.measureText(drawText + '…').width; }
    if (drawText !== text) drawText += '…';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(drawText, cx + pad, cy + this.slotH / 2);
    const used = Math.min(this.slotW, w + pad * 2);
    const slot: TextSlot = { u0: cx / this.canvas.width, v0: cy / this.canvas.height, u1: (cx + used) / this.canvas.width, v1: (cy + this.slotH) / this.canvas.height, aspect: used / this.slotH };
    this.slots.set(key, slot);
    this.dirty = true;
    return slot;
  }
  commit() { if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; } }
}

export class TextBuilder {
  pos: number[] = []; uv: number[] = []; col: number[] = []; em: number[] = []; idx: number[] = [];
  /** quad with text slot; corners p0 (left-bottom), p1 (right-bottom), p2 (right-top), p3 (left-top) seen from the front */
  quad(p0: V3, p1: V3, p2: V3, p3: V3, s: TextSlot, color: THREE.Color, em = 0) {
    const b = this.pos.length / 3;
    this.pos.push(...p0, ...p1, ...p2, ...p3);
    this.uv.push(s.u0, s.v1, s.u1, s.v1, s.u1, s.v0, s.u0, s.v0);
    for (let i = 0; i < 4; i++) { this.col.push(color.r, color.g, color.b); this.em.push(em); }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /**
   * text centred at (x, y, z), facing direction n (unit, horizontal), height h, maximum width maxW; returns actual width
   */
  label(x: number, y: number, z: number, nx: number, nz: number, h: number, maxW: number, s: TextSlot, color: THREE.Color, em = 0, doubleSided = false): number {
    const w = Math.min(maxW, s.aspect * h);
    const hh = h * (w / (s.aspect * h)) ; // shrink height if clamped by width
    const rx = nz, rz = -nx; // viewer's right when looking at a face whose outward normal is n
    const p0: V3 = [x - rx * w / 2, y - hh / 2, z - rz * w / 2], p1: V3 = [x + rx * w / 2, y - hh / 2, z + rz * w / 2];
    const p2: V3 = [x + rx * w / 2, y + hh / 2, z + rz * w / 2], p3: V3 = [x - rx * w / 2, y + hh / 2, z - rz * w / 2];
    this.quad(p0, p1, p2, p3, s, color, em);
    if (doubleSided) this.quad(p1, p0, p3, p2, s, color, em);
    return w;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aEm', new THREE.Float32BufferAttribute(this.em, 1));
    g.setIndex(this.pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
  get empty() { return this.idx.length === 0; }
}

export function makeTextMaterial(atlas: TextAtlas): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: atlas.texture }, uNight: GLOBAL.uNight },
    vertexShader: /* glsl */`
      attribute float aEm; varying vec2 vUv; varying vec3 vColor; varying float vEm;
      void main(){ vUv = uv; vColor = color; vEm = aEm; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform float uNight; varying vec2 vUv; varying vec3 vColor; varying float vEm;
      void main(){
        float a = texture2D(uMap, vUv).a;
        if (a < 0.35) discard;
        vec3 c = vColor * (1.0 - uNight * 0.6) + vColor * vEm * uNight * 1.4;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
    vertexColors: true, transparent: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
}
