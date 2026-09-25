// Mediterranean sky, sun and day/night cycle. The sun position is computed
// for Riudoms (41.139 N, 1.052 E) on the current date, local time (CET/CEST).
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { nightUniform } from './facade';

const LAT = 41.1391 * (Math.PI / 180);
const LON = 1.052;

export const lampUniform = { value: 0 }; // 0 = lamps off, 1 = on

function tzOffsetHours(d: Date) {
  // Spain (peninsula): CET, CEST from last Sunday of March to last Sunday of October
  const y = d.getUTCFullYear();
  const lastSun = (m: number) => { const t = new Date(Date.UTC(y, m + 1, 0)); return t.getUTCDate() - t.getUTCDay(); };
  const start = Date.UTC(y, 2, lastSun(2), 1), end = Date.UTC(y, 9, lastSun(9), 1);
  const t = d.getTime();
  return t >= start && t < end ? 2 : 1;
}

/** Sun direction (three.js axes: x east, y up, z south) for a local clock hour. */
export function sunDirection(hour: number, date = new Date(), out = new THREE.Vector3()) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const N = Math.floor((date.getTime() - start) / 86400000);
  const B = (2 * Math.PI * (N - 81)) / 364;
  const eot = (9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B)) / 60; // hours
  const decl = (23.44 * Math.PI / 180) * Math.sin((2 * Math.PI * (284 + N)) / 365);
  const solar = hour - tzOffsetHours(date) + LON / 15 + eot;
  const H = ((solar - 12) * 15 * Math.PI) / 180;
  const sinEl = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(sinEl);
  const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT)) + Math.PI;
  out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
  return out;
}

export class SkySystem {
  sky = new Sky();
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x8a7a5a, 1.0);
  fog: THREE.Fog;
  hour = 11;
  running = true;
  speed = 1 / 60; // game hours per real second (1 game hour = 1 real minute)
  private dir = new THREE.Vector3();
  private stars: THREE.Points;
  private shadowSize = 90;

  constructor(scene: THREE.Scene, private renderer: THREE.WebGLRenderer) {
    this.sky.scale.setScalar(20000);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.1;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    scene.add(this.sky);
    this.fog = new THREE.Fog(0xcfdde6, 250, 2600);
    scene.fog = this.fog;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const c = this.sun.shadow.camera;
    c.left = -this.shadowSize; c.right = this.shadowSize; c.top = this.shadowSize; c.bottom = -this.shadowSize;
    c.near = 1; c.far = 900;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.35;
    scene.add(this.sun, this.sun.target, this.hemi);
    // stars
    const n = 1500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 9000;
      pos[i * 3 + 1] = Math.cos(ph) * 9000;
      pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 9000;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.stars = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 14, sizeAttenuation: true, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);
  }

  setShadows(on: boolean) { this.sun.castShadow = on; }

  update(dt: number, focus: THREE.Vector3) {
    if (this.running) this.hour = (this.hour + dt * this.speed) % 24;
    const d = sunDirection(this.hour, new Date(), this.dir);
    const el = d.y;
    // below the horizon use the moon-ish opposite direction for a faint light
    const day = THREE.MathUtils.smoothstep(el, -0.08, 0.12);
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(d);
    u.rayleigh.value = THREE.MathUtils.lerp(0.4, 1.1, day);
    this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.28, 0.62, day);
    const warm = 1 - THREE.MathUtils.smoothstep(el, 0.02, 0.35);
    this.sun.color.setRGB(1, 1 - 0.35 * warm, 1 - 0.6 * warm);
    this.sun.intensity = 3.2 * THREE.MathUtils.smoothstep(el, -0.02, 0.1) + 0.25 * (1 - day);
    const ld = el > 0 ? d : new THREE.Vector3(-d.x, 0.5, -d.z).normalize();
    if (el <= 0) this.sun.color.setRGB(0.55, 0.65, 0.95);
    // shadow camera follows the player, snapped to texels to avoid shimmering
    const step = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / step) * step, fz = Math.round(focus.z / step) * step;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + ld.x * 400, focus.y + ld.y * 400, fz + ld.z * 400);
    this.hemi.intensity = THREE.MathUtils.lerp(0.5, 1.55, day);
    this.hemi.color.setRGB(THREE.MathUtils.lerp(0.35, 0.75, day), THREE.MathUtils.lerp(0.42, 0.85, day), THREE.MathUtils.lerp(0.7, 1.0, day));
    this.hemi.groundColor.setRGB(0.45 * day + 0.08, 0.4 * day + 0.07, 0.3 * day + 0.08);
    // fog colour: hazy light blue by day, orange at dusk, dark blue at night
    const fogDay = new THREE.Color(0xd3e0e8), fogDusk = new THREE.Color(0xe6b88e), fogNight = new THREE.Color(0x141c2a);
    const c = fogDay.clone().lerp(fogDusk, warm * day).lerp(fogNight, 1 - day);
    this.fog.color.copy(c);
    this.fog.near = THREE.MathUtils.lerp(120, 250, day);
    this.fog.far = THREE.MathUtils.lerp(1400, 2600, day);
    (this.stars.material as THREE.PointsMaterial).opacity = 1 - THREE.MathUtils.smoothstep(el, -0.15, 0.02);
    this.stars.position.copy(focus);
    const night = 1 - THREE.MathUtils.smoothstep(el, -0.06, 0.06);
    nightUniform.value = night;
    lampUniform.value = night > 0.3 ? 1 : 0;
    this.sky.position.copy(focus);
  }

  get isNight() { return nightUniform.value > 0.5; }
}
