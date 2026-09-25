// Level changes measured on the LiDAR DTM (scripts/p_relief.py): retaining
// walls with railings in town, dry-stone "marges" in the fields and stairs
// between pedestrian levels. Geometry is merged per 500 m block and material;
// walls block the player, stairs are walkable platforms.
import * as THREE from 'three';
import type { Meta } from '../data/types';
import type { Collision } from './collision';
import type { HeightField } from './heightfield';
import { ashlarTex, pavingTex, rubbleTex } from './textures';

export interface ReliefFile { segments: [number, number, number, number, number, number, number, number, string][] }

const RISE = 0.165, RUN = 0.32;

class Acc {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; idx: number[] = [];
  quad(p: number[][], n: [number, number, number], uvScale = 1.5) {
    const b = this.pos.length / 3;
    // UVs in metres: u along the first edge, v vertical
    const du = Math.hypot(p[1][0] - p[0][0], p[1][2] - p[0][2]);
    const dv = Math.hypot(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
    const base = p[0][0] * 0.37 + p[0][2] * 0.61;
    const uvs = [[base, 0], [base + du, 0], [base + du, dv], [base, dv]];
    for (let i = 0; i < 4; i++) {
      this.pos.push(p[i][0], p[i][1], p[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      this.uv.push(uvs[i][0] / uvScale, (uvs[i][1] + p[0][1]) / uvScale);
    }
    this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  /** Oriented box from two ground points along the segment (world east/north), bottom/top, thickness towards n. */
  box(ax: number, ay: number, bx: number, by: number, z0: number, z1a: number, z1b: number, nx: number, ny: number, th: number, batter = 0) {
    const ox = nx * th, oy = ny * th;
    const bt = batter; // inset of the top of the front face
    const P = (x: number, y: number, z: number) => [x, z, -y];
    const fa = [ax + ox, ay + oy], fb = [bx + ox, by + oy]; // front (downhill) bottom
    const ta = [ax + ox - nx * bt, ay + oy - ny * bt], tb = [bx + ox - nx * bt, by + oy - ny * bt]; // front top
    const back: [number, number][] = [[ax, ay], [bx, by]];
    // front face
    this.quad([P(fa[0], fa[1], z0), P(fb[0], fb[1], z0), P(tb[0], tb[1], z1b), P(ta[0], ta[1], z1a)], [nx, 0.2 * bt, -ny]);
    // top
    this.quad([P(ta[0], ta[1], z1a), P(tb[0], tb[1], z1b), P(back[1][0], back[1][1], z1b), P(back[0][0], back[0][1], z1a)], [0, 1, 0]);
    // back face (visible where the upper terrain is lower than the wall top)
    this.quad([P(bx, by, z0), P(ax, ay, z0), P(ax, ay, z1a), P(bx, by, z1b)], [-nx, 0, ny]);
    // ends
    this.quad([P(ax, ay, z0), P(fa[0], fa[1], z0), P(ta[0], ta[1], z1a), P(ax, ay, z1a)], [-(by - ay), 0, -(bx - ax)]);
    this.quad([P(fb[0], fb[1], z0), P(bx, by, z0), P(bx, by, z1b), P(tb[0], tb[1], z1b)], [(by - ay), 0, (bx - ax)]);
  }
  mesh(mat: THREE.Material) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat);
    m.castShadow = m.receiveShadow = true;
    return m;
  }
}

export class Relief {
  group = new THREE.Group();
  private blocks: { m: THREE.Object3D; x: number; y: number }[] = [];
  counts = { stairs: 0, wall: 0, marge: 0 };
  /** Walls and marges: the third-person camera is kept in front of them. */
  obstacles: THREE.Mesh[] = [];

  constructor(data: ReliefFile, meta: Meta, private hf: HeightField, col: Collision) {
    const mats = {
      wall: new THREE.MeshLambertMaterial({ map: ashlarTex(), color: 0xd6d0c4 }),
      marge: new THREE.MeshLambertMaterial({ map: rubbleTex(), color: 0xd9c7a3 }),
      stairs: new THREE.MeshLambertMaterial({ map: pavingTex(), color: 0xe9e2d4 }),
      rail: new THREE.MeshLambertMaterial({ color: 0x2c2e2d }),
    };
    const B = meta.tile * 2;
    const accs = new Map<string, Acc>();
    const acc = (k: string, x: number, y: number) => {
      const key = `${Math.floor(x / B)},${Math.floor(y / B)},${k}`;
      let a = accs.get(key);
      if (!a) accs.set(key, (a = new Acc()));
      return a;
    };
    for (const [x0, y0, x1, y1, lo, hi, nx, ny, kind] of data.segments) {
      const drop = hi - lo;
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      this.counts[kind as 'wall']++;
      if (kind === 'stairs') {
        this.stairs(acc('stairs', mx, my), x0, y0, x1, y1, lo, hi, nx, ny, col);
        continue;
      }
      // the wall stands on the upper edge of the transition: its top meets the upper level
      const up = kind === 'marge' ? 0.55 : 0.45;
      const ax = x0 - nx * up, ay = y0 - ny * up, bx = x1 - nx * up, by = y1 - ny * up;
      const za = Math.max(hi, this.hf.heightAt(ax - nx * 0.6, ay - ny * 0.6));
      const zb = Math.max(hi, this.hf.heightAt(bx - nx * 0.6, by - ny * 0.6));
      const cap = kind === 'marge' ? 0.12 : 0.18;
      const th = kind === 'marge' ? 0.55 : 0.32;
      acc(kind, mx, my).box(ax, ay, bx, by, lo - 0.6, za + cap, zb + cap, nx, ny, th, kind === 'marge' ? 0.12 : 0);
      if (drop > 0.45) col.addSegment(ax + nx * th * 0.5, ay + ny * th * 0.5, bx + nx * th * 0.5, by + ny * th * 0.5);
      // railing on urban walls higher than 0.6 m
      if (kind === 'wall' && drop > 0.6) {
        const r = acc('rail', mx, my);
        const L = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.round(L / 1.2));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const px = ax + (bx - ax) * t + nx * th * 0.5, py = ay + (by - ay) * t + ny * th * 0.5;
          const z = za + (zb - za) * t + cap;
          r.box(px - 0.025, py, px + 0.025, py, z, z + 1.0, z + 1.0, nx, ny, 0.05);
        }
        const z0r = za + cap + 0.95, z1r = zb + cap + 0.95;
        r.box(ax + nx * th * 0.4, ay + ny * th * 0.4, bx + nx * th * 0.4, by + ny * th * 0.4, z0r, z0r + 0.06, z1r + 0.06, nx, ny, 0.06);
      }
    }
    for (const [key, a] of accs) {
      const kind = key.split(',')[2] as keyof typeof mats;
      const m = a.mesh(mats[kind]);
      const [bi, bj] = key.split(',').map(Number);
      this.group.add(m);
      if (kind === 'wall' || kind === 'marge') this.obstacles.push(m);
      this.blocks.push({ m, x: (bi + 0.5) * B, y: (bj + 0.5) * B });
    }
  }

  private stairs(a: Acc, x0: number, y0: number, x1: number, y1: number, lo: number, hi: number, nx: number, ny: number, col: Collision) {
    const drop = hi - lo;
    const n = Math.max(2, Math.round(drop / RISE));
    const rise = drop / n;
    const run = RUN;
    const total = n * run;
    // the flight is centred on the break line, from the upper edge (start) down along n
    const sx = -nx * total / 2, sy = -ny * total / 2;
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 0; i < n; i++) {
      const d0 = i * run, d1 = (i + 1) * run;
      const ax = x0 + sx + nx * d0, ay = y0 + sy + ny * d0, bx = x1 + sx + nx * d0, by = y1 + sy + ny * d0;
      const top = hi - rise * i + 0.02; // tread i sits i rises below the upper level
      a.box(ax, ay, bx, by, lo - 0.4, top, top, nx, ny, d1 - d0);
    }
    // walkable surface: height follows the steps
    const minx = Math.min(x0, x1) + Math.min(sx, -sx) - 0.5, maxx = Math.max(x0, x1) + Math.max(sx, -sx) + 0.5;
    const miny = Math.min(y0, y1) + Math.min(sy, -sy) - 0.5, maxy = Math.max(y0, y1) + Math.max(sy, -sy) + 0.5;
    const tx = (x1 - x0) / L, ty = (y1 - y0) / L;
    col.platforms.push({
      minx, miny, maxx, maxy,
      height: (x, y) => {
        const along = (x - x0) * tx + (y - y0) * ty;
        if (along < -0.1 || along > L + 0.1) return null;
        const across = (x - (x0 + sx)) * nx + (y - (y0 + sy)) * ny;
        if (across < -0.2 || across > total + 0.2) return null;
        const k = Math.min(n - 1, Math.max(0, Math.floor(across / run)));
        return hi - rise * k + 0.02;
      },
    });
  }

  update(px: number, py: number) {
    for (const b of this.blocks) b.m.visible = Math.hypot(b.x - px, b.y - py) < 1100;
  }
}
