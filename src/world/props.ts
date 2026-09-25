// Street furniture: lamps (wall-mounted "fanals de braç", poles and square
// lamps), benches, drinking fountains, bins, bus shelters, post boxes and
// playgrounds. Everything is instanced; lamps light up at night.
import * as THREE from 'three';
import type { Collision } from './collision';
import { lampUniform } from './sky';
import { mergeSimple } from './buildings';

export interface PropsFile {
  benches: number[][]; drinking: number[][]; fountains: any[][]; bins: number[][]; bus: any[][]; post: number[][];
  lamps: number[][]; bikeRacks: number[][]; playgrounds: number[][]; bikes: any[][];
}

const iron = new THREE.MeshLambertMaterial({ color: 0x2b2d2c });
const green = new THREE.MeshLambertMaterial({ color: 0x2f4a3a });
const woodM = new THREE.MeshLambertMaterial({ color: 0x8a5a33 });
const grey = new THREE.MeshLambertMaterial({ color: 0x8b8e90 });
const yellow = new THREE.MeshLambertMaterial({ color: 0xe8b21c });
const glassOn = new THREE.MeshLambertMaterial({ color: 0xfff1c9, emissive: 0xffc877, emissiveIntensity: 0 });

/** rotation.y that points local +z to the direction angle a (radians from east, counter-clockwise). */
const yawTo = (a: number) => Math.atan2(Math.cos(a), -Math.sin(a));

function g(geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const out = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
  if (!out.getAttribute('uv')) out.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(out.getAttribute('position').count * 2), 2));
  return out;
}
const B = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const C = (r0: number, r1: number, h: number, s = 8) => new THREE.CylinderGeometry(r0, r1, h, s);

function lantern() {
  // hexagonal glass lantern with a small cap: [structure, glass]
  return [mergeSimple([g(C(0.02, 0.2, 0.18, 6), 0, 0.5, 0), g(C(0.06, 0.06, 0.08, 6), 0, 0.62, 0), g(C(0.1, 0.1, 0.05, 6), 0, 0, 0)]),
    mergeSimple([g(C(0.18, 0.12, 0.42, 6), 0, 0.23, 0)])];
}

const vcolMat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** Merge geometries, baking each material colour into a vertex colour attribute. */
function bakeColors(parts: [THREE.BufferGeometry, THREE.Material][]) {
  const geos = parts.map(([geo, mat]) => {
    const g2 = geo.index ? geo.toNonIndexed() : geo.clone();
    const c = (mat as THREE.MeshLambertMaterial).color ?? new THREE.Color(1, 1, 1);
    const n = g2.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g2;
  });
  let n = 0;
  for (const g2 of geos) n += g2.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g2 of geos) {
    const k = g2.getAttribute('position').count;
    pos.set(g2.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g2.getAttribute('normal').array as Float32Array, o * 3);
    col.set(g2.getAttribute('color').array as Float32Array, o * 3);
    o += k;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

const BLOCK = 500;
/** Split rows [x, y, ...] into 500 m blocks so each InstancedMesh can be culled. */
function blocks<T extends number[] | any[]>(rows: T[]): T[][] {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = `${Math.floor(r[0] / BLOCK)},${Math.floor(r[1] / BLOCK)}`;
    let l = m.get(k);
    if (!l) m.set(k, (l = []));
    l.push(r);
  }
  return [...m.values()];
}

export class Props {
  group = new THREE.Group();
  private blockMeshes: { m: THREE.Object3D; x: number; y: number }[] = [];
  private lamps: { x: number; y: number; z: number }[] = [];
  private lights: THREE.PointLight[] = [];
  private glow!: THREE.Points;
  private glowMat!: THREE.PointsMaterial;

  constructor(data: PropsFile, private surface: (x: number, y: number) => number, col: Collision) {
    this.buildLamps(data.lamps, col);
    this.instanced(data.benches, (m) => {
      m.push([mergeSimple([g(B(1.8, 0.05, 0.45), 0, 0.45, 0), g(B(1.8, 0.4, 0.05), 0, 0.72, -0.22, -0.18)]), woodM]);
      m.push([mergeSimple([g(B(0.06, 0.45, 0.45), -0.75, 0.22, 0), g(B(0.06, 0.45, 0.45), 0.75, 0.22, 0)]), iron]);
    }, col, 0.55, 2);
    this.instanced(data.drinking.map((p) => [p[0], p[1], 0]), (m) => {
      m.push([mergeSimple([g(C(0.12, 0.16, 1.05, 10), 0, 0.52, 0), g(new THREE.SphereGeometry(0.14, 8, 6), 0, 1.1, 0),
        g(C(0.02, 0.02, 0.22, 6), 0, 0.85, 0.12, Math.PI / 2), g(C(0.25, 0.2, 0.12, 12), 0, 0.3, 0.3)]), green]);
    }, col, 0.3, 2);
    this.instanced(data.bins.map((p) => [p[0], p[1], 0]), (m) => {
      m.push([mergeSimple([g(C(0.22, 0.2, 0.7, 10), 0, 0.35, 0)]), grey]);
    }, col, 0.25, 2);
    this.instanced(data.post.map((p) => [p[0], p[1], 0]), (m) => {
      m.push([mergeSimple([g(B(0.5, 0.7, 0.4), 0, 0.85, 0), g(C(0.08, 0.08, 0.5), 0, 0.25, 0)]), yellow]);
    }, col, 0.3, 2);
    this.instanced(data.bus.map((p) => [p[0], p[1], p[2]]), (m) => {
      m.push([mergeSimple([g(B(3.2, 0.1, 1.5), 0, 2.4, 0), g(B(0.08, 2.4, 0.08), -1.5, 1.2, -0.65), g(B(0.08, 2.4, 0.08), 1.5, 1.2, -0.65),
        g(B(2.9, 0.05, 0.4), 0, 0.45, -0.5)]), grey]);
      m.push([mergeSimple([g(B(3.0, 1.9, 0.04), 0, 1.35, -0.7)]), new THREE.MeshLambertMaterial({ color: 0xa9c4cc, transparent: true, opacity: 0.4 })]);
    }, col, 0.0, 3, true);
    this.playgrounds(data.playgrounds);
  }

  /** Generic instanced prop: rows [x, y, angle]. Opaque parts are baked into one vertex-coloured geometry. */
  private instanced(rows: number[][], build: (m: [THREE.BufferGeometry, THREE.Material][]) => void, col: Collision,
                    radius: number, _kind: number, roadAngle = false) {
    if (!rows.length) return;
    const raw: [THREE.BufferGeometry, THREE.Material][] = [];
    build(raw);
    const opaque = raw.filter(([, m]) => !(m as any).transparent);
    const parts: [THREE.BufferGeometry, THREE.Material][] = raw.filter(([, m]) => (m as any).transparent);
    if (opaque.length) parts.unshift([bakeColors(opaque), vcolMat]);
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (const [geo, mat] of parts) for (const blk of blocks(rows)) {
      const im = new THREE.InstancedMesh(geo, mat, blk.length);
      blk.forEach((r, i) => {
        const [x, y, a] = r;
        // benches face the direction `a`; bus shelters run along the road (local +x = road direction)
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), roadAngle ? a : yawTo(a));
        p.set(x, this.surface(x, y), -y);
        mtx.compose(p, q, one);
        im.setMatrixAt(i, mtx);
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.blockMeshes.push({ m: im, x: blk[0][0], y: blk[0][1] });
    }
    if (radius > 0) for (const [x, y] of rows) col.addCircle(x, y, radius);
  }

  private buildLamps(rows: number[][], col: Collision) {
    // type 0 wall bracket, 1 pole on the sidewalk, 2 square lamp post
    const [lanS, lanG] = lantern();
    const specs = [
      { struct: mergeSimple([g(B(0.12, 0.3, 0.06), 0, 4.7, 0.03), g(C(0.025, 0.025, 0.85, 6), 0, 4.75, 0.45, Math.PI / 2),
        lanS.clone().translate(0, 4.1, 0.85)]), glass: lanG.clone().translate(0, 4.1, 0.85), h: 4.35, off: 0.85 },
      { struct: mergeSimple([g(C(0.05, 0.08, 5.6, 8), 0, 2.8, 0), g(C(0.1, 0.12, 0.5, 8), 0, 0.25, 0), g(C(0.025, 0.025, 0.9, 6), 0, 5.55, 0.42, Math.PI / 2 - 0.25),
        lanS.clone().translate(0, 5.0, 0.85)]), glass: lanG.clone().translate(0, 5.0, 0.85), h: 5.25, off: 0.85 },
      { struct: mergeSimple([g(C(0.07, 0.12, 3.9, 10), 0, 1.95, 0), g(C(0.2, 0.25, 0.6, 10), 0, 0.3, 0), g(B(1.3, 0.05, 0.05), 0, 3.95, 0), g(B(0.05, 0.05, 1.3), 0, 3.95, 0),
        lanS.clone().translate(0.62, 3.95, 0), lanS.clone().translate(-0.62, 3.95, 0), lanS.clone().translate(0, 3.95, 0.62), lanS.clone().translate(0, 3.95, -0.62)]),
      glass: mergeSimple([lanG.clone().translate(0.62, 3.95, 0), lanG.clone().translate(-0.62, 3.95, 0), lanG.clone().translate(0, 3.95, 0.62), lanG.clone().translate(0, 3.95, -0.62)]),
      h: 4.2, off: 0 },
    ];
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const glowPos: number[] = [];
    specs.forEach((spec, type) => blocks(rows.filter((r) => r[3] === type)).forEach((list) => {
      if (!list.length) return;
      const s = new THREE.InstancedMesh(spec.struct, type === 0 ? iron : green, list.length);
      const gl = new THREE.InstancedMesh(spec.glass, glassOn, list.length);
      list.forEach((r, i) => {
        const [x, y, a] = r;
        const z = this.surface(x, y);
        // local +z points to the street (direction angle a)
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yawTo(a));
        p.set(x, z, -y);
        mtx.compose(p, q, one);
        s.setMatrixAt(i, mtx); gl.setMatrixAt(i, mtx);
        const hx = x + Math.cos(a) * spec.off, hy = y + Math.sin(a) * spec.off;
        this.lamps.push({ x: hx, y: hy, z: z + spec.h });
        glowPos.push(hx, z + spec.h, -hy);
        if (type !== 0) col.addCircle(x, y, type === 2 ? 0.3 : 0.15);
      });
      s.castShadow = true;
      s.computeBoundingSphere(); gl.computeBoundingSphere();
      this.group.add(s, gl);
      this.blockMeshes.push({ m: s, x: list[0][0], y: list[0][1] }, { m: gl, x: list[0][0], y: list[0][1] });
    }));
    // glow halos at night (one Points object for all the lamps)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const grd = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,230,170,1)'); grd.addColorStop(0.25, 'rgba(255,200,120,0.55)'); grd.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.PointsMaterial({ size: 3.2, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, opacity: 0, sizeAttenuation: true });
    this.glow = new THREE.Points(geo, this.glowMat);
    this.glow.frustumCulled = false;
    this.group.add(this.glow);
    // a few real lights follow the player
    for (let i = 0; i < 6; i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 22, 1.6);
      this.lights.push(l);
      this.group.add(l);
    }
  }

  private playgrounds(rows: number[][]) {
    const red = new THREE.MeshLambertMaterial({ color: 0xc8453a }), blue = new THREE.MeshLambertMaterial({ color: 0x3b6fb6 });
    for (const [x, y] of rows) {
      const z = this.surface(x, y);
      const G = new THREE.Group();
      G.position.set(x, z, -y);
      const slide = new THREE.Mesh(mergeSimple([g(B(0.8, 1.6, 0.8), 0, 0.8, 0), g(B(0.6, 0.05, 2.6), 0, 0.85, 1.6, 0.55)]), red);
      const sw = new THREE.Mesh(mergeSimple([g(C(0.05, 0.05, 2.4), -1.2, 1.2, 0, 0, 0, 0.2), g(C(0.05, 0.05, 2.4), 1.2, 1.2, 0, 0, 0, -0.2),
        g(C(0.05, 0.05, 2.5), 0, 2.35, 0, 0, 0, Math.PI / 2)]), blue);
      sw.position.set(3, 0, 0);
      slide.castShadow = sw.castShadow = true;
      G.add(slide, sw);
      this.group.add(G);
    }
  }

  update(px: number, py: number) {
    for (const b of this.blockMeshes) b.m.visible = Math.hypot(b.x - px, b.y - py) < 900;
    const on = lampUniform.value;
    glassOn.emissiveIntensity = on ? 2.2 : 0;
    this.glowMat.opacity = on ? 0.9 : 0;
    if (!on) { for (const l of this.lights) l.intensity = 0; return; }
    // nearest lamps get a real light
    const near = this.lamps
      .map((l) => ({ l, d: (l.x - px) ** 2 + (l.y - py) ** 2 }))
      .filter((o) => o.d < 90 * 90)
      .sort((a, b) => a.d - b.d)
      .slice(0, this.lights.length);
    this.lights.forEach((light, i) => {
      const o = near[i];
      if (!o) { light.intensity = 0; return; }
      light.position.set(o.l.x, o.l.z - 0.3, -o.l.y);
      light.intensity = 18;
    });
  }

  get lampCount() { return this.lamps.length; }
}
