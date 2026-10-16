/** Procedural canvas textures + materials for the mansion kit (no external assets). */
import * as THREE from 'three';

export type MatId =
  | 'plaster' | 'plasterDark' | 'stone' | 'concrete' | 'paving' | 'grass' | 'soil' | 'marble' | 'wood' | 'woodDark' | 'tile' | 'roof'
  | 'fabric' | 'fabricDark' | 'leather' | 'metal' | 'metalDark' | 'white' | 'black' | 'glass' | 'glassDark' | 'emissive' | 'foliage' | 'trunk'
  | 'water' | 'carPaint' | 'rubber' | 'chrome' | 'screen' | 'poolTile' | 'brick';

function canvas(size: number, paint: (c: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d')!; paint(c, size);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
function noise(c: CanvasRenderingContext2D, s: number, n: number, alpha: number, dark = true) {
  for (let i = 0; i < n; i++) { const v = Math.floor(rnd() * 255); c.fillStyle = `rgba(${dark ? 0 : 255},${dark ? 0 : 255},${dark ? 0 : 255},${alpha * rnd()})`; c.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 3, 1 + rnd() * 3); void v; }
}

export function makeTextures(size = 256) {
  const S = size;
  const plaster = canvas(S, (c, s) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, s, s); noise(c, s, s * 6, 0.06); noise(c, s, s * 3, 0.08, false); });
  const marble = canvas(S, (c, s) => {
    c.fillStyle = '#f2efe8'; c.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { c.strokeStyle = `rgba(120,110,100,${0.08 + rnd() * 0.12})`; c.lineWidth = 0.5 + rnd() * 1.5; c.beginPath(); let x = rnd() * s, y = rnd() * s; c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * s * 0.5; y += (rnd() - 0.5) * s * 0.5; c.lineTo(x, y); } c.stroke(); }
    // 2×2 tiles per texture with thin grout
    c.strokeStyle = 'rgba(90,85,80,0.55)'; c.lineWidth = 2; c.strokeRect(1, 1, s / 2 - 1, s / 2 - 1); c.strokeRect(s / 2, 1, s / 2 - 1, s / 2 - 1); c.strokeRect(1, s / 2, s / 2 - 1, s / 2 - 1); c.strokeRect(s / 2, s / 2, s / 2 - 1, s / 2 - 1);
  });
  const wood = canvas(S, (c, s) => {
    c.fillStyle = '#b4834f'; c.fillRect(0, 0, s, s);
    const planks = 4; const pw = s / planks;
    for (let p = 0; p < planks; p++) {
      const tone = 0.85 + rnd() * 0.3; c.fillStyle = `rgb(${Math.round(176 * tone)},${Math.round(128 * tone)},${Math.round(78 * tone)})`; c.fillRect(p * pw, 0, pw, s);
      for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(70,40,15,${0.08 + rnd() * 0.15})`; c.lineWidth = 0.6 + rnd(); c.beginPath(); const y0 = rnd() * s; c.moveTo(p * pw, y0); c.bezierCurveTo(p * pw + pw * 0.3, y0 + (rnd() - 0.5) * 12, p * pw + pw * 0.6, y0 + (rnd() - 0.5) * 12, p * pw + pw, y0 + (rnd() - 0.5) * 8); c.stroke(); }
      c.fillStyle = 'rgba(40,20,5,0.5)'; c.fillRect(p * pw, 0, 1.5, s);
      const off = Math.floor(rnd() * s); c.fillRect(p * pw, off, pw, 1.5);
    }
  });
  const tile = canvas(S, (c, s) => { c.fillStyle = '#d9d4cb'; c.fillRect(0, 0, s, s); noise(c, s, s * 3, 0.05); const n = 4, w = s / n; c.strokeStyle = 'rgba(70,70,70,0.6)'; c.lineWidth = 1.5; for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * w, 0); c.lineTo(i * w, s); c.stroke(); c.beginPath(); c.moveTo(0, i * w); c.lineTo(s, i * w); c.stroke(); } });
  const poolTile = canvas(S, (c, s) => { c.fillStyle = '#9fd5e8'; c.fillRect(0, 0, s, s); const n = 8, w = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = `hsl(${196 + rnd() * 10},${55 + rnd() * 20}%,${68 + rnd() * 14}%)`; c.fillRect(i * w + 1, j * w + 1, w - 2, w - 2); } });
  const paving = canvas(S, (c, s) => {
    c.fillStyle = '#8f8a82'; c.fillRect(0, 0, s, s); const rows = 6, bh = s / rows, bw = s / 3;
    for (let r = 0; r < rows; r++) { const off = (r % 2) * bw / 2; for (let i = -1; i < 4; i++) { const g = 120 + rnd() * 50; c.fillStyle = `rgb(${g + 10},${g},${g - 8})`; c.fillRect(i * bw + off + 1, r * bh + 1, bw - 2, bh - 2); } }
    noise(c, s, s * 3, 0.08);
  });
  const concrete = canvas(S, (c, s) => { c.fillStyle = '#b9b5ad'; c.fillRect(0, 0, s, s); noise(c, s, s * 8, 0.08); noise(c, s, s * 4, 0.1, false); });
  const grass = canvas(S, (c, s) => { c.fillStyle = '#5f8a3a'; c.fillRect(0, 0, s, s); for (let i = 0; i < s * 20; i++) { c.fillStyle = `hsl(${88 + rnd() * 30},${40 + rnd() * 30}%,${28 + rnd() * 22}%)`; c.fillRect(rnd() * s, rnd() * s, 1, 2 + rnd() * 3); } });
  const soil = canvas(S, (c, s) => { c.fillStyle = '#6b4a2e'; c.fillRect(0, 0, s, s); noise(c, s, s * 10, 0.14); noise(c, s, s * 4, 0.06, false); });
  const fabric = canvas(S, (c, s) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, s, s); for (let i = 0; i < s; i += 2) { c.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.05})`; c.fillRect(0, i, s, 1); c.fillRect(i, 0, 1, s); } });
  const brick = canvas(S, (c, s) => { c.fillStyle = '#7a4a36'; c.fillRect(0, 0, s, s); const rows = 8, bh = s / rows, bw = s / 4; for (let r = 0; r < rows; r++) { const off = (r % 2) * bw / 2; for (let i = -1; i < 5; i++) { const t = 0.85 + rnd() * 0.3; c.fillStyle = `rgb(${Math.round(150 * t)},${Math.round(82 * t)},${Math.round(60 * t)})`; c.fillRect(i * bw + off + 1.5, r * bh + 1.5, bw - 3, bh - 3); } } });
  const stone = canvas(S, (c, s) => { c.fillStyle = '#8c8a86'; c.fillRect(0, 0, s, s); for (let i = 0; i < 60; i++) { const g = 110 + rnd() * 60; c.fillStyle = `rgb(${g},${g - 4},${g - 10})`; const w = 12 + rnd() * 40, h = 8 + rnd() * 20; c.fillRect(rnd() * s, rnd() * s, w, h); } noise(c, s, s * 5, 0.1); });
  return { plaster, marble, wood, tile, poolTile, paving, concrete, grass, soil, fabric, brick, stone };
}

export interface MatDef { material: THREE.Material; uvScale: number }
export function makeMaterials(size = 256): Record<MatId, MatDef> {
  const T = makeTextures(size);
  const std = (o: THREE.MeshStandardMaterialParameters, uvScale = 1): MatDef => ({ material: new THREE.MeshStandardMaterial({ vertexColors: true, ...o }), uvScale });
  const M: Record<MatId, MatDef> = {
    plaster: std({ map: T.plaster, roughness: 0.9 }, 1 / 2),
    plasterDark: std({ map: T.plaster, roughness: 0.85 }, 1 / 2),
    stone: std({ map: T.stone, roughness: 0.85 }, 1 / 1.6),
    brick: std({ map: T.brick, roughness: 0.9 }, 1 / 1.2),
    concrete: std({ map: T.concrete, roughness: 0.92 }, 1 / 3),
    paving: std({ map: T.paving, roughness: 0.9 }, 1 / 1.2),
    grass: std({ map: T.grass, roughness: 1 }, 1 / 2),
    soil: std({ map: T.soil, roughness: 1 }, 1 / 2),
    marble: std({ map: T.marble, roughness: 0.35, metalness: 0.05 }, 1 / 1.2),
    tile: std({ map: T.tile, roughness: 0.5 }, 1 / 1.2),
    poolTile: std({ map: T.poolTile, roughness: 0.4 }, 1 / 1.0),
    wood: std({ map: T.wood, roughness: 0.6 }, 1 / 1.6),
    woodDark: std({ map: T.wood, roughness: 0.55 }, 1 / 1.0),
    roof: std({ map: T.concrete, roughness: 0.95 }, 1 / 3),
    fabric: std({ map: T.fabric, roughness: 0.95 }, 1 / 0.5),
    fabricDark: std({ map: T.fabric, roughness: 0.95 }, 1 / 0.5),
    leather: std({ roughness: 0.55, metalness: 0.02 }),
    metal: std({ roughness: 0.4, metalness: 0.7 }),
    metalDark: std({ roughness: 0.5, metalness: 0.6 }),
    chrome: std({ roughness: 0.2, metalness: 0.95 }),
    white: std({ roughness: 0.7 }),
    black: std({ roughness: 0.7 }),
    rubber: std({ roughness: 0.95 }),
    glass: { material: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.4, depthWrite: false, side: THREE.DoubleSide }), uvScale: 1 },
    glassDark: { material: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.75, roughness: 0.08, metalness: 0.6, depthWrite: false }), uvScale: 1 },
    emissive: { material: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 1.4, roughness: 0.4 }), uvScale: 1 },
    screen: { material: new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.3, metalness: 0.2 }), uvScale: 1 },
    foliage: std({ roughness: 0.9, side: THREE.DoubleSide }),
    trunk: std({ map: T.wood, roughness: 0.95 }, 1 / 0.8),
    water: { material: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.6, roughness: 0.12, metalness: 0.3, color: 0x6fc7e0, depthWrite: false }), uvScale: 1 },
    carPaint: std({ roughness: 0.25, metalness: 0.65 }),
  };
  return M;
}
