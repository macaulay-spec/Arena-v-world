// @vitest-environment happy-dom
/** Touch/mouse/keyboard input: stick claiming, release on every pointer end path, pinch zoom, key edges. */
import { describe, it, expect, beforeEach } from 'vitest';
import { Input, STICK_RADIUS } from '../src/game/input';

function dom() {
  document.body.innerHTML = `
    <canvas id="view" style="width:800px;height:400px"></canvas>
    <div id="hud"><div id="touch">
      <div id="stick"><div id="knob"></div></div>
      <button id="btn-pause"></button><button id="btn-camera"></button><button id="btn-interact"></button><button id="btn-jump"></button><button id="btn-run"></button>
    </div></div>`;
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  const stick = document.getElementById('stick') as HTMLElement;
  // happy-dom has no layout: give the elements fixed rectangles
  (canvas as any).getBoundingClientRect = () => ({ left: 0, top: 0, right: 800, bottom: 400, width: 800, height: 400, x: 0, y: 0, toJSON() {} });
  (stick as any).getBoundingClientRect = () => ({ left: 86, top: 244, right: 214, bottom: 372, width: 128, height: 128, x: 86, y: 244, toJSON() {} });
  return { canvas, stick };
}
function ptr(target: EventTarget, type: string, id: number, x: number, y: number, pointerType = 'touch', extra: PointerEventInit = {}) {
  const e = new PointerEvent(type, { pointerId: id, clientX: x, clientY: y, pointerType, isPrimary: id === 1, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, ...extra });
  target.dispatchEvent(e); return e;
}
let canvas: HTMLCanvasElement, stick: HTMLElement, input: Input;
const $ = (id: string) => document.getElementById(id) as HTMLElement;
beforeEach(() => { ({ canvas, stick } = dom()); input = new Input(canvas, { stick, knob: $('knob'), buttons: { jump: $('btn-jump'), run: $('btn-run'), interact: $('btn-interact'), camera: $('btn-camera'), pause: $('btn-pause') } }, { touch: true }); });

describe('virtual stick', () => {
  it('a touch starting on the stick drives moveX/moveY relative to the stick centre and clamps to the ring', () => {
    ptr(stick, 'pointerdown', 1, 150, 308);          // stick centre
    ptr(window, 'pointermove', 1, 150 + STICK_RADIUS / 2, 308);
    let s = input.poll(); expect(s.moveX).toBeCloseTo(0.5, 2); expect(s.moveY).toBeCloseTo(0, 2);
    ptr(window, 'pointermove', 1, 150, 308 - 500);   // far up → clamped
    s = input.poll(); expect(s.moveY).toBeCloseTo(1, 3); expect(Math.hypot(s.moveX, s.moveY)).toBeLessThanOrEqual(1 + 1e-6);
    expect(stick.classList.contains('on')).toBe(true);
  });
  it('a touch in the left part of the canvas becomes a floating stick anchored at the touch point', () => {
    ptr(canvas, 'pointerdown', 1, 300, 200);
    expect(input.active.stick).toBe(true);
    ptr(window, 'pointermove', 1, 300, 200 - STICK_RADIUS);
    const s = input.poll(); expect(s.moveY).toBeCloseTo(1, 3); expect(s.moveX).toBeCloseTo(0, 3);
    expect(s.lookDX).toBe(0); // a stick touch never orbits the camera
  });
  it('a touch on the right side orbits the camera and never moves the player', () => {
    ptr(canvas, 'pointerdown', 1, 600, 200);
    expect(input.active.stick).toBe(false);
    ptr(window, 'pointermove', 1, 640, 210);
    const s = input.poll(); expect(s.moveX).toBe(0); expect(s.moveY).toBe(0);
    expect(s.lookDX).toBeGreaterThan(0); expect(s.lookDY).toBeGreaterThan(0);
    expect(input.poll().lookDX).toBe(0); // deltas are consumed per poll
  });
  it('releases on pointerup, pointercancel and lostpointercapture — no stuck movement', () => {
    for (const end of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      ptr(stick, 'pointerdown', 1, 150, 308); ptr(window, 'pointermove', 1, 190, 308);
      expect(input.poll().moveX).toBeGreaterThan(0.5);
      ptr(end === 'lostpointercapture' ? stick : window, end, 1, 190, 308);
      const s = input.poll(); expect(s.moveX, end).toBe(0); expect(s.moveY, end).toBe(0);
      expect(input.active.stick, end).toBe(false); expect(stick.classList.contains('on')).toBe(false);
    }
  });
  it('only the claiming pointer steers the stick; a second finger on the right orbits at the same time', () => {
    ptr(stick, 'pointerdown', 1, 150, 308); ptr(window, 'pointermove', 1, 150, 308 - STICK_RADIUS);
    ptr(canvas, 'pointerdown', 2, 600, 200); ptr(window, 'pointermove', 2, 650, 200);
    const s = input.poll(); expect(s.moveY).toBeCloseTo(1, 3); expect(s.lookDX).toBeGreaterThan(0);
    ptr(window, 'pointerup', 2, 650, 200);      // lifting the look finger keeps the stick
    expect(input.poll().moveY).toBeCloseTo(1, 3);
    ptr(window, 'pointerup', 1, 150, 200);
    expect(input.poll().moveY).toBe(0);
  });
  it('a second finger landing on the stick does not steal it from the first', () => {
    ptr(stick, 'pointerdown', 1, 150, 308); ptr(window, 'pointermove', 1, 150 + STICK_RADIUS, 308);
    ptr(stick, 'pointerdown', 2, 150, 308);
    ptr(window, 'pointermove', 2, 150, 308 + STICK_RADIUS);
    const s = input.poll(); expect(s.moveX).toBeCloseTo(1, 3); expect(s.moveY).toBeCloseTo(0, 3);
  });
  it('pinching with two look fingers zooms', () => {
    ptr(canvas, 'pointerdown', 1, 500, 200); ptr(canvas, 'pointerdown', 2, 700, 200);
    ptr(window, 'pointermove', 1, 550, 200); ptr(window, 'pointermove', 2, 650, 200); // fingers closer → zoom out
    const s = input.poll(); expect(s.zoom).toBeLessThan(0); expect(s.lookDX).toBe(0);
  });
  it('clear() and window blur drop everything held', () => {
    ptr(stick, 'pointerdown', 1, 150, 308); ptr(window, 'pointermove', 1, 190, 308);
    window.dispatchEvent(new Event('blur'));
    const s = input.poll(); expect(s.moveX).toBe(0); expect(input.active.pointers).toBe(0);
    ptr(stick, 'pointerdown', 1, 150, 308); ptr(window, 'pointermove', 1, 190, 308);
    input.clear(); expect(input.poll().moveX).toBe(0);
    ptr(window, 'pointermove', 1, 210, 308); // moves from a forgotten pointer are ignored
    expect(input.poll().moveX).toBe(0);
  });
});

describe('keyboard', () => {
  const key = (type: string, code: string, repeat = false) => window.dispatchEvent(new KeyboardEvent(type, { code, repeat, bubbles: true, cancelable: true }));
  it('WASD and arrows move, shift runs, and edge actions fire once per press (auto-repeat ignored)', () => {
    key('keydown', 'KeyW'); key('keydown', 'KeyD'); key('keydown', 'ShiftLeft');
    let s = input.poll(); expect(s.moveY).toBeCloseTo(Math.SQRT1_2, 6); expect(s.moveX).toBeCloseTo(Math.SQRT1_2, 6); expect(s.moveMag).toBe(1); expect(s.run).toBe(true);
    key('keyup', 'KeyW'); key('keyup', 'KeyD'); key('keyup', 'ShiftLeft'); key('keydown', 'ArrowLeft');
    s = input.poll(); expect(s.moveX).toBe(-1); expect(s.moveY).toBe(0); expect(s.run).toBe(false);
    key('keydown', 'Space'); key('keydown', 'Space', true); key('keydown', 'Space', true);
    s = input.poll(); expect(s.jumpPressed).toBe(true);
    s = input.poll(); expect(s.jumpPressed).toBe(false);
    key('keydown', 'KeyE'); key('keydown', 'Escape');
    s = input.poll(); expect(s.interactPressed).toBe(true); expect(s.pausePressed).toBe(true);
  });
  it('disabled input reports nothing but keeps the key state consistent on re-enable', () => {
    key('keydown', 'KeyW'); input.enabled = false; input.clear();
    expect(input.poll().moveY).toBe(0);
    input.enabled = true; expect(input.poll().moveY).toBe(0); // the key was dropped by clear(); a fresh press works
    key('keydown', 'KeyW'); expect(input.poll().moveY).toBe(1);
  });
});

describe('buttons', () => {
  it('on-screen buttons produce one-frame edges and the run button toggles', () => {
    const b = (id: string, type: string) => ptr(document.getElementById(id)!, type, 9, 0, 0);
    b('btn-jump', 'pointerdown'); b('btn-interact', 'pointerdown'); b('btn-camera', 'pointerdown'); b('btn-pause', 'pointerdown'); b('btn-run', 'pointerdown');
    let s = input.poll(); expect(s.jumpPressed && s.interactPressed && s.cameraPressed && s.pausePressed && s.run).toBe(true);
    s = input.poll(); expect(s.jumpPressed || s.interactPressed || s.cameraPressed || s.pausePressed).toBe(false); expect(s.run).toBe(true);
    b('btn-run', 'pointerdown'); expect(input.poll().run).toBe(false);
  });
});
