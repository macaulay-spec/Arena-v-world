/** Player controller + appearance logic (pure parts of src/game/player.ts). */
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PlayerController, JUMP_SPEED, GRAVITY, normalizeAppearance, morphInfluences, heightScale, DEFAULT_APPEARANCE, FACE_KEYS, type KitInfo, type AvatarLike,
} from '../src/game/player';
import type { InputState } from '../src/game/input';
import type { CollisionWorld } from '../src/game/collision';

const idle = (): InputState => ({ moveX: 0, moveY: 0, moveMag: 0, lookDX: 0, lookDY: 0, zoom: 0, run: false, jumpPressed: false, interactPressed: false, cameraPressed: false, pausePressed: false, touch: true });
/** stick deflection helper: sets the vector and its magnitude */
const stick = (inp: InputState, x: number, y: number) => { inp.moveX = x; inp.moveY = y; inp.moveMag = Math.min(1, Math.hypot(x, y)); return inp; };
/** flat ground at y = 0, nothing to collide with */
const flat = { resolve: (x: number, z: number, _y: number, _r: number, _h: number, out: [number, number]) => { out[0] = x; out[1] = z; }, groundAt: () => 0 } as unknown as CollisionWorld;
class FakeAvatar implements AvatarLike {
  root = new THREE.Group(); clip = '';
  play(name: string) { this.clip = name; }
  update() {}
}
const make = () => { const av = new FakeAvatar(); const c = new PlayerController(av, flat); c.teleport(0, 0, 0, 0); return { c, av }; };

describe('PlayerController.inputDirection', () => {
  it('stick up moves away from the camera (camera forward), right moves right', () => {
    // camera yaw π ⇒ camera sits south of the player looking north (−z); forward = (sin π, cos π)... in world terms −z
    const [fx, fz] = PlayerController.inputDirection(0, 1, Math.PI);
    expect(fx).toBeCloseTo(0, 6); expect(fz).toBeCloseTo(1, 6);           // camera yaw π looks along −(sin π, cos π) = (0, +1)
    const [rx, rz] = PlayerController.inputDirection(1, 0, Math.PI);
    expect(rx).toBeCloseTo(-1, 6); expect(rz).toBeCloseTo(0, 6);
    const [bx, bz] = PlayerController.inputDirection(0, 1, 0);           // yaw 0 looks along −z
    expect(bx).toBeCloseTo(0, 6); expect(bz).toBeCloseTo(-1, 6);
  });
  it('normalises diagonals so they are not faster than straight input', () => {
    const [dx, dz] = PlayerController.inputDirection(1, 1, 0);
    expect(Math.hypot(dx, dz)).toBeCloseTo(1, 6);
  });
});

describe('PlayerController movement', () => {
  it('does not jitter: a held stick accelerates to walk speed and stays there', () => {
    const { c } = make(); const inp = stick(idle(), 0, 1);
    const speeds: number[] = [];
    for (let i = 0; i < 90; i++) { c.update(1 / 60, inp, 0); speeds.push(c.speed); }
    expect(speeds[89]).toBeCloseTo(c.walkSpeed, 3);
    // monotone non-decreasing approach, no oscillation once settled
    for (let i = 1; i < 90; i++) expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1] - 1e-6);
    expect(c.pos.z).toBeLessThan(-1.5); // actually travelled (camera yaw 0 ⇒ forward is −z)
    expect(c.yaw).toBeCloseTo(Math.PI, 3); // and faces the way it walks
  });
  it('keeps the release heading while decelerating instead of snapping to (0,0)', () => {
    const { c } = make(); const inp = stick(idle(), 1, 0);
    for (let i = 0; i < 60; i++) c.update(1 / 60, inp, 0);
    const yawMoving = c.yaw, xBefore = c.pos.x;
    const rel = idle();
    for (let i = 0; i < 30; i++) c.update(1 / 60, rel, 0);
    expect(c.pos.x).toBeGreaterThan(xBefore);          // slid on in the same direction
    expect(Math.abs(c.yaw - yawMoving)).toBeLessThan(1e-6); // and never turned
    expect(c.speed).toBe(0); expect(c.moving).toBe(false);
  });
  it('turns at a finite rate rather than snapping 180°', () => {
    const { c } = make(); const inp = stick(idle(), 0, 1);
    for (let i = 0; i < 30; i++) c.update(1 / 60, inp, 0);
    expect(Math.abs(c.yaw)).toBeCloseTo(Math.PI, 2); // facing −z
    const back = stick(idle(), 0, -1);
    c.update(1 / 60, back, 0);
    const dist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    expect(dist(c.yaw, 0)).toBeGreaterThan(Math.PI * 0.5); // still mostly facing the old way after one frame
    for (let i = 0; i < 60; i++) c.update(1 / 60, back, 0);
    expect(dist(c.yaw, 0)).toBeLessThan(0.05);
  });
});

describe('PlayerController jump', () => {
  it('leaves the ground on the first frame the button is pressed (no 0.3 s wind-up)', () => {
    const { c, av } = make(); const inp = idle(); inp.jumpPressed = true;
    c.update(1 / 60, inp, 0);
    expect(c.grounded).toBe(false);
    expect(c.vy).toBeCloseTo(JUMP_SPEED - GRAVITY / 60, 6);
    expect(c.pos.y).toBeGreaterThan(0);
    expect(av.clip).toBe('jump');
  });
  it('follows a ballistic arc and lands back on the ground', () => {
    const { c } = make(); const inp = idle(); inp.jumpPressed = true;
    c.update(1 / 60, inp, 0);
    let peak = 0; const dt = 1 / 120; let frames = 0;
    const coast = idle();
    while (!c.grounded && frames++ < 2000) { c.update(dt, coast, 0); peak = Math.max(peak, c.pos.y); }
    expect(c.grounded).toBe(true);
    expect(peak).toBeGreaterThan(0.75); expect(peak).toBeLessThan(1.0); // v²/2g ≈ 0.9 m
    expect(c.pos.y).toBe(0);
  });
  it('ignores a second press while airborne and keeps horizontal control in the air', () => {
    const { c } = make(); const inp = stick(idle(), 0, 1); inp.jumpPressed = true;
    c.update(1 / 60, inp, 0);
    const vy1 = c.vy;
    c.update(1 / 60, inp, 0); // still pressed
    expect(c.vy).toBeLessThan(vy1); // no re-impulse
    const z0 = c.pos.z; const coast = stick(idle(), 0, 1);
    for (let i = 0; i < 10; i++) c.update(1 / 60, coast, 0);
    expect(c.pos.z).toBeLessThan(z0); // moved forward in the air
  });
});

describe('appearance', () => {
  const kits: KitInfo[] = [
    { sex: 'm', file: 'player_m.gltf', height: 1.88, skin: ['#1', '#2', '#3'], hair: [{ id: 'low_cut', name: 'Low' }], outfits: [{ id: 'casual', name: 'Casual' }], morphs: ['shape_weight_hi'] },
    { sex: 'f', file: 'player_f.gltf', height: 1.66, skin: ['#1', '#2'], hair: [{ id: 'braids', name: 'Braids' }], outfits: [{ id: 'smart', name: 'Office' }] },
  ];
  it('normalises partial / corrupt saves into a valid appearance (old saves lack build/muscle/face)', () => {
    const a = normalizeAppearance({ sex: 'f', tone: 99, height: 7, hair: 'nope', outfit: 'nah', name: 'x'.repeat(40) } as never, kits);
    expect(a.sex).toBe('f'); expect(a.tone).toBe(1); expect(a.height).toBe(1); expect(a.hair).toBe('braids'); expect(a.outfit).toBe('smart');
    expect(a.name.length).toBe(14); expect(a.build).toBe(0.5); expect(a.muscle).toBe(0.5); expect(a.face).toEqual({});
    const b = normalizeAppearance({ face: { jaw: 5, bogus: 1 } as never, build: 'fat' as never } as never);
    expect(b.face.jaw).toBe(1); expect((b.face as Record<string, number>).bogus).toBeUndefined(); expect(b.build).toBe(0.5);
    expect(normalizeAppearance(undefined)).toEqual(expect.objectContaining({ sex: DEFAULT_APPEARANCE.sex, hair: DEFAULT_APPEARANCE.hair }));
  });
  it('maps sliders to paired morph influences, one side at a time', () => {
    const slim = morphInfluences({ ...DEFAULT_APPEARANCE, build: 0, face: {} });
    expect(slim.shape_weight_lo).toBeGreaterThan(0.99); expect(slim.shape_weight_hi).toBe(0);
    const heavy = morphInfluences({ ...DEFAULT_APPEARANCE, build: 1, face: { nose_width: -0.5, lips: 0.25 } });
    expect(heavy.shape_weight_lo).toBe(0); expect(heavy.shape_weight_hi).toBeGreaterThan(1);
    expect(heavy.face_nose_width_neg).toBeCloseTo(0.5); expect(heavy.face_nose_width_pos).toBe(0);
    expect(heavy.face_lips_pos).toBeCloseTo(0.25);
    for (const k of FACE_KEYS) { expect(heavy).toHaveProperty(`face_${k}_neg`); expect(heavy).toHaveProperty(`face_${k}_pos`); }
  });
  it('height slider is a modest ±6 % scale', () => {
    expect(heightScale(0.5)).toBeCloseTo(1); expect(heightScale(0)).toBeCloseTo(0.94); expect(heightScale(1)).toBeCloseTo(1.06);
  });
});
