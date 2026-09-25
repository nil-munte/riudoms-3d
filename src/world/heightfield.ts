// Terrain height function. Must match TerrainModel.height in scripts/ctx.py:
// MET-5 (ICGC) everywhere, replaced by the 2 m LiDAR DTM inside its extent and by
// the 1 m LiDAR DTM over the built-up area (the finest grid that contains the point wins).
import type { BinFile } from '../data/binfmt';

interface Grid {
  x0: number; // west edge (local m)
  y1: number; // north edge (local m)
  res: number;
  w: number;
  h: number;
  hmin: number;
  scale: number;
  data: Uint16Array;
}

export class HeightField {
  private coarse!: Grid;
  private fines: Grid[] = []; // finest first: 1 m urban core, then 2 m LiDAR area

  constructor(bin: BinFile) {
    for (const g of bin.meta.grids) {
      const grid: Grid = { ...g, data: bin.arrays[g.name] as Uint16Array };
      if (g.name === 'coarse') this.coarse = grid;
      else this.fines.push(grid);
    }
    this.fines.sort((a, b) => a.res - b.res);
  }

  /** Resolution of the finest grid covering the point (m). */
  resolutionAt(x: number, y: number) {
    for (const f of this.fines) if (this.inside(f, x, y)) return f.res;
    return this.coarse.res;
  }

  private inside(f: Grid, x: number, y: number) {
    return x >= f.x0 + f.res && x <= f.x0 + (f.w - 1) * f.res && y <= f.y1 - f.res && y >= f.y1 - (f.h - 1) * f.res;
  }

  private sample(g: Grid, x: number, y: number): number {
    let c = (x - g.x0) / g.res - 0.5;
    let r = (g.y1 - y) / g.res - 0.5;
    c = Math.min(Math.max(c, 0), g.w - 1.001);
    r = Math.min(Math.max(r, 0), g.h - 1.001);
    const c0 = Math.floor(c), r0 = Math.floor(r);
    const fc = c - c0, fr = r - r0;
    const d = g.data, w = g.w;
    const i = r0 * w + c0;
    const v = d[i] * (1 - fc) * (1 - fr) + d[i + 1] * fc * (1 - fr) + d[i + w] * (1 - fc) * fr + d[i + w + 1] * fc * fr;
    return g.hmin + v * g.scale;
  }

  /** Terrain height at local coords (x = east, y = north). */
  heightAt(x: number, y: number): number {
    for (const f of this.fines) if (this.inside(f, x, y)) return this.sample(f, x, y);
    return this.sample(this.coarse, x, y);
  }

  /** Analytic-ish normal (three.js axes: x east, y up, z south). */
  normalAt(x: number, y: number, step = 1, out = { x: 0, y: 1, z: 0 }) {
    const dx = (this.heightAt(x + step, y) - this.heightAt(x - step, y)) / (2 * step);
    const dy = (this.heightAt(x, y + step) - this.heightAt(x, y - step)) / (2 * step);
    const l = Math.hypot(dx, 1, dy);
    out.x = -dx / l;
    out.y = 1 / l;
    out.z = dy / l;
    return out;
  }
}
