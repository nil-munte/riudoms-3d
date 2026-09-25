// Documented facade features of emblematic buildings (stone doorways, plaques,
// quoins, balustered balcony, esgrafiats...), placed on the real street facade
// chosen by scripts/p_landmarks.py, plus a few square furnishings.
import * as THREE from 'three';
import { ashlarTex, grassTex, rubbleTex } from './textures';

const stoneMat = new THREE.MeshLambertMaterial({ map: ashlarTex(), color: 0xf3e6cc });
const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
const darkMat = new THREE.MeshLambertMaterial({ color: 0x1d1b19 });
const ironMat = new THREE.MeshLambertMaterial({ color: 0x262827 });
export const lanternMat = new THREE.MeshLambertMaterial({ color: 0xfff0c8, emissive: 0xffc877, emissiveIntensity: 0 });

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function plaqueTex(lines: string[]) {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#e8e2d2'; g.fillRect(0, 0, 512, 256);
    g.strokeStyle = '#6b5a45'; g.lineWidth = 10; g.strokeRect(12, 12, 488, 232);
    g.fillStyle = '#3a2e22'; g.textAlign = 'center';
    g.font = 'bold 76px Georgia, serif'; g.fillText(lines[0], 256, 118);
    if (lines[1]) { g.font = 'italic 40px Georgia, serif'; g.fillText(lines[1], 256, 190); }
  });
}

const esgrafiatTex = () => canvasTex(256, 320, (g) => {
  g.fillStyle = '#d9b77a'; g.fillRect(0, 0, 256, 320);
  g.strokeStyle = '#a45c3a'; g.lineWidth = 6; g.strokeRect(10, 10, 236, 300);
  g.lineWidth = 3;
  for (let i = 0; i < 6; i++) {
    const y = 40 + i * 48;
    g.beginPath(); g.moveTo(40, y); g.bezierCurveTo(90, y - 30, 166, y + 30, 216, y); g.stroke();
    g.beginPath(); g.arc(128, y, 10, 0, Math.PI * 2); g.stroke();
  }
});

const shieldTex = () => canvasTex(256, 320, (g) => {
  g.clearRect(0, 0, 256, 320);
  g.fillStyle = '#e6d2a8';
  g.beginPath(); g.moveTo(28, 30); g.lineTo(228, 30); g.lineTo(228, 170); g.quadraticCurveTo(228, 290, 128, 300);
  g.quadraticCurveTo(28, 290, 28, 170); g.closePath(); g.fill();
  g.strokeStyle = '#9b4b2e'; g.lineWidth = 10; g.stroke();
  // elms and river, as in the arms of Riudoms
  g.fillStyle = '#6e8a4c';
  g.beginPath(); g.arc(88, 120, 34, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(168, 120, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6b4a2e'; g.fillRect(82, 150, 12, 40); g.fillRect(162, 150, 12, 40);
  g.strokeStyle = '#5f86a8'; g.lineWidth = 12;
  g.beginPath(); g.moveTo(50, 230); g.bezierCurveTo(100, 200, 150, 260, 206, 225); g.stroke();
});

function box(w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  return m;
}

function arch(w: number, h: number) {
  const s = new THREE.Shape();
  const r = w / 2;
  s.moveTo(-r, 0); s.lineTo(r, 0); s.lineTo(r, h - r); s.absarc(0, h - r, r, 0, Math.PI, false); s.lineTo(-r, 0);
  return s;
}

function frame(x: number, y: number, z: number, dx: number, dy: number) {
  const g = new THREE.Group();
  g.position.set(x, z, -y);
  g.rotation.y = Math.atan2(dx, -dy); // local +z -> (dx, dy), local +x along the facade
  return g;
}

export interface DecorItem { k: string; at: number; w?: number; h?: number; stone?: boolean; steps?: number; text?: string[]; floor?: number }
export interface Decor {
  id: string;
  edge: { a: [number, number]; b: [number, number]; n: [number, number]; len: number; ground: number; top: number; fh: number };
  items: DecorItem[];
}

export function buildDecor(d: Decor): THREE.Group {
  const e = d.edge;
  const G = frame(e.a[0] + e.n[0] * 0.03, e.a[1] + e.n[1] * 0.03, e.ground, e.n[0], e.n[1]);
  const fh = e.fh || 3.2, gh = fh * 1.15;
  const floorY = (f: number) => (f <= 0 ? 0 : gh + (f - 1) * fh);
  for (const it of d.items) {
    const x = it.at * e.len;
    if (it.k === 'door') {
      const w = it.w ?? 1.6, h = it.h ?? 3.0;
      const sur = new THREE.Mesh(new THREE.ShapeGeometry(arch(w + 0.7, h + 0.4), 16), stoneMat);
      sur.position.set(x, 0.02, 0.01);
      G.add(sur);
      // voussoir joints
      const r = (w + 0.35) / 2;
      for (let i = 1; i < 9; i++) {
        const a = (i / 9) * Math.PI;
        const j = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.36), darkMat);
        j.position.set(x + Math.cos(a) * r, 0.02 + h - w / 2 + Math.sin(a) * r, 0.015);
        j.rotation.z = a - Math.PI / 2;
        G.add(j);
      }
      const door = new THREE.Mesh(new THREE.ShapeGeometry(arch(w, h), 16), woodMat);
      door.position.set(x, 0.02, 0.02);
      G.add(door);
      G.add(box(0.04, h - w / 2, 0.02, darkMat, x, 0.02, 0.03));
      for (let s = 0; s < (it.steps ?? 0); s++) {
        G.add(box(w + 1.0 - s * 0.2, 0.17 * ((it.steps ?? 0) - s), 0.36, stoneMat, x, -0.05, 0.2 + ((it.steps ?? 0) - 1 - s) * 0.36));
      }
    } else if (it.k === 'plaque') {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.5), new THREE.MeshLambertMaterial({ map: plaqueTex(it.text ?? ['']) }));
      p.position.set(x, it.h ?? 1.7, 0.03);
      G.add(p);
    } else if (it.k === 'quoins') {
      const x0 = x <= 0.01 ? 0 : e.len;
      const sgn = x0 === 0 ? 1 : -1;
      const top = e.top - e.ground;
      for (let y = 0.9, i = 0; y < top - 0.3; y += 0.36, i++) {
        const w = i % 2 ? 0.42 : 0.62;
        G.add(box(w, 0.33, 0.06, stoneMat, x0 + sgn * w / 2, y, 0.03));
      }
    } else if (it.k === 'balcony') {
      const w = it.w ?? 3.5, y = floorY(it.floor ?? 1);
      G.add(box(w, 0.16, 1.0, stoneMat, x, y - 0.1, 0.5));
      G.add(box(w, 0.12, 0.14, stoneMat, x, y + 0.85, 0.95));
      const bg = new THREE.CylinderGeometry(0.045, 0.06, 0.8, 8);
      const n = Math.floor(w / 0.2);
      const bal = new THREE.InstancedMesh(bg, stoneMat, n + 8);
      const m4 = new THREE.Matrix4();
      let k = 0;
      for (let i = 0; i < n; i++) { m4.makeTranslation(x - w / 2 + 0.1 + i * (w - 0.2) / (n - 1), y + 0.46, 0.95); bal.setMatrixAt(k++, m4); }
      for (let i = 0; i < 4; i++) {
        m4.makeTranslation(x - w / 2 + 0.07, y + 0.46, 0.2 + i * 0.22); bal.setMatrixAt(k++, m4);
        m4.makeTranslation(x + w / 2 - 0.07, y + 0.46, 0.2 + i * 0.22); bal.setMatrixAt(k++, m4);
      }
      bal.castShadow = true;
      G.add(bal);
    } else if (it.k === 'esgrafiat') {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.75), new THREE.MeshLambertMaterial({ map: esgrafiatTex() }));
      p.position.set(x, floorY(it.floor ?? 1) + 1.3, 0.025);
      G.add(p);
    } else if (it.k === 'shield') {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.25), new THREE.MeshLambertMaterial({ map: shieldTex(), transparent: true }));
      p.position.set(x, floorY(it.floor ?? 2) + 1.2, 0.04);
      G.add(p);
    } else if (it.k === 'oculus') {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 6, 24), stoneMat);
      ring.position.set(x, floorY(it.floor ?? 1) + 1.3, 0.06);
      G.add(ring);
      const glass = new THREE.Mesh(new THREE.CircleGeometry(0.5, 24), darkMat);
      glass.position.set(x, floorY(it.floor ?? 1) + 1.3, 0.03);
      G.add(glass);
    }
  }
  return G;
}

/** Large ornamental lamp post of the Plaça de l'Om. */
export function omLamp(x: number, y: number, z: number) {
  const G = new THREE.Group();
  G.position.set(x, z, -y);
  G.add(box(1.1, 0.5, 1.1, stoneMat, 0, 0, 0));
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 5.4, 12), ironMat);
  col.position.y = 0.5 + 2.7;
  col.castShadow = true;
  G.add(col);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.1, 6), ironMat);
    arm.position.set(Math.cos(a) * 0.55, 5.3, Math.sin(a) * 0.55);
    arm.rotation.set(0, -a, Math.PI / 2);
    G.add(arm);
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.45, 6), lanternMat);
    lan.position.set(Math.cos(a) * 1.1, 5.05, Math.sin(a) * 1.1);
    G.add(lan);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 6), ironMat);
    cap.position.set(Math.cos(a) * 1.1, 5.38, Math.sin(a) * 1.1);
    G.add(cap);
  }
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.16, 0.5, 6), lanternMat);
  top.position.y = 6.2;
  G.add(top);
  return G;
}

/** Raised round lawn bed with a stone rim (Plaça de la Palmera). */
export function palmBed(x: number, y: number, z: number, r: number) {
  const G = new THREE.Group();
  G.position.set(x, z, -y);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 40, 1, true), new THREE.MeshLambertMaterial({ map: rubbleTex(), color: 0xe0d2b4, side: THREE.DoubleSide }));
  rim.position.y = 0.25;
  rim.castShadow = rim.receiveShadow = true;
  G.add(rim);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshLambertMaterial({ map: grassTex() }));
  lawn.rotation.x = -Math.PI / 2;
  lawn.position.y = 0.46;
  lawn.receiveShadow = true;
  G.add(lawn);
  return G;
}

/** Cast-iron "dama oferent": a woman in a long dress holding an offering up in front of her. */
export function damaStatue(mat: THREE.Material) {
  const G = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.set(rx, 0, rz);
    m.castShadow = true;
    G.add(m);
  };
  add(new THREE.CylinderGeometry(0.16, 0.42, 1.25, 12), 0, 0.62, 0); // skirt
  add(new THREE.CylinderGeometry(0.15, 0.17, 0.5, 10), 0, 1.45, 0); // bodice
  add(new THREE.SphereGeometry(0.12, 10, 8), 0, 1.85, 0); // head
  add(new THREE.SphereGeometry(0.08, 8, 6), 0, 1.95, -0.08); // hair bun
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 6), 0.17, 1.62, 0.16, -1.0, 0.25); // arms forward and up
  add(new THREE.CylinderGeometry(0.035, 0.04, 0.5, 6), -0.17, 1.62, 0.16, -1.0, -0.25);
  add(new THREE.CylinderGeometry(0.16, 0.1, 0.12, 10), 0, 1.86, 0.38); // the offering (a bowl)
  return G;
}
