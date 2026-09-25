// Stream beds (the rieres are dry most of the year: gravel), ponds and pools.
// One mesh per layer and 500 m block.
import * as THREE from 'three';
import type { BinFile } from '../data/binfmt';
import type { Meta } from '../data/types';
import type { HeightField } from './heightfield';
import { gravelTex } from './textures';

export class Water {
  group = new THREE.Group();

  constructor(bin: BinFile, meta: Meta, hf: HeightField) {
    const V = bin.arrays.wverts as Float32Array, I = bin.arrays.widx as Uint32Array;
    const Z = bin.arrays.wz as Float32Array;
    const layers: string[] = bin.meta.layers;
    const mats: Record<string, THREE.Material> = {
      bed: new THREE.MeshLambertMaterial({ map: gravelTex(), color: 0xc8bba0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
      water: new THREE.MeshPhongMaterial({ color: 0x4d7f8a, specular: 0x99bbcc, shininess: 80, transparent: true, opacity: 0.88 }),
      pool: new THREE.MeshPhongMaterial({ color: 0x38b6cf, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.92 }),
    };
    const S = meta.tile * 2;
    const bnx = Math.ceil(meta.tiles.nx / 2);
    const acc = new Map<string, { layer: string; tx: number; ty: number; pos: number[]; uv: number[]; idx: number[] }>();
    for (const c of bin.meta.chunks) {
      const layer = layers[c.s];
      const bi = Math.floor((c.t % meta.tiles.nx) / 2), bj = Math.floor(Math.floor(c.t / meta.tiles.nx) / 2);
      const tx = meta.tiles.x0 + bi * S + S / 2, ty = meta.tiles.y0 + bj * S + S / 2;
      const key = (bi + bj * bnx) + ':' + layer;
      let a = acc.get(key);
      if (!a) acc.set(key, (a = { layer, tx, ty, pos: [], uv: [], idx: [] }));
      const v = V.subarray(c.v0 * 2, (c.v0 + c.vn) * 2);
      const lv = Z.subarray(c.v0, c.v0 + c.vn); // one flat level per pool / pond (from the pipeline)
      const base = a.pos.length / 3;
      for (let k = 0; k < c.vn; k++) {
        const x = v[k * 2], y = v[k * 2 + 1];
        const z = layer === 'bed' ? hf.heightAt(x, y) + 0.04 : lv[k] + (layer === 'pool' ? 0.02 : 0.1);
        a.pos.push(x - tx, z, -(y - ty));
        a.uv.push(x / 2, y / 2);
      }
      const idx = I.subarray(c.i0, c.i0 + c.in);
      for (let k = 0; k < idx.length; k += 3) {
        const i0 = idx[k], i1 = idx[k + 1], i2 = idx[k + 2];
        const cr = (v[i1 * 2] - v[i0 * 2]) * (v[i2 * 2 + 1] - v[i0 * 2 + 1]) - (v[i1 * 2 + 1] - v[i0 * 2 + 1]) * (v[i2 * 2] - v[i0 * 2]);
        if (cr < 0) a.idx.push(base + i0, base + i2, base + i1); else a.idx.push(base + i0, base + i1, base + i2);
      }
    }
    for (const a of acc.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(a.uv, 2));
      g.setIndex(a.idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mats[a.layer]);
      m.position.set(a.tx, 0, -a.ty);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
    }
  }
}
