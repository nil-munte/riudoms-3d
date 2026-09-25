// City bicycle: procedural model + simple, forgiving physics
// (pedalling, freewheel, braking, steering with lean, slopes, collisions).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collision } from '../world/collision';

const WHEEL_R = 0.34;
const WHEELBASE = 1.06;
const CRANK = 0.17;
export const BB = new THREE.Vector3(0, 0.3, -0.05);
export const SADDLE = new THREE.Vector3(0, 0.98, -0.27);
// [right, left] (bike local +x points to the rider's left)
export const GRIPS = [new THREE.Vector3(-0.26, 1.02, 0.4), new THREE.Vector3(0.26, 1.02, 0.4)];

function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: THREE.Material) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), 6);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  m.castShadow = true;
  return m;
}

function wheel(tire: THREE.Material, metal: THREE.Material) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.02, 0.022, 6, 28), tire);
  t.rotation.y = Math.PI / 2;
  t.castShadow = true;
  g.add(t);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.05, 0.008, 4, 28), metal);
  rim.rotation.y = Math.PI / 2;
  g.add(rim);
  const pts: number[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(0, 0, 0, 0, Math.cos(a) * (WHEEL_R - 0.05), Math.sin(a) * (WHEEL_R - 0.05));
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xb9bcc0 })));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8).rotateZ(Math.PI / 2), metal);
  g.add(hub);
  return g;
}

/** Replace the direct Mesh children of a group by one merged mesh per material. */
function mergeChildren(group: THREE.Object3D) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const rm: THREE.Mesh[] = [];
  for (const o of group.children) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as any).isInstancedMesh || m.children.length || m.userData.dynamic) continue;
    m.updateMatrix();
    let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.getAttribute('uv')) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
    g = g.applyMatrix4(m.matrix);
    const mat = m.material as THREE.Material;
    let l = byMat.get(mat);
    if (!l) byMat.set(mat, (l = []));
    l.push(g);
    rm.push(m);
  }
  for (const m of rm) group.remove(m);
  for (const [mat, list] of byMat) {
    const g = mergeGeometries(list, false);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = true;
    group.add(mesh);
  }
}

export class Bike {
  root = new THREE.Group();
  body = new THREE.Group(); // lean / pitch
  private wheels: THREE.Group[] = [];
  private fork = new THREE.Group();
  private crank = new THREE.Group();
  private pedals: THREE.Mesh[] = [];
  x = 0; y = 0; // local coords (east, north)
  heading = 0; // radians, 0 = north, clockwise
  speed = 0;
  steer = 0;
  lean = 0;
  pitch = 0;
  wheelRot = 0;
  crankRot = 0;
  ridden = false;

  constructor(color = 0x9c2f2f) {
    const frameMat = new THREE.MeshLambertMaterial({ color });
    const metal = new THREE.MeshLambertMaterial({ color: 0xa7aaae });
    const tire = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
    const black = new THREE.MeshLambertMaterial({ color: 0x252525 });
    this.root.add(this.body);
    const rear = new THREE.Vector3(0, WHEEL_R, -WHEELBASE / 2);
    const front = new THREE.Vector3(0, WHEEL_R, WHEELBASE / 2);
    const head = new THREE.Vector3(0, 0.86, 0.36), headLow = new THREE.Vector3(0, 0.7, 0.4);
    const seatTop = new THREE.Vector3(0, 0.86, -0.22);
    const b = this.body;
    b.add(tube(BB, seatTop, 0.018, frameMat));
    b.add(tube(seatTop, head, 0.017, frameMat));
    b.add(tube(BB, headLow, 0.02, frameMat));
    for (const s of [-1, 1]) {
      b.add(tube(BB.clone().setX(0.035 * s), rear.clone().setX(0.055 * s), 0.011, frameMat));
      b.add(tube(seatTop.clone().setX(0.02 * s), rear.clone().setX(0.055 * s), 0.01, frameMat));
    }
    // seat post + saddle
    b.add(tube(seatTop, SADDLE.clone().add(new THREE.Vector3(0, -0.03, 0.02)), 0.012, metal));
    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.05, 0.27), black);
    saddle.position.copy(SADDLE);
    saddle.castShadow = true;
    b.add(saddle);
    // fork + handlebar (steerable)
    this.fork.position.copy(head);
    b.add(this.fork);
    const fl = front.clone().sub(head);
    for (const s of [-1, 1]) this.fork.add(tube(new THREE.Vector3(0.045 * s, 0, 0), fl.clone().setX(0.05 * s), 0.012, frameMat));
    this.fork.add(tube(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.14, 0.03), 0.014, metal));
    const barC = new THREE.Vector3(0, 0.16, 0.05);
    this.fork.add(tube(barC.clone().setX(-0.27), barC.clone().setX(0.27), 0.012, metal));
    for (const s of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 6).rotateZ(Math.PI / 2), black);
      grip.position.set(0.24 * s, 0.16, 0.05);
      this.fork.add(grip);
    }
    const basket = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.26), new THREE.MeshLambertMaterial({ color: 0x6b4a2b, wireframe: false }));
    basket.position.set(0, 0.02, 0.26);
    basket.castShadow = true;
    this.fork.add(basket);
    // wheels
    const wr = wheel(tire, metal), wf = wheel(tire, metal);
    wr.position.copy(rear);
    wf.position.copy(front.clone().sub(head));
    b.add(wr);
    this.fork.add(wf);
    this.wheels.push(wr, wf);
    // mudguards
    for (const w of [wr, wf]) {
      const mg = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R + 0.02, 0.025, 3, 16, Math.PI * 0.8), metal);
      mg.rotation.set(0, Math.PI / 2, Math.PI * 0.12);
      mg.scale.set(1, 1, 1.5);
      w.parent!.add(mg);
      mg.position.copy(w.position);
    }
    // crank & pedals
    this.crank.position.copy(BB);
    b.add(this.crank);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 16).rotateZ(Math.PI / 2), metal);
    ring.position.x = 0.06;
    this.crank.add(ring);
    for (const s of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.02, CRANK, 0.025).translate(0, -CRANK / 2, 0), metal);
      arm.position.x = 0.075 * s;
      if (s < 0) arm.rotation.x = Math.PI;
      this.crank.add(arm);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.07), black);
      pedal.castShadow = true;
      pedal.userData.dynamic = true;
      b.add(pedal);
      this.pedals.push(pedal);
    }
    // merge the static meshes of each moving part into one mesh per material (~40 draw calls -> ~10)
    for (const part of [this.body, this.fork, this.crank, ...this.wheels]) mergeChildren(part);
    this.body.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  /** Pedal positions in bike space (0 = right foot, 1 = left foot). */
  pedalPos(i: number, out = new THREE.Vector3()) {
    const a = this.crankRot + (i === 0 ? 0 : Math.PI);
    return out.set(i === 0 ? 0.13 : -0.13, BB.y - Math.cos(a) * CRANK, BB.z - Math.sin(a) * CRANK);
  }

  update(dt: number, ctl: { throttle: number; brake: number; steer: number; sprint: boolean } | null,
         heightAt: (x: number, y: number) => number, col: Collision) {
    if (ctl) {
      const vmax = ctl.sprint ? 10 : 7;
      if (ctl.throttle > 0) this.speed += ctl.throttle * (this.speed < vmax ? 2.6 * (1 - this.speed / (vmax + 1)) + 0.6 : 0) * dt;
      if (ctl.brake > 0) {
        if (this.speed > 0.2) this.speed -= 6 * ctl.brake * dt;
        else this.speed = Math.max(this.speed - 1.2 * dt, -1.2); // walk it backwards
      }
      const maxSteer = THREE.MathUtils.lerp(0.55, 0.16, THREE.MathUtils.clamp(Math.abs(this.speed) / 8, 0, 1));
      this.steer += (ctl.steer * maxSteer - this.steer) * Math.min(1, dt * 6);
    } else {
      this.steer *= Math.max(0, 1 - dt * 4);
      this.speed *= Math.max(0, 1 - dt * 2);
    }
    // rolling resistance + air drag + slope
    const fx = Math.sin(this.heading), fy = Math.cos(this.heading);
    const hF = heightAt(this.x + fx * WHEELBASE / 2, this.y + fy * WHEELBASE / 2);
    const hR = heightAt(this.x - fx * WHEELBASE / 2, this.y - fy * WHEELBASE / 2);
    const slope = (hF - hR) / WHEELBASE;
    this.speed -= Math.sign(this.speed) * (0.12 + 0.012 * this.speed * this.speed) * dt;
    this.speed -= 9.81 * slope * 0.9 * dt;
    if (Math.abs(this.speed) < 0.03 && (!ctl || (ctl.throttle === 0 && ctl.brake === 0))) this.speed = 0;
    // kinematic bicycle model
    const turn = (this.speed * Math.tan(this.steer)) / WHEELBASE;
    this.heading += turn * dt;
    let nx = this.x + Math.sin(this.heading) * this.speed * dt;
    let ny = this.y + Math.cos(this.heading) * this.speed * dt;
    const r = col.resolve(nx, ny, 0.42);
    if (r.hit) {
      const hitSpeed = Math.abs(this.speed);
      this.speed *= hitSpeed > 3 ? 0.35 : 0.8;
    }
    nx = r.x; ny = r.y;
    this.x = nx; this.y = ny;
    // lean into the turn (visual), pitch with the slope
    const targetLean = this.ridden ? THREE.MathUtils.clamp(Math.atan((this.speed * turn) / 9.81), -0.6, 0.6) : -0.12;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 5);
    this.pitch = Math.atan(slope);
    this.wheelRot += (this.speed * dt) / WHEEL_R;
    if (ctl && ctl.throttle > 0 && this.speed > 0.1) this.crankRot += (this.speed * dt) / WHEEL_R / 2.1;
    this.sync(heightAt);
  }

  sync(heightAt: (x: number, y: number) => number) {
    this.root.position.set(this.x, heightAt(this.x, this.y), -this.y);
    this.root.rotation.set(0, Math.PI - this.heading, 0);
    this.body.rotation.set(-this.pitch, 0, this.lean, 'YXZ'); // local +x is the rider's left
    for (const w of this.wheels) w.rotation.x = this.wheelRot;
    this.fork.rotation.y = this.steer * 0.8;
    this.crank.rotation.x = this.crankRot;
    const p = new THREE.Vector3();
    for (let i = 0; i < 2; i++) this.pedals[i].position.copy(this.pedalPos(i, p));
  }
}
