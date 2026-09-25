// Demo video director. Runs inside the game page (loaded with a dynamic import
// from the dev server), drives the real game — player, bicycle physics,
// camera, sky — with scripted input, draws the HUD and the explanatory
// overlays on a 1280x720 canvas and POSTs every frame to the dev server
// (tools/demo/vite-plugin.ts writes them to demo-out/).
// It also logs the events (footsteps, bike, bells, fountains, night) that
// tools/demo/audio.py turns into the ambient soundtrack.
//
//   const m = await import('/tools/demo/director.ts');
//   m.record();                        // full video
//   m.record({ dry: true });           // simulate only, report
//   m.record({ stills: [3, 20, 45] }); // a few frames to check
import * as THREE from 'three';
import { nightUniform } from '../../src/world/facade';

const W = 1280, H = 720, FPS = 30, DT = 1 / FPS;
const SENS = 0.0024; // ThirdPersonCamera mouse sensitivity
const ss = (t: number) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const clamp = THREE.MathUtils.clamp;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const V = (x: number, y: number, h: number) => new THREE.Vector3(x, h, -y);

type P2 = [number, number];
interface Sign { id: string; name: string; text: string; src?: string }
interface Caption { keys: string[]; text: string; sub?: string; t0: number; t1: number; mouse?: 'orbit' | 'wheel' }
interface Lower { title: string; sub: string; t0: number; t1: number }

// ---------------------------------------------------------------- path planning
/** A* over a 0.5 m occupancy grid built from the game collision, with a cost
 *  that keeps the path away from walls and (optionally) on the street network. */
function planPath(col: any, roads: any, s: P2, e: P2, rad: number, roadPref: boolean, margin = 35): P2[] {
  const C = 0.5;
  const x0 = Math.min(s[0], e[0]) - margin, y0 = Math.min(s[1], e[1]) - margin;
  const nx = Math.ceil((Math.max(s[0], e[0]) + margin - x0) / C), ny = Math.ceil((Math.max(s[1], e[1]) + margin - y0) / C);
  const N = nx * ny;
  const blocked = new Uint8Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (col.resolve(x0 + (i + 0.5) * C, y0 + (j + 0.5) * C, rad).hit) blocked[j * nx + i] = 1;
  }
  const chamfer = (seed: (k: number) => boolean) => {
    const d = new Float32Array(N).fill(1e9);
    for (let k = 0; k < N; k++) if (seed(k)) d[k] = 0;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = j * nx + i; let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + 1);
      if (j > 0) v = Math.min(v, d[k - nx] + 1);
      if (i > 0 && j > 0) v = Math.min(v, d[k - nx - 1] + 1.414);
      if (i < nx - 1 && j > 0) v = Math.min(v, d[k - nx + 1] + 1.414);
      d[k] = v;
    }
    for (let j = ny - 1; j >= 0; j--) for (let i = nx - 1; i >= 0; i--) {
      const k = j * nx + i; let v = d[k];
      if (i < nx - 1) v = Math.min(v, d[k + 1] + 1);
      if (j < ny - 1) v = Math.min(v, d[k + nx] + 1);
      if (i < nx - 1 && j < ny - 1) v = Math.min(v, d[k + nx + 1] + 1.414);
      if (i > 0 && j < ny - 1) v = Math.min(v, d[k + nx - 1] + 1.414);
      d[k] = v;
    }
    return d;
  };
  const wall = chamfer((k) => blocked[k] === 1);
  let road: Float32Array | null = null;
  if (roadPref) {
    const onRoad = new Uint8Array(N);
    for (const r of roads.roads) {
      if (['track', 'path', 'footway', 'steps'].includes(r.k)) continue;
      const p = r.p;
      for (let q = 0; q + 3 < p.length; q += 2) {
        const ax = p[q] / 10, ay = p[q + 1] / 10, bx = p[q + 2] / 10, by = p[q + 3] / 10;
        const L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 0.25);
        for (let t = 0; t <= n; t++) {
          const i = Math.floor((ax + (bx - ax) * t / n - x0) / C), j = Math.floor((ay + (by - ay) * t / n - y0) / C);
          if (i >= 0 && j >= 0 && i < nx && j < ny) onRoad[j * nx + i] = 1;
        }
      }
    }
    road = chamfer((k) => onRoad[k] === 1);
  }
  const cost = (k: number) => {
    const dw = wall[k] * C;
    let c = 1 + 4 * Math.max(0, 2.2 - dw) / 2.2;
    if (road) c += Math.min(6, Math.max(0, road[k] * C - 2) * 0.8);
    return c;
  };
  const idx = (p: P2) => clamp(Math.floor((p[1] - y0) / C), 0, ny - 1) * nx + clamp(Math.floor((p[0] - x0) / C), 0, nx - 1);
  const start = idx(s), goal = idx(e);
  const gS = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  // binary heap
  const heap: number[] = [], hk: number[] = [];
  const push = (k: number, f: number) => {
    heap.push(k); hk.push(f); let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; }
  };
  const pop = () => {
    const top = heap[0], lk = heap.pop()!, lf = hk.pop()!;
    if (heap.length) {
      heap[0] = lk; hk[0] = lf; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < heap.length && hk[l] < hk[m]) m = l;
        if (r < heap.length && hk[r] < hk[m]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; [hk[m], hk[i]] = [hk[i], hk[m]]; i = m;
      }
    }
    return top;
  };
  const gx = goal % nx, gy = Math.floor(goal / nx);
  const hfn = (k: number) => { const dx = Math.abs(k % nx - gx), dy = Math.abs(Math.floor(k / nx) - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  gS[start] = 0; push(start, hfn(start));
  const nb = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  while (heap.length) {
    const k = pop();
    if (k === goal) break;
    if (closed[k]) continue;
    closed[k] = 1;
    const i = k % nx, j = Math.floor(k / nx);
    for (const [di, dj, dl] of nb) {
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii;
      if (blocked[kk] && kk !== goal) continue;
      if (dl > 1 && (blocked[j * nx + ii] || blocked[jj * nx + i])) continue;
      const g = gS[k] + dl * (cost(k) + cost(kk)) / 2;
      if (g < gS[kk]) { gS[kk] = g; from[kk] = k; push(kk, g + hfn(kk)); }
    }
  }
  if (from[goal] < 0) throw new Error(`no path ${s} -> ${e}`);
  const raw: P2[] = [];
  for (let k = goal; k >= 0; k = from[k]) raw.push([x0 + (k % nx + 0.5) * C, y0 + (Math.floor(k / nx) + 0.5) * C]);
  raw.reverse();
  raw[0] = s; raw[raw.length - 1] = e;
  // resample every 0.5 m, then smooth with a moving average (only where it stays clear)
  const res: P2[] = [raw[0]];
  for (let q = 1; q < raw.length; q++) {
    const a = res[res.length - 1], b = raw[q];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L >= 0.5) res.push(b);
  }
  let out = res;
  for (let it = 0; it < 3; it++) {
    const w = 5;
    out = out.map((p, q) => {
      if (q < 2 || q > out.length - 3) return p;
      let sx = 0, sy = 0, n = 0;
      for (let d = -w; d <= w; d++) { const o = out[clamp(q + d, 0, out.length - 1)]; sx += o[0]; sy += o[1]; n++; }
      const c: P2 = [sx / n, sy / n];
      return col.resolve(c[0], c[1], rad * 0.9).hit ? p : c;
    });
  }
  return out;
}

class Follower {
  s: number[] = [0];
  i = 0;
  constructor(public path: P2[]) {
    for (let q = 1; q < path.length; q++) this.s.push(this.s[q - 1] + Math.hypot(path[q][0] - path[q - 1][0], path[q][1] - path[q - 1][1]));
  }
  get length() { return this.s[this.s.length - 1]; }
  at(d: number): P2 {
    d = clamp(d, 0, this.length);
    let q = this.i;
    while (q < this.path.length - 2 && this.s[q + 1] < d) q++;
    while (q > 0 && this.s[q] > d) q--;
    const t = (d - this.s[q]) / Math.max(1e-6, this.s[q + 1] - this.s[q]);
    const a = this.path[q], b = this.path[Math.min(q + 1, this.path.length - 1)];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }
  seek(d: number) { let q = 0; while (q < this.path.length - 2 && this.s[q + 1] < d) q++; this.i = q; }
  /** Progress along the path of the closest point to (x, y), searching forward. */
  progress(x: number, y: number) {
    let best = this.i, bd = Infinity;
    for (let q = this.i; q < Math.min(this.path.length, this.i + 40); q++) {
      const d = Math.hypot(this.path[q][0] - x, this.path[q][1] - y);
      if (d < bd) { bd = d; best = q; }
    }
    this.i = best;
    return this.s[best];
  }
  /** Max heading change per metre over the next `span` metres. */
  curvature(d: number, span: number) {
    const a = this.at(d), b = this.at(d + span / 2), c = this.at(d + span);
    const h1 = Math.atan2(b[0] - a[0], b[1] - a[1]), h2 = Math.atan2(c[0] - b[0], c[1] - b[1]);
    return Math.abs(wrap(h2 - h1)) / Math.max(1, span / 2);
  }
}

// ---------------------------------------------------------------- drawing helpers
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
}
function wrapText(c: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/), lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}
function keycap(c: CanvasRenderingContext2D, x: number, y: number, label: string, on: boolean, h = 34) {
  c.font = '700 16px "Segoe UI", system-ui, sans-serif';
  const w = Math.max(h, c.measureText(label).width + 20);
  const dy = on ? 3 : 0;
  c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, x, y + 4, w, h, 7); c.fill();
  c.fillStyle = on ? '#e2a64a' : '#f6efe2'; rr(c, x, y + dy, w, h, 7); c.fill();
  c.strokeStyle = on ? '#b8582f' : 'rgba(29,42,51,.25)'; c.lineWidth = 1.5; c.stroke();
  c.fillStyle = '#1d2a33'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(label, x + w / 2, y + dy + h / 2 + 1);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  return w;
}
function mouseIcon(c: CanvasRenderingContext2D, x: number, y: number, mode: 'orbit' | 'wheel', on: boolean, t: number) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#f6efe2'; c.strokeStyle = '#1d2a33'; c.lineWidth = 2;
  rr(c, 0, 0, 26, 38, 13); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(13, 0); c.lineTo(13, 14); c.stroke();
  c.fillStyle = mode === 'wheel' && on ? '#e2a64a' : '#1d2a33';
  rr(c, 10.5, 5, 5, 8, 2.5); c.fill();
  if (on) {
    c.strokeStyle = '#e2a64a'; c.lineWidth = 3; c.lineCap = 'round';
    if (mode === 'orbit') {
      const o = Math.sin(t * 6) * 3;
      for (const s of [-1, 1]) {
        const ax = 13 + s * (24 + o);
        c.beginPath(); c.moveTo(13 + s * 17, 19); c.lineTo(ax, 19); c.lineTo(ax - s * 5, 14); c.moveTo(ax, 19); c.lineTo(ax - s * 5, 24); c.stroke();
      }
    } else {
      const o = (t * 2) % 1;
      c.globalAlpha = 1 - o;
      c.beginPath(); c.arc(13, 9, 8 + o * 10, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      c.globalAlpha = 1;
    }
  }
  c.restore();
}

// ---------------------------------------------------------------- the recorder
export async function record(opt: { dry?: boolean; stills?: number[]; from?: number; to?: number } = {}) {
  const g = (window as any).__game, input = (window as any).__input;
  const { player, cam, scene, renderer, sky, buildings, terrain, hf, collision, streets, veg, landmarks, propsObj, minimap, bikes, reliefObj } = g;
  const status: any = { frame: 0, t: 0, shot: '', done: false, log: [] as string[], error: null, paths: {} as Record<string, P2[]>, trace: [] as number[][] };
  (window as any).__demo = status;
  const log = (s: string) => { status.log.push(`[${status.t.toFixed(1)}] ${s}`); };
  const [roads, lm] = await Promise.all([fetch('./data/roads.json').then((r) => r.json()), fetch('./data/landmarks.json').then((r) => r.json())]);
  const surface = (x: number, y: number): number => {
    const gr = hf.heightAt(x, y) + streets.walkOffset(x, y);
    const p = collision.platformHeight(x, y);
    return p !== null && p > gr - 0.3 ? Math.max(gr, p) : gr;
  };
  const plan = (...a: Parameters<typeof planPath>) => {
    try { const p = planPath(...a); status.paths[status.shot] = p; return p; }
    catch (e) { status.paths[status.shot + '-failed'] = [a[2], a[3]]; throw e; }
  };
  const freeSpot = (x: number, y: number, r0 = 0.6): P2 => {
    for (const r of [0, 1, 2, 3.5, 5, 7, 9, 12]) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (!collision.resolve(px, py, r0).hit) return [px, py];
    }
    return [x, y];
  };

  (window as any).__freeze = true;
  const prevRatio = renderer.getPixelRatio();
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  cam.camera.aspect = W / H; cam.camera.updateProjectionMatrix();
  sky.running = false;
  sky.hour = 11;
  minimap.big = false;

  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d')!;
  const mmCanvas = document.getElementById('minimap') as HTMLCanvasElement;

  // ---------------------------------------------------------- state
  const church = lm.models.church.frame;
  const h0 = hf.heightAt(0, 0);
  const tower = { x: church.x + church.ax * 3, y: church.y + church.ay * 3 };
  const fountains: P2[] = [lm.models.plazaFountain.pos, lm.models.damaOferent.pos];
  const events: any[] = [];
  const track: any[] = [];
  let t = 0, frameNo = 0;
  let hud = false, fade = 0, title = 0, endCard = 0;
  let captions: Caption[] = [], lowers: Lower[] = [];
  const keysOn = new Set<string>();
  let mouseOn = false;
  let menu: { a: number; cursor: P2; hot: number; click: number } | null = null;
  let signShown: Sign | null = null, signCand: Sign | null = null, signT = 0, signA = 0;
  let stepAcc = 0, lastPos: P2 = [player.x, player.y];
  let mode = 'aerial';
  let freeCam: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  let blend: { pos: THREE.Vector3; q: THREE.Quaternion; k: number } | null = null;
  let aerialFog = 0;

  const ev = (type: string, extra: any = {}) => events.push({ t: +t.toFixed(3), type, ...extra });
  const press = (code: string) => { input.pressed.add(code); keysOn.add(code); ev('key', { code }); };

  // ---------------------------------------------------------- one simulation step
  const worldUpdate = (fx: number, fy: number, fz: THREE.Vector3) => {
    const cp = cam.camera.position;
    terrain.update(cp.x, -cp.z);
    buildings.update(cp.x, -cp.z);
    streets.update(cp.x, -cp.z);
    veg.update(cam.camera);
    propsObj.update(fx, fy);
    reliefObj.update(fx, fy);
    landmarks.update();
    for (const b of bikes) b.root.visible = b.ridden || Math.hypot(b.x - fx, b.y - fy) < 160;
    void fz;
  };
  const nightExposure = () => { renderer.toneMappingExposure = Math.max(renderer.toneMappingExposure, 0.28 + 0.14 * nightUniform.value); };
  const gameStep = (dt: number) => {
    player.update(dt, input, cam.yaw);
    sky.update(dt, player.position);
    nightExposure();
    const p = player.position;
    cam.update(dt, input, p, player.bike ? 1.75 : 1.55, player.bike || player.speed > 0.5 ? player.heading : null, surface);
    if (blend) {
      const k = ss(blend.k);
      cam.camera.position.lerpVectors(blend.pos, cam.camera.position.clone(), k);
      cam.camera.quaternion.slerpQuaternions(blend.q, cam.camera.quaternion.clone(), k);
    }
    worldUpdate(player.x, player.y, p);
    minimap.draw(player.x, player.y, cam.yaw, player.heading);
    input.endFrame();
  };
  const freeStep = (dt: number) => {
    const f = freeCam!;
    sky.update(dt, f.look);
    nightExposure();
    if (aerialFog > 0) {
      sky.fog.near = THREE.MathUtils.lerp(sky.fog.near, 900, aerialFog);
      sky.fog.far = THREE.MathUtils.lerp(sky.fog.far, 7000, aerialFog);
    }
    cam.camera.position.copy(f.pos);
    cam.camera.lookAt(f.look);
    worldUpdate(-f.look.z * 0 + f.look.x, -f.look.z, f.look);
    player.character.updateWalk?.(dt, 0);
    input.endFrame();
  };

  // ---------------------------------------------------------- controllers
  let fol: Follower | null = null;
  const walkTo = (run: boolean, look = 2.0) => {
    const d = fol!.progress(player.x, player.y);
    const rem = fol!.length - d;
    if (rem < 0.45) { input.joyX = input.joyY = 0; input.keys.delete('ShiftLeft'); return true; }
    const [tx, ty] = fol!.at(d + look);
    const rel = wrap(Math.atan2(tx - player.x, ty - player.y) - cam.yaw);
    const m = rem < 1.5 ? 0.5 : 1;
    input.joyX = Math.sin(rel) * m; input.joyY = Math.cos(rel) * m;
    if (run && rem > 5) input.keys.add('ShiftLeft'); else input.keys.delete('ShiftLeft');
    return false;
  };
  const rideTo = (vmax: number, sprintOk: boolean) => {
    const b = player.bike;
    const d = fol!.progress(b.x, b.y);
    const rem = fol!.length - d;
    const v = b.speed;
    const Ld = Math.max(2.4, Math.abs(v) * 0.85);
    const [tx, ty] = fol!.at(d + Ld);
    const alpha = wrap(Math.atan2(tx - b.x, ty - b.y) - b.heading);
    const delta = Math.atan((2 * 1.06 * Math.sin(alpha)) / Ld);
    const maxSteer = THREE.MathUtils.lerp(0.55, 0.16, clamp(Math.abs(v) / 8, 0, 1));
    const steer = clamp(delta / maxSteer, -1, 1);
    const k = Math.max(fol!.curvature(d, 6), fol!.curvature(d + 4, 8));
    let vt = Math.min(vmax, Math.sqrt(2.8 / Math.max(k, 1e-3)));
    vt = Math.min(vt, Math.sqrt(2 * 2.2 * Math.max(0, rem - 1.2)));
    if (Math.abs(alpha) > 1.2) vt = Math.min(vt, 2.2);
    let thr = 0, brk = 0;
    if (vt > v + 0.15) thr = clamp((vt - v) / 1.2, 0.35, 1);
    else if (v > vt + 0.4) brk = clamp((v - vt) / 2.5, 0.1, 1);
    input.joyX = steer; input.joyY = thr - brk;
    if (sprintOk && vt > 7.2 && thr > 0) input.keys.add('ShiftLeft'); else input.keys.delete('ShiftLeft');
    return rem < 1.3 && v < 0.4;
  };
  const stopInput = () => { input.joyX = input.joyY = 0; input.keys.delete('ShiftLeft'); };

  // ---------------------------------------------------------- shots
  interface Shot { name: string; dur?: number; max?: number; init?: () => void; step: (lt: number) => boolean | void }
  const shots: Shot[] = [];

  // 1-2. aerial approach over the fields to the church square
  const A = (d: number, side: number, h: number): THREE.Vector3 => {
    // point on the facade axis (away from the church) + lateral offset
    const x = church.x - church.ax * d - church.ay * side, y = church.y - church.ay * d + church.ax * side;
    return V(x, y, h0 + h);
  };
  // the flight ends just above and behind the spot where the walk starts, so the
  // landing is a short vertical drop onto the open square (no trees in between)
  const cxs = -church.ay, cys = church.ax;
  const spawn: P2 = freeSpot(church.x - church.ax * 17 - cxs * 10, church.y - church.ay * 17 - cys * 10);
  const spawnHeading = Math.atan2(tower.x - spawn[0], tower.y - spawn[1]);
  const hs = surface(spawn[0], spawn[1]);
  const back = (d: number, h: number) => V(spawn[0] - Math.sin(spawnHeading) * d, spawn[1] - Math.cos(spawnHeading) * d, hs + h);
  const aPos = new THREE.CatmullRomCurve3([A(1250, -700, 420), A(950, -420, 330), A(640, -160, 240), A(380, 20, 160), A(190, 40, 95), back(60, 45), back(14, 17)]);
  const aLook = new THREE.CatmullRomCurve3([V(0, 40, h0 - 30), V(-10, 30, h0 - 10), V(-20, 25, h0), V(-28, 24, h0 + 6), V(-32, 25, h0 + 12), V(-32, 25, h0 + 12), V(tower.x, tower.y, h0 + 8)]);
  const AERIAL = 30;
  shots.push({
    name: 'aerial', dur: AERIAL,
    init: () => {
      mode = 'aerial'; hud = false;
      freeCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
      lowers = [
        { title: 'Relleu i ortofoto reals', sub: 'Model del terreny LiDAR de 1-2 m i ortofoto de 25 cm (ICGC)', t0: 7.5, t1: 13.5 },
        { title: '5.544 volums edificats', sub: 'Cadastre (INSPIRE) amb alçades i teulades mesurades amb LiDAR', t0: 14, t1: 20 },
        { title: '138.522 arbres', sub: 'Posicions LiDAR i espècies de la DUN 2025 · la resta, estimades', t0: 20.5, t1: 26 },
        { title: "Plaça de l'Església", sub: 'Sant Jaume Apòstol · campanar de 32,6 m sobre la plaça (LiDAR)', t0: 26.3, t1: 32.5 },
      ];
    },
    step: (lt) => {
      const u = lt / AERIAL;
      const e = u < 0.5 ? 0.5 * Math.pow(u * 2, 1.35) : 1 - 0.5 * Math.pow((1 - u) * 2, 2.1);
      freeCam!.pos.copy(aPos.getPointAt(e));
      freeCam!.look.copy(aLook.getPointAt(e));
      aerialFog = 1 - ss((u - 0.55) / 0.4);
      title = lt < 7 ? ss(lt / 1.2) * (1 - ss((lt - 5.6) / 1.2)) : 0;
      fade = 1 - ss(lt / 1.5);
    },
  });

  // 3. landing behind the player
  shots.push({
    name: 'landing', dur: 4,
    init: () => {
      mode = 'game'; aerialFog = 0;
      player.teleport(spawn[0], spawn[1], spawnHeading);
      cam.yaw = player.heading; cam.pitch = 0.16; cam.dist = 6.5;
      blend = { pos: cam.camera.position.clone(), q: cam.camera.quaternion.clone(), k: 0 };
    },
    step: (lt) => {
      if (blend) blend.k = lt / 3.6;
      hud = lt > 2.6;
      if (lt > 3.9) blend = null;
    },
  });

  // 4. look around with the mouse, zoom with the wheel
  let yaw0 = 0;
  shots.push({
    name: 'look', dur: 8.5,
    init: () => {
      blend = null; yaw0 = cam.yaw;
      captions = [
        { keys: [], mouse: 'orbit', text: 'Ratolí: girar la càmera', sub: 'Clica la pantalla per capturar el ratolí', t0: t + 0.3, t1: t + 5.6 },
        { keys: [], mouse: 'wheel', text: 'Roda: apropar o allunyar', t0: t + 5.8, t1: t + 8.5 },
      ];
      ev('bell', { n: 2, x: tower.x, y: tower.y });
    },
    step: (lt) => {
      if (lt < 5.2) {
        const want = yaw0 + Math.PI * 2 * ss((lt - 0.4) / 4.6);
        input.mouseDX = (want - cam.yaw) / SENS;
        const pw = 0.16 + 0.18 * Math.sin(Math.PI * ss((lt - 0.4) / 4.6));
        input.mouseDY = (pw - cam.pitch) / SENS * 0.3;
        mouseOn = lt > 0.4 && lt < 5.0;
      } else {
        mouseOn = false;
        const k = Math.floor((lt - 5.8) * FPS);
        if (k >= 0 && k < 40 && k % 5 === 0) input.wheel = 1;
        if (k >= 45 && k < 85 && k % 5 === 0) input.wheel = -1;
        mouseOn = k >= 0 && k < 85;
      }
    },
  });

  // 5. walk and run to the Dama Oferent fountain (Plaça Petita)
  let walkT0 = 0;
  shots.push({
    name: 'walk', max: 30,
    init: () => {
      const dama = lm.models.damaOferent.pos;
      const goal = freeSpot(dama[0] - 1.5, dama[1] + 5.2, 0.6);
      fol = new Follower(plan(collision, roads, [player.x, player.y], goal, 0.45, false));
      log(`walk path ${fol.length.toFixed(1)} m`);
      walkT0 = t;
      captions = [
        { keys: ['W', 'A', 'S', 'D'], text: 'Caminar', sub: 'o les fletxes del teclat · al mòbil, el joystick', t0: t + 0.2, t1: t + 7 },
      ];
    },
    step: (lt) => {
      const run = lt > 6.5;
      if (run && captions.length === 1) captions.push({ keys: ['Shift'], text: 'Córrer', sub: 'mantén premut mentre camines', t0: t, t1: t + 5.5 });
      const done = walkTo(run);
      keysOn.clear();
      if (Math.hypot(input.joyX, input.joyY) > 0.1) keysOn.add('W');
      if (input.joyX > 0.35) keysOn.add('D'); if (input.joyX < -0.35) keysOn.add('A');
      if (input.keys.has('ShiftLeft')) keysOn.add('Shift');
      if (done && !status.walkDone) { status.walkDone = t; log(`walk arrived after ${(t - walkT0).toFixed(1)} s`); }
      if (status.walkDone) {
        if (captions.length < 3) captions.push({ keys: [], text: 'Plafons amb la història de cada lloc', sub: 'textos verificats amb fonts (IPAC, riudoms.cat, Viquipèdia…)', t0: t + 0.4, t1: t + 5 });
        // turn the camera slowly towards the fountain
        const dama = lm.models.damaOferent.pos;
        const want = Math.atan2(dama[0] - player.x, dama[1] - player.y);
        input.mouseDX = wrap(want - cam.yaw) * 0.04 / SENS;
        return t - status.walkDone > 5.2;
      }
    },
  });

  // 6. mount a bicycle at the square and ride to Plaça de l'Om
  let bike: any = null, jumpAt = -1, jumped = false;
  shots.push({
    name: 'bike-approach', max: 8,
    init: () => {
      stopInput(); keysOn.clear();
      bike = bikes.reduce((a: any, b: any) => Math.hypot(b.x + 3.6, b.y - 4.6) < Math.hypot(a.x + 3.6, a.y - 4.6) ? b : a);
      // start a few metres away, walking to the bike
      const side = bike.heading + Math.PI / 2;
      const st = freeSpot(bike.x + Math.sin(side) * 4.5 - Math.sin(bike.heading) * 2, bike.y + Math.cos(side) * 4.5 - Math.cos(bike.heading) * 2);
      player.teleport(st[0], st[1], Math.atan2(bike.x - st[0], bike.y - st[1]));
      cam.yaw = player.heading + 0.5; cam.pitch = 0.2; cam.dist = 6;
      const goal = freeSpot(bike.x + Math.sin(side) * 1.1, bike.y + Math.cos(side) * 1.1, 0.35);
      fol = new Follower(plan(collision, roads, [player.x, player.y], goal, 0.35, false, 10));
      fade = 1;
      ev('whoosh');
    },
    step: (lt) => {
      fade = 1 - ss(lt / 0.5);
      const done = walkTo(false, 1.2);
      keysOn.clear(); if (!done) keysOn.add('W');
      if (player.nearBike && !captions.some((q) => q.text.startsWith('E'))) {
        captions = [{ keys: ['E'], text: 'E: pujar a la bicicleta', sub: 'hi ha bicicletes aparcades a les places', t0: t, t1: t + 4.5 }];
      }
      if (player.nearBike && lt > 2.2 && (done || lt > 3.5)) {
        stopInput();
        press('KeyE');
        ev('mount');
        return true;
      }
    },
  });
  shots.push({
    name: 'ride', max: 55,
    init: () => {
      const om = lm.models.omLamp.pos;
      const goal = freeSpot(om[0] + 4, om[1] + 6.5, 1.0);
      fol = new Follower(plan(collision, roads, [player.x, player.y], goal, 0.85, true, 45));
      log(`ride path ${fol.length.toFixed(1)} m`);
      cam.dist = 7.5;
      captions.push({ keys: ['W', 'A', 'S', 'D'], text: 'Pedalar, frenar i girar', sub: 'la bici s’inclina als revolts i nota els pendents', t0: t + 1.5, t1: t + 8 });
    },
    step: (lt) => {
      if (lt < 0.6) { stopInput(); return; }
      if (lt > 10 && !captions.some((q) => q.keys[0] === 'Shift')) captions.push({ keys: ['Shift'], text: 'Més velocitat', t0: t, t1: t + 4.5 });
      // jump cut: skip the middle of the ride (dip to black), keep the last ~50 m
      const b = player.bike;
      if (jumpAt < 0 && lt > 16.5 && fol!.length - fol!.progress(b.x, b.y) > 75) { jumpAt = lt; log('ride jump cut'); }
      if (jumpAt >= 0) {
        const k = lt - jumpAt;
        fade = k < 0.25 ? k / 0.25 : Math.max(0, 1 - (k - 0.25) / 0.35);
        if (k >= 0.25 && !jumped) {
          const d = fol!.length - 50;
          const [x, y] = fol!.at(d), [x2, y2] = fol!.at(d + 1.5);
          b.x = x; b.y = y; b.heading = Math.atan2(x2 - x, y2 - y); b.steer = 0;
          fol!.seek(d);
          cam.yaw = b.heading;
          jumped = true;
        }
      }
      if (jumped && lt - jumpAt > 1 && !captions.some((q) => q.text.startsWith('Minimapa'))) captions.push({ keys: ['M'], text: 'Minimapa: gira amb tu', sub: 'dibuixat amb carrers, edificis i conreus reals', t0: t, t1: t + 5 });
      const done = rideTo(9.4, lt > 8);
      keysOn.clear();
      if (input.joyY > 0.1) keysOn.add('W'); if (input.joyY < -0.05) keysOn.add('S');
      if (input.joyX > 0.3) keysOn.add('D'); if (input.joyX < -0.3) keysOn.add('A');
      if (input.keys.has('ShiftLeft')) keysOn.add('Shift');
      return done;
    },
  });
  shots.push({
    name: 'dismount', dur: 5.5,
    init: () => {
      stopInput(); keysOn.clear();
      captions = [{ keys: ['E'], text: 'E: baixar de la bicicleta', t0: t + 0.4, t1: t + 4 }];
    },
    step: (lt) => {
      if (Math.abs(lt - 0.8) < DT / 2) { press('KeyE'); ev('dismount'); }
      if (lt > 1.4) {
        const om = lm.models.omLamp.pos;
        const want = Math.atan2(om[0] - player.x, om[1] - player.y) + 0.35;
        input.mouseDX = wrap(want - cam.yaw) * 0.05 / SENS;
      }
    },
  });

  // 7. pause menu and teleport to the Gaudí monument (plaça d'Arnau de Palomar)
  const tps = lm.teleports as { name: string; x: number; y: number }[];
  const destIdx = tps.findIndex((q) => q.name.startsWith('Monument a Gaud'));
  const mg: P2 = lm.models.monumentGaudi.pos;
  shots.push({
    name: 'menu', dur: 5.2,
    init: () => {
      stopInput(); keysOn.clear();
      press('Escape');
      menu = { a: 0, cursor: [900, 560], hot: -1, click: 0 };
      captions = [{ keys: ['Esc'], text: 'Menú: controls, hora, qualitat i teletransport', t0: t + 0.1, t1: t + 5 }];
    },
    step: (lt) => {
      menu!.a = ss(lt / 0.35);
      const tgt = btnPos(destIdx);
      const k = ss((lt - 1.0) / 1.8);
      menu!.cursor = [900 + (tgt[0] + 60 - 900) * k, 560 + (tgt[1] + 14 - 560) * k];
      menu!.hot = k > 0.9 ? destIdx : -1;
      if (Math.abs(lt - 3.3) < DT / 2) { menu!.click = t; ev('ui'); }
      if (lt > 3.8) fade = ss((lt - 3.8) / 1.2);
    },
  });
  shots.push({
    name: 'gaudi', dur: 8,
    init: () => {
      menu = null;
      const st = freeSpot(mg[0], mg[1] - 15);
      player.teleport(st[0], st[1], Math.atan2(mg[0] - st[0], mg[1] - st[1]));
      cam.yaw = player.heading - 0.7; cam.pitch = 0.1; cam.dist = 7;
      const goal = freeSpot(mg[0] + 0.5, mg[1] - 6.5);
      fol = new Follower(plan(collision, roads, [player.x, player.y], goal, 0.45, false, 15));
      captions = [];
      ev('whoosh');
    },
    step: (lt) => {
      fade = 1 - ss(lt / 0.8);
      walkTo(false);
      keysOn.clear(); if (Math.hypot(input.joyX, input.joyY) > 0.1) keysOn.add('W');
      if (lt > 0.3) {
        const want = Math.atan2(mg[0] - player.x, mg[1] - player.y);
        input.mouseDX = wrap(want - cam.yaw) * 0.035 / SENS;
        input.mouseDY = (0.02 - cam.pitch) * 0.04 / SENS;
      }
    },
  });

  // 8. dusk to night at the monument
  let hour0 = 0;
  shots.push({
    name: 'timelapse', dur: 13,
    init: () => {
      stopInput(); keysOn.clear();
      hour0 = sky.hour = 17.8;
      captions = [{ keys: ['T'], text: 'T: avançar l’hora', sub: 'sol calculat per a Riudoms en la data d’avui', t0: t + 0.2, t1: t + 12.5 }];
      lowers = [{ title: 'Enllumenat de nit', sub: 'fanals a les façanes i als carrers (posicions estimades)', t0: t + 8.3, t1: t + 13.5 }];
    },
    step: (lt) => {
      const h = hour0 + 3.0 * ss(lt / 11.5);
      if (Math.floor(h) !== Math.floor(sky.hour)) { keysOn.add('T'); ev('key', { code: 'KeyT' }); ev('bell', { n: 1, x: tower.x, y: tower.y }); status.tOn = t; }
      if (status.tOn && t - status.tOn > 0.25) keysOn.delete('T');
      sky.hour = h;
      // the camera stays facing the monument, drifting a little from side to side
      const want = Math.atan2(mg[0] - player.x, mg[1] - player.y) + 0.22 * Math.sin(lt * 0.45);
      input.mouseDX = wrap(want - cam.yaw) * 0.05 / SENS;
      input.mouseDY = (0.06 - cam.pitch) * 0.03 / SENS;
    },
  });

  // 9. dusk aerial over the church square and end card
  let endFrom: THREE.Vector3, endLook0: THREE.Vector3;
  shots.push({
    name: 'night-aerial', dur: 12,
    init: () => {
      mode = 'aerial'; hud = false; captions = []; lowers = [];
      endFrom = cam.camera.position.clone();
      const d = new THREE.Vector3(); cam.camera.getWorldDirection(d);
      endLook0 = endFrom.clone().addScaledVector(d, 30);
      freeCam = { pos: endFrom.clone(), look: endLook0.clone() };
    },
    step: (lt) => {
      const u = ss(lt / 11);
      const ex = endFrom.x, ey = -endFrom.z;
      const p = new THREE.CatmullRomCurve3([endFrom, V(ex + 2, ey - 2, h0 + 42), V(-6, 16, h0 + 66), V(20, -30, h0 + 75), V(55, -80, h0 + 95)]);
      freeCam!.pos.copy(p.getPointAt(u));
      freeCam!.look.lerpVectors(endLook0, V(-22, 14, h0 + 8), ss(lt / 4)).lerp(V(-12, 2, h0), ss((lt - 4) / 6));
      aerialFog = 0.5 * u;
      endCard = ss((lt - 5) / 1.5);
      fade = ss((lt - 10.6) / 1.4);
    },
  });

  // menu layout (shared by the step and the drawing)
  const MB = { x: 190, y: 90, w: 900, h: 540 };
  function btnPos(i: number): P2 { return [MB.x + 470, MB.y + 110 + i * 29]; }

  // ---------------------------------------------------------- overlays
  const drawHud = () => {
    // clock + menu button
    c.font = '600 14px "Segoe UI", system-ui, sans-serif';
    const hh = Math.floor(sky.hour), mm = Math.floor((sky.hour - hh) * 60);
    const clock = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    c.fillStyle = 'rgba(24,32,38,.72)'; rr(c, 16, 16, 64, 30, 15); c.fill();
    c.fillStyle = '#fff'; c.fillText(clock, 29, 36);
    c.fillStyle = 'rgba(24,32,38,.72)'; c.beginPath(); c.arc(37, 77, 21, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = '20px "Segoe UI Symbol", sans-serif'; c.textAlign = 'center'; c.fillText('☰', 37, 84); c.textAlign = 'left';
    // minimap
    const R = 110, cx = W - 16 - R, cy = 16 + R;
    c.save();
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 20; c.shadowOffsetY = 4;
    c.fillStyle = '#d9d2c0'; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill();
    c.restore();
    c.save(); c.beginPath(); c.arc(cx, cy, R - 1, 0, Math.PI * 2); c.clip();
    c.drawImage(mmCanvas, cx - R, cy - R, R * 2, R * 2);
    c.restore();
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    const rot = -cam.yaw, rn = R - 14;
    const nx = cx + Math.sin(rot) * rn, ny = cy - Math.cos(rot) * rn;
    c.fillStyle = '#b8582f'; c.beginPath(); c.arc(nx, ny, 11, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.font = '700 12px sans-serif'; c.textAlign = 'center'; c.fillText('N', nx, ny + 4);
    // street name
    const place = minimap.streetAt(player.x, player.y) ?? '';
    c.font = '600 13px "Segoe UI", system-ui, sans-serif';
    c.shadowColor = 'rgba(0,0,0,.8)'; c.shadowBlur = 3; c.shadowOffsetY = 1;
    c.fillStyle = '#fff'; c.fillText(place, cx, 16 + 2 * R + 26);
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
    c.textAlign = 'left';
    // interaction prompt
    const prompt = player.bike ? ['E', 'per baixar de la bicicleta'] : player.nearBike ? ['E', 'per pujar a la bicicleta'] : null;
    if (prompt && !menu) {
      c.font = '15px "Segoe UI", system-ui, sans-serif';
      const tw = c.measureText(prompt[1]).width + 34;
      const x = W / 2 - tw / 2, y = H - 64 - 36;
      c.fillStyle = 'rgba(24,32,38,.86)'; rr(c, x - 16, y, tw + 32, 36, 10); c.fill();
      c.fillStyle = '#fff'; rr(c, x, y + 8, 22, 20, 4); c.fill();
      c.fillStyle = '#1d2a33'; c.font = '600 12px system-ui'; c.textAlign = 'center'; c.fillText('E', x + 11, y + 22); c.textAlign = 'left';
      c.fillStyle = '#fff'; c.font = '15px "Segoe UI", system-ui, sans-serif'; c.fillText(prompt[1], x + 30, y + 23);
    }
  };
  const drawSign = () => {
    if (!signShown || signA <= 0.01) return;
    const s = signShown;
    const w = 560, x = W / 2 - w / 2;
    c.font = '14.5px "Segoe UI", system-ui, sans-serif';
    const lines = wrapText(c, s.text, w - 36);
    const hgt = 14 + 24 + 6 + lines.length * 21 + (s.src ? 20 : 0) + 12;
    const y = 18 - 12 * (1 - signA);
    c.save(); c.globalAlpha = signA;
    c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 24; c.shadowOffsetY = 6;
    const gr = c.createLinearGradient(0, y, 0, y + hgt); gr.addColorStop(0, '#f8f1e1'); gr.addColorStop(1, '#eadcc0');
    c.fillStyle = gr; rr(c, x, y, w, hgt, 6); c.fill();
    c.shadowColor = 'transparent';
    c.strokeStyle = '#8a5a2c'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#6d3514'; c.font = '700 20px Georgia, "Times New Roman", serif';
    c.fillText(s.name, x + 18, y + 14 + 19);
    c.fillStyle = '#1d2a33'; c.font = '14.5px "Segoe UI", system-ui, sans-serif';
    lines.forEach((l, i) => c.fillText(l, x + 18, y + 14 + 24 + 6 + 15 + i * 21));
    if (s.src) { c.globalAlpha = signA * 0.6; c.font = '11px "Segoe UI", system-ui, sans-serif'; c.fillText(`Font: ${s.src}`, x + 18, y + hgt - 14); }
    c.restore();
  };
  const drawCaptions = () => {
    let y = H - 28;
    for (const q of [...captions].reverse()) {
      const a = ss((t - q.t0) / 0.35) * (1 - ss((t - q.t1 + 0.35) / 0.35));
      if (a <= 0) continue;
      c.save(); c.globalAlpha = a;
      c.font = '600 19px "Segoe UI", system-ui, sans-serif';
      const tw = c.measureText(q.text).width;
      c.font = '14px "Segoe UI", system-ui, sans-serif';
      const sw = q.sub ? c.measureText(q.sub).width : 0;
      c.font = '700 16px "Segoe UI", system-ui, sans-serif';
      let kw = 0;
      for (const k of q.keys) kw += Math.max(34, c.measureText(k).width + 20) + 6;
      if (q.mouse) kw += 70;
      const bw = 28 + kw + Math.max(tw, sw) + 8, bh = q.sub ? 70 : 54;
      const x = 24 - 16 * (1 - a), top = y - bh;
      c.fillStyle = 'rgba(24,32,38,.8)'; rr(c, x, top, bw, bh, 12); c.fill();
      c.fillStyle = '#b8582f'; rr(c, x, top, 5, bh, 2); c.fill();
      let kx = x + 18;
      const ky = top + (bh - 34) / 2 - 1;
      for (const k of q.keys) {
        const code = k.length === 1 ? 'Key' + k : k === 'Shift' ? 'Shift' : k;
        const on = keysOn.has(k) || keysOn.has(code) || (k === 'Esc' && keysOn.has('Escape'));
        kx += keycap(c, kx, ky, k, on) + 6;
      }
      if (q.mouse) { mouseIcon(c, kx + 20, top + (bh - 38) / 2, q.mouse, mouseOn, t); kx += 70; }
      c.fillStyle = '#fff'; c.font = '600 19px "Segoe UI", system-ui, sans-serif';
      c.fillText(q.text, kx + 6, top + (q.sub ? 30 : 34));
      if (q.sub) { c.fillStyle = 'rgba(255,255,255,.72)'; c.font = '14px "Segoe UI", system-ui, sans-serif'; c.fillText(q.sub, kx + 6, top + 52); }
      c.restore();
      y = top - 10;
    }
  };
  const drawLowers = () => {
    for (const q of lowers) {
      const lt = t - q.t0;
      const a = ss(lt / 0.6) * (1 - ss((t - q.t1 + 0.6) / 0.6));
      if (a <= 0) continue;
      c.save(); c.globalAlpha = a;
      c.font = '700 30px Georgia, "Times New Roman", serif';
      const tw = c.measureText(q.title).width;
      c.font = '17px "Segoe UI", system-ui, sans-serif';
      const sw = c.measureText(q.sub).width;
      const w = Math.max(tw, sw) + 48, x = 40 - 20 * (1 - a), y = mode === 'game' ? H - 250 : H - 150;
      const gr = c.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(24,32,38,.82)'); gr.addColorStop(1, 'rgba(24,32,38,.55)');
      c.fillStyle = gr; rr(c, x, y, w, 98, 10); c.fill();
      c.fillStyle = '#e2a64a'; c.fillRect(x, y + 14, 5, 70);
      c.fillStyle = '#f6efe2'; c.font = '700 30px Georgia, "Times New Roman", serif'; c.fillText(q.title, x + 24, y + 44);
      c.fillStyle = 'rgba(246,239,226,.82)'; c.font = '17px "Segoe UI", system-ui, sans-serif'; c.fillText(q.sub, x + 24, y + 76);
      c.restore();
    }
  };
  const drawMenu = () => {
    if (!menu) return;
    const a = menu.a;
    c.save(); c.globalAlpha = a;
    c.fillStyle = 'rgba(10,14,18,.45)'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(24,32,38,.9)'; rr(c, MB.x, MB.y, MB.w, MB.h, 14); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.14)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = '#e2a64a'; c.font = '700 26px "Segoe UI", system-ui, sans-serif'; c.fillText('Pausa', MB.x + 24, MB.y + 44);
    c.fillStyle = '#fff'; c.font = '700 16px "Segoe UI", system-ui, sans-serif';
    c.fillText('Controls', MB.x + 24, MB.y + 84); c.fillText('Teletransport', MB.x + 470, MB.y + 84);
    const rows: [string, string][] = [['W A S D / fletxes', 'Caminar'], ['Shift', 'Córrer'], ['E', 'Pujar / baixar de la bici'], ['Ratolí', 'Girar la càmera'],
      ['Roda', 'Zoom'], ['M', 'Minimapa gran / petit'], ['T', "Avançar l'hora"], ['Esc', 'Aquest menú']];
    c.font = '14px "Segoe UI", system-ui, sans-serif';
    rows.forEach(([k, v], i) => {
      const y = MB.y + 112 + i * 30;
      c.fillStyle = '#fff'; const kw = c.measureText(k).width + 14;
      rr(c, MB.x + 24, y - 15, kw, 21, 4); c.fill();
      c.fillStyle = '#1d2a33'; c.font = '600 12px system-ui'; c.fillText(k, MB.x + 31, y);
      c.fillStyle = 'rgba(255,255,255,.9)'; c.font = '14px "Segoe UI", system-ui, sans-serif'; c.fillText(v, MB.x + 190, y);
    });
    c.fillStyle = '#fff'; c.font = '700 16px "Segoe UI", system-ui, sans-serif'; c.fillText("Hora del dia", MB.x + 24, MB.y + 372);
    c.fillStyle = 'rgba(255,255,255,.25)'; rr(c, MB.x + 24, MB.y + 386, 380, 6, 3); c.fill();
    c.fillStyle = '#b8582f'; c.beginPath(); c.arc(MB.x + 24 + 380 * (sky.hour / 24), MB.y + 389, 8, 0, Math.PI * 2); c.fill();
    const n = Math.min(tps.length, 14);
    for (let i = 0; i < n; i++) {
      const [bx, by] = btnPos(i);
      const hot = i === menu.hot, clicked = hot && menu.click && t - menu.click < 0.25;
      c.fillStyle = clicked ? 'rgba(184,88,47,.9)' : hot ? 'rgba(255,255,255,.18)' : 'rgba(255,255,255,.06)';
      rr(c, bx, by, 400, 25, 7); c.fill();
      c.strokeStyle = 'rgba(255,255,255,.14)'; c.stroke();
      c.fillStyle = '#fff'; c.font = '13.5px "Segoe UI", system-ui, sans-serif'; c.fillText(tps[i].name, bx + 10, by + 17);
    }
    c.fillStyle = '#b8582f'; rr(c, MB.x + 24, MB.y + MB.h - 58, 110, 36, 8); c.fill();
    c.fillStyle = '#fff'; c.font = '600 14px "Segoe UI", system-ui, sans-serif'; c.fillText('Continuar', MB.x + 46, MB.y + MB.h - 35);
    c.fillStyle = 'rgba(255,255,255,.06)'; rr(c, MB.x + 146, MB.y + MB.h - 58, 140, 36, 8); c.fill();
    c.fillStyle = '#fff'; c.fillText('Fonts i crèdits', MB.x + 162, MB.y + MB.h - 35);
    // cursor
    const [mx, my] = menu.cursor;
    c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(mx, my); c.lineTo(mx, my + 20); c.lineTo(mx + 5, my + 15); c.lineTo(mx + 9, my + 23); c.lineTo(mx + 12, my + 21); c.lineTo(mx + 8, my + 14); c.lineTo(mx + 14, my + 14); c.closePath();
    c.fill(); c.stroke();
    c.restore();
  };
  const drawTitle = () => {
    if (title > 0.01) {
      c.save(); c.globalAlpha = title;
      const gr = c.createLinearGradient(0, H * 0.25, 0, H * 0.75);
      gr.addColorStop(0, 'rgba(24,32,38,0)'); gr.addColorStop(0.5, 'rgba(24,32,38,.45)'); gr.addColorStop(1, 'rgba(24,32,38,0)');
      c.fillStyle = gr; c.fillRect(0, H * 0.25, W, H * 0.5);
      c.textAlign = 'center';
      c.fillStyle = '#f6efe2'; c.font = '700 84px "Segoe UI", system-ui, sans-serif';
      c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 18;
      const w1 = c.measureText('Riudoms ').width, w2 = c.measureText('3D').width;
      c.textAlign = 'left';
      c.fillText('Riudoms ', W / 2 - (w1 + w2) / 2, H / 2 + 6);
      c.fillStyle = '#e2a64a'; c.fillText('3D', W / 2 - (w1 + w2) / 2 + w1, H / 2 + 6);
      c.textAlign = 'center';
      c.fillStyle = '#f6efe2'; c.font = '22px "Segoe UI", system-ui, sans-serif';
      c.fillText('Baix Camp · el poble recreat amb dades obertes, per recórrer-lo a peu i en bicicleta', W / 2, H / 2 + 50);
      c.restore();
    }
    if (endCard > 0.01) {
      c.save(); c.globalAlpha = endCard;
      c.fillStyle = 'rgba(12,16,22,.55)'; c.fillRect(0, 0, W, H);
      c.textAlign = 'center';
      c.fillStyle = '#f6efe2'; c.font = '700 64px "Segoe UI", system-ui, sans-serif';
      const w1 = c.measureText('Riudoms ').width, w2 = c.measureText('3D').width;
      c.textAlign = 'left';
      c.fillText('Riudoms ', W / 2 - (w1 + w2) / 2, H / 2 - 60);
      c.fillStyle = '#e2a64a'; c.fillText('3D', W / 2 - (w1 + w2) / 2 + w1, H / 2 - 60);
      c.textAlign = 'center';
      c.fillStyle = 'rgba(246,239,226,.92)'; c.font = '19px "Segoe UI", system-ui, sans-serif';
      c.fillText('Dades: ICGC (LiDAR, MET, ortofoto) · Cadastre (DGC, INSPIRE) · OpenStreetMap', W / 2, H / 2 - 4);
      c.fillText('Generalitat de Catalunya (DUN 2025, Equipaments) · Inventari del Patrimoni Arquitectònic', W / 2, H / 2 + 24);
      c.fillStyle = 'rgba(246,239,226,.7)'; c.font = '16px "Segoe UI", system-ui, sans-serif';
      c.fillText('Allò que no es coneix amb dades s’ha estimat i està documentat · Vite + Three.js', W / 2, H / 2 + 62);
      c.fillStyle = '#e2a64a'; c.font = '600 18px Consolas, monospace';
      c.fillText('npm install && npm run dev', W / 2, H / 2 + 104);
      c.restore();
    }
  };

  // ---------------------------------------------------------- frame upload
  let inflight: Promise<any>[] = [];
  const upload = async (i: number) => {
    const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), 'image/jpeg', 0.92));
    await fetch(`/__demo/frame/${i}`, { method: 'POST', body: blob });
  };
  const wantFrame = (i: number) => {
    if (opt.dry) return false;
    if (opt.stills) return opt.stills.some((s) => Math.round(s * FPS) === i);
    if (opt.from !== undefined && i < opt.from * FPS) return false;
    if (opt.to !== undefined && i > opt.to * FPS) return false;
    return true;
  };

  // ---------------------------------------------------------- main loop
  const t0 = performance.now();
  try {
    for (const shot of shots) {
      status.shot = shot.name;
      shot.init?.();
      log(`shot ${shot.name} at (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`);
      let lt = 0, lastProg = 0, stuckT = 0;
      for (;;) {
        const done = shot.step(lt);
        if (mode === 'game' && !(shot.name === 'aerial')) gameStep(DT); else freeStep(DT);
        // bookkeeping for the soundtrack
        const onFoot = mode === 'game' && !player.bike;
        const moved = Math.hypot(player.x - lastPos[0], player.y - lastPos[1]);
        lastPos = [player.x, player.y];
        if (onFoot && player.speed > 0.3) {
          stepAcc += moved;
          const len = player.speed > 3 ? 1.35 : 0.72;
          if (stepAcc >= len) { stepAcc -= len; ev('step', { run: player.speed > 3 ? 1 : 0 }); }
        }
        const cp = cam.camera.position;
        const lx = mode === 'game' ? player.x : cp.x, ly = mode === 'game' ? player.y : -cp.z;
        track.push({
          t: +t.toFixed(3), m: menu ? 'menu' : mode === 'game' ? (player.bike ? 'bike' : 'foot') : 'aerial',
          v: +(player.bike ? player.bike.speed : player.speed).toFixed(2),
          ped: player.bike && input.joyY > 0.1 ? 1 : 0,
          alt: +(cp.y - hf.heightAt(cp.x, -cp.z)).toFixed(1),
          fo: +Math.min(...fountains.map((f) => Math.hypot(f[0] - lx, f[1] - ly))).toFixed(1),
          ch: +Math.hypot(tower.x - lx, tower.y - ly).toFixed(1),
          n: +nightUniform.value.toFixed(3),
        });
        if (mode === 'game' && frameNo % 15 === 0) status.trace.push([+player.x.toFixed(1), +player.y.toFixed(1)]);
        // landmark sign logic as in the HUD (0.6 s delay when arriving)
        const sgn: Sign | null = mode === 'game' && hud ? landmarks.signAt(player.x, player.y) : null;
        if (sgn !== signCand) { signCand = sgn; signT = 0; }
        signT += DT;
        if (signCand && signCand !== signShown && signT > 0.6) { signShown = signCand; signA = 0; ev('sign'); }
        if (!signCand && signShown) { signA -= DT / 0.3; if (signA <= 0) signShown = null; }
        else if (signShown) signA = Math.min(1, signA + DT / 0.45);
        // stuck detector for the scripted paths
        if (fol && mode === 'game' && (shot.name === 'walk' || shot.name === 'ride')) {
          const pr = fol.i;
          if (pr === lastProg) stuckT += DT; else { stuckT = 0; lastProg = pr; }
          if (stuckT > 1.5 && Math.hypot(input.joyX, input.joyY) > 0.2) { log(`STUCK in ${shot.name} at (${player.x.toFixed(1)}, ${player.y.toFixed(1)})`); stuckT = -5; }
        }
        if (wantFrame(frameNo)) {
          renderer.render(scene, cam.camera);
          c.drawImage(renderer.domElement, 0, 0, W, H);
          if (hud) drawHud();
          if (hud) drawSign();
          drawLowers();
          drawMenu();
          if (hud || menu) drawCaptions();
          drawTitle();
          if (fade > 0.001) { c.fillStyle = `rgba(0,0,0,${fade})`; c.fillRect(0, 0, W, H); }
          inflight.push(upload(frameNo));
          if (inflight.length >= 6) { await Promise.all(inflight); inflight = []; }
        }
        frameNo++; t += DT; lt += DT;
        status.frame = frameNo; status.t = t;
        if (frameNo % 30 === 0) status.fps = frameNo / ((performance.now() - t0) / 1000);
        if (shot.dur !== undefined ? lt >= shot.dur : (done === true || lt >= (shot.max ?? 30))) {
          if (shot.max && lt >= shot.max) log(`shot ${shot.name} hit max duration`);
          break;
        }
        if (opt.dry && frameNo % 60 === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
    await Promise.all(inflight);
    const payload = JSON.stringify({ fps: FPS, frames: frameNo, duration: t, events, track, log: status.log });
    if (!opt.dry) await fetch(`/__demo/file/${opt.stills ? 'stills' : 'events'}.json`, { method: 'POST', body: payload });
    status.summary = { frames: frameNo, duration: +t.toFixed(2), secs: (performance.now() - t0) / 1000 };
  } catch (e: any) {
    status.error = String(e?.stack ?? e);
  } finally {
    await fetch('/__demo/file/debug.json', { method: 'POST', body: JSON.stringify({ paths: status.paths, trace: status.trace, log: status.log }) }).catch(() => {});
    status.done = true;
    stopInput(); keysOn.clear();
    renderer.setPixelRatio(prevRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.camera.aspect = window.innerWidth / window.innerHeight; cam.camera.updateProjectionMatrix();
    (window as any).__freeze = false;
  }
  return status;
}
