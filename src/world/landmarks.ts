// Custom models of the emblematic places. Massing comes from the Cadastre
// footprint and the LiDAR heights exported by scripts/p_landmarks.py; the
// ornament (retable, rose window, bell tower terrace, espadanya, fountains...)
// is procedural, sized from the heritage research (see data/raw/heritage/).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HeightField } from './heightfield';
import type { Collision } from './collision';
import {
  ashlarTex, casalLogoTex, clockTex, mosaicTex, pavingTex, roofTileTex, rubbleTex, tilesTex,
} from './textures';
import { Character } from '../player/character';
import { buildDecor, damaStatue, lanternMat, omLamp, palmBed, type Decor } from './decor';
import { lampUniform } from './sky';

export interface Sign { id: string; name: string; x: number; y: number; r: number; text: string; src: string }
export interface LandmarksFile {
  signs: Sign[];
  teleports: { name: string; x: number; y: number }[];
  models: any;
  credits: { title: string; author: string; license: string }[];
}

type P2 = [number, number];

const M = {
  ashlar: () => new THREE.MeshLambertMaterial({ map: ashlarTex(), color: 0xf0e2c6 }),
  rubble: () => new THREE.MeshLambertMaterial({ map: rubbleTex() }),
};

function ringPairs(r: number[]): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < r.length; i += 2) out.push([r[i], r[i + 1]]);
  return out;
}

/** Sutherland-Hodgman clip of a polygon against the half plane f >= 0. */
function clip(poly: P2[], f: (p: P2) => number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa * fb < 0) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Walls (from zb to top(x,y)) + roof surface of a world polygon. */
function extrude(poly: P2[], zb: number, top: (x: number, y: number) => number, wall: THREE.Material,
                 roof: THREE.Material | null, roofPieces?: P2[][], uvScale = 2): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  const ccw = area > 0;
  let u = 0;
  for (let i = 0; i < poly.length; i++) {
    let a = poly[i], b = poly[(i + 1) % poly.length];
    if (!ccw) [a, b] = [b, a];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 0.01) continue;
    const nx = dy / L, ny = -dx / L;
    const ta = top(a[0], a[1]), tb = top(b[0], b[1]);
    const k = pos.length / 3;
    pos.push(a[0], zb, -a[1], b[0], zb, -b[1], b[0], tb, -b[1], a[0], ta, -a[1]);
    for (let q = 0; q < 4; q++) nor.push(nx, 0, -ny);
    uv.push(u / uvScale, zb / uvScale, (u + L) / uvScale, zb / uvScale, (u + L) / uvScale, tb / uvScale, u / uvScale, ta / uvScale);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
    u += L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const w = new THREE.Mesh(g, wall);
  w.castShadow = w.receiveShadow = true;
  out.push(w);
  if (roof) {
    for (const piece of roofPieces ?? [poly]) {
      if (piece.length < 3) continue;
      const faces = THREE.ShapeUtils.triangulateShape(piece.map(([x, y]) => new THREE.Vector2(x, y)), []);
      const rp: number[] = [], ru: number[] = [], ri: number[] = [];
      for (const [x, y] of piece) { rp.push(x, top(x, y) + 0.01, -y); ru.push(x / 1.2, y / 1.2); }
      for (const [a, b, c] of faces) {
        const cr = (piece[b][0] - piece[a][0]) * (piece[c][1] - piece[a][1]) - (piece[b][1] - piece[a][1]) * (piece[c][0] - piece[a][0]);
        if (cr >= 0) ri.push(a, b, c); else ri.push(a, c, b);
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
      rg.setAttribute('uv', new THREE.Float32BufferAttribute(ru, 2));
      rg.setIndex(ri);
      rg.computeVertexNormals();
      const rm = new THREE.Mesh(rg, roof);
      rm.castShadow = rm.receiveShadow = true;
      out.push(rm);
    }
  }
  return out;
}

/** Group whose local +z points to world direction (dx, dy) and local +x to its right. */
function frameGroup(x: number, y: number, z: number, dx: number, dy: number) {
  const g = new THREE.Group();
  g.position.set(x, z, -y);
  g.rotation.y = Math.atan2(dx, -dy);
  return g;
}

/** Box whose UVs are in metres / 2 (textures keep their real scale on any size). */
function boxGeo(w: number, h: number, d: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // face order: +x, -x, +y, -y, +z, -z (4 vertices each)
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] / 2, uv.getY(i) * dims[f][1] / 2);
    }
  }
  return g;
}

/** Scale ExtrudeGeometry UVs (shape units = metres) to the 2 m texture tile. */
function extrudeGeo(shape: THREE.Shape, opts: THREE.ExtrudeGeometryOptions) {
  const g = new THREE.ExtrudeGeometry(shape, opts);
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 2, uv.getY(i) / 2);
  return g;
}

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(boxGeo(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** Round-arched opening shape (width w, height h to the crown). */
function archShape(w: number, h: number) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0);
  s.lineTo(r, 0);
  s.lineTo(r, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-r, 0);
  return s;
}

function flat(shape: THREE.Shape, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.ShapeGeometry(shape, 12), mat);
  m.position.set(x, y, z);
  return m;
}

export class Landmarks {
  group = new THREE.Group();
  skip = new Set<string>(['esglesia_sant_jaume']);
  data: LandmarksFile;
  private hf: HeightField;
  private dark = new THREE.MeshLambertMaterial({ color: 0x1d1b19 });
  private wood = new THREE.MeshLambertMaterial({ color: 0x5b3a22 });
  private iron = new THREE.MeshLambertMaterial({ color: 0x232323 });
  private bronze = new THREE.MeshStandardMaterial({ color: 0x6b4f2e, metalness: 0.75, roughness: 0.45 });
  private marble = new THREE.MeshLambertMaterial({ color: 0xe7e4dc });
  private roof = new THREE.MeshLambertMaterial({ map: roofTileTex(), color: 0xb07a55 });
  private water = new THREE.MeshPhongMaterial({ color: 0x3f8fb0, specular: 0xaaccdd, shininess: 90, transparent: true, opacity: 0.9 });
  private hedge = new THREE.MeshLambertMaterial({ color: 0x3f6b2e, flatShading: true });

  constructor(data: LandmarksFile, hf: HeightField, private col: Collision,
              private roofAt: (x: number, y: number) => number | null) {
    this.data = data;
    this.hf = hf;
    const m = data.models;
    if (m.church) this.church(m.church);
    if (m.ermita) this.ermita(m.ermita);
    if (m.damaOferent) this.damaOferent(m.damaOferent);
    if (m.plazaFountain) this.plazaFountain(m.plazaFountain);
    if (m.monumentGaudi) this.monumentGaudi(m.monumentGaudi);
    if (m.statueGaudi) this.statue(m.statueGaudi.pos, false);
    if (m.plegadora) this.statue(m.plegadora.pos, true);
    if (m.porxos) this.porxos(m.porxos.edges);
    if (m.casalLogo) this.casalLogo(m.casalLogo);
    if (m.mosaic && m.church) this.mosaic(m.church);
    for (const d of (m.decor ?? []) as Decor[]) this.group.add(buildDecor(d));
    if (m.omLamp) {
      const [x, y] = m.omLamp.pos;
      this.group.add(omLamp(x, y, hf.heightAt(x, y)));
      this.col.addCircle(x, y, 0.8);
    }
    if (m.palmBed) {
      const [x, y] = m.palmBed.pos;
      this.group.add(palmBed(x, y, hf.heightAt(x, y) - 0.05, m.palmBed.r));
      this.col.addCircle(x, y, m.palmBed.r);
    }
    this.mergeStatic();
  }

  /** Bake every plain mesh into one mesh per material (dozens of draw calls -> a handful). */
  private mergeStatic() {
    this.group.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const remove: THREE.Mesh[] = [];
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (mesh as any).isInstancedMesh || Array.isArray(mesh.material)) return;
      const mat = mesh.material as THREE.Material;
      if ((mat as any).transparent) return;
      let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
      g = g.applyMatrix4(mesh.matrixWorld);
      let l = byMat.get(mat);
      if (!l) byMat.set(mat, (l = []));
      l.push(g);
      remove.push(mesh);
    });
    for (const m of remove) m.removeFromParent();
    for (const [mat, list] of byMat) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  // ---------------------------------------------------------------- church
  private church(c: any) {
    const ash = M.ashlar(), rub = M.rubble();
    const { x: fx, y: fy, ax, ay, platform: zp } = c.frame;
    const cx = -ay, cy = ax; // across, positive to the left seen from the square
    const T = (x: number, y: number) => (x - fx) * cx + (y - fy) * cy;
    const n = c.nave;
    const tmid = (n.t0 + n.t1) / 2, half = (n.t1 - n.t0) / 2;
    const k = (n.ridge - n.eave) / half;
    const naveTop = (x: number, y: number) => zp + n.ridge - k * Math.min(half, Math.abs(T(x, y) - tmid));
    const nave = ringPairs(n.ring);
    // split the nave roof along the ridge
    const left = clip(nave, (p) => T(p[0], p[1]) - tmid), right = clip(nave, (p) => tmid - T(p[0], p[1]));
    for (const mm of extrude(nave, zp - 1.5, naveTop, rub, this.roof, [left, right])) this.group.add(mm);
    // chapels: roofs sloping outwards
    for (const ch of c.chapels) {
      const ring = ringPairs(ch.ring);
      const top = (x: number, y: number) => zp + ch.top + 0.6 - 0.25 * Math.max(0, Math.abs(T(x, y) - tmid) - half);
      for (const mm of extrude(ring, zp - 1.5, top, rub, this.roof)) this.group.add(mm);
    }
    // outer extent of the chapels on each side (for buttresses)
    let tl = n.t1, tr = n.t0;
    for (const ch of c.chapels) for (const [x, y] of ringPairs(ch.ring)) { const t = T(x, y); tl = Math.max(tl, t); tr = Math.min(tr, t); }
    // everything else is built in the church frame: local z = -s (towards the square), local x = -t
    const G = frameGroup(fx, fy, zp, -ax, -ay);
    this.group.add(G);
    const L = (s: number, t: number) => [-t, -s] as const;
    // buttresses with sloped tops and small gables over each chapel bay (seen on the flanks)
    const bay = 6.5;
    for (let i = 1; i * bay < n.length - 5; i++) {
      for (const [tin, tout] of [[n.t1, tl], [n.t0, tr]]) {
        if (Math.abs(tout - tin) < 2) continue;
        const depth = Math.abs(tout - tin) - 0.2;
        const sgn = Math.sign(tout - tin);
        const prof = new THREE.Shape();
        prof.moveTo(0, 0); prof.lineTo(depth, 0); prof.lineTo(depth, 14.8); prof.lineTo(0, 17.5); prof.lineTo(0, 0);
        const g = extrudeGeo(prof, { depth: 1.25, bevelEnabled: false });
        const b = new THREE.Mesh(g, ash);
        b.castShadow = b.receiveShadow = true;
        // profile x runs across (outwards), extrusion along s
        const [lx, lz] = L(i * bay - 0.6, tin);
        b.position.set(lx, 0, lz);
        b.rotation.y = sgn > 0 ? Math.PI : 0;
        if (sgn > 0) b.position.z -= 1.25;
        G.add(b);
        // chapel gable between this buttress and the next
        if ((i + 1) * bay < n.length - 3) {
          const gshape = new THREE.Shape();
          gshape.moveTo(-bay / 2 + 0.7, 0); gshape.lineTo(bay / 2 - 0.7, 0); gshape.lineTo(0, 2.3); gshape.lineTo(-bay / 2 + 0.7, 0);
          const gg = extrudeGeo(gshape, { depth, bevelEnabled: false });
          const gm = new THREE.Mesh(gg, rub);
          gm.castShadow = true;
          const [gx, gz] = L((i + 0.5) * bay, tin);
          gm.position.set(gx, c.chapels[0]?.top ?? 10.3, gz);
          gm.rotation.y = sgn > 0 ? -Math.PI / 2 : Math.PI / 2;
          G.add(gm);
        }
      }
    }
    // ---- facade (plane s = 0, front faces the square = local +z). The facade group sits 0.8 m in front
    // of the footprint line so the LiDAR nave outline (slightly dilated) never pokes through it.
    const FG = new THREE.Group();
    FG.position.z = 0.8;
    G.add(FG);
    const f = c.facade;
    const fw = n.t1 - n.t0;
    const [mx] = L(0, tmid);
    FG.add(box(fw + 0.4, f.crown + 1.5, 1.8, ash, mx, -1.5, -0.9));
    // mixtilinear clock gable
    const gs = new THREE.Shape();
    gs.moveTo(-3.2, 0); gs.lineTo(3.2, 0);
    gs.quadraticCurveTo(2.2, 0.4, 2.1, 1.6);
    gs.quadraticCurveTo(1.6, 2.6, 0.9, 2.9);
    gs.lineTo(0.9, f.gable_top - f.crown);
    gs.lineTo(-0.9, f.gable_top - f.crown);
    gs.lineTo(-0.9, 2.9);
    gs.quadraticCurveTo(-1.6, 2.6, -2.1, 1.6);
    gs.quadraticCurveTo(-2.2, 0.4, -3.2, 0);
    const gable = new THREE.Mesh(extrudeGeo(gs, { depth: 0.9, bevelEnabled: false }), ash);
    gable.position.set(mx, f.crown, -0.9);
    gable.castShadow = true;
    FG.add(gable);
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshLambertMaterial({ map: clockTex() }));
    clock.position.set(mx, f.crown + 1.55, 0.03);
    FG.add(clock);
    FG.add(box(0.06, 1.6, 0.06, this.iron, mx, f.gable_top, -0.45));
    FG.add(box(0.8, 0.06, 0.06, this.iron, mx, f.gable_top + 1.1, -0.45));
    // cornice along the crown
    FG.add(box(fw + 0.6, 0.35, 0.5, ash, mx, f.crown - 0.35, 0.1));
    // rose window
    const rose = new THREE.Mesh(new THREE.TorusGeometry(f.rose_d / 2, 0.22, 8, 36), ash);
    rose.position.set(mx, f.rose_h, 0.08);
    FG.add(rose);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(f.rose_d / 2 - 0.1, 36), new THREE.MeshLambertMaterial({ map: roseTex() }));
    glass.position.set(mx, f.rose_h, 0.02);
    FG.add(glass);
    for (let i = 0; i < 8; i++) {
      const bar = box(0.08, f.rose_d - 0.3, 0.06, ash, 0, -(f.rose_d - 0.3) / 2, 0);
      const holder = new THREE.Group();
      holder.position.set(mx, f.rose_h, 0.06);
      holder.rotation.z = (i / 8) * Math.PI;
      holder.add(bar);
      FG.add(holder);
    }
    // two-storey stone retable around the door
    const rw = f.retable_w;
    FG.add(box(rw + 0.6, 0.7, 0.8, ash, mx, 0, 0.35));
    for (const dx of [-3.5, -1.9, 1.9, 3.5]) {
      const colm = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 5.6, 12), ash);
      colm.position.set(mx + dx, 0.7 + 2.8, 0.4);
      colm.castShadow = true;
      FG.add(colm);
    }
    FG.add(box(rw + 0.4, 0.75, 0.9, ash, mx, 6.3, 0.35));
    for (const dx of [-3.1, -1.5, 1.5, 3.1]) FG.add(box(0.5, 3.4, 0.4, ash, mx + dx, 7.05, 0.35));
    FG.add(box(rw - 0.4, 0.4, 0.8, ash, mx, 10.45, 0.3));
    const ped = new THREE.Shape();
    ped.moveTo(-3.3, 0); ped.lineTo(3.3, 0); ped.lineTo(0, 1.8); ped.lineTo(-3.3, 0);
    const pm = new THREE.Mesh(extrudeGeo(ped, { depth: 0.6, bevelEnabled: false }), ash);
    pm.position.set(mx, 10.85, 0);
    FG.add(pm);
    // niches (dark, shell-topped) between the columns and pilasters
    for (const [dx, y0, w, h] of [[-2.7, 1.6, 0.9, 2.6], [2.7, 1.6, 0.9, 2.6], [-2.3, 7.6, 0.8, 2.2], [2.3, 7.6, 0.8, 2.2], [0, 7.6, 1.1, 2.5]] as const) {
      FG.add(flat(archShape(w, h), this.dark, mx + dx, y0, 0.03));
    }
    // coat of arms (1606) over the door and God the Father relief in the pediment
    const arms = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshLambertMaterial({ color: 0xd9c9a2 }));
    arms.scale.set(0.8, 1.1, 1);
    arms.position.set(mx, 5.75, 0.05);
    FG.add(arms);
    // round-arched door
    FG.add(flat(archShape(f.door_w + 0.6, f.door_h + 0.3), new THREE.MeshLambertMaterial({ color: 0xd8c49a }), mx, 0.7, 0.02));
    FG.add(flat(archShape(f.door_w, f.door_h), this.wood, mx, 0.7, 0.04));
    // platform steps towards the square (the LiDAR terrain already has the level change)
    const sq = hfAt(this.hf, fx - ax * 7, fy - ay * 7);
    const drop = zp - sq;
    if (drop > 0.12) {
      const nst = Math.min(6, Math.round(drop / 0.16));
      const pav = new THREE.MeshLambertMaterial({ map: pavingTex(), color: 0xe0d6c4 });
      for (let i = 0; i < nst; i++) {
        const h = drop - (i * drop) / nst;
        FG.add(box(fw + 9.5, h + 0.3, 0.45, pav, mx + 3.5, -drop - 0.3, 3.2 + i * 0.45));
      }
    }
    // collision in front of the facade (the ornament stands forward of the footprint line) and the retable
    const W = (sv: number, tv: number): [number, number] => [fx + ax * sv + cx * tv, fy + ay * sv + cy * tv];
    const seg = (s0: number, t0: number, s1: number, t1: number) => {
      const [x0, y0] = W(s0, t0), [x1, y1] = W(s1, t1);
      this.col.addSegment(x0, y0, x1, y1);
    };
    seg(-0.85, n.t0 - 0.2, -0.85, n.t1 + 0.2);
    seg(-1.5, tmid - f.retable_w / 2 - 0.4, -1.5, tmid + f.retable_w / 2 + 0.4);
    seg(-1.5, tmid - f.retable_w / 2 - 0.4, -0.85, tmid - f.retable_w / 2 - 0.4);
    seg(-1.5, tmid + f.retable_w / 2 + 0.4, -0.85, tmid + f.retable_w / 2 + 0.4);
    // ---- bell tower
    const tw = c.tower;
    const TG = frameGroup(tw.x, tw.y, zp, -ax, -ay);
    this.group.add(TG);
    const sd = tw.side, top = tw.top;
    TG.add(box(sd, top - 1.3 + 1.5, sd, ash, 0, -1.5, 0));
    TG.add(box(sd + 0.5, 0.45, sd + 0.5, ash, 0, 21.8, 0));
    TG.add(box(sd + 0.6, 0.5, sd + 0.6, ash, 0, top - 1.8, 0));
    // bell openings: two on the east-ish face, one on the others (campaners.com)
    const faces: [number, number, number][] = [[0, sd / 2 + 0.02, 0], [Math.PI / 2, sd / 2 + 0.02, 1], [Math.PI, sd / 2 + 0.02, 0], [-Math.PI / 2, sd / 2 + 0.02, 0]];
    for (const [rot, off, two] of faces) {
      const holder = new THREE.Group();
      holder.rotation.y = rot;
      TG.add(holder);
      const xs = two ? [-1.5, 1.5] : [0];
      for (const x of xs) {
        holder.add(flat(archShape(1.9, 4.4), ash, x, 24.3, off + 0.02));
        holder.add(flat(archShape(1.4, 3.9), this.dark, x, 24.5, off + 0.04));
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.55, 0.8, 10), this.bronze);
        bell.position.set(x, 25.9, off - 0.7);
        holder.add(bell);
      }
    }
    // terrace: balustrade between four corner posts, small tiled dome, weathervane
    const ty0 = top - 1.3;
    for (const [px, pz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) TG.add(box(0.75, 1.5, 0.75, ash, px * (sd / 2 - 0.35), ty0, pz * (sd / 2 - 0.35)));
    const balGeom = new THREE.CylinderGeometry(0.07, 0.09, 0.8, 6);
    const nb = Math.floor((sd - 1.4) / 0.28);
    const balusters = new THREE.InstancedMesh(balGeom, ash, nb * 4);
    const mtx = new THREE.Matrix4();
    let bi = 0;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < nb; i++) {
        const u = -sd / 2 + 0.75 + (i + 0.5) * ((sd - 1.5) / nb);
        const v = sd / 2 - 0.2;
        const [bx, bz] = side === 0 ? [u, v] : side === 1 ? [v, -u] : side === 2 ? [-u, -v] : [-v, u];
        mtx.makeTranslation(bx, ty0 + 0.5, bz);
        balusters.setMatrixAt(bi++, mtx);
      }
      const rail = side % 2 === 0 ? box(sd - 1.4, 0.16, 0.3, ash, 0, ty0 + 0.9, (side === 0 ? 1 : -1) * (sd / 2 - 0.2))
        : box(0.3, 0.16, sd - 1.4, ash, (side === 1 ? 1 : -1) * (sd / 2 - 0.2), ty0 + 0.9, 0);
      TG.add(rail);
    }
    balusters.castShadow = true;
    TG.add(balusters);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.9, 16), ash);
    drum.position.y = ty0 + 0.45;
    TG.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.roof);
    dome.position.y = ty0 + 0.9;
    dome.castShadow = true;
    TG.add(dome);
    TG.add(box(0.05, 1.6, 0.05, this.iron, 0, ty0 + 1.8, 0));
    const vane = box(0.9, 0.2, 0.02, this.iron, 0.3, ty0 + 3.0, 0);
    TG.add(vane);
    // the terrace floor
    TG.add(box(sd - 0.2, 0.2, sd - 0.2, ash, 0, ty0 - 0.2, 0));
    // Santíssim chapel (1878) behind the tower: small tiled dome with a lantern, seen on the flank
    // photos. Position and size ESTIMATED.
    const SG = frameGroup(tw.x + ax * 10, tw.y + ay * 10, zp, -ax, -ay);
    this.group.add(SG);
    const chTop = (c.chapels[0]?.top ?? 10.3) + 0.4;
    const sdrum = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 1.6, 8), rub);
    sdrum.position.y = chTop + 0.8;
    sdrum.castShadow = true;
    SG.add(sdrum);
    const cup = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.roof);
    cup.scale.y = 0.8;
    cup.position.y = chTop + 1.6;
    cup.castShadow = true;
    SG.add(cup);
    const lant = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.2, 8), ash);
    lant.position.y = chTop + 1.6 + 1.84 + 0.6;
    SG.add(lant);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.1, 8), this.roof);
    spike.position.y = chTop + 1.6 + 1.84 + 1.2 + 0.55;
    SG.add(spike);
  }

  private mosaic(c: any) {
    // in front of the church door, long axis parallel to the facade (position ESTIMATED from photos)
    const { x: fx, y: fy, ax, ay } = c.frame;
    const tmid = (c.nave.t0 + c.nave.t1) / 2;
    const cx = -ay, cy = ax;
    const px = fx - ax * 13 + cx * tmid, py = fy - ay * 13 + cy * tmid;
    const G = frameGroup(px, py, hfAt(this.hf, px, py) + 0.11, -ax, -ay);
    const g = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshLambertMaterial({
      map: mosaicTex(), transparent: true, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
    }));
    g.rotation.x = -Math.PI / 2;
    g.scale.set(4.2, 2.8, 1);
    g.receiveShadow = true;
    G.add(g);
    this.group.add(G);
  }

  // ---------------------------------------------------------------- ermita
  private ermita(e: any) {
    const G = frameGroup(e.x, e.y, e.ground, e.ax, e.ay);
    this.group.add(G);
    const stuc = new THREE.MeshLambertMaterial({ map: ashlarTex(), color: 0xf2c98c });
    const w = e.width;
    // cornice + pediment frame + oculus
    G.add(box(w + 0.5, 0.4, 0.6, stuc, 0, 8.3, 0.1));
    const ped = new THREE.Shape();
    ped.moveTo(-w / 2 - 0.2, 0); ped.lineTo(w / 2 + 0.2, 0); ped.lineTo(0, e.pediment - 8.7); ped.lineTo(-w / 2 - 0.2, 0);
    const pm = new THREE.Mesh(extrudeGeo(ped, { depth: 0.5, bevelEnabled: false }), stuc);
    pm.position.set(0, 8.7, -0.35);
    pm.castShadow = true;
    G.add(pm);
    const ocul = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), this.dark);
    ocul.position.set(0, 10.1, 0.17);
    G.add(ocul);
    // espadanya with one bell and small pinnacles
    const espShape = new THREE.Shape();
    espShape.moveTo(-1.3, 0); espShape.lineTo(1.3, 0); espShape.lineTo(1.3, 2.2); espShape.absarc(0, 2.2, 1.3, 0, Math.PI, false); espShape.lineTo(-1.3, 0);
    const hp = new THREE.Path();
    hp.moveTo(-0.55, 0.5); hp.lineTo(0.55, 0.5); hp.lineTo(0.55, 1.8); hp.absarc(0, 1.8, 0.55, 0, Math.PI, false); hp.lineTo(-0.55, 0.5);
    espShape.holes.push(hp);
    const em = new THREE.Mesh(extrudeGeo(espShape, { depth: 0.45, bevelEnabled: false }), stuc);
    em.position.set(0, e.pediment - 0.6, -0.4);
    em.castShadow = true;
    G.add(em);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.35, 0.5, 10), this.bronze);
    bell.position.set(0, e.pediment - 0.6 + 1.2, -0.17);
    G.add(bell);
    for (const sx of [-1, 1]) {
      const pin = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.8, 6), stuc);
      pin.position.set(sx * (w / 2), 8.9, 0);
      G.add(pin);
    }
    // round-arched door with voussoirs, window above, steps
    G.add(flat(archShape(2.3, 3.8), new THREE.MeshLambertMaterial({ color: 0xc9a46b }), 0, 0.02, 0.03));
    G.add(flat(archShape(1.7, 3.4), this.wood, 0, 0.02, 0.05));
    G.add(box(0.9, 1.2, 0.05, this.dark, 0, 5.2, 0.03));
    for (let i = 0; i < 4; i++) G.add(box(3.4 - i * 0.2, 0.17 * (4 - i), 0.4, stuc, 0, -0.68, 0.2 + (3 - i) * 0.4));
  }

  // ---------------------------------------------------------------- fountains & monuments
  private damaOferent(d: any) {
    const [x, y] = d.pos;
    const z = hfAt(this.hf, x, y);
    const G = new THREE.Group();
    G.position.set(x, z, -y);
    this.group.add(G);
    const tt = tilesTex().clone();
    tt.repeat.set(10, 1.2);
    tt.needsUpdate = true;
    const tiles = new THREE.MeshLambertMaterial({ map: tt });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.6, 0.65, 6, 1, true), tiles);
    basin.position.y = 0.32;
    basin.castShadow = basin.receiveShadow = true;
    G.add(basin);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.52, 0.12, 4, 6), new THREE.MeshLambertMaterial({ color: 0xd9d2c3 }));
    rim.rotation.x = -Math.PI / 2; rim.rotation.z = Math.PI / 6; rim.position.y = 0.66;
    G.add(rim);
    const w = new THREE.Mesh(new THREE.CircleGeometry(3.45, 6), this.water);
    w.rotation.x = -Math.PI / 2; w.rotation.z = Math.PI / 6; w.position.y = 0.5;
    G.add(w);
    // slender tiled column and the cast-iron statue on top (total 5.1 m, LiDAR)
    G.add(box(1.0, 1.2, 1.0, new THREE.MeshLambertMaterial({ color: 0xa2553c }), 0, 0, 0));
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 2.2, 8), tiles);
    col.position.y = 1.2 + 1.1;
    col.castShadow = true;
    G.add(col);
    const statue = damaStatue(this.iron);
    statue.position.y = 3.4 - 0.3; // statue top at ~5.1 m (LiDAR)
    G.add(statue);
    // iron railing around
    const rail = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.03, 3, 6), this.iron);
    rail.rotation.x = -Math.PI / 2; rail.rotation.z = Math.PI / 6 + Math.PI / 6; rail.position.y = 0.85;
    G.add(rail);
    // posts along the hexagon of the railing
    const R = 4.3;
    for (let side = 0; side < 6; side++) {
      const a0 = (side / 6) * Math.PI * 2 + Math.PI / 6, a1 = ((side + 1) / 6) * Math.PI * 2 + Math.PI / 6;
      for (let k = 0; k < 4; k++) {
        const t = k / 4;
        const px = Math.cos(a0) * R * (1 - t) + Math.cos(a1) * R * t, pz = Math.sin(a0) * R * (1 - t) + Math.sin(a1) * R * t;
        G.add(box(0.04, 0.85, 0.04, this.iron, px, 0, -pz));
      }
    }
    this.col.addCircle(x, y, 4.3);
  }

  private plazaFountain(d: any) {
    // oval basin surrounded by shrubs (size and orientation from the orthophoto)
    const [x, y] = d.pos;
    const rx = d.rx ?? 3.9, ry = d.ry ?? 7.9;
    const z = hfAt(this.hf, x, y);
    const G = new THREE.Group();
    G.position.set(x, z, -y);
    G.rotation.y = -((d.bearing ?? 0) * Math.PI) / 180;
    this.group.add(G);
    const stone = new THREE.MeshLambertMaterial({ color: 0xd8cdb8 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.55, 40, 1, true), stone);
    basin.scale.set(rx - 1.2, 1, ry - 1.2);
    basin.position.y = 0.27;
    G.add(basin);
    const w = new THREE.Mesh(new THREE.CircleGeometry(1, 40), this.water);
    w.rotation.x = -Math.PI / 2; w.scale.set(rx - 1.25, ry - 1.25, 1); w.position.y = 0.42;
    G.add(w);
    for (const dz of [-(ry - 3.2), 0, ry - 3.2]) {
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.8, 10), stone);
      jet.position.set(0, 0.4, dz);
      G.add(jet);
      const spray = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xd6ecf5, transparent: true, opacity: 0.35 }));
      spray.position.set(0, 1.3, dz); spray.rotation.x = Math.PI;
      G.add(spray);
    }
    // shrubs all around the basin
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.13, 5, 40), this.hedge);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.45;
    ring.scale.set(rx - 0.5, ry - 0.5, 4.5);
    ring.castShadow = true;
    G.add(ring);
    // collision: circles along the long axis (bearing clockwise from north)
    const br = ((d.bearing ?? 0) * Math.PI) / 180;
    for (let k = -2; k <= 2; k++) {
      const lz = (k / 2) * (ry - rx);
      this.col.addCircle(x + Math.sin(br) * lz, y + Math.cos(br) * lz, rx);
    }
  }

  private monumentGaudi(d: any) {
    const [x, y] = d.pos;
    const z = hfAt(this.hf, x, y);
    const G = new THREE.Group();
    G.position.set(x, z, -y);
    this.group.add(G);
    G.add(box(2.6, 0.4, 2.6, new THREE.MeshLambertMaterial({ color: 0xb8b1a3 }), 0, 0, 0));
    G.add(box(1.6, 0.9, 1.6, this.marble, 0, 0.4, 0));
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.62, d.height - 2.5, 4, 1), this.marble);
    shaft.rotation.y = Math.PI / 4;
    shaft.position.y = 1.3 + (d.height - 2.5) / 2;
    shaft.castShadow = true;
    G.add(shaft);
    // Gaudí's four-armed (three-dimensional) cross on top
    const cy = d.height - 0.7;
    for (const [sx, sy, sz] of [[1.1, 0.16, 0.16], [0.16, 1.1, 0.16], [0.16, 0.16, 1.1]]) G.add(box(sx, sy, sz, this.marble, 0, cy - sy / 2, 0));
    this.col.addCircle(x, y, 1.5);
  }

  private statue([x, y]: [number, number], crouch: boolean) {
    const c = new Character();
    c.updateWalk(0, 0);
    c.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.bronze; });
    const z = hfAt(this.hf, x, y);
    const G = new THREE.Group();
    G.position.set(x, z, -y);
    if (crouch) {
      // hazelnut gatherer: kneeling, bent forward
      c.root.position.y = -0.35;
      c.root.rotation.x = 0.0;
      c.root.children[0].rotation.x = 0.6;
    } else {
      G.add(box(0.9, 0.25, 0.9, new THREE.MeshLambertMaterial({ color: 0x9d968a }), 0, 0, 0));
      c.root.position.y = 0.25;
    }
    G.add(c.root);
    G.rotation.y = Math.PI * 0.8;
    this.group.add(G);
    this.col.addCircle(x, y, 0.6);
  }

  private porxos(edges: number[][]) {
    const stone = new THREE.MeshLambertMaterial({ map: ashlarTex(), color: 0xf5e6c8 });
    for (const [ax, ay, bx, by, nx, ny] of edges) {
      const L = Math.hypot(bx - ax, by - ay);
      const nArch = Math.max(1, Math.round(L / 3.7));
      const bw = L / nArch;
      const H = 4.4, spring = 2.9, pier = 0.75, depth = 0.55;
      const s = new THREE.Shape();
      s.moveTo(0, 0); s.lineTo(L, 0); s.lineTo(L, H); s.lineTo(0, H); s.lineTo(0, 0);
      for (let i = 0; i < nArch; i++) {
        const x0 = i * bw + pier / 2, x1 = (i + 1) * bw - pier / 2;
        const r = (x1 - x0) / 2;
        const hp = new THREE.Path();
        hp.moveTo(x0, 0); hp.lineTo(x1, 0); hp.lineTo(x1, spring); hp.absarc(x0 + r, spring, r, 0, Math.PI, false); hp.lineTo(x0, 0);
        s.holes.push(hp);
      }
      const g = extrudeGeo(s, { depth, bevelEnabled: false, curveSegments: 10 });
      g.translate(0, 0, -depth); // front face on the facade line, body inside the building
      const m = new THREE.Mesh(g, stone);
      m.castShadow = m.receiveShadow = true;
      // local +z = outward normal, local +x = (-ny, nx): start from the end that makes x run along the edge
      const along = (-ny) * (bx - ax) + nx * (by - ay) > 0;
      const [sx, sy] = along ? [ax, ay] : [bx, by];
      const z = Math.min(hfAt(this.hf, ax, ay), hfAt(this.hf, bx, by)) - 0.05;
      const G = frameGroup(sx + nx * 0.03, sy + ny * 0.03, z, nx, ny);
      G.add(m);
      this.group.add(G);
    }
  }

  private casalLogo(a: any) {
    const top = this.roofAt(a.x - a.nx * 1.0, a.y - a.ny * 1.0);
    if (top === null) return;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshLambertMaterial({ map: casalLogoTex() }));
    const G = frameGroup(a.x + a.nx * 0.08, a.y + a.ny * 0.08, top - 2.2, a.nx, a.ny);
    G.add(panel);
    this.group.add(G);
  }

  update() {
    lanternMat.emissiveIntensity = lampUniform.value ? 2.2 : 0;
  }

  /** Signs in reach of the player (nearest first). */
  signAt(x: number, y: number): Sign | null {
    let best: Sign | null = null, bd = Infinity;
    for (const s of this.data.signs) {
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < s.r && d < bd) { bd = d; best = s; }
    }
    return best;
  }
}

function hfAt(hf: HeightField, x: number, y: number) { return hf.heightAt(x, y); }

/** Stained glass of the rose window (colours ESTIMATED; the glass shows Saint James / Clavijo). */
function roseTex() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1c2230'; g.fillRect(0, 0, 256, 256);
  const cols = ['#2f5d9a', '#9a2f3a', '#c9a23a', '#3d7a4f', '#6a3f8a'];
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = ((i + 1) / 16) * Math.PI * 2;
    g.fillStyle = cols[i % cols.length];
    g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 118, a0 + 0.03, a1 - 0.03); g.closePath(); g.fill();
  }
  g.fillStyle = '#c9a23a'; g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#111'; g.lineWidth = 3;
  for (let r = 40; r < 128; r += 26) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
