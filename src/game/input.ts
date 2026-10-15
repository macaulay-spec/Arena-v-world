/**
 * Game input: virtual joystick (the visible stick, or anywhere on the left part of the screen) +
 * camera drag (right part) + on-screen buttons for touch; WASD/arrows + mouse drag + Shift/Space/E
 * for keyboards. Produces one frame state consumed by the player/camera controllers.
 *
 * Pointer handling is id-based: every pointer is claimed exactly once (stick, look, or ignored)
 * on `pointerdown` and released on `pointerup` / `pointercancel` / `lostpointercapture`, so the
 * same touch is never processed by two handlers and a lost touch can never leave the player moving.
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

export interface InputUi { stick: HTMLElement; knob: HTMLElement; buttons: Record<'jump' | 'run' | 'interact' | 'camera' | 'pause', HTMLElement | null> }

/** radius (px) of full stick deflection */
export const STICK_RADIUS = 56;
/** fraction of the viewport width that acts as the joystick area for touches outside the visible stick */
export const STICK_ZONE = 0.45;

export class Input {
  state: InputState = { moveX: 0, moveY: 0, moveMag: 0, run: false, jumpPressed: false, interactPressed: false, cameraPressed: false, pausePressed: false, lookDX: 0, lookDY: 0, zoom: 0, touch: false };
  enabled = true;
  /** camera look multiplier (settings) */
  sensitivity = 1; invertY = false;
  private keys = new Set<string>();
  private stickId: number | null = null; private stickOrigin = [0, 0]; private stickVec = [0, 0]; private stickFloating = false;
  private lookId: number | null = null; private lookLast = [0, 0];
  private mouseDown = false; private mouseLast = [0, 0];
  private pending = { jump: false, interact: false, camera: false, pause: false };
  private lookAcc = [0, 0]; private zoomAcc = 0;
  private runToggle = false;
  private pinch: { a: number; b: number; dist: number } | null = null;
  private pointers = new Map<number, [number, number]>();
  private stickEl: HTMLElement; private knobEl: HTMLElement; private runBtn: HTMLElement | null;
  readonly isTouch: boolean;

  constructor(private canvas: HTMLCanvasElement, ui: InputUi, opts: { touch?: boolean } = {}) {
    this.stickEl = ui.stick; this.knobEl = ui.knob; this.runBtn = ui.buttons.run;
    this.isTouch = opts.touch ?? (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
    this.state.touch = this.isTouch;
    // the visible stick is an overlay above the canvas: it must start the joystick itself
    this.stickEl.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { e.preventDefault(); e.stopPropagation(); this.beginStick(e, true); } });
    canvas.addEventListener('pointerdown', e => this.onDown(e));
    addEventListener('pointermove', e => this.onMove(e));
    addEventListener('pointerup', e => this.onUp(e));
    addEventListener('pointercancel', e => this.onUp(e));
    addEventListener('lostpointercapture', e => this.onUp(e as PointerEvent));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('wheel', e => { this.zoomAcc += Math.sign(e.deltaY) * -0.6; e.preventDefault(); }, { passive: false });
    addEventListener('keydown', e => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const k = e.code; const fresh = !this.keys.has(k); this.keys.add(k);
      if (k === 'Space') { if (fresh) this.pending.jump = true; e.preventDefault(); }
      if (!fresh) return; // key auto-repeat never re-triggers edge actions
      if (k === 'KeyE' || k === 'Enter') this.pending.interact = true;
      if (k === 'KeyV') this.pending.camera = true;
      if (k === 'Escape' || k === 'KeyP') this.pending.pause = true;
      if (k === 'CapsLock') this.setRun(!this.runToggle);
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    // focus loss / tab switch: no key-up or pointer-up will ever arrive for what is held now
    addEventListener('blur', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
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
    bind(ui.buttons.run, () => this.setRun(!this.runToggle));
  }

  private setRun(on: boolean) { this.runToggle = on; this.runBtn?.classList.toggle('active', on); }

  /** start the joystick for a pointer; `fromStick` = the touch landed on the visible stick (fixed origin at its centre) */
  private beginStick(e: PointerEvent, fromStick: boolean) {
    if (!this.enabled || this.stickId !== null) return;
    this.stickId = e.pointerId; this.stickVec = [0, 0]; this.stickFloating = !fromStick;
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (fromStick) {
      const r = this.stickEl.getBoundingClientRect();
      this.stickOrigin = r.width > 0 ? [r.left + r.width / 2, r.top + r.height / 2] : [e.clientX, e.clientY];
    } else {
      this.stickOrigin = [e.clientX, e.clientY];
      this.stickEl.style.left = `${e.clientX}px`; this.stickEl.style.top = `${e.clientY}px`;
    }
    this.stickEl.classList.add('on');
    try { (e.target as Element | null)?.setPointerCapture?.(e.pointerId); } catch { /* capture is a nicety only */ }
    this.moveStick(e.clientX, e.clientY);
  }
  private moveStick(x: number, y: number) {
    const R = STICK_RADIUS; let dx = x - this.stickOrigin[0], dy = y - this.stickOrigin[1];
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    this.stickVec = [dx / R, dy / R];
    this.knobEl.style.transform = `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px))`;
  }
  private endStick() {
    this.stickId = null; this.stickVec = [0, 0];
    this.stickEl.classList.remove('on'); this.knobEl.style.transform = 'translate(-50%,-50%)';
    if (this.stickFloating) { this.stickEl.style.left = ''; this.stickEl.style.top = ''; }
    this.stickFloating = false;
  }

  private onDown(e: PointerEvent) {
    if (!this.enabled) return;
    if (e.pointerType === 'mouse') { if (e.button === 0 || e.button === 2) { this.mouseDown = true; this.mouseLast = [e.clientX, e.clientY]; } return; }
    if (this.pointers.has(e.pointerId)) return; // already claimed (e.g. by the stick overlay)
    const w = typeof innerWidth === 'number' && innerWidth > 0 ? innerWidth : 1;
    if (e.clientX < w * STICK_ZONE && this.stickId === null) { this.beginStick(e, false); return; }
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (this.lookId === null) { this.lookId = e.pointerId; this.lookLast = [e.clientX, e.clientY]; }
    // two non-stick pointers → pinch zoom
    const others = [...this.pointers.keys()].filter(id => id !== this.stickId);
    if (others.length === 2 && !this.pinch) { const [a, b] = others; this.pinch = { a, b, dist: this.pointerDist(a, b) }; }
  }
  private pointerDist(a: number, b: number) { const pa = this.pointers.get(a), pb = this.pointers.get(b); return pa && pb ? Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) : 0; }
  private onMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') {
      if (!this.mouseDown || !this.enabled) return;
      this.lookAcc[0] += e.clientX - this.mouseLast[0]; this.lookAcc[1] += e.clientY - this.mouseLast[1]; this.mouseLast = [e.clientX, e.clientY];
      return;
    }
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (e.pointerId === this.stickId) { this.moveStick(e.clientX, e.clientY); return; }
    if (this.pinch) {
      const d = this.pointerDist(this.pinch.a, this.pinch.b);
      if (this.pinch.dist > 0 && d > 0) this.zoomAcc += (d - this.pinch.dist) / 80;
      this.pinch.dist = d; return; // while pinching, the look pointer does not rotate the camera
    }
    if (e.pointerId === this.lookId) {
      this.lookAcc[0] += e.clientX - this.lookLast[0]; this.lookAcc[1] += e.clientY - this.lookLast[1]; this.lookLast = [e.clientX, e.clientY];
    }
  }
  private onUp(e: PointerEvent) {
    if (e.pointerType === 'mouse') { this.mouseDown = false; return; }
    if (e.pointerId === this.stickId) this.endStick();
    if (e.pointerId === this.lookId) this.lookId = null;
    if (this.pinch && (e.pointerId === this.pinch.a || e.pointerId === this.pinch.b)) this.pinch = null;
    this.pointers.delete(e.pointerId);
  }

  /** collect the frame state; edge-triggered buttons are reset after the call */
  poll(): InputState {
    const s = this.state; const k = this.keys;
    let mx = 0, my = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1; if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1; if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (this.stickId !== null) { mx = this.stickVec[0]; my = -this.stickVec[1]; }
    const len = Math.hypot(mx, my); const mag = Math.min(1, len);
    if (len > 1) { mx /= len; my /= len; } // diagonals are never faster than straight lines
    s.moveX = mx; s.moveY = my; s.moveMag = mag;
    s.run = k.has('ShiftLeft') || k.has('ShiftRight') || this.runToggle;
    s.jumpPressed = this.pending.jump; s.interactPressed = this.pending.interact; s.cameraPressed = this.pending.camera; s.pausePressed = this.pending.pause;
    this.pending.jump = this.pending.interact = this.pending.camera = this.pending.pause = false;
    const sens = (this.isTouch ? 0.0065 : 0.0038) * this.sensitivity;
    s.lookDX = this.lookAcc[0] * sens; s.lookDY = this.lookAcc[1] * sens * (this.invertY ? -1 : 1); this.lookAcc[0] = this.lookAcc[1] = 0;
    s.zoom = this.zoomAcc; this.zoomAcc = 0;
    if (!this.enabled) { s.moveX = s.moveY = s.moveMag = 0; s.run = false; s.lookDX = s.lookDY = 0; s.zoom = 0; s.jumpPressed = s.interactPressed = s.cameraPressed = false; }
    return s;
  }

  /**
   * Drop every transient input: held keys, active pointers (stick / look / pinch / mouse drag),
   * accumulated look + zoom deltas, pending edge actions and the run toggle. Settings
   * (sensitivity, invert) are untouched. Call on pause, cutscenes, focus loss and screen changes.
   */
  clear() {
    this.keys.clear();
    this.endStick(); this.lookId = null; this.pinch = null; this.pointers.clear();
    this.mouseDown = false;
    this.lookAcc[0] = this.lookAcc[1] = 0; this.zoomAcc = 0;
    this.pending.jump = this.pending.interact = this.pending.camera = this.pending.pause = false;
    this.setRun(false);
    const s = this.state; s.moveX = s.moveY = s.moveMag = 0; s.run = false; s.lookDX = s.lookDY = 0; s.zoom = 0; s.jumpPressed = s.interactPressed = s.cameraPressed = s.pausePressed = false;
  }
  get running() { return this.runToggle; }
  /** what is currently held (diagnostics / tests) */
  get active() { return { stick: this.stickId !== null, look: this.lookId !== null, pinch: this.pinch !== null, pointers: this.pointers.size, keys: this.keys.size, mouse: this.mouseDown }; }
}
