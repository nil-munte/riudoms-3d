// 2D collision world (local x = east, y = north): wall segments from the
// building footprints and circles for trunks, fountains, posts... stored in a
// uniform grid. Resolves a moving circle by pushing it out and sliding.

const CELL = 8;

export interface Platform {
  // walkable raised surface (stairs, fountain rims...): height = fn(x, y) or null outside
  minx: number; miny: number; maxx: number; maxy: number;
  height: (x: number, y: number) => number | null;
}

export class Collision {
  private segs: number[] = [];
  private circles: number[] = [];
  private grid = new Map<number, number[]>();
  private cgrid = new Map<number, number[]>();
  private polys: Float64Array[] = []; // building footprints (x, y, x, y...): nobody can stand inside them
  private pgrid = new Map<number, number[]>();
  platforms: Platform[] = [];

  private key(cx: number, cy: number) { return (cx + 4096) * 8192 + (cy + 4096); }

  addSegment(ax: number, ay: number, bx: number, by: number) {
    const id = this.segs.length / 4;
    this.segs.push(ax, ay, bx, by);
    const x0 = Math.floor(Math.min(ax, bx) / CELL), x1 = Math.floor(Math.max(ax, bx) / CELL);
    const y0 = Math.floor(Math.min(ay, by) / CELL), y1 = Math.floor(Math.max(ay, by) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = this.key(cx, cy);
      let l = this.grid.get(k);
      if (!l) this.grid.set(k, (l = []));
      l.push(id);
    }
  }

  addCircle(x: number, y: number, r: number) {
    const id = this.circles.length / 3;
    this.circles.push(x, y, r);
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
    const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const k = this.key(cx, cy);
      let l = this.cgrid.get(k);
      if (!l) this.cgrid.set(k, (l = []));
      l.push(id);
    }
  }

  /** Solid footprint: its edges are walls and a point inside it is pushed out to the nearest edge. */
  addPolygon(ring: ArrayLike<number>) {
    const id = this.polys.length;
    const p = Float64Array.from(ring);
    this.polys.push(p);
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      const ax = p[i], ay = p[i + 1], j = (i + 2) % p.length;
      this.addSegment(ax, ay, p[j], p[j + 1]);
      minx = Math.min(minx, ax); maxx = Math.max(maxx, ax); miny = Math.min(miny, ay); maxy = Math.max(maxy, ay);
    }
    for (let cx = Math.floor(minx / CELL); cx <= Math.floor(maxx / CELL); cx++)
      for (let cy = Math.floor(miny / CELL); cy <= Math.floor(maxy / CELL); cy++) {
        const k = this.key(cx, cy);
        let l = this.pgrid.get(k);
        if (!l) this.pgrid.set(k, (l = []));
        l.push(id);
      }
  }

  /** Nearest point around (x, y) that is outside every footprint and clear of walls. */
  private escape(x: number, y: number, r: number): [number, number] {
    for (let d = 0.5; d <= 80; d += d < 10 ? 0.5 : 2) {
      const n = Math.max(12, Math.ceil(d * 4));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        const px = x + Math.cos(a) * d, py = y + Math.sin(a) * d;
        if (this.insideFootprint(px, py) >= 0) continue;
        if (!this.nearWall(px, py, r)) return [px, py];
      }
    }
    return [x, y];
  }

  private nearWall(x: number, y: number, r: number): boolean {
    for (let cx = Math.floor((x - r) / CELL); cx <= Math.floor((x + r) / CELL); cx++)
      for (let cy = Math.floor((y - r) / CELL); cy <= Math.floor((y + r) / CELL); cy++) {
        const l = this.grid.get(this.key(cx, cy));
        if (!l) continue;
        for (const id of l) {
          const s = id * 4;
          const ax = this.segs[s], ay = this.segs[s + 1], dx = this.segs[s + 2] - ax, dy = this.segs[s + 3] - ay;
          const ll = dx * dx + dy * dy;
          const t = ll > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ll)) : 0;
          if (Math.hypot(x - ax - dx * t, y - ay - dy * t) < r) return true;
        }
      }
    return false;
  }

  /** Index of the footprint containing (x, y), or -1. */
  insideFootprint(x: number, y: number): number {
    const l = this.pgrid.get(this.key(Math.floor(x / CELL), Math.floor(y / CELL)));
    if (!l) return -1;
    for (const id of l) {
      const p = this.polys[id];
      let inside = false;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const yi = p[i + 1], yj = p[j + 1];
        if ((yi > y) !== (yj > y) && x < ((p[j] - p[i]) * (y - yi)) / (yj - yi) + p[i]) inside = !inside;
      }
      if (inside) return id;
    }
    return -1;
  }

  get segmentCount() { return this.segs.length / 4; }

  /** Push a circle (x, y, r) out of every obstacle. Returns corrected position. */
  resolve(x: number, y: number, r: number, out = { x: 0, y: 0, hit: false }) {
    out.hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL);
      const y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
        const k = this.key(cx, cy);
        const l = this.grid.get(k);
        if (l) for (const id of l) {
          const s = id * 4;
          const ax = this.segs[s], ay = this.segs[s + 1], bx = this.segs[s + 2], by = this.segs[s + 3];
          const dx = bx - ax, dy = by - ay;
          const ll = dx * dx + dy * dy;
          let t = ll > 0 ? ((x - ax) * dx + (y - ay) * dy) / ll : 0;
          t = Math.max(0, Math.min(1, t));
          const px = ax + dx * t, py = ay + dy * t;
          const ex = x - px, ey = y - py;
          const d2 = ex * ex + ey * ey;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 1e-4;
            const push = r - d;
            x += (ex / d) * push; y += (ey / d) * push;
            moved = out.hit = true;
          }
        }
        const lc = this.cgrid.get(k);
        if (lc) for (const id of lc) {
          const c = id * 3;
          const ex = x - this.circles[c], ey = y - this.circles[c + 1];
          const rr = r + this.circles[c + 2];
          const d2 = ex * ex + ey * ey;
          if (d2 < rr * rr) {
            const d = Math.sqrt(d2) || 1e-4;
            x += (ex / d) * (rr - d); y += (ey / d) * (rr - d);
            moved = out.hit = true;
          }
        }
      }
      // never inside a building: jump out through the nearest edge
      const pid = this.insideFootprint(x, y);
      if (pid >= 0) {
        const p = this.polys[pid];
        let bd = Infinity, bx = x, by = y, nx = 0, ny = 0;
        for (let i = 0; i < p.length; i += 2) {
          const j = (i + 2) % p.length;
          const ax = p[i], ay = p[i + 1], dx = p[j] - ax, dy = p[j + 1] - ay;
          const ll = dx * dx + dy * dy;
          const t = ll > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / ll)) : 0;
          const px = ax + dx * t, py = ay + dy * t;
          const d = Math.hypot(x - px, y - py);
          if (d < bd) { bd = d; bx = px; by = py; nx = px - x; ny = py - y; }
        }
        const l = Math.hypot(nx, ny) || 1;
        x = bx + (nx / l) * (r + 0.02); y = by + (ny / l) * (r + 0.02);
        moved = out.hit = true;
      }
      if (!moved) break;
    }
    // still inside (pushed through a party wall into the neighbour): spiral out to the nearest free spot
    if (this.insideFootprint(x, y) >= 0) {
      const e = this.escape(x, y, r);
      x = e[0]; y = e[1]; out.hit = true;
    }
    out.x = x; out.y = y;
    return out;
  }

  /** Is the point inside a building footprint? (odd crossings over the nearby segments) */
  blockedLine(ax: number, ay: number, bx: number, by: number): boolean {
    // cheap test used for teleport / spawn safety: does the segment cross any wall?
    const x0 = Math.floor(Math.min(ax, bx) / CELL), x1 = Math.floor(Math.max(ax, bx) / CELL);
    const y0 = Math.floor(Math.min(ay, by) / CELL), y1 = Math.floor(Math.max(ay, by) / CELL);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const l = this.grid.get(this.key(cx, cy));
      if (!l) continue;
      for (const id of l) {
        const s = id * 4;
        if (segX(ax, ay, bx, by, this.segs[s], this.segs[s + 1], this.segs[s + 2], this.segs[s + 3])) return true;
      }
    }
    return false;
  }

  platformHeight(x: number, y: number): number | null {
    let best: number | null = null;
    for (const p of this.platforms) {
      if (x < p.minx || x > p.maxx || y < p.miny || y > p.maxy) continue;
      const h = p.height(x, y);
      if (h !== null && (best === null || h > best)) best = h;
    }
    return best;
  }
}

function segX(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
