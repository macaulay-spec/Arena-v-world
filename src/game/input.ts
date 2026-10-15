/**
 * Game input: virtual joystick (left half of the screen) + camera drag (right half) + on-screen
 * buttons for touch; WASD/arrows + mouse drag + Shift/Space/E for keyboards. Produces one frame
 * state consumed by the player/camera controllers.
 */
export interface InputState {
  /** movement vector in screen space: x right, y forward (0..1 magnitude) */
  moveX: number; moveY: number; moveMag: number;
  run: boolean;
  jumpPressed: boolean;
  interactPressed: boolean;
  cameraPressed: boolean;
  pausePressed: boolean;
  /** camera look delta this frame (radians) */
  lookDX: number; lookDY: number;
  /** pinch / wheel zoom delta (positive = closer) */
  zoom: number;
  touch: boolean;
}

export class Input {
  state: InputState = { moveX: 0, moveY: 0, moveMag: 0, run: false, jumpPressed: false, interactPressed: false, cameraPressed: false, pausePressed: false, lookDX: 0, lookDY: 0, zoom: 0, touch: false };
  enabled = true;
  private keys = new Set<string>();
  private stickId: number | null = null; private stickOrigin = [0, 0]; private stickVec = [0, 0];
  private lookId: number | null = null; private lookLast = [0, 0];
  private mouseDown = false; private mouseLast = [0, 0];
  private pending = { jump: false, interact: false, camera: false, pause: false };
  private lookAcc = [0, 0]; private zoomAcc = 0;
  private runToggle = false;
  private pinchDist = 0;
  private stickEl: HTMLElement; private knobEl: HTMLElement;
  readonly isTouch = matchMedia('(pointer: coarse)').matches;

  constructor(private canvas: HTMLCanvasElement, ui: { stick: HTMLElement; knob: HTMLElement; buttons: Record<'jump' | 'run' | 'interact' | 'camera' | 'pause', HTMLElement | null> }) {
    this.stickEl = ui.stick; this.knobEl = ui.knob;
    this.state.touch = this.isTouch;
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    addEventListener('pointermove', e => this.onMove(e));
    addEventListener('pointerup', e => this.onUp(e));
    addEventListener('pointercancel', e => this.onUp(e));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.zoomAcc += Math.sign(e.deltaY) * -0.6; e.preventDefault(); }, { passive: false });
    addEventListener('keydown', e => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.code; this.keys.add(k);
      if (k === 'Space') { this.pending.jump = true; e.preventDefault(); }
      if (k === 'KeyE' || k === 'Enter') this.pending.interact = true;
      if (k === 'KeyV') this.pending.camera = true;
      if (k === 'Escape' || k === 'KeyP') this.pending.pause = true;
      if (k === 'CapsLock') this.runToggle = !this.runToggle;
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    const bind = (el: HTMLElement | null, down: () => void, up?: () => void) => {
      if (!el) return;
      el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); down(); });
      const release = (e: Event) => { e.preventDefault(); el.classList.remove('down'); up?.(); };
      el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release); el.addEventListener('pointerleave', e => { if (el.classList.contains('down')) release(e); });
    };
    bind(ui.buttons.jump, () => { this.pending.jump = true; });
    bind(ui.buttons.interact, () => { this.pending.interact = true; });
    bind(ui.buttons.camera, () => { this.pending.camera = true; });
    bind(ui.buttons.pause, () => { this.pending.pause = true; });
    bind(ui.buttons.run, () => { this.runToggle = !this.runToggle; ui.buttons.run?.classList.toggle('active', this.runToggle); });
  }

  private onDown(e: PointerEvent) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') { if (e.button === 0 || e.button === 2) { this.mouseDown = true; this.mouseLast = [e.clientX, e.clientY]; } return; }
    const leftHalf = e.clientX < innerWidth * 0.45;
    if (leftHalf && this.stickId === null) {
      this.stickId = e.pointerId; this.stickOrigin = [e.clientX, e.clientY]; this.stickVec = [0, 0];
      this.stickEl.style.left = `${e.clientX}px`; this.stickEl.style.top = `${e.clientY}px`; this.stickEl.classList.add('on'); this.knobEl.style.transform = 'translate(-50%,-50%)';
    } else if (this.lookId === null) {
      this.lookId = e.pointerId; this.lookLast = [e.clientX, e.clientY];
    }
  }
  private onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (!this.mouseDown) return;
      this.lookAcc[0] += e.clientX - this.mouseLast[0]; this.lookAcc[1] += e.clientY - this.mouseLast[1]; this.mouseLast = [e.clientX, e.clientY];
      return;
    }
    if (e.pointerId === this.stickId) {
      const R = 56; let dx = e.clientX - this.stickOrigin[0], dy = e.clientY - this.stickOrigin[1];
      const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
      this.stickVec = [dx / R, dy / R];
      this.knobEl.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookId) {
      this.lookAcc[0] += e.clientX - this.lookLast[0]; this.lookAcc[1] += e.clientY - this.lookLast[1]; this.lookLast = [e.clientX, e.clientY];
    }
  }
  private onUp(e: PointerEvent) {
    if (e.pointerType === 'mouse') { this.mouseDown = false; return; }
    if (e.pointerId === this.stickId) { this.stickId = null; this.stickVec = [0, 0]; this.stickEl.classList.remove('on'); }
    if (e.pointerId === this.lookId) this.lookId = null;
  }

  /** collect the frame state; edge-triggered buttons are reset after the call */
  poll(): InputState {
    const s = this.state; const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1; if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1; if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (this.stickId !== null) { mx = this.stickVec[0]; my = -this.stickVec[1]; }
    const mag = Math.min(1, Math.hypot(mx, my));
    if (mag > 0) { mx /= Math.max(1, Math.hypot(mx, my)); my /= Math.max(1, Math.hypot(mx, my)); }
    s.moveX = mx; s.moveY = my; s.moveMag = mag;
    s.run = k.has('ShiftLeft') || k.has('ShiftRight') || this.runToggle;
    s.jumpPressed = this.pending.jump; s.interactPressed = this.pending.interact; s.cameraPressed = this.pending.camera; s.pausePressed = this.pending.pause;
    this.pending.jump = this.pending.interact = this.pending.camera = this.pending.pause = false;
    const sens = this.isTouch ? 0.0065 : 0.0038;
    s.lookDX = this.lookAcc[0] * sens; s.lookDY = this.lookAcc[1] * sens; this.lookAcc[0] = this.lookAcc[1] = 0;
    s.zoom = this.zoomAcc; this.zoomAcc = 0;
    if (!this.enabled) { s.moveX = s.moveY = s.moveMag = 0; s.lookDX = s.lookDY = 0; s.jumpPressed = s.interactPressed = false; }
    return s;
  }
  clear() { this.keys.clear(); this.stickId = null; this.lookId = null; this.stickVec = [0, 0]; this.stickEl.classList.remove('on'); this.pending.jump = this.pending.interact = this.pending.camera = false; }
  get running() { return this.runToggle; }
}
