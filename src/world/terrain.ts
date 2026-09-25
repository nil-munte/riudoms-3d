// Terrain: one mesh per 250 m tile, draped with the ICGC orthophoto, with
// four levels of detail chosen by distance. Geometry for the finer levels is
// built on demand and freed when the tile is far again.
import * as THREE from 'three';
import type { Meta } from '../data/types';
import type { HeightField } from './heightfield';
import { detailTex } from './textures';

const SEGS = [64, 32, 16, 8];
const DIST = [260, 700, 1500];

interface Tile {
  i: number;
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  level: number;
  geoms: (THREE.BufferGeometry | null)[];
  mesh: THREE.Mesh;
  lastUsed: number[];
}

/** Adds a world-space detail texture that fades out with distance. */
export function addDetail(mat: THREE.Material, strength = 0.55, scale = 0.45) {
  const dt = detailTex();
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: dt };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nuniform sampler2D uDetail;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float dist = length(vWPos - cameraPosition);
          float fade = clamp(1.0 - dist / 90.0, 0.0, 1.0);
          float d1 = texture2D(uDetail, vWPos.xz * ${scale.toFixed(3)}).r;
          float d2 = texture2D(uDetail, vWPos.xz * ${(scale * 0.13).toFixed(4)}).r;
          float d = mix(1.0, (d1 * 0.6 + d2 * 0.4) * 2.0, ${strength.toFixed(2)} * fade);
          diffuseColor.rgb *= d;
        }`);
  };
  mat.customProgramCacheKey = () => 'detail' + strength + scale;
}

export class Terrain {
  group = new THREE.Group();
  private tiles: Tile[] = [];
  private frame = 0;

  constructor(private hf: HeightField, private meta: Meta, textures: THREE.Texture[]) {
    const { x0, y0, nx, ny } = meta.tiles;
    const S = meta.tile;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const t = j * nx + i;
        const tx0 = x0 + i * S, ty0 = y0 + j * S;
        const mat = new THREE.MeshLambertMaterial({ map: textures[t] });
        addDetail(mat);
        const tile: Tile = {
          i: t, x0: tx0, y0: ty0, cx: tx0 + S / 2, cy: ty0 + S / 2, level: -1,
          geoms: [null, null, null, null], mesh: new THREE.Mesh(undefined, mat), lastUsed: [0, 0, 0, 0],
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
    const N = SEGS[level];
    const S = this.meta.tile;
    const step = S / N;
    const nv = (N + 1) * (N + 1);
    const nSkirt = 4 * N;
    const pos = new Float32Array((nv + nSkirt) * 3);
    const nor = new Float32Array((nv + nSkirt) * 3);
    const uv = new Float32Array((nv + nSkirt) * 2);
    const n = { x: 0, y: 1, z: 0 };
    let k = 0;
    for (let r = 0; r <= N; r++) {
      const y = tile.y0 + r * step;
      for (let c = 0; c <= N; c++) {
        const x = tile.x0 + c * step;
        const h = this.hf.heightAt(x, y);
        pos[k * 3] = x - tile.cx;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = -(y - tile.cy);
        this.hf.normalAt(x, y, Math.max(step, 2), n);
        nor[k * 3] = n.x; nor[k * 3 + 1] = n.y; nor[k * 3 + 2] = n.z;
        uv[k * 2] = c / N;
        uv[k * 2 + 1] = r / N;
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
        const v = 0.55 + 0.05 * Math.sin(x * 0.003) * Math.cos(y * 0.002);
        col.push(v * 0.95, v * 0.9, v * 0.62);
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
