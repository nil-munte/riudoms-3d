// Keyboard, mouse (pointer lock) and touch input.

export class Input {
  keys = new Set<string>();
  pressed = new Set<string>(); // keys pressed this frame
  mouseDX = 0;
  mouseDY = 0;
  wheel = 0;
  locked = false;
  touch = false;
  joyX = 0; // -1..1 (right +)
  joyY = 0; // -1..1 (forward +)
  touchRun = false;
  private camTouchId: number | null = null;
  private camLast = { x: 0, y: 0 };
  onEscape: () => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      this.keys.add(k);
      this.pressed.add(k);
      if (k === 'Escape' || k === 'KeyP') this.onEscape();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (!this.touch && !this.locked) {
        // not allowed inside some iframes: the mouse-drag fallback keeps working
        try { (canvas.requestPointerLock?.() as any)?.catch?.(() => {}); } catch { /* ignore */ }
      }
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      // leaving pointer lock with Esc opens the menu (the Esc keydown is swallowed by the browser)
      if (was && !this.locked && !this.suppressUnlockMenu) this.onEscape();
      this.suppressUnlockMenu = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; }
    });
    // drag with the mouse also rotates the camera when not locked
    let dragging = false, lx = 0, ly = 0;
    canvas.addEventListener('mousedown', (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
    window.addEventListener('mouseup', () => (dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (dragging && !this.locked) { this.mouseDX += e.clientX - lx; this.mouseDY += e.clientY - ly; lx = e.clientX; ly = e.clientY; }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    this.setupTouch();
  }

  suppressUnlockMenu = false;

  releasePointer() {
    if (this.locked) { this.suppressUnlockMenu = true; document.exitPointerLock?.(); }
  }

  private setupTouch() {
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const joy = document.getElementById('joy')!;
    const knob = document.getElementById('joy-knob')!;
    const run = document.getElementById('t-run')!;
    const eb = document.getElementById('t-e')!;
    if (isTouch && matchMedia('(pointer: coarse)').matches) {
      this.touch = true;
      document.getElementById('touch')!.classList.remove('hidden');
    }
    let joyId: number | null = null;
    const joyMove = (t: Touch) => {
      const r = joy.getBoundingClientRect();
      let dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
      let dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.joyX = dx; this.joyY = -dy;
      knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
    };
    joy.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; joyId = t.identifier; joyMove(t); e.preventDefault(); }, { passive: false });
    joy.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === joyId) joyMove(t);
      e.preventDefault();
    }, { passive: false });
    const joyEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === joyId) {
        joyId = null; this.joyX = this.joyY = 0; knob.style.transform = '';
      }
    };
    joy.addEventListener('touchend', joyEnd);
    joy.addEventListener('touchcancel', joyEnd);
    run.addEventListener('touchstart', (e) => { this.touchRun = !this.touchRun; run.style.background = this.touchRun ? 'rgba(184,88,47,.8)' : ''; e.preventDefault(); }, { passive: false });
    eb.addEventListener('touchstart', (e) => { this.pressed.add('KeyE'); e.preventDefault(); }, { passive: false });
    // camera: drag anywhere else on the canvas; pinch to zoom
    let pinch = 0;
    this.canvas.addEventListener('touchstart', (e) => {
      this.touch = true;
      document.getElementById('touch')!.classList.remove('hidden');
      if (e.touches.length === 2) { pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
      const t = e.changedTouches[0];
      if (this.camTouchId === null) { this.camTouchId = t.identifier; this.camLast = { x: t.clientX, y: t.clientY }; }
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinch) this.wheel += (pinch - d) * 0.03;
        pinch = d;
      }
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.camTouchId) {
        this.mouseDX += (t.clientX - this.camLast.x) * 1.6;
        this.mouseDY += (t.clientY - this.camLast.y) * 1.6;
        this.camLast = { x: t.clientX, y: t.clientY };
      }
      e.preventDefault();
    }, { passive: false });
    const camEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) if (t.identifier === this.camTouchId) this.camTouchId = null;
      if (e.touches.length < 2) pinch = 0;
    };
    this.canvas.addEventListener('touchend', camEnd);
    this.canvas.addEventListener('touchcancel', camEnd);
  }

  /** Movement axes combining keyboard and joystick: x = right, y = forward. */
  axes() {
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    x += this.joyX; y += this.joyY;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }

  get run() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touchRun; }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
  }
}
