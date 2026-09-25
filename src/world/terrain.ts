// Terrain: one mesh per 250 m tile, draped with the ICGC orthophoto, with
// four levels of detail chosen by distance. Geometry for the finer levels is
// built on demand and freed when the tile is far again.
import * as THREE from 'three';
import type { Meta } from '../data/types';
import type { HeightField } from './heightfield';
import { detailTex } from './textures';

const SEGS = [64, 32, 16, 8];
const DIST = [260, 700, 1500];

interface Quad {
  x0: number; y0: number; cx: number; cy: number;
  mesh: THREE.Mesh;
  level: number; // 0 = 1 m, 1 = 2 m, 2 = 4 m
  geoms: (THREE.BufferGeometry | null)[];
  lastUsed: number[];
}

interface Tile {
  i: number;
  active: boolean;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  level: number;
  geoms: (THREE.BufferGeometry | null)[];
  mesh: THREE.Mesh;
  lastUsed: number[];
  quads: Quad[] | null; // detail quadrants used when the tile is at level 0
}

const QSEGS = [125, 62, 32];
const QDIST = [80, 160];

/** Adds a world-space detail texture that fades out with distance. */
/** Colour of the ground outside the town (a neutral, maquette-like base). */
export const NEUTRAL = 0xcfc7b6;

interface RegionMask { tex: THREE.Texture; box: THREE.Vector4 }

/** Soft mask of the town outline (1 inside, 0 outside, ~10 m fade) for the terrain shader. */
function regionMask(meta: Meta): RegionMask | null {
  const r = meta.region;
  if (!r?.length) return null;
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]);
  const pad = 40, res = 2;
  const minx = Math.min(...xs) - pad, miny = Math.min(...ys) - pad;
  const w = Math.ceil((Math.max(...xs) + pad - minx) / res), h = Math.ceil((Math.max(...ys) + pad - miny) / res);
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
  c.filter = 'blur(3px)';
  c.fillStyle = '#fff';
  c.beginPath();
  r.forEach(([x, y], i) => { const px = (x - minx) / res, py = (y - miny) / res; if (i) c.lineTo(px, py); else c.moveTo(px, py); });
  c.closePath(); c.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.colorSpace = THREE.NoColorSpace;
  return { tex, box: new THREE.Vector4(minx, miny, w * res, h * res) };
}

export function addDetail(mat: THREE.Material, strength = 0.55, scale = 0.45, mask: RegionMask | null = null) {
  const dt = detailTex();
  const neutral = new THREE.Color(NEUTRAL);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: dt };
    sh.uniforms.uMask = { value: mask?.tex ?? null };
    sh.uniforms.uMaskBox = { value: mask?.box ?? new THREE.Vector4(0, 0, 1, 1) };
    sh.uniforms.uNeutral = { value: neutral };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail;' +
        (mask ? '\nuniform sampler2D uMask;\nuniform vec4 uMaskBox;\nuniform vec3 uNeutral;' : ''))
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float dist = length(vWPos - cameraPosition);
          float fade = clamp(1.0 - dist / 90.0, 0.0, 1.0);
          float d1 = texture2D(uDetail, vWPos.xz * ${scale.toFixed(3)}).r;
          float d2 = texture2D(uDetail, vWPos.xz * ${(scale * 0.13).toFixed(4)}).r;
          float d = mix(1.0, (d1 * 0.6 + d2 * 0.4) * 2.0, ${strength.toFixed(2)} * fade);
          diffuseColor.rgb *= d;
        }` + (mask ? `
        {
          vec2 mp = (vec2(vWPos.x, -vWPos.z) - uMaskBox.xy) / uMaskBox.zw;
          float inside = (mp.x < 0.0 || mp.y < 0.0 || mp.x > 1.0 || mp.y > 1.0) ? 0.0 : texture2D(uMask, mp).r;
          diffuseColor.rgb = mix(uNeutral, diffuseColor.rgb, inside);
        }` : ''));
  };
  mat.customProgramCacheKey = () => 'detail' + strength + scale + (mask ? 'm' : '');
}

export class Terrain {
  group = new THREE.Group();
  private tiles: Tile[] = [];
  private frame = 0;

  constructor(private hf: HeightField, private meta: Meta, textures: (THREE.Texture | null)[]) {
    const { x0, y0, nx, ny } = meta.tiles;
    const S = meta.tile;
    const mask = regionMask(meta);
    const neutral = new THREE.MeshLambertMaterial({ color: NEUTRAL });
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = j * nx + i;
        const tx0 = x0 + i * S, ty0 = y0 + j * S;
        let mat: THREE.MeshLambertMaterial;
        if (textures[t]) {
          mat = new THREE.MeshLambertMaterial({ map: textures[t] });
          addDetail(mat, 0.55, 0.45, mask);
        } else mat = neutral; // outside the town: plain relief, no photo
        const tile: Tile = {
          active: !!textures[t],
          i: t, x0: tx0, y0: ty0, cx: tx0 + S / 2, cy: ty0 + S / 2, level: -1,
          geoms: [null, null, null, null], mesh: new THREE.Mesh(undefined, mat), lastUsed: [0, 0, 0, 0], quads: null,
        };
        tile.mesh.position.set(tile.cx, 0, -tile.cy);
        tile.mesh.receiveShadow = true;
        tile.mesh.matrixAutoUpdate = false;
        tile.mesh.updateMatrix();
        tile.mesh.name = 'terrain';
        this.tiles.push(tile);
        this.group.add(tile.mesh);
      }
    }
    this.group.add(this.buildOuter());
  }

  private buildGeom(tile: Tile, level: number): THREE.BufferGeometry {
    return this.buildGrid(tile, tile.x0, tile.y0, this.meta.tile, SEGS[level]);
  }

  /** Regular grid of N x N cells covering [gx0, gx0 + size] (positions relative to the tile centre). */
  private buildGrid(tile: Tile, gx0: number, gy0: number, size: number, N: number): THREE.BufferGeometry {
    const S = this.meta.tile;
    const step = size / N;
    const nv = (N + 1) * (N + 1);
    const nSkirt = 4 * N;
    const pos = new Float32Array((nv + nSkirt) * 3);
    const nor = new Float32Array((nv + nSkirt) * 3);
    const uv = new Float32Array((nv + nSkirt) * 2);
    const n = { x: 0, y: 1, z: 0 };
    let k = 0;
    for (let r = 0; r <= N; r++) {
      const y = gy0 + r * step;
      for (let c = 0; c <= N; c++) {
        const x = gx0 + c * step;
        const h = this.hf.heightAt(x, y);
        pos[k * 3] = x - tile.cx;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = -(y - tile.cy);
        this.hf.normalAt(x, y, Math.max(step, 1), n);
        nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
        uv[k * 2] = (x - tile.x0) / S;
        uv[k * 2 + 1] = (y - tile.y0) / S;
        k++;
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const a = r * (N + 1) + c, b = a + 1, d = a + N + 1, e = d + 1;
        idx.push(a, b, e, a, e, d);
      }
    }
    // skirts: walk the border and add a lowered copy of each border vertex
    const border: number[] = [];
    for (let c = 0; c < N; c++) border.push(c);
    for (let r = 0; r < N; r++) border.push(r * (N + 1) + N);
    for (let c = N; c > 0; c--) border.push(N * (N + 1) + c);
    for (let r = N; r > 0; r--) border.push(r * (N + 1));
    const s0 = k;
    for (const b of border) {
      pos[k * 3] = pos[b * 3];
      pos[k * 3 + 1] = pos[b * 3 + 1] - 4;
      pos[k * 3 + 2] = pos[b * 3 + 2];
      nor[k * 3] = nor[b * 3]; nor[k * 3 + 1] = nor[b * 3 + 1]; nor[k * 3 + 2] = nor[b * 3 + 2];
      uv[k * 2] = uv[b * 2]; uv[k * 2 + 1] = uv[b * 2 + 1];
      k++;
    }
    for (let q = 0; q < border.length; q++) {
      const a = border[q], b = border[(q + 1) % border.length];
      const sa = s0 + q, sb = s0 + ((q + 1) % border.length);
      idx.push(a, sa, b, b, sa, sb);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  /** A big coarse apron beyond the data area so the horizon is not empty. */
  private buildOuter(): THREE.Mesh {
    const { x0, y0, nx, ny } = this.meta.tiles;
    const S = this.meta.tile;
    const minx = x0, miny = y0, maxx = x0 + nx * S, maxy = y0 + ny * S;
    const R = 9000, N = 48;
    const neutral = new THREE.Color(NEUTRAL).convertSRGBToLinear();
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
    for (let r = 0; r <= N; r++) {
      for (let c = 0; c <= N; c++) {
        const x = cx - R + (2 * R * c) / N, y = cy - R + (2 * R * r) / N;
        const inside = x > minx && x < maxx && y > miny && y < maxy;
        const clx = Math.min(Math.max(x, minx), maxx), cly = Math.min(Math.max(y, miny), maxy);
        const d = Math.hypot(x - clx, y - cly);
        const h = this.hf.heightAt(clx, cly) - (inside ? 30 : 0.6 + d * 0.004);
        pos.push(x, h, -y);
        col.push(neutral.r, neutral.g, neutral.b);
      }
    }
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const a = r * (N + 1) + c, b = a + 1, d = a + N + 1, e = d + 1;
      idx.push(a, b, e, a, e, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    m.receiveShadow = false;
    m.name = 'outer';
    return m;
  }

  private makeQuads(t: Tile): Quad[] {
    const S = this.meta.tile, h = S / 2;
    const out: Quad[] = [];
    for (const [qi, qj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const x0 = t.x0 + qi * h, y0 = t.y0 + qj * h;
      const mesh = new THREE.Mesh(undefined, t.mesh.material);
      mesh.position.copy(t.mesh.position);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.name = 'terrain';
      mesh.visible = false;
      this.group.add(mesh);
      out.push({ x0, y0, cx: x0 + h / 2, cy: y0 + h / 2, mesh, level: -1, geoms: [null, null, null], lastUsed: [0, 0, 0] });
    }
    return out;
  }

  /** Choose levels of detail around the camera (local coords). */
  update(camX: number, camY: number, force = false) {
    this.frame++;
    if (!force && this.frame % 6 !== 0) return;
    const S = this.meta.tile;
    const now = performance.now();
    let built = 0;
    for (const t of this.tiles) {
      const dx = Math.max(Math.abs(camX - t.cx) - S / 2, 0);
      const dy = Math.max(Math.abs(camY - t.cy) - S / 2, 0);
      const d = Math.hypot(dx, dy);
      let lvl = d < DIST[0] ? 0 : d < DIST[1] ? 1 : d < DIST[2] ? 2 : 3;
      if (!t.active) lvl = Math.max(lvl, 1); // plain relief around the town: 8 m grid is enough
      // limit the number of expensive rebuilds per update, use a coarser level meanwhile
      while (!t.geoms[lvl] && built >= 2 && !force && lvl < 3) lvl++;
      if (!t.geoms[lvl]) {
        t.geoms[lvl] = this.buildGeom(t, lvl);
        if (lvl < 2) built++;
      }
      t.lastUsed[lvl] = now;
      if (t.level !== lvl) {
        t.mesh.geometry = t.geoms[lvl]!;
        t.level = lvl;
      }
      // near tiles are drawn as four 125 m quadrants with their own resolution (1 m / 2 m / 4 m)
      const useQuads = lvl === 0;
      t.mesh.visible = !useQuads;
      if (useQuads && !t.quads) t.quads = this.makeQuads(t);
      if (t.quads) for (const q of t.quads) {
        q.mesh.visible = useQuads;
        if (!useQuads) continue;
        const qd = Math.hypot(Math.max(Math.abs(camX - q.cx) - S / 4, 0), Math.max(Math.abs(camY - q.cy) - S / 4, 0));
        let ql = qd < QDIST[0] ? 0 : qd < QDIST[1] ? 1 : 2;
        if (ql === 0 && this.hf.resolutionAt(q.cx, q.cy) > 1) ql = 1;
        while (!q.geoms[ql] && built >= 3 && !force && ql < 2) ql++;
        if (!q.geoms[ql]) {
          q.geoms[ql] = this.buildGrid(t, q.x0, q.y0, S / 2, QSEGS[ql]);
          built++;
        }
        q.lastUsed[ql] = now;
        if (q.level !== ql) { q.mesh.geometry = q.geoms[ql]!; q.level = ql; }
        for (let l = 0; l < 2; l++) {
          if (l !== ql && q.geoms[l] && now - q.lastUsed[l] > 15000) { q.geoms[l]!.dispose(); q.geoms[l] = null; }
        }
      }
      // free fine geometry not used for 20 s
      for (let l = 0; l < 2; l++) {
        if (l !== lvl && t.geoms[l] && now - t.lastUsed[l] > 20000) {
          t.geoms[l]!.dispose();
          t.geoms[l] = null;
        }
      }
    }
  }
}
