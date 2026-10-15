/** Save/settings validation and device-based quality selection. */
import { describe, it, expect } from 'vitest';
import { sanitizeSettings, sanitizeSave, chooseQuality, gpuTier, DEFAULT_SETTINGS } from '../src/game/save';

describe('sanitizeSettings', () => {
  it('rejects unknown quality presets and clamps numbers', () => {
    expect(sanitizeSettings({ quality: 'ultra', sensitivity: 50, invertY: 'yes', showFps: 1 })).toEqual({ quality: 'auto', sensitivity: 3, invertY: false, showFps: false, sound: true });
    expect(sanitizeSettings({ quality: 'lite', sensitivity: NaN })).toMatchObject({ quality: 'lite', sensitivity: 1 });
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });
});

describe('sanitizeSave', () => {
  it('returns null for non-saves and repairs partial ones', () => {
    expect(sanitizeSave(null)).toBeNull(); expect(sanitizeSave({ version: 2 })).toBeNull(); expect(sanitizeSave('x')).toBeNull();
    const s = sanitizeSave({ version: 1, cash: -5, health: 1e9, minutes: 'noon', day: 0, pos: [1, 2, 3], stats: { steps: 'many' }, appearance: { sex: 'f' } })!;
    expect(s.cash).toBe(0); expect(s.health).toBe(100); expect(s.minutes).toBe(7 * 60 + 12); expect(s.day).toBe(1);
    expect(s.pos).toBeUndefined(); expect(s.stats.steps).toBe(0); expect(s.appearance.sex).toBe('f'); expect(s.appearance.build).toBe(0.5);
    const ok = sanitizeSave({ version: 1, pos: [1, 2, 3, 4] })!; expect(ok.pos).toEqual([1, 2, 3, 4]);
  });
});

describe('quality auto-select', () => {
  it('treats unknown phones conservatively', () => {
    // nothing known at all (e.g. iOS Safari: no deviceMemory, masked renderer)
    expect(chooseQuality({ coarsePointer: true, pixels: 2e6, webgl2: true })).toBe('lite');
    // unknown memory but a strong GPU string → standard, not high
    expect(chooseQuality({ coarsePointer: true, pixels: 2e6, webgl2: true, gpu: 'Apple A15 GPU', cores: 6 })).toBe('standard');
  });
  it('low memory or few cores → lite, flagship → high', () => {
    expect(chooseQuality({ coarsePointer: true, pixels: 2e6, webgl2: true, memoryGB: 2, cores: 8, gpu: 'Adreno (TM) 740' })).toBe('lite');
    expect(chooseQuality({ coarsePointer: true, pixels: 2e6, webgl2: true, memoryGB: 4, cores: 4, gpu: 'Mali-G52' })).toBe('lite');
    expect(chooseQuality({ coarsePointer: true, pixels: 2.6e6, webgl2: true, memoryGB: 8, cores: 8, gpu: 'Adreno (TM) 740' })).toBe('high');
    expect(chooseQuality({ coarsePointer: true, pixels: 2.6e6, webgl2: true, memoryGB: 6, cores: 8, gpu: 'Mali-G68' })).toBe('standard');
    expect(chooseQuality({ coarsePointer: true, pixels: 2.6e6, webgl2: false, memoryGB: 8, cores: 8 })).toBe('lite');
  });
  it('desktop software renderers stay on lite', () => {
    expect(chooseQuality({ coarsePointer: false, pixels: 2e6, webgl2: true, memoryGB: 8, cores: 8, gpu: 'Google SwiftShader' })).toBe('lite');
    expect(chooseQuality({ coarsePointer: false, pixels: 2e6, webgl2: true, memoryGB: 16, cores: 12, gpu: 'NVIDIA GeForce RTX 3060' })).toBe('high');
    expect(gpuTier('ANGLE (Qualcomm, Adreno (TM) 610, OpenGL ES 3.2)')).toBe(0);
    expect(gpuTier('Adreno (TM) 650')).toBe(2);
    expect(gpuTier('ANGLE (ARM, Mali-G78, OpenGL ES 3.2)')).toBe(2);
  });
});
