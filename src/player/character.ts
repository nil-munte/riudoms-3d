// Clean low-poly character built from primitives, with procedural
// idle / walk / run animation and a seated cycling pose.
import * as THREE from 'three';

const SKIN = 0xd9a882, SHIRT = 0x2f6f8f, PANTS = 0x3b3f4a, SHOES = 0x2a2522, HAIR = 0x3a2a1e;

function part(geo: THREE.BufferGeometry, color: number, flat = true) {
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, flatShading: flat }));
  m.castShadow = true;
  return m;
}

function limb(len: number, w: number, color: number) {
  // box hanging down from the pivot
  const g = new THREE.BoxGeometry(w, len, w * 0.9);
  g.translate(0, -len / 2, 0);
  return part(g, color);
}

export class Character {
  root = new THREE.Group();
  private hips = new THREE.Group();
  private torso = new THREE.Group();
  private head = new THREE.Group();
  private arm: THREE.Group[] = [];
  private fore: THREE.Group[] = [];
  private thigh: THREE.Group[] = [];
  private shin: THREE.Group[] = [];
  private phase = 0;
  private blendWalk = 0;
  private blendRun = 0;
  readonly thighLen = 0.44;
  readonly shinLen = 0.44;
  readonly hipHeight = 0.93;

  constructor() {
    const r = this.root;
    this.hips.position.y = this.hipHeight;
    r.add(this.hips);
    const pelvis = part(new THREE.BoxGeometry(0.34, 0.16, 0.22), PANTS);
    this.hips.add(pelvis);
    this.hips.add(this.torso);
    const chest = part(new THREE.BoxGeometry(0.4, 0.5, 0.23).translate(0, 0.3, 0), SHIRT);
    const belly = part(new THREE.BoxGeometry(0.36, 0.1, 0.21).translate(0, 0.05, 0), SHIRT);
    this.torso.add(chest, belly);
    const neck = part(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 6).translate(0, 0.59, 0), SKIN);
    this.torso.add(neck);
    this.head.position.y = 0.64;
    this.torso.add(this.head);
    const headM = part(new THREE.IcosahedronGeometry(0.125, 1).scale(0.92, 1.08, 1).translate(0, 0.12, 0), SKIN);
    const hair = part(new THREE.IcosahedronGeometry(0.13, 1).scale(0.95, 0.7, 1.02).translate(0, 0.18, -0.015), HAIR);
    const nose = part(new THREE.BoxGeometry(0.03, 0.04, 0.04).translate(0, 0.1, 0.12), SKIN);
    this.head.add(headM, hair, nose);
    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.position.set(0.25 * s, 0.52, 0);
      this.torso.add(a);
      const sh = part(new THREE.IcosahedronGeometry(0.07, 0), SHIRT);
      a.add(sh, limb(0.3, 0.1, SHIRT));
      const f = new THREE.Group();
      f.position.y = -0.3;
      a.add(f);
      f.add(limb(0.27, 0.085, SKIN));
      const hand = part(new THREE.BoxGeometry(0.08, 0.09, 0.05).translate(0, -0.31, 0), SKIN);
      f.add(hand);
      this.arm.push(a); this.fore.push(f);
      const t = new THREE.Group();
      t.position.set(0.1 * s, -0.04, 0);
      this.hips.add(t);
      t.add(limb(this.thighLen, 0.15, PANTS));
      const k = new THREE.Group();
      k.position.y = -this.thighLen;
      t.add(k);
      k.add(limb(this.shinLen, 0.12, PANTS));
      const shoe = part(new THREE.BoxGeometry(0.12, 0.08, 0.26).translate(0, -this.shinLen - 0.02, 0.05), SHOES);
      k.add(shoe);
      this.thigh.push(t); this.shin.push(k);
    }
  }

  /** speed in m/s on foot. */
  updateWalk(dt: number, speed: number) {
    const walkW = THREE.MathUtils.clamp(speed / 1.6, 0, 1);
    const runW = THREE.MathUtils.clamp((speed - 2.2) / 2.5, 0, 1);
    this.blendWalk += (walkW - this.blendWalk) * Math.min(1, dt * 10);
    this.blendRun += (runW - this.blendRun) * Math.min(1, dt * 8);
    const stride = THREE.MathUtils.lerp(1.3, 2.2, this.blendRun);
    this.phase += (speed / stride) * Math.PI * 2 * dt;
    if (speed < 0.05) this.phase += dt * 1.5;
    const p = this.phase;
    const w = this.blendWalk, rn = this.blendRun;
    const amp = THREE.MathUtils.lerp(0.5, 0.95, rn) * w;
    const t = performance.now() / 1000;
    const breathe = Math.sin(t * 2.2) * 0.012 * (1 - w);
    this.hips.position.y = this.hipHeight - 0.03 * w + Math.abs(Math.sin(p)) * 0.05 * w * (1 + rn) + breathe;
    this.hips.rotation.set(0, Math.sin(p) * 0.08 * w, 0);
    this.torso.rotation.set(THREE.MathUtils.lerp(0.02, 0.28, rn) * w, -Math.sin(p) * 0.12 * w, 0);
    this.head.rotation.set(-this.torso.rotation.x * 0.6, Math.sin(p) * 0.06 * w + Math.sin(t * 0.4) * 0.15 * (1 - w), 0);
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const ph = p + (i === 0 ? 0 : Math.PI);
      const sw = Math.sin(ph);
      this.thigh[i].rotation.set(-sw * amp, 0, 0);
      const knee = Math.max(0, Math.cos(ph)) * amp * 1.4 + (1 - w) * 0.02;
      this.shin[i].rotation.set(knee, 0, 0);
      this.arm[i].rotation.set(sw * amp * 0.9, 0, s * (0.08 + 0.05 * (1 - w)));
      this.fore[i].rotation.set(-THREE.MathUtils.lerp(0.15, 1.3, rn) * (0.4 + 0.6 * w) - 0.1, 0, 0);
    }
  }

  /** Seated on a bike: feet follow the pedal positions (in root space). */
  updateBike(pedals: THREE.Vector3[], hip: THREE.Vector3, hands: THREE.Vector3[], lean: number) {
    this.hips.position.copy(hip);
    this.hips.rotation.set(0, 0, 0);
    this.torso.rotation.set(0.55, 0, 0);
    this.head.rotation.set(-0.45, 0, 0);
    for (let i = 0; i < 2; i++) {
      // 2-bone IK in the sagittal plane (y-z of the hips)
      const tp = this.thigh[i].position;
      const hx = hip.y + tp.y, hz = hip.z + tp.z;
      const dy = pedals[i].y - hx, dz = pedals[i].z - hz;
      const d = Math.min(Math.hypot(dy, dz), this.thighLen + this.shinLen - 0.001);
      const a = this.thighLen, b = this.shinLen;
      const cosK = (a * a + b * b - d * d) / (2 * a * b);
      const knee = Math.PI - Math.acos(THREE.MathUtils.clamp(cosK, -1, 1));
      const base = Math.atan2(dz, -dy); // angle from straight down, forward positive
      const cosA = (a * a + d * d - b * b) / (2 * a * d);
      const off = Math.acos(THREE.MathUtils.clamp(cosA, -1, 1));
      this.thigh[i].rotation.set(-(base + off), 0, 0);
      this.shin[i].rotation.set(knee, 0, 0);
      // arms reach the handlebar
      const sp = this.arm[i].position;
      const shoulder = new THREE.Vector3(sp.x, sp.y, sp.z).applyEuler(this.torso.rotation).add(hip);
      const hv = hands[i].clone().sub(shoulder);
      const ang = Math.atan2(hv.z, -hv.y);
      this.arm[i].rotation.set(-ang - this.torso.rotation.x, 0, 0);
      this.fore[i].rotation.set(-0.35, 0, 0);
    }
    this.root.rotation.z = 0;
    void lean;
  }
}
