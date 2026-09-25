// Trees: low-poly models per species (olive, hazel, almond, carob, pine...)
// drawn with one InstancedMesh per species and level of detail. Instances are
// re-selected by distance a few times per second (near = detailed + shadows,
// far = simple blob), culled per 250 m tile against the camera frustum.
import * as THREE from 'three';
import type { BinFile } from '../data/binfmt';
import type { Meta } from '../data/types';
import type { HeightField } from './heightfield';
import type { Collision } from './collision';

type Blob = { x: number; y: number; z: number; sx: number; sy: number; sz: number; c: number };
interface Spec {
  trunk: { h: number; r: number; lean?: number; stems?: number };
  blobs: Blob[];
  palm?: boolean;
  cone?: boolean;
}

const TRUNK = 0x6b5640;
// unit tree: height 1, crown radius 1 (scaled per instance by h and r)
const SPECS: Spec[] = [
  /* olive */ { trunk: { h: 0.42, r: 0.09, lean: 0.12 }, blobs: [
    { x: 0, y: 0.62, z: 0, sx: 0.95, sy: 0.4, sz: 0.9, c: 0x7b8a5f }, { x: 0.35, y: 0.78, z: 0.2, sx: 0.6, sy: 0.3, sz: 0.55, c: 0x8b9a70 },
    { x: -0.3, y: 0.8, z: -0.25, sx: 0.55, sy: 0.28, sz: 0.6, c: 0x6d7a55 }] },
  /* hazel */ { trunk: { h: 0.3, r: 0.035, stems: 4 }, blobs: [
    { x: 0, y: 0.58, z: 0, sx: 0.95, sy: 0.45, sz: 0.95, c: 0x5b7f31 }, { x: 0.2, y: 0.82, z: -0.15, sx: 0.6, sy: 0.25, sz: 0.6, c: 0x6a8f3a }] },
  /* almond */ { trunk: { h: 0.45, r: 0.07, lean: 0.08 }, blobs: [
    { x: 0.3, y: 0.7, z: 0.1, sx: 0.55, sy: 0.3, sz: 0.55, c: 0x7f9a4a }, { x: -0.3, y: 0.72, z: -0.1, sx: 0.55, sy: 0.3, sz: 0.55, c: 0x86a052 },
    { x: 0, y: 0.84, z: 0.3, sx: 0.5, sy: 0.22, sz: 0.5, c: 0x77924a }, { x: 0.05, y: 0.62, z: -0.35, sx: 0.45, sy: 0.25, sz: 0.45, c: 0x80994c }] },
  /* carob */ { trunk: { h: 0.32, r: 0.1 }, blobs: [
    { x: 0, y: 0.62, z: 0, sx: 1.0, sy: 0.42, sz: 1.0, c: 0x3b5a2d }, { x: 0.1, y: 0.86, z: 0.05, sx: 0.65, sy: 0.2, sz: 0.65, c: 0x46683a }] },
  /* citrus */ { trunk: { h: 0.2, r: 0.07 }, blobs: [
    { x: 0, y: 0.6, z: 0, sx: 1.0, sy: 0.45, sz: 1.0, c: 0x2f4d27 }, { x: 0.3, y: 0.55, z: 0.5, sx: 0.08, sy: 0.08, sz: 0.08, c: 0xe08a1f }] },
  /* fruit */ { trunk: { h: 0.4, r: 0.06 }, blobs: [
    { x: 0, y: 0.7, z: 0, sx: 0.9, sy: 0.35, sz: 0.9, c: 0x6f9140 }, { x: -0.25, y: 0.86, z: 0.2, sx: 0.5, sy: 0.2, sz: 0.5, c: 0x7a9d48 }] },
  /* pine */ { trunk: { h: 0.78, r: 0.05, lean: 0.1 }, blobs: [
    { x: 0.1, y: 0.86, z: 0, sx: 1.0, sy: 0.16, sz: 0.95, c: 0x3e5a22 }, { x: -0.3, y: 0.8, z: 0.2, sx: 0.55, sy: 0.12, sz: 0.55, c: 0x46642a }] },
  /* broadleaf (urban plane trees / elms: pruned, tall clear trunk) */ { trunk: { h: 0.55, r: 0.05 }, blobs: [
    { x: 0, y: 0.73, z: 0, sx: 1.0, sy: 0.29, sz: 1.0, c: 0x4f6e2a }, { x: 0.25, y: 0.86, z: -0.2, sx: 0.65, sy: 0.2, sz: 0.65, c: 0x5c7d33 },
    { x: -0.3, y: 0.8, z: 0.25, sx: 0.6, sy: 0.2, sz: 0.6, c: 0x486526 }] },
  /* palm */ { trunk: { h: 0.86, r: 0.035 }, blobs: [], palm: true },
  /* cypress */ { trunk: { h: 0.08, r: 0.1 }, blobs: [], cone: true },
  /* elm */ { trunk: { h: 0.45, r: 0.06 }, blobs: [
    { x: 0, y: 0.7, z: 0, sx: 0.95, sy: 0.38, sz: 0.95, c: 0x44663a }, { x: 0.15, y: 0.88, z: 0.1, sx: 0.6, sy: 0.2, sz: 0.6, c: 0x4e7141 }] },
  /* shrub */ { trunk: { h: 0.05, r: 0.05 }, blobs: [{ x: 0, y: 0.5, z: 0, sx: 1.0, sy: 0.5, sz: 1.0, c: 0x4d6a2a }] },
  /* walnut */ { trunk: { h: 0.4, r: 0.07 }, blobs: [
    { x: 0, y: 0.68, z: 0, sx: 1.0, sy: 0.35, sz: 1.0, c: 0x5e8038 }] },
];

function colored(g: THREE.BufferGeometry, hex: number, jitter = 0.08, seed = 1) {
  g = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  let s = seed;
  for (let i = 0; i < n; i += 3) {
    s = (s * 16807) % 2147483647;
    const k = 1 - jitter + ((s % 1000) / 1000) * jitter * 2;
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = c.r * k; col[(i + j) * 3 + 1] = c.g * k; col[(i + j) * 3 + 2] = c.b * k; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}

function merge(list: THREE.BufferGeometry[]) {
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position'), q = g.getAttribute('normal'), c = g.getAttribute('color');
    pos.set(p.array as Float32Array, o * 3); nor.set(q.array as Float32Array, o * 3); col.set(c.array as Float32Array, o * 3);
    o += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}

/** Very far trees: a single octahedron crown (8 triangles). */
function buildTreeFar(spec: Spec): THREE.BufferGeometry {
  const b = spec.blobs[0];
  let g: THREE.BufferGeometry;
  if (spec.cone) g = new THREE.ConeGeometry(1, 0.95, 4, 1).translate(0, 0.52, 0);
  else if (spec.palm) g = new THREE.OctahedronGeometry(1).scale(0.9, 0.2, 0.9).translate(0, 0.86, 0);
  else g = new THREE.OctahedronGeometry(1).scale(b.sx, b.sy * 1.3, b.sz).translate(b.x, b.y, b.z);
  const c = colored(g, spec.cone ? 0x2c4a26 : spec.palm ? 0x5e7d34 : b.c, 0.05, 3);
  c.computeVertexNormals();
  return c;
}

function buildTree(spec: Spec, detail: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const t = spec.trunk;
  const stems = t.stems ?? 1;
  if (detail || spec.palm) {
    for (let s = 0; s < stems; s++) {
      const a = (s / stems) * Math.PI * 2;
      const off = stems > 1 ? 0.12 : 0;
      const g = new THREE.CylinderGeometry(t.r * 0.7, t.r, t.h, detail ? 6 : 4, 1).translate(0, t.h / 2, 0);
      if (t.lean || stems > 1) g.rotateZ((t.lean ?? 0.15) * (stems > 1 ? Math.cos(a) : 1)).rotateX(stems > 1 ? 0.15 * Math.sin(a) : 0);
      g.translate(Math.cos(a) * off, 0, Math.sin(a) * off);
      parts.push(colored(g, TRUNK, 0.1, s + 3));
    }
  }
  if (spec.palm) {
    const top = t.h;
    const n = detail ? 11 : 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const leaf = new THREE.PlaneGeometry(0.22, 1.0, 1, detail ? 3 : 1).translate(0, 0.5, 0);
      // droop: bend the blade down
      const p = leaf.getAttribute('position');
      for (let k = 0; k < p.count; k++) {
        const y = p.getY(k);
        p.setZ(k, p.getZ(k) - y * y * 0.45);
      }
      leaf.rotateX(-Math.PI / 2 + 0.55).rotateY(a).translate(0, top, 0);
      leaf.computeVertexNormals();
      parts.push(colored(leaf, 0x5e7d34, 0.12, i + 7));
    }
    parts.push(colored(new THREE.IcosahedronGeometry(0.08, 0).translate(0, top, 0), 0x6b5a30));
  } else if (spec.cone) {
    parts.push(colored(new THREE.ConeGeometry(1, 0.95, detail ? 7 : 4, 1).translate(0, 0.52, 0), 0x2c4a26, 0.1, 5));
  } else {
    spec.blobs.forEach((b, i) => {
      if (!detail && i > 1) return;
      const g = new THREE.IcosahedronGeometry(1, detail ? 1 : 0);
      g.scale(b.sx, b.sy, b.sz).translate(b.x, b.y, b.z);
      if (detail) {
        // lumpy crowns
        const p = g.getAttribute('position');
        for (let k = 0; k < p.count; k++) {
          const f = 1 + 0.12 * Math.sin(p.getX(k) * 9 + i) * Math.cos(p.getZ(k) * 7 - i);
          p.setXYZ(k, b.x + (p.getX(k) - b.x) * f, b.y + (p.getY(k) - b.y) * f, b.z + (p.getZ(k) - b.z) * f);
        }
      }
      parts.push(colored(g, b.c, 0.1, i + 11));
    });
  }
  const g = merge(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  g.computeVertexNormals();
  return g;
}

const NEAR = 110, MID = 400, FAR = 900;

export class Vegetation {
  group = new THREE.Group();
  private n: number;
  private x: Float32Array; private y: Float32Array; private z: Float32Array;
  private h: Float32Array; private r: Float32Array; private type: Uint8Array; private rot: Float32Array;
  private tileStart = new Map<number, [number, number]>();
  private near: THREE.InstancedMesh[] = [];
  private far: THREE.InstancedMesh[] = [];
  private vfar: THREE.InstancedMesh[] = [];
  private lastPos = new THREE.Vector3(1e9, 0, 0);
  private lastUpdate = 0;
  private frustum = new THREE.Frustum();
  private m4 = new THREE.Matrix4();
  farEnabled = true;

  constructor(bin: BinFile, private meta: Meta, hf: HeightField, collision: Collision) {
    const a = bin.arrays;
    this.n = a.tx.length;
    const n = this.n;
    this.x = new Float32Array(n); this.y = new Float32Array(n); this.z = new Float32Array(n);
    this.h = new Float32Array(n); this.r = new Float32Array(n); this.type = a.tt as Uint8Array; this.rot = new Float32Array(n);
    const tt = a.ttile as Uint16Array;
    const counts = new Array(SPECS.length).fill(0);
    for (let i = 0; i < n; i++) {
      this.x[i] = (a.tx as Int16Array)[i] / 10;
      this.y[i] = (a.ty as Int16Array)[i] / 10;
      this.z[i] = hf.heightAt(this.x[i], this.y[i]) - 0.05;
      this.h[i] = (a.th as Uint8Array)[i] / 10;
      this.r[i] = (a.tr as Uint8Array)[i] / 10;
      this.rot[i] = ((i * 2654435761) >>> 0) / 4294967296 * Math.PI * 2;
      counts[this.type[i]]++;
      const t = tt[i];
      const s = this.tileStart.get(t);
      if (!s) this.tileStart.set(t, [i, i + 1]); else s[1] = i + 1;
      // big trunks block the player
      if (this.h[i] > 3.5 && this.type[i] !== 11) collision.addCircle(this.x[i], this.y[i], this.type[i] === 8 ? 0.25 : 0.2 + this.r[i] * 0.03);
    }
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    const matFar = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    SPECS.forEach((spec, ti) => {
      const cap = Math.max(1, Math.min(counts[ti], 6000));
      const nm = new THREE.InstancedMesh(buildTree(spec, true), mat, cap);
      nm.count = 0; nm.castShadow = true; nm.receiveShadow = true; nm.frustumCulled = false;
      const fm = new THREE.InstancedMesh(buildTree(spec, false), matFar, Math.max(1, Math.min(counts[ti], 40000)));
      fm.count = 0; fm.frustumCulled = false;
      const vm = new THREE.InstancedMesh(buildTreeFar(spec), matFar, Math.max(1, counts[ti]));
      vm.count = 0; vm.frustumCulled = false;
      this.near.push(nm); this.far.push(fm); this.vfar.push(vm);
      this.group.add(nm, fm, vm);
    });
  }

  update(camera: THREE.Camera, force = false) {
    const now = performance.now();
    const p = camera.position;
    if (!force && now - this.lastUpdate < 250 && p.distanceToSquared(this.lastPos) < 16) return;
    this.lastUpdate = now;
    this.lastPos.copy(p);
    camera.updateMatrixWorld();
    this.frustum.setFromProjectionMatrix(this.m4.multiplyMatrices((camera as THREE.PerspectiveCamera).projectionMatrix, camera.matrixWorldInverse));
    const cx = p.x, cy = -p.z;
    const S = this.meta.tile;
    const nearCount = new Array(SPECS.length).fill(0), farCount = new Array(SPECS.length).fill(0);
    const vfarCount = new Array(SPECS.length).fill(0);
    const box = new THREE.Box3();
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [t, [s0, s1]] of this.tileStart) {
      const i = t % this.meta.tiles.nx, j = Math.floor(t / this.meta.tiles.nx);
      const x0 = this.meta.tiles.x0 + i * S, y0 = this.meta.tiles.y0 + j * S;
      const dx = Math.max(x0 - cx, 0, cx - (x0 + S)), dy = Math.max(y0 - cy, 0, cy - (y0 + S));
      const dTile = Math.hypot(dx, dy);
      if (dTile > FAR) continue;
      box.min.set(x0, this.z[s0] - 60, -(y0 + S));
      box.max.set(x0 + S, this.z[s0] + 80, -y0);
      if (!this.frustum.intersectsBox(box) && dTile > 20) continue;
      for (let k = s0; k < s1; k++) {
        const d = Math.hypot(this.x[k] - cx, this.y[k] - cy);
        const ty = this.type[k];
        if (d > FAR || (!this.farEnabled && d > MID)) continue;
        const lvl = d < NEAR ? 0 : d < MID ? 1 : 2;
        const mesh = lvl === 0 ? this.near[ty] : lvl === 1 ? this.far[ty] : this.vfar[ty];
        const cnt = lvl === 0 ? nearCount : lvl === 1 ? farCount : vfarCount;
        if (cnt[ty] >= mesh.instanceMatrix.count) continue;
        pos.set(this.x[k], this.z[k], -this.y[k]);
        q.setFromAxisAngle(up, this.rot[k]);
        sc.set(this.r[k], this.h[k], this.r[k]);
        this.m4.compose(pos, q, sc);
        mesh.setMatrixAt(cnt[ty]++, this.m4);
      }
    }
    for (let t = 0; t < SPECS.length; t++) {
      this.near[t].count = nearCount[t];
      this.far[t].count = farCount[t];
      this.vfar[t].count = vfarCount[t];
      this.near[t].visible = nearCount[t] > 0;
      this.far[t].visible = farCount[t] > 0;
      this.vfar[t].visible = vfarCount[t] > 0;
      this.near[t].instanceMatrix.needsUpdate = true;
      this.far[t].instanceMatrix.needsUpdate = true;
      this.vfar[t].instanceMatrix.needsUpdate = true;
    }
  }

  get total() { return this.n; }
}
