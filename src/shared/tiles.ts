/**
 * Material tile catalogue shared by the generator (which references tiles by name) and the renderer
 * (which paints them procedurally into one atlas). Keep names stable: they are stored in city.json.
 */
export type TileKind = 'facade' | 'ground' | 'roof' | 'misc';

export interface TileDef {
  name: string;
  kind: TileKind;
  /** physical size of one tile repeat in meters (width, height) */
  size: [number, number];
  /** painter id in the renderer */
  painter: string;
  /** painter params */
  p?: Record<string, number | string>;
}

export const TILES: TileDef[] = [
  // ── facades (one floor high, one bay wide) ──
  { name: 'plaster-win', kind: 'facade', size: [3.6, 3.1], painter: 'window', p: { win: 1, frame: 'light' } },
  { name: 'plaster-win2', kind: 'facade', size: [5.4, 3.1], painter: 'window', p: { win: 2, frame: 'light' } },
  { name: 'plaster-plain', kind: 'facade', size: [4, 3.1], painter: 'plain', p: { grime: 0.5 } },
  { name: 'plaster-louvre', kind: 'facade', size: [3.6, 3.1], painter: 'window', p: { win: 1, frame: 'light', louvre: 1 } },
  { name: 'plaster-arch', kind: 'facade', size: [3.4, 3.4], painter: 'window', p: { win: 1, arch: 1, frame: 'light' } },
  { name: 'concrete-grid', kind: 'facade', size: [3.4, 3.2], painter: 'window', p: { win: 1, frame: 'dark', wide: 1 } },
  { name: 'concrete-strip', kind: 'facade', size: [4, 3.6], painter: 'strip', p: {} },
  { name: 'glass-curtain', kind: 'facade', size: [3, 3.8], painter: 'curtain', p: { tint: 'blue' } },
  { name: 'glass-dark', kind: 'facade', size: [3, 3.8], painter: 'curtain', p: { tint: 'dark' } },
  { name: 'glass-green', kind: 'facade', size: [3, 3.8], painter: 'curtain', p: { tint: 'green' } },
  { name: 'brick-win', kind: 'facade', size: [3.6, 3.1], painter: 'window', p: { win: 1, frame: 'light', brick: 1 } },
  { name: 'block-win', kind: 'facade', size: [4, 3.4], painter: 'window', p: { win: 1, frame: 'dark', block: 1, small: 1 } },
  { name: 'zinc-wall', kind: 'facade', size: [3, 3], painter: 'corrugated', p: {} },
  { name: 'panel-industrial', kind: 'facade', size: [4, 4], painter: 'panel', p: {} },
  { name: 'shopfront', kind: 'facade', size: [5, 4.2], painter: 'shopfront', p: {} },
  { name: 'shopfront-shutter', kind: 'facade', size: [4, 3.8], painter: 'shutter', p: {} },
  { name: 'arcade', kind: 'facade', size: [4, 4.2], painter: 'arcade', p: {} },
  { name: 'colonnade', kind: 'facade', size: [4.5, 5], painter: 'colonnade', p: {} },
  { name: 'stone', kind: 'facade', size: [3.6, 3.6], painter: 'window', p: { win: 1, frame: 'dark', stone: 1, tall: 1 } },
  { name: 'mud-traditional', kind: 'facade', size: [3.2, 2.9], painter: 'window', p: { win: 1, frame: 'wood', small: 1, mud: 1 } },
  { name: 'lattice', kind: 'facade', size: [3, 3], painter: 'lattice', p: {} },
  { name: 'garage-door', kind: 'facade', size: [4.5, 4.5], painter: 'garage', p: {} },
  { name: 'hotel', kind: 'facade', size: [4, 3.3], painter: 'window', p: { win: 2, frame: 'dark', wide: 1, rail: 1 } },
  { name: 'hospital', kind: 'facade', size: [3.6, 3.6], painter: 'window', p: { win: 1, frame: 'light', wide: 1, tall: 1 } },
  { name: 'school', kind: 'facade', size: [3.6, 3.3], painter: 'window', p: { win: 1, frame: 'dark', louvre: 1, wide: 1 } },
  { name: 'warehouse', kind: 'facade', size: [5, 6], painter: 'panel', p: { high: 1 } },
  { name: 'church', kind: 'facade', size: [3.2, 6], painter: 'window', p: { win: 1, arch: 1, tall: 1, frame: 'dark', narrow: 1 } },
  { name: 'frame', kind: 'facade', size: [4, 3.4], painter: 'frame', p: {} },
  { name: 'open', kind: 'facade', size: [4, 4], painter: 'none', p: {} },
  // ── roofs ──
  { name: 'roof-concrete', kind: 'roof', size: [6, 6], painter: 'concrete', p: { stains: 1 } },
  { name: 'roof-gravel', kind: 'roof', size: [4, 4], painter: 'gravel', p: {} },
  { name: 'roof-zinc', kind: 'roof', size: [3, 3], painter: 'corrugated', p: { roof: 1 } },
  { name: 'roof-zinc-rust', kind: 'roof', size: [3, 3], painter: 'corrugated', p: { roof: 1, rust: 1 } },
  { name: 'roof-tile', kind: 'roof', size: [2, 2], painter: 'tiles', p: {} },
  { name: 'roof-membrane', kind: 'roof', size: [6, 6], painter: 'concrete', p: { dark: 1 } },
  { name: 'roof-metal', kind: 'roof', size: [3, 3], painter: 'standing', p: {} },
  // ── ground / misc ──
  { name: 'asphalt', kind: 'ground', size: [8, 8], painter: 'asphalt', p: {} },
  { name: 'asphalt-old', kind: 'ground', size: [8, 8], painter: 'asphalt', p: { old: 1 } },
  { name: 'paving', kind: 'ground', size: [4, 4], painter: 'paving', p: {} },
  { name: 'paving-plaza', kind: 'ground', size: [6, 6], painter: 'paving', p: { plaza: 1 } },
  { name: 'concrete-plain', kind: 'ground', size: [4, 4], painter: 'concrete', p: {} },
  { name: 'earth', kind: 'ground', size: [10, 10], painter: 'earth', p: {} },
  { name: 'grass', kind: 'ground', size: [10, 10], painter: 'grass', p: {} },
  { name: 'grass-dry', kind: 'ground', size: [10, 10], painter: 'grass', p: { dry: 1 } },
  { name: 'field', kind: 'ground', size: [12, 12], painter: 'field', p: {} },
  { name: 'wall-plain', kind: 'misc', size: [3, 2], painter: 'plain', p: { grime: 0.8 } },
  { name: 'wall-block', kind: 'misc', size: [3, 2], painter: 'blockwall', p: {} },
  { name: 'metal-panel', kind: 'misc', size: [2, 2], painter: 'panel', p: { plain: 1 } },
  { name: 'sand', kind: 'ground', size: [10, 10], painter: 'earth', p: { sand: 1 } },
  { name: 'water-bed', kind: 'ground', size: [10, 10], painter: 'earth', p: { wet: 1 } },
  { name: 'pitch', kind: 'ground', size: [12, 12], painter: 'grass', p: { pitch: 1 } },
  { name: 'track', kind: 'ground', size: [4, 4], painter: 'plain', p: { grime: 0.2 } },
  { name: 'container', kind: 'misc', size: [6, 2.6], painter: 'corrugated', p: { container: 1 } },
  { name: 'canopy-fabric', kind: 'misc', size: [2, 2], painter: 'stripes', p: {} },
];

export const TILE_INDEX: Record<string, number> = Object.fromEntries(TILES.map((t, i) => [t.name, i]));
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = Math.ceil(TILES.length / ATLAS_COLS);
export function hasTile(name: string): boolean { return name in TILE_INDEX; }
