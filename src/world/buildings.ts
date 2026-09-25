// Builds the generic buildings (Cadastre footprints + LiDAR / Cadastre
// heights) as one merged mesh per world tile, plus instanced balconies.
import * as THREE from 'three';
import type { BuildingsFile, BuildingPart, Meta } from '../data/types';
import { E_STREET, S_MID, S_NEW, S_OLD, S_PUBLIC } from '../data/types';
import { STYLE_SPACING, makeFacadeMaterial } from './facade';
import { flatRoofTex, railingTex, roofTileTex } from './textures';
import type { Collision } from './collision';

function hash1(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const tmpC = new THREE.Color();
function lin(hex: string, minLum = 0): [number, number, number] {
  tmpC.set(hex);
  let { r, g, b } = tmpC;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  if (l < minLum && l > 0.001) {
    const k = minLum / l;
    r = Math.min(1, r * k); g = Math.min(1, g * k); b = Math.min(1, b * k);
  }
  return [r, g, b];
}

class Buf {
  pos: number[] = []; nor: number[] = []; idx: number[] = [];
  extra: Record<string, number[]> = {};
  get count() { return this.pos.length / 3; }
  attr(name: string) { return (this.extra[name] ??= []); }
  geometry(sizes: Record<string, number>) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    for (const [k, v] of Object.entries(this.extra)) g.setAttribute(k, new THREE.Float32BufferAttribute(v, sizes[k]));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export interface BalconyInst { type: number; m: THREE.Matrix4 }

export class Buildings {
  group = new THREE.Group();
  tileGroups: THREE.Group[] = [];
  meshes: THREE.Mesh[] = [];
  facadeMat = makeFacadeMaterial();
  private balconies: BalconyInst[] = [];

  constructor(data: BuildingsFile, meta: Meta, skip: Set<string>, collision: Collision) {
    // merged meshes per 500 m block (2 x 2 tiles): few draw calls, still frustum culled
    const S = meta.tile * 2;
    const bnx = Math.ceil(meta.tiles.nx / 2), bny = Math.ceil(meta.tiles.ny / 2);
    const nt = bnx * bny;
    const blockOf = (t: number) => Math.floor((t % meta.tiles.nx) / 2) + Math.floor(Math.floor(t / meta.tiles.nx) / 2) * bnx;
    const walls: Buf[] = [], roofsT: Buf[] = [], roofsF: Buf[] = [], trims: Buf[] = [], eaves: Buf[] = [];
    for (let t = 0; t < nt; t++) { walls.push(new Buf()); roofsT.push(new Buf()); roofsF.push(new Buf()); trims.push(new Buf()); eaves.push(new Buf()); }
    for (const p of data.parts) {
      const info = data.buildings[p.b];
      // collision for every part (also landmarks: their custom model sits on the same footprint)
      for (const ring of p.rings) {
        const n = ring.length / 2;
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          collision.addSegment(ring[i * 2] / 100, ring[i * 2 + 1] / 100, ring[j * 2] / 100, ring[j * 2 + 1] / 100);
        }
      }
      if (p.cm && p.lm && skip.has(p.lm)) continue; // replaced by a custom landmark model
      const t = blockOf(p.t);
      const tx = meta.tiles.x0 + (t % bnx) * S + S / 2;
      const ty = meta.tiles.y0 + Math.floor(t / bnx) * S + S / 2;
      const seed = (strHash(info.ref) % 997) + (p.rings[0][0] % 13);
      const retail = info.use === '4_2_retail' ? 1 : 0;
      this.addWalls(walls[t], p, tx, ty, seed, retail);
      this.addRoof(p.roof.k === 0 ? roofsF[t] : roofsT[t], p, tx, ty);
      this.addEaves(eaves[t], p, tx, ty);
      this.addTrims(trims[t], p, tx, ty);
    }
    const tileMat = new THREE.MeshLambertMaterial({ map: roofTileTex(), vertexColors: true });
    const flatMat = new THREE.MeshLambertMaterial({ map: flatRoofTex(), vertexColors: true });
    const eaveMat = new THREE.MeshLambertMaterial({ map: roofTileTex(), vertexColors: true, side: THREE.DoubleSide });
    const trimMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let t = 0; t < nt; t++) {
      const g = new THREE.Group();
      const tx = meta.tiles.x0 + (t % bnx) * S + S / 2;
      const ty = meta.tiles.y0 + Math.floor(t / bnx) * S + S / 2;
      g.position.set(tx, 0, -ty);
      g.userData.cx = tx; g.userData.cy = ty;
      if (walls[t].count) {
        const m = new THREE.Mesh(walls[t].geometry({ aFac: 2, aInfo: 4, aExtra: 4, aFCol: 3, aSCol: 3 }), this.facadeMat);
        m.castShadow = m.receiveShadow = true;
        m.name = 'walls';
        g.add(m); this.meshes.push(m);
      }
      for (const [buf, mat] of [[roofsT[t], tileMat], [roofsF[t], flatMat], [eaves[t], eaveMat]] as const) {
        if (!buf.count) continue;
        const m = new THREE.Mesh(buf.geometry({ uv: 2, color: 3 }), mat);
        m.castShadow = m.receiveShadow = true;
        m.name = 'roof';
        g.add(m); this.meshes.push(m);
      }
      if (trims[t].count) {
        const m = new THREE.Mesh(trims[t].geometry({ color: 3 }), trimMat);
        m.castShadow = m.receiveShadow = true;
        m.name = 'trim';
        g.add(m); this.meshes.push(m);
      }
      g.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
      this.tileGroups.push(g);
      this.group.add(g);
    }
    this.buildBalconies();
  }

  private addWalls(buf: Buf, p: BuildingPart, tx: number, ty: number, seed: number, retail: number) {
    const [fr, fg, fb] = lin(p.fc, 0.3);
    const [sr, sg, sb] = lin(p.sc, 0.02);
    const z0 = p.z0, vg = z0 + 0.3;
    const sp = STYLE_SPACING[p.s];
    const fh = p.fh || 3.0, gh = fh * 1.15;
    let ei = 0;
    const fac = buf.attr('aFac'), inf = buf.attr('aInfo'), ext = buf.attr('aExtra');
    const fcol = buf.attr('aFCol'), scol = buf.attr('aSCol');
    for (let ri = 0; ri < p.rings.length; ri++) {
      const ring = p.rings[ri];
      const n = ring.length / 2;
      for (let i = 0; i < n; i++, ei++) {
        const j = (i + 1) % n;
        const ax = ring[i * 2] / 100, ay = ring[i * 2 + 1] / 100;
        const bx = ring[j * 2] / 100, by = ring[j * 2 + 1] / 100;
        const dx = bx - ax, dy = by - ay;
        const L = Math.hypot(dx, dy);
        if (L < 0.05) continue;
        const za = z0 + p.w[ei * 2] / 100, zb = z0 + p.w[ei * 2 + 1] / 100;
        const flag = p.e[ei];
        const nx = dy / L, ny = -dx / L;
        // balconies on street facades of residential styles
        let mask = 0;
        if (flag === E_STREET && p.f >= 2 && (p.s === S_OLD || p.s === S_MID || p.s === S_NEW || p.s === S_PUBLIC)) {
          const ncol = Math.max(1, Math.floor(L / sp));
          const cw = L / ncol;
          const prob = p.s === S_OLD ? 0.6 : p.s === S_MID ? 0.5 : p.s === S_NEW ? 0.4 : 0.15;
          for (let c = 0; c < Math.min(ncol, 22); c++) {
            if (cw < 1.6) break;
            if (hash1(seed * 31 + ei, c) < prob) {
              mask |= 1 << c;
              const u = (c + 0.5) * cw;
              const topAt = (za + (zb - za) * (u / L)) - vg;
              for (let f = 1; f < p.f; f++) {
                const base = gh + (f - 1) * fh;
                if (base + 2.4 > topAt) break;
                const wx = ax + (dx * u) / L, wy = ay + (dy * u) / L;
                const m = new THREE.Matrix4();
                const yaw = Math.atan2(nx, -ny); // local +z = outward normal
                m.makeRotationY(yaw);
                m.setPosition(wx, vg + base, -wy);
                this.balconies.push({ type: p.s === S_OLD || p.s === S_PUBLIC ? 0 : p.s === S_MID ? 1 : 2, m });
              }
            }
          }
        }
        const base = buf.count;
        const pts: [number, number, number, number][] = [[ax, ay, z0, 0], [bx, by, z0, L], [bx, by, zb, L], [ax, ay, za, 0]];
        for (const [x, y, z, u] of pts) {
          buf.pos.push(x - tx, z, -(y - ty));
          buf.nor.push(nx, 0, -ny);
          fac.push(u, z - vg);
          inf.push(L, flag, p.f, p.s + retail * 10 + p.br * 20);
          ext.push((u === 0 ? za : zb) - vg, seed, mask, fh);
          fcol.push(fr, fg, fb);
          scol.push(sr, sg, sb);
        }
        buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }

  private addRoof(buf: Buf, p: BuildingPart, tx: number, ty: number) {
    const [r0, g0, b0] = lin(p.rc);
    const k = 1.35;
    const cr = Math.min(1, r0 * k), cg = Math.min(1, g0 * k), cb = Math.min(1, b0 * k);
    const uv = buf.attr('uv'), col = buf.attr('color');
    for (const piece of p.roof.p) {
      const contour: THREE.Vector2[] = [];
      const holes: THREE.Vector2[][] = [];
      const xs: number[] = [], ys: number[] = [], zs: number[] = [];
      piece.forEach((ring, ri) => {
        const arr: THREE.Vector2[] = [];
        for (let i = 0; i < ring.z.length; i++) {
          const x = ring.r[i * 2] / 100, y = ring.r[i * 2 + 1] / 100;
          arr.push(new THREE.Vector2(x, y));
          xs.push(x); ys.push(y); zs.push(p.z0 + ring.z[i] / 100);
        }
        if (ri === 0) contour.push(...arr); else holes.push(arr);
      });
      if (contour.length < 3) continue;
      let faces: number[][];
      try { faces = THREE.ShapeUtils.triangulateShape(contour, holes); } catch { continue; }
      if (!faces.length) continue;
      // plane normal of the piece from its largest triangle
      let best = 0, nx = 0, ny = 0, nz = 1;
      for (const f of faces) {
        const [a, b, c] = f;
        const ux = xs[b] - xs[a], uy = ys[b] - ys[a], uz = zs[b] - zs[a];
        const vx = xs[c] - xs[a], vy = ys[c] - ys[a], vz = zs[c] - zs[a];
        let cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const l = Math.hypot(cx, cy, cz);
        if (cz < 0) { cx = -cx; cy = -cy; cz = -cz; }
        if (l > best) { best = l; nx = cx / l; ny = cy / l; nz = cz / l; }
      }
      const hl = Math.hypot(nx, ny);
      const dx = hl > 1e-3 ? nx / hl : 0, dy = hl > 1e-3 ? ny / hl : 1; // downhill direction
      const slopeK = hl > 1e-3 ? 1 / Math.max(nz, 0.3) : 1;
      const base = buf.count;
      for (let i = 0; i < xs.length; i++) {
        buf.pos.push(xs[i] - tx, zs[i] + 0.02, -(ys[i] - ty));
        buf.nor.push(nx, nz, -ny);
        if (p.roof.k === 0) uv.push(xs[i], ys[i]);
        else uv.push(xs[i] * -dy + ys[i] * dx, (xs[i] * dx + ys[i] * dy) * slopeK);
        const vv = 0.92 + 0.16 * hash1(i, xs.length);
        col.push(cr * vv, cg * vv, cb * vv);
      }
      for (const [a, b, c] of faces) {
        // keep the winding facing up
        const ux = xs[b] - xs[a], uy = ys[b] - ys[a], vx = xs[c] - xs[a], vy = ys[c] - ys[a];
        // counter-clockwise in (east, north) = facing up in three.js (z = -north)
        if (ux * vy - uy * vx >= 0) buf.idx.push(base + a, base + b, base + c);
        else buf.idx.push(base + a, base + c, base + b);
      }
    }
  }

  /** Roof overhangs (ràfecs) and verges: quads that continue the roof plane. */
  private addEaves(buf: Buf, p: BuildingPart, tx: number, ty: number) {
    if (!p.ev?.length) return;
    const [r0, g0, b0] = lin(p.rc);
    const uv = buf.attr('uv'), col = buf.attr('color');
    for (const q of p.ev) {
      const base = buf.count;
      const pts: number[][] = [];
      for (let k = 0; k < 4; k++) pts.push([q[k * 3] / 100, q[k * 3 + 1] / 100, p.z0 + q[k * 3 + 2] / 100]);
      // normal from the quad
      const ux = pts[1][0] - pts[0][0], uy = pts[1][1] - pts[0][1], uz = pts[1][2] - pts[0][2];
      const vx = pts[3][0] - pts[0][0], vy = pts[3][1] - pts[0][1], vz = pts[3][2] - pts[0][2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const [x, y, z] of pts) {
        buf.pos.push(x - tx, z, -(y - ty));
        buf.nor.push(nx / l, nz / l, -ny / l);
        uv.push(x, y);
        col.push(Math.min(1, r0 * 1.3), Math.min(1, g0 * 1.3), Math.min(1, b0 * 1.3));
      }
      buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  /** Cornices on flat-roof street facades and rooftop structures measured by LiDAR. */
  private addTrims(buf: Buf, p: BuildingPart, tx: number, ty: number) {
    const col = buf.attr('color');
    const [fr, fg, fb] = lin(p.fc, 0.3);
    const [rr, rg, rb] = lin(p.rc);
    const quad = (pts: number[][], c: [number, number, number]) => {
      const base = buf.count;
      const ux = pts[1][0] - pts[0][0], uy = pts[1][1] - pts[0][1], uz = pts[1][2] - pts[0][2];
      const vx = pts[3][0] - pts[0][0], vy = pts[3][1] - pts[0][1], vz = pts[3][2] - pts[0][2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.hypot(nx, ny, nz) || 1;
      for (const [x, y, z] of pts) {
        buf.pos.push(x - tx, z, -(y - ty));
        buf.nor.push(nx / l, nz / l, -ny / l);
        col.push(c[0], c[1], c[2]);
      }
      buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    // prism from a CCW footprint (x,y) between z0 and z1: walls + top
    const prism = (ring: number[][], z0: number, z1: number, cw: [number, number, number], ct: [number, number, number]) => {
      let area = 0;
      for (let i = 0; i < ring.length; i++) { const a = ring[i], b = ring[(i + 1) % ring.length]; area += a[0] * b[1] - b[0] * a[1]; }
      const r = area > 0 ? ring : [...ring].reverse();
      for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length];
        quad([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], cw);
      }
      if (r.length === 4) quad([[r[0][0], r[0][1], z1], [r[1][0], r[1][1], z1], [r[2][0], r[2][1], z1], [r[3][0], r[3][1], z1]], ct);
    };
    const light: [number, number, number] = [Math.min(1, fr * 1.08), Math.min(1, fg * 1.08), Math.min(1, fb * 1.08)];
    for (const [x0, y0, x1, y1, z] of p.cn ?? []) {
      const ax = x0 / 100, ay = y0 / 100, bx = x1 / 100, by = y1 / 100, zz = p.z0 + z / 100;
      const L = Math.hypot(bx - ax, by - ay) || 1;
      const nx = (by - ay) / L, ny = -(bx - ax) / L;
      const o = 0.28;
      prism([[ax, ay], [bx, by], [bx + nx * o, by + ny * o], [ax + nx * o, ay + ny * o]], zz - 0.22, zz, light, light);
    }
    for (const s of p.rs ?? []) {
      const ring: number[][] = [];
      for (let i = 0; i < s.r.length; i += 2) ring.push([s.r[i] / 100, s.r[i + 1] / 100]);
      const z0 = p.z0 + s.z0 / 100 - 0.1, z1 = p.z0 + s.z1 / 100;
      if (s.k === 1) {
        // chimney: rendered, a little cap on top
        const c: [number, number, number] = [0.62, 0.52, 0.45];
        prism(ring, z0, z1, c, [0.35, 0.33, 0.32]);
      } else {
        // stair housing / water tank on a terrace: facade colour walls, roof-coloured top
        prism(ring, z0, z1, [fr * 0.97, fg * 0.97, fb * 0.97], [rr, rg, rb]);
      }
    }
  }

  private buildBalconies() {
    // 0 old: stone slab + wrought iron; 1 1960-70s: concrete + solid parapet; 2 recent: slab + glass
    const railMat = new THREE.MeshLambertMaterial({ map: railingTex(), transparent: false, alphaTest: 0.5, side: THREE.DoubleSide });
    const slabMat = new THREE.MeshLambertMaterial({ color: 0xd9d2c4 });
    const parMat = new THREE.MeshLambertMaterial({ color: 0xcdb99a });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x9fb4bd, transparent: true, opacity: 0.45 });
    const specs = [
      { w: 1.3, d: 0.5, rail: railMat, h: 1.0 },
      { w: 2.0, d: 0.85, rail: parMat, h: 1.0 },
      { w: 2.3, d: 1.0, rail: glassMat, h: 1.0 },
    ];
    specs.forEach((s, type) => {
      const items = this.balconies.filter((b) => b.type === type);
      if (!items.length) return;
      const slab = new THREE.BoxGeometry(s.w, 0.14, s.d).translate(0, 0.0, s.d / 2);
      const front = new THREE.PlaneGeometry(s.w, s.h).translate(0, s.h / 2 + 0.07, s.d);
      const left = new THREE.PlaneGeometry(s.d, s.h).rotateY(Math.PI / 2).translate(-s.w / 2, s.h / 2 + 0.07, s.d / 2);
      const right = left.clone().translate(s.w, 0, 0);
      const slabMesh = new THREE.InstancedMesh(slab, slabMat, items.length);
      const railGeom = mergeSimple([front, left, right]);
      const railMesh = new THREE.InstancedMesh(railGeom, s.rail, items.length);
      items.forEach((b, i) => { slabMesh.setMatrixAt(i, b.m); railMesh.setMatrixAt(i, b.m); });
      slabMesh.castShadow = true; railMesh.castShadow = type !== 2;
      slabMesh.receiveShadow = true;
      slabMesh.computeBoundingSphere(); railMesh.computeBoundingSphere();
      this.group.add(slabMesh, railMesh);
    });
    this.balconyCount = this.balconies.length;
    this.balconies = [];
  }
  balconyCount = 0;

  /** Hide tiles far away (fog covers them anyway). */
  update(camX: number, camY: number) {
    for (const g of this.tileGroups) {
      const d = Math.hypot(g.userData.cx - camX, g.userData.cy - camY);
      g.visible = d < 1700;
    }
  }
}

/** Merge non-indexed-compatible geometries with the same attributes (position, normal, uv). */
export function mergeSimple(geoms: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let off = 0;
  for (const g0 of geoms) {
    const g = g0.index ? g0 : g0;
    const p = g.getAttribute('position'), n = g.getAttribute('normal'), u = g.getAttribute('uv');
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      nor.push(n.getX(i), n.getY(i), n.getZ(i));
      if (u) uv.push(u.getX(i), u.getY(i)); else uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off);
    else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}

