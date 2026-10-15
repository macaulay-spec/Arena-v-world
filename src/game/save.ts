/** Save game + settings (localStorage; a cloud/multiplayer profile replaces this later). */
import { DEFAULT_APPEARANCE, type Appearance } from './player';

export type QualityId = 'lite' | 'standard' | 'high';
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

export function newSave(appearance: Appearance): SaveData {
  return { version: 1, appearance, cash: 25000, health: 100, minutes: 7 * 60 + 12, day: 1, stats: { steps: 0, sleeps: 0, meals: 0, doors: 0, talks: 0 }, created: Date.now(), played: 0, saved: 0 };
}
export function loadSave(): SaveData | null {
  try { const raw = localStorage.getItem(SAVE_KEY); if (!raw) return null; const s = JSON.parse(raw) as SaveData; if (s.version !== 1) return null; s.appearance = { ...DEFAULT_APPEARANCE, ...s.appearance }; return s; } catch { return null; }
}
export function writeSave(s: SaveData): void { s.saved = Date.now(); try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { console.warn('[save] failed', e); } }
export function deleteSave(): void { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }
export function loadSettings(): Settings { try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<Settings>) }; } catch { return { ...DEFAULT_SETTINGS }; } }
export function writeSettings(s: Settings): void { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }

/** pick a preset for this device: memory, cores, pixel count and pointer type */
export function autoQuality(): QualityId {
  const nav = navigator as Navigator & { deviceMemory?: number; hardwareConcurrency?: number };
  const mem = nav.deviceMemory ?? 4, cores = nav.hardwareConcurrency ?? 4;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const px = screen.width * screen.height * Math.min(devicePixelRatio, 3);
  if (!coarse && cores >= 8) return 'high';
  if (mem <= 3 || cores <= 4 || px > 3.2e6 && mem < 6) return 'lite';
  if (mem >= 8 && cores >= 8) return 'high';
  return 'standard';
}

export function clockLabel(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440; const h = Math.floor(m / 60), mm = Math.floor(m % 60);
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}
export function cashLabel(n: number): string { return '₦' + Math.round(n).toLocaleString('en-NG'); }
