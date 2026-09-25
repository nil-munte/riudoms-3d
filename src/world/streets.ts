// Street surfaces (asphalt, setts, sidewalks, squares...) draped on the
// terrain, plus curbs, zebra crossings, centre lines and stairs.
import * as THREE from 'three';
import type { BinFile } from '../data/binfmt';
import type { Meta } from '../data/types';
import type { HeightField } from './heightfield';
import {
  asphaltTex, cobbleTex, dirtTex, grassTex, gravelTex, pavingTex, settTex, sidewalkTex,
} from './textures';

// height above the terrain of each surface (sidewalks sit 12 cm above the road)
export const OFFSET: Record<string, number> = {
  asphalt: 0.05, sett: 0.05, cobble: 0.05, sidewalk: 0.17, plaza: 0.09, paving: 0.08, dirt: 0.03, gravel: 0.04, curbtop: 0.17, grass: 0.2,
};
// metres covered by one texture repeat
const SCALE: Record<string, number> = { asphalt: 4, sett: 2, cobble: 2, sidewalk: 1, plaza: 2.4, paving: 2.4, dirt: 4, gravel: 2, curbtop: 1, grass: 2 };

function texFor(s: string) {
  switch (s) {
    case 'asphalt': return asphaltTex();
    case 'sett': return settTex();
    case 'cobble': return cobbleTex();
    case 'sidewalk': case 'curbtop': return sidewalkTex();
    case 'plaza': return pavingTex();
    case 'paving': return pavingTex();
    case 'dirt': return dirtTex();
    case 'grass': return grassTex();
    default: return gravelTex();
  }
}

interface WalkTile { x0: number; y0: number; data: Uint8Array }
const WR = 0.5; // walk raster resolution (m)

/** Adaptive subdivision of a triangulated surface (x, y pairs) so that, once
 *  draped at `h`, no triangle passes more than `tol` below the ground. Edge
 *  midpoints are shared between neighbouring triangles. */
function refineDrape(v: Float32Array, idx: Uint32Array, h: (x: number, y: number) => number, tol: number) {
  const xs: number[] = Array.from({ length: v.length / 2 }, (_, k) => v[k * 2]);
  const ys: number[] = Array.from({ length: v.length / 2 }, (_, k) => v[k * 2 + 1]);
  const zs: number[] = xs.map((x, k) => h(x, ys[k]));
  const mids = new Map<number, number>();
  const mid = (a: number, b: number) => {
    const key = a < b ? a * 4194304 + b : b * 4194304 + a;
    let m = mids.get(key);
    if (m === undefined) {
      m = xs.length;
      xs.push((xs[a] + xs[b]) / 2); ys.push((ys[a] + ys[b]) / 2); zs.push(h(xs[m], ys[m]));
      mids.set(key, m);
    }
    return m;
  };
  const out: number[] = [];
  const need = (a: number, b: number, c: number) => {
    const e = Math.max(Math.hypot(xs[a] - xs[b], ys[a] - ys[b]), Math.hypot(xs[b] - xs[c], ys[b] - ys[c]), Math.hypot(xs[c] - xs[a], ys[c] - ys[a]));
    if (e < 0.9) return false;
    // ground above the flat triangle at the centroid or the edge midpoints?
    const pts: [number, number, number][] = [
      [(xs[a] + xs[b] + xs[c]) / 3, (ys[a] + ys[b] + ys[c]) / 3, (zs[a] + zs[b] + zs[c]) / 3],
      [(xs[a] + xs[b]) / 2, (ys[a] + ys[b]) / 2, (zs[a] + zs[b]) / 2],
      [(xs[b] + xs[c]) / 2, (ys[b] + ys[c]) / 2, (zs[b] + zs[c]) / 2],
      [(xs[c] + xs[a]) / 2, (ys[c] + ys[a]) / 2, (zs[c] + zs[a]) / 2],
    ];
    return pts.some(([x, y, z]) => h(x, y) - z > tol);
  };
  const split = (a: number, b: number, c: number, depth: number) => {
    if (depth >= 6 || !need(a, b, c)) { out.push(a, b, c); return; }
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    split(a, ab, ca, depth + 1); split(ab, b, bc, depth + 1); split(ca, bc, c, depth + 1); split(ab, bc, ca, depth + 1);
  };
  for (let k = 0; k < idx.length; k += 3) split(idx[k], idx[k + 1], idx[k + 2], 0);
  if (xs.length === v.length / 2) return { v, idx };
  const nv = new Float32Array(xs.length * 2);
  for (let k = 0; k < xs.length; k++) { nv[k * 2] = xs[k]; nv[k * 2 + 1] = ys[k]; }
  return { v: nv, idx: Uint32Array.from(out) };
}

export class Streets {
  group = new THREE.Group();
  private walk = new Map<number, WalkTile>();
  private triByTile = new Map<number, { v: Float32Array; i: Uint32Array; off: number }[]>();
  surfaces: string[];

  constructor(bin: BinFile, private meta: Meta, private hf: HeightField) {
    const { surfaces, chunks } = bin.meta;
    this.surfaces = surfaces;
    const V = bin.arrays.verts as Float32Array;
    const I = bin.arrays.idx as Uint32Array;
    const mats: Record<string, THREE.Material> = {};
    for (const s of surfaces) {
      const m = new THREE.MeshLambertMaterial({ map: texFor(s), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      if (s === 'plaza') m.color.setRGB(1.0, 0.97, 0.9);
      mats[s] = m;
    }
    // one mesh per surface and 500 m block (2 x 2 tiles)
    const S = meta.tile * 2;
    const bnx = Math.ceil(meta.tiles.nx / 2);
    const acc = new Map<string, { s: string; tx: number; ty: number; pos: number[]; nor: number[]; uv: number[]; idx: number[] }>();
    for (const c of chunks) {
      const s = surfaces[c.s];
      const bi = Math.floor((c.t % meta.tiles.nx) / 2), bj = Math.floor(Math.floor(c.t / meta.tiles.nx) / 2);
      const tx = meta.tiles.x0 + bi * S + S / 2;
      const ty = meta.tiles.y0 + bj * S + S / 2;
      const key = (bi + bj * bnx) + ':' + s;
      const v0 = V.subarray(c.v0 * 2, (c.v0 + c.vn) * 2);
      const idx0 = I.subarray(c.i0, c.i0 + c.in);
      const off = OFFSET[s] ?? 0.05, sc = SCALE[s] ?? 2;
      // the surface is draped on the terrain at its vertices only: split the triangles
      // that cross a sharp level change, or the terrain would poke through the paving
      const { v, idx } = refineDrape(v0, idx0, (x, y) => hf.heightAt(x, y), off * 0.8);
      const n = v.length / 2;
      const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), nor = new Float32Array(n * 3);
      const nn = { x: 0, y: 1, z: 0 };
      for (let k = 0; k < n; k++) {
        const x = v[k * 2], y = v[k * 2 + 1];
        pos[k * 3] = x - tx;
        pos[k * 3 + 1] = hf.heightAt(x, y) + off;
        pos[k * 3 + 2] = -(y - ty);
        uv[k * 2] = x / sc; uv[k * 2 + 1] = y / sc;
        hf.normalAt(x, y, 2, nn);
        nor[k * 3] = nn.x; nor[k * 3 + 1] = nn.y; nor[k * 3 + 2] = nn.z;
      }
      let a = acc.get(key);
      if (!a) acc.set(key, (a = { s, tx, ty, pos: [], nor: [], uv: [], idx: [] }));
      const base = a.pos.length / 3;
      for (let k = 0; k < n * 3; k++) { a.pos.push(pos[k]); a.nor.push(nor[k]); }
      for (let k = 0; k < n * 2; k++) a.uv.push(uv[k]);
      // make every triangle counter-clockwise in (east, north) so it faces up
      for (let k = 0; k < idx.length; k += 3) {
        const i0 = idx[k], i1 = idx[k + 1], i2 = idx[k + 2];
        const cr = (v[i1 * 2] - v[i0 * 2]) * (v[i2 * 2 + 1] - v[i0 * 2 + 1]) - (v[i1 * 2 + 1] - v[i0 * 2 + 1]) * (v[i2 * 2] - v[i0 * 2]);
        if (cr < 0) a.idx.push(base + i0, base + i2, base + i1); else a.idx.push(base + i0, base + i1, base + i2);
      }
      if (s === 'sidewalk' || s === 'plaza' || s === 'paving') {
        let l = this.triByTile.get(c.t);
        if (!l) this.triByTile.set(c.t, (l = []));
        l.push({ v: v0, i: idx0, off });
      }
    }
    for (const a of acc.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(a.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      g.setIndex(a.idx);
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mats[a.s]);
      mesh.position.set(a.tx, 0, -a.ty);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.userData = { cx: a.tx, cy: a.ty };
      this.group.add(mesh);
    }
    this.buildCurbs(bin);
    this.buildCrossings(bin);
    this.buildMarks(bin);
    this.buildSteps(bin);
  }

  private buildCurbs(bin: BinFile) {
    const P = bin.arrays.curbs as Float32Array, O = bin.arrays.curbOff as Uint32Array;
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (let k = 0; k + 1 < O.length; k++) {
      for (let j = O[k]; j + 1 < O[k + 1]; j++) {
        const ax = P[j * 2], ay = P[j * 2 + 1], bx = P[j * 2 + 2], by = P[j * 2 + 3];
        const ha = this.hf.heightAt(ax, ay), hb = this.hf.heightAt(bx, by);
        const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
        const nx = dy / L, ny = -dx / L;
        const b = pos.length / 3;
        pos.push(ax, ha + 0.03, -ay, bx, hb + 0.03, -by, bx, hb + OFFSET.sidewalk, -by, ax, ha + OFFSET.sidewalk, -ay);
        for (let q = 0; q < 4; q++) nor.push(nx, 0, -ny);
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0xb9b5ad, side: THREE.DoubleSide }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  private buildCrossings(bin: BinFile) {
    const C = bin.arrays.crossings as Float32Array;
    const pos: number[] = [], idx: number[] = [];
    for (let k = 0; k < C.length; k += 5) {
      const x = C[k], y = C[k + 1], a = C[k + 2], w = C[k + 3], len = C[k + 4];
      const ux = Math.cos(a), uy = Math.sin(a); // along the road
      const vx = -uy, vy = ux; // across
      for (let s = -w / 2 + 0.25; s < w / 2 - 0.2; s += 1.0) {
        const cx = x + vx * (s + 0.25), cy = y + vy * (s + 0.25);
        const corners = [[-len / 2, -0.25], [len / 2, -0.25], [len / 2, 0.25], [-len / 2, 0.25]];
        const b = pos.length / 3;
        for (const [p, q] of corners) {
          const px = cx + ux * p + vx * q, py = cy + uy * p + vy * q;
          pos.push(px, this.hf.heightAt(px, py) + 0.075, -py);
        }
        idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
      }
    }
    this.addFlat(pos, idx, 0xe9e7e0);
  }

  private buildMarks(bin: BinFile) {
    const P = bin.arrays.marks as Float32Array, O = bin.arrays.markOff as Uint32Array;
    const pos: number[] = [], idx: number[] = [];
    for (let k = 0; k + 1 < O.length; k++) {
      let dist = 0;
      for (let j = O[k]; j + 1 < O[k + 1]; j++) {
        const ax = P[j * 2], ay = P[j * 2 + 1], bx = P[j * 2 + 2], by = P[j * 2 + 3];
        const L = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / L, uy = (by - ay) / L, vx = -uy * 0.06, vy = ux * 0.06;
        for (let t = 0; t < L; t += 0.5) {
          const on = (dist + t) % 8 < 3;
          if (!on) continue;
          const t1 = Math.min(L, t + 0.5);
          const p0x = ax + ux * t, p0y = ay + uy * t, p1x = ax + ux * t1, p1y = ay + uy * t1;
          const b = pos.length / 3;
          for (const [px, py] of [[p0x - vx, p0y - vy], [p1x - vx, p1y - vy], [p1x + vx, p1y + vy], [p0x + vx, p0y + vy]]) {
            pos.push(px, this.hf.heightAt(px, py) + 0.07, -py);
          }
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        dist += L;
      }
    }
    this.addFlat(pos, idx, 0xe6e4dc);
  }

  private addFlat(pos: number[], idx: number[], color: number) {
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const nor = new Float32Array(pos.length);
    for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }));
    m.receiveShadow = true;
    this.group.add(m);
  }

  private buildSteps(bin: BinFile) {
    const S = bin.arrays.steps as Float32Array;
    const mat = new THREE.MeshLambertMaterial({ map: pavingTex(), color: 0xe8e0d0 });
    for (let k = 0; k < S.length; k += 5) {
      let ax = S[k], ay = S[k + 1], bx = S[k + 2], by = S[k + 3];
      const w = S[k + 4];
      let ha = this.hf.heightAt(ax, ay), hb = this.hf.heightAt(bx, by);
      if (ha > hb) { [ax, ay, bx, by] = [bx, by, ax, ay]; [ha, hb] = [hb, ha]; }
      const L = Math.hypot(bx - ax, by - ay);
      const n = Math.max(2, Math.round((hb - ha) / 0.16));
      const run = L / n, rise = (hb - ha) / n;
      const ang = Math.atan2(bx - ax, by - ay);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        const top = ha + rise * (i + 1) + 0.05;
        const hBox = Math.max(0.2, top - (this.hf.heightAt(px, py) - 0.3));
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, hBox, run + 0.02), mat);
        box.position.set(px, top - hBox / 2, -py);
        box.rotation.y = Math.PI - ang;
        box.receiveShadow = box.castShadow = true;
        this.group.add(box);
      }
    }
  }

  /** Extra height of the walkable surface (sidewalks, squares) above the terrain. */
  walkOffset(x: number, y: number): number {
    const S = this.meta.tile;
    const i = Math.floor((x - this.meta.tiles.x0) / S), j = Math.floor((y - this.meta.tiles.y0) / S);
    if (i < 0 || j < 0 || i >= this.meta.tiles.nx || j >= this.meta.tiles.ny) return 0.04;
    const t = j * this.meta.tiles.nx + i;
    let wt = this.walk.get(t);
    if (!wt) { wt = this.rasterize(t, i, j); this.walk.set(t, wt); }
    const c = Math.floor((x - wt.x0) / WR), r = Math.floor((y - wt.y0) / WR);
    const n = Math.round(S / WR);
    if (c < 0 || r < 0 || c >= n || r >= n) return 0.04;
    const v = wt.data[r * n + c];
    return v ? v / 100 : 0.05;
  }

  private rasterize(t: number, i: number, j: number): WalkTile {
    const S = this.meta.tile;
    const x0 = this.meta.tiles.x0 + i * S, y0 = this.meta.tiles.y0 + j * S;
    const n = Math.round(S / WR);
    const data = new Uint8Array(n * n);
    for (const { v, i: idx, off } of this.triByTile.get(t) ?? []) {
      const val = Math.round(off * 100);
      for (let k = 0; k < idx.length; k += 3) {
        const ax = v[idx[k] * 2], ay = v[idx[k] * 2 + 1];
        const bx = v[idx[k + 1] * 2], by = v[idx[k + 1] * 2 + 1];
        const cx = v[idx[k + 2] * 2], cy = v[idx[k + 2] * 2 + 1];
        const minc = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / WR));
        const maxc = Math.min(n - 1, Math.floor((Math.max(ax, bx, cx) - x0) / WR));
        const minr = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / WR));
        const maxr = Math.min(n - 1, Math.floor((Math.max(ay, by, cy) - y0) / WR));
        const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
        if (Math.abs(d) < 1e-9) continue;
        for (let r = minr; r <= maxr; r++) for (let c = minc; c <= maxc; c++) {
          const px = x0 + (c + 0.5) * WR, py = y0 + (r + 0.5) * WR;
          const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / d;
          const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / d;
          if (l1 >= -0.02 && l2 >= -0.02 && l1 + l2 <= 1.02) {
            const idxc = r * n + c;
            if (data[idxc] < val) data[idxc] = val;
          }
        }
      }
    }
    return { x0, y0, data };
  }

  update(camX: number, camY: number) {
    for (const m of this.group.children) {
      const u = m.userData;
      if (u.cx !== undefined) m.visible = Math.hypot(u.cx - camX, u.cy - camY) < 1400;
    }
  }
}
