/** Save game + settings (localStorage; a cloud/multiplayer profile replaces this later). */
import { DEFAULT_APPEARANCE, normalizeAppearance, type Appearance } from './player';

export type QualityId = 'lite' | 'standard' | 'high';
export const QUALITY_IDS: readonly QualityId[] = ['lite', 'standard', 'high'];
export interface Settings { quality: QualityId | 'auto'; sensitivity: number; invertY: boolean; showFps: boolean; sound: boolean }
export interface SaveData {
  version: 1; appearance: Appearance; cash: number; health: number;
  /** game clock in minutes since midnight + day counter */
  minutes: number; day: number;
  /** last position (world) + yaw; undefined ⇒ wake up in bed */
  pos?: [number, number, number, number];
  stats: { steps: number; sleeps: number; meals: number; doors: number; talks: number };
  created: number; played: number; saved: number;
}

const SAVE_KEY = 'voracity.save.v1', SETTINGS_KEY = 'voracity.settings.v1';
export const DEFAULT_SETTINGS: Settings = { quality: 'auto', sensitivity: 1, invertY: false, showFps: false, sound: true };

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Coerce anything into a valid Settings object (unknown presets → 'auto', out-of-range numbers clamped). */
export function sanitizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const q = r.quality;
  const quality: Settings['quality'] = q === 'auto' || (typeof q === 'string' && (QUALITY_IDS as readonly string[]).includes(q)) ? (q as Settings['quality']) : DEFAULT_SETTINGS.quality;
  return { quality, sensitivity: num(r.sensitivity, DEFAULT_SETTINGS.sensitivity, 0.2, 3), invertY: bool(r.invertY, false), showFps: bool(r.showFps, false), sound: bool(r.sound, true) };
}

/** Coerce a parsed save into a valid SaveData, or null when it is not a usable save at all. */
export function sanitizeSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;
  const st = (r.stats && typeof r.stats === 'object' ? r.stats : {}) as Record<string, unknown>;
  let pos: SaveData['pos'];
  if (Array.isArray(r.pos) && r.pos.length === 4 && r.pos.every(v => typeof v === 'number' && Number.isFinite(v))) pos = [r.pos[0], r.pos[1], r.pos[2], r.pos[3]];
  const now = Date.now();
  return {
    version: 1,
    appearance: normalizeAppearance(r.appearance as Partial<Appearance>),
    cash: num(r.cash, 25000, 0, 1e12), health: num(r.health, 100, 0, 100),
    minutes: num(r.minutes, 7 * 60 + 12, 0, 1439), day: Math.max(1, Math.floor(num(r.day, 1, 1, 1e6))),
    pos,
    stats: { steps: num(st.steps, 0, 0), sleeps: num(st.sleeps, 0, 0), meals: num(st.meals, 0, 0), doors: num(st.doors, 0, 0), talks: num(st.talks, 0, 0) },
    created: num(r.created, now, 0), played: num(r.played, 0, 0), saved: num(r.saved, 0, 0),
  };
}

function storageGet(key: string): string | null { try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(key); } catch { return null; } }
function storageSet(key: string, value: string): boolean { try { localStorage.setItem(key, value); return true; } catch (e) { console.warn('[save] write failed', key, e); return false; } }

export function newSave(appearance: Appearance): SaveData {
  return { version: 1, appearance: normalizeAppearance(appearance), cash: 25000, health: 100, minutes: 7 * 60 + 12, day: 1, stats: { steps: 0, sleeps: 0, meals: 0, doors: 0, talks: 0 }, created: Date.now(), played: 0, saved: 0 };
}
export function loadSave(): SaveData | null {
  const raw = storageGet(SAVE_KEY); if (!raw) return null;
  try { return sanitizeSave(JSON.parse(raw)); } catch (e) { console.warn('[save] corrupt save ignored', e); return null; }
}
export function writeSave(s: SaveData): boolean { s.saved = Date.now(); return storageSet(SAVE_KEY, JSON.stringify(s)); }
export function deleteSave(): void { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
export function loadSettings(): Settings {
  const raw = storageGet(SETTINGS_KEY); if (!raw) return { ...DEFAULT_SETTINGS };
  try { return sanitizeSettings(JSON.parse(raw)); } catch { return { ...DEFAULT_SETTINGS }; }
}
export function writeSettings(s: Settings): boolean { return storageSet(SETTINGS_KEY, JSON.stringify(sanitizeSettings(s))); }

/** what we can learn about the device without rendering anything */
export interface DeviceInfo { memoryGB?: number; cores?: number; coarsePointer: boolean; pixels: number; gpu?: string; webgl2: boolean }

/** Rough GPU tier from the WEBGL_debug_renderer_info string: 0 = unknown/weak, 1 = mid, 2 = strong. */
export function gpuTier(gpu: string | undefined): 0 | 1 | 2 {
  if (!gpu) return 0;
  const g = gpu.toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(g)) return 0;
  let m: RegExpMatchArray | null;
  if ((m = g.match(/adreno\s*(?:\(tm\))?\s*(\d{3})/))) { const n = +m[1]; return n >= 640 ? 2 : n >= 616 ? 1 : 0; }
  if ((m = g.match(/mali-g(\d{2,3})/))) { const n = +m[1]; return n >= 76 ? 2 : n >= 57 ? 1 : 0; }
  if (/mali-t|mali-4|powervr (sgx|rogue ge8|ge8)/.test(g)) return 0;
  if ((m = g.match(/apple (a|m)(\d+)/))) { const n = +m[2]; return m[1] === 'm' || n >= 12 ? 2 : n >= 10 ? 1 : 0; }
  if (/apple gpu/.test(g)) return 1;
  if (/nvidia|geforce|radeon|rx \d|arc\(tm\)|apple m/.test(g)) return 2;
  if (/intel.*(iris|uhd 7|xe)/.test(g)) return 1;
  if (/intel/.test(g)) return 0;
  if (/samsung xclipse|immortalis/.test(g)) return 2;
  return 1;
}

/**
 * Pick a preset from the device facts. Unknown hardware is treated conservatively: a phone that
 * reports neither memory nor a recognisable GPU gets Lite, and nothing short of a strong GPU
 * with ≥ 6 GB reaches High on a touch device.
 */
export function chooseQuality(d: DeviceInfo): QualityId {
  const tier = gpuTier(d.gpu);
  if (!d.webgl2) return 'lite';
  const mem = d.memoryGB, cores = d.cores;
  if (!d.coarsePointer) {
    // desktop / laptop: software renderers and old integrated GPUs stay low
    if (tier === 0 && (d.gpu || (cores ?? 0) < 4)) return 'lite';
    if (tier === 2 && (cores ?? 0) >= 6 && (mem ?? 8) >= 6) return 'high';
    return 'standard';
  }
  // touch device
  if (mem !== undefined && mem <= 3) return 'lite';
  if ((cores ?? 0) > 0 && (cores ?? 0) <= 4 && tier < 2) return 'lite';
  if (mem === undefined && tier === 0) return 'lite';          // nothing known → assume a budget phone
  if (tier === 0 && (mem ?? 0) < 6) return 'lite';
  if (d.pixels > 3.2e6 && (mem ?? 4) < 6 && tier < 2) return 'lite'; // very dense screens on mid hardware
  if (tier === 2 && (mem ?? 0) >= 6 && (cores ?? 0) >= 6) return 'high';
  return 'standard';
}

/** Probe the device (memory, cores, pointer, screen, GPU string) and choose a preset. */
export function autoQuality(): QualityId {
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  let gpu: string | undefined; let webgl2 = true;
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl2') ?? null) as WebGL2RenderingContext | null;
    webgl2 = !!gl;
    const ctx = gl ?? (c.getContext('webgl') as WebGLRenderingContext | null);
    const ext = ctx?.getExtension('WEBGL_debug_renderer_info');
    if (ctx && ext) gpu = String(ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL));
    else if (ctx) gpu = String(ctx.getParameter(ctx.RENDERER));
    ctx?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* no GL at all → the renderer will fail later anyway */ }
  return chooseQuality({
    memoryGB: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    cores: typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0 ? nav.hardwareConcurrency : undefined,
    coarsePointer: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches,
    pixels: screen.width * screen.height * Math.min(devicePixelRatio || 1, 3),
    gpu, webgl2,
  });
}

export function clockLabel(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = Math.floor(m % 60);
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}
export function cashLabel(n: number): string { return '₦' + Math.round(n).toLocaleString('en-NG'); }
export { DEFAULT_APPEARANCE };
