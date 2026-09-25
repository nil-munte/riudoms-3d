// Rotating minimap. The whole world is drawn once from the real data (DUN crop
// parcels, streams, OSM roads, Cadastre buildings, landmarks) into an offscreen
// canvas; each frame a rotated window of it is copied to the HUD.
import type { BuildingsFile, Meta } from '../data/types';

export interface RoadsFile { roads: { n: string | null; k: string; w: number; s: string; p: number[] }[] }
export interface FieldsFile { classes: string[]; fields: { c: number; p: number[] }[]; water: number[][] }

const RES = 1.25; // metres per offscreen pixel
const FIELD_COL = ['', '#c8cf9b', '#aecb86', '#d7d3a1', '#a9b98a', '#9fc28a', '#c2d59a', '#98b07a', '#d6c28e', '#bcd49a', '#e3d9a5', '#e2dcc0'];
const ROAD_COL: Record<string, [string, number]> = {
  primary: ['#f0b36b', 1.0], secondary: ['#f3c77f', 1.0], tertiary: ['#fbe2a0', 1.0], secondary_link: ['#f3c77f', 1],
  tertiary_link: ['#fbe2a0', 1], unclassified: ['#ffffff', 1], residential: ['#ffffff', 1], living_street: ['#efe4cf', 1],
  service: ['#ffffff', 0.8], pedestrian: ['#e9dcc6', 1], track: ['#b99a6b', 0.7], footway: ['#d9c8ae', 0.6], path: ['#c2a47a', 0.5],
  steps: ['#d9c8ae', 0.6], cycleway: ['#b9d0e8', 0.6],
};

export class Minimap {
  private off: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private x0: number; private y1: number;
  big = false;
  private roads: RoadsFile;

  constructor(private canvas: HTMLCanvasElement, private meta: Meta, b: BuildingsFile, roads: RoadsFile, fields: FieldsFile,
              landmarks: { x: number; y: number; name: string }[]) {
    const { x0, y0, nx, ny } = meta.tiles;
    const W = Math.ceil((nx * meta.tile) / RES), H = Math.ceil((ny * meta.tile) / RES);
    this.x0 = x0; this.y1 = y0 + ny * meta.tile;
    this.roads = roads;
    this.off = document.createElement('canvas');
    this.off.width = W; this.off.height = H;
    const g = this.off.getContext('2d')!;
    this.ctx = canvas.getContext('2d')!;
    g.fillStyle = '#e6e0c9';
    g.fillRect(0, 0, W, H);
    const P = (x: number, y: number): [number, number] => [(x - this.x0) / RES, (this.y1 - y) / RES];
    const poly = (pts: number[], scale: number) => {
      g.beginPath();
      for (let i = 0; i < pts.length; i += 2) {
        const [px, py] = P(pts[i] / scale, pts[i + 1] / scale);
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.closePath();
    };
    for (const f of fields.fields) {
      g.fillStyle = FIELD_COL[f.c] || '#d9d3b8';
      poly(f.p, 10); g.fill();
      g.strokeStyle = 'rgba(120,110,80,0.25)'; g.lineWidth = 1; g.stroke();
    }
    g.strokeStyle = '#7fb3d5'; g.lineWidth = 3 / RES; g.lineCap = 'round';
    for (const w of fields.water) {
      g.beginPath();
      for (let i = 0; i < w.length; i += 2) { const [px, py] = P(w[i] / 10, w[i + 1] / 10); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.stroke();
    }
    // roads: casing then fill, widest first
    const order = [...roads.roads].sort((a, b) => a.w - b.w);
    for (const pass of [0, 1]) {
      for (const r of order) {
        const [col, k] = ROAD_COL[r.k] ?? ['#ffffff', 0.8];
        g.strokeStyle = pass === 0 ? 'rgba(90,80,60,0.55)' : col;
        g.lineWidth = Math.max(1.2, (r.w * k) / RES + (pass === 0 ? 1.6 : 0));
        g.lineJoin = 'round';
        if (r.k === 'track' && pass === 1) g.setLineDash([4, 3]); else g.setLineDash([]);
        g.beginPath();
        for (let i = 0; i < r.p.length; i += 2) { const [px, py] = P(r.p[i] / 10, r.p[i + 1] / 10); if (i === 0) g.moveTo(px, py); else g.lineTo(px, py); }
        g.stroke();
      }
    }
    g.setLineDash([]);
    for (const p of b.parts) {
      const lm = !!b.buildings[p.b].lm;
      g.fillStyle = lm ? '#b8583a' : p.s === 3 ? '#b9b3a8' : '#cdb89c';
      poly(p.rings[0], 100); g.fill();
      g.strokeStyle = 'rgba(80,60,40,0.55)'; g.lineWidth = 0.6; g.stroke();
    }
    for (const l of landmarks) {
      const [px, py] = P(l.x, l.y);
      g.fillStyle = '#b8583a'; g.beginPath(); g.arc(px, py, 3.2, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#fff'; g.lineWidth = 1.2; g.stroke();
    }
  }

  /** x, y player (local m), heading of the camera and of the player (0 = north, clockwise). */
  draw(x: number, y: number, camYaw: number, playerHeading: number) {
    const c = this.ctx, cv = this.canvas;
    const size = cv.clientWidth * (window.devicePixelRatio || 1);
    if (cv.width !== Math.round(size)) { cv.width = cv.height = Math.round(size); }
    const S = cv.width;
    const zoom = (this.big ? 0.42 : 1.1) * (S / 220); // offscreen px -> screen px
    const rot = this.big ? 0 : -camYaw;
    c.save();
    c.fillStyle = '#e6e0c9';
    c.fillRect(0, 0, S, S);
    c.translate(S / 2, S / 2);
    c.rotate(rot);
    c.scale(zoom, zoom);
    c.drawImage(this.off, -(x - this.x0) / RES, -(this.y1 - y) / RES);
    c.restore();
    // player arrow
    c.save();
    c.translate(S / 2, S / 2);
    c.rotate(playerHeading + rot);
    const a = S * 0.045;
    c.fillStyle = '#d6342b'; c.strokeStyle = '#fff'; c.lineWidth = S * 0.01;
    c.beginPath(); c.moveTo(0, -a * 1.4); c.lineTo(a, a); c.lineTo(0, a * 0.45); c.lineTo(-a, a); c.closePath();
    c.fill(); c.stroke();
    c.restore();
    // north marker on the rim
    const n = document.getElementById('compass-n')!;
    const r = cv.clientWidth / 2 - 14;
    n.style.transform = `translate(${Math.sin(rot) * r}px, ${-Math.cos(rot) * r}px)`;
  }

  /** Name of the nearest named street within 18 m. */
  streetAt(x: number, y: number): string | null {
    let best: string | null = null, bd = 18 * 18;
    for (const r of this.roads.roads) {
      if (!r.n) continue;
      const p = r.p;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i] / 10, ay = p[i + 1] / 10, bx = p[i + 2] / 10, by = p[i + 3] / 10;
        const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
        let t = l2 ? ((x - ax) * dx + (y - ay) * dy) / l2 : 0;
        t = Math.max(0, Math.min(1, t));
        const ex = ax + dx * t - x, ey = ay + dy * t - y;
        const d = ex * ex + ey * ey;
        if (d < bd) { bd = d; best = r.n; }
      }
    }
    return best;
  }

  get resolution() { return RES; }
  get meters() { return this.meta.tile; }
}
