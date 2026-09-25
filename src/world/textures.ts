// Procedural textures drawn on canvases (no external image files needed).
// Each texture covers `metres` x `metres` of world surface and repeats.
import * as THREE from 'three';

export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return { c, g: c.getContext('2d', { willReadFrequently: true })! };
}

function finish(c: HTMLCanvasElement, srgb = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function noise(g: CanvasRenderingContext2D, size: number, amount: number, seed: number, dot = 1) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y += dot) {
    for (let x = 0; x < size; x += dot) {
      const n = (r() - 0.5) * amount;
      for (let yy = 0; yy < dot; yy++) for (let xx = 0; xx < dot; xx++) {
        const i = ((y + yy) * size + (x + xx)) * 4;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
    }
  }
  g.putImageData(img, 0, 0);
}

const cache = new Map<string, THREE.Texture>();
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) { t = make(); cache.set(key, t); }
  return t;
}

/** Teula àrab: channels along v (down the slope), courses every ~0.4 m. 1 m tile. Near-white so the
 *  orthophoto roof colour (vertex colour) sets the hue. */
export const roofTileTex = () => cached('rooftile', () => {
  const S = 256, { c, g } = canvas(S);
  const r = rng(7);
  g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, S, S);
  const cols = 6; // ~0.17 m per channel
  const cw = S / cols;
  const rows = 5; // ~0.2 m visible per tile course (overlap)
  const rh = S / rows;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const cover = i % 2 === 0; // convex cover tile vs concave channel
      const x0 = i * cw, y0 = j * rh;
      const tone = 0.82 + r() * 0.22;
      const grd = g.createLinearGradient(x0, 0, x0 + cw, 0);
      if (cover) {
        grd.addColorStop(0, `rgba(0,0,0,${0.38})`);
        grd.addColorStop(0.35, `rgba(255,255,255,${0.10})`);
        grd.addColorStop(0.6, `rgba(255,255,255,${0.05})`);
        grd.addColorStop(1, `rgba(0,0,0,${0.45})`);
      } else {
        grd.addColorStop(0, `rgba(0,0,0,0.15)`);
        grd.addColorStop(0.5, `rgba(0,0,0,0.32)`);
        grd.addColorStop(1, `rgba(0,0,0,0.15)`);
      }
      const v = Math.floor(200 * tone);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x0, y0, cw, rh);
      g.fillStyle = grd;
      g.fillRect(x0, y0, cw, rh);
      // overlap shadow at the lower edge of each course
      const sh = g.createLinearGradient(0, y0 + rh - 10, 0, y0 + rh);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.45)');
      g.fillStyle = sh;
      g.fillRect(x0 + (cover ? 2 : 0), y0 + rh - 10, cw - (cover ? 4 : 0), 10);
    }
  }
  noise(g, S, 22, 11, 2);
  return finish(c);
});

/** Flat roof (terrat): square clay tiles / concrete, 1 m tile. */
export const flatRoofTex = () => cached('flatroof', () => {
  const S = 256, { c, g } = canvas(S);
  const r = rng(3);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, S, S);
  const n = 4;
  const w = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 200 + Math.floor((r() - 0.5) * 26);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(i * w + 1, j * w + 1, w - 2, w - 2);
  }
  noise(g, S, 30, 5, 2);
  return finish(c);
});

export const asphaltTex = () => cached('asphalt', () => {
  const S = 256, { c, g } = canvas(S);
  g.fillStyle = '#5c5e61'; g.fillRect(0, 0, S, S);
  noise(g, S, 34, 21, 1);
  noise(g, S, 18, 22, 4);
  const r = rng(23);
  for (let i = 0; i < 90; i++) {
    const v = 120 + r() * 80;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  // a few patches / cracks
  for (let i = 0; i < 3; i++) {
    g.fillStyle = `rgba(40,40,42,${0.12 + r() * 0.1})`;
    g.beginPath();
    g.ellipse(r() * S, r() * S, 20 + r() * 40, 10 + r() * 30, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
});

/** Llambordes (setts) 10 x 20 cm, running bond. 2 m tile. */
export const settTex = () => cached('sett', () => {
  const S = 512, { c, g } = canvas(S);
  const r = rng(31);
  g.fillStyle = '#4a4744'; g.fillRect(0, 0, S, S);
  const rows = 20, rh = S / rows, cw = rh * 2;
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * cw * 0.5;
    for (let x = -cw; x < S + cw; x += cw) {
      const v = 120 + Math.floor(r() * 45);
      g.fillStyle = `rgb(${v},${v - 4},${v - 10})`;
      g.beginPath();
      g.roundRect(x + off + 1.5, j * rh + 1.5, cw - 3, rh - 3, 3);
      g.fill();
    }
  }
  noise(g, S, 20, 32, 2);
  return finish(c);
});

/** Empedrat: irregular rounded stones. 2 m tile. */
export const cobbleTex = () => cached('cobble', () => {
  const S = 512, { c, g } = canvas(S);
  const r = rng(41);
  g.fillStyle = '#5a534b'; g.fillRect(0, 0, S, S);
  const step = 22;
  for (let y = 0; y < S + step; y += step * 0.86) {
    for (let x = 0; x < S + step; x += step) {
      const px = x + (r() - 0.5) * 8 + ((y / step) % 2) * step * 0.5;
      const py = y + (r() - 0.5) * 8;
      const v = 135 + Math.floor(r() * 60);
      const rad = step * (0.42 + r() * 0.12);
      for (const [dx, dy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
        const grd = g.createRadialGradient(px + dx - rad * 0.3, py + dy - rad * 0.3, 1, px + dx, py + dy, rad);
        grd.addColorStop(0, `rgb(${v + 30},${v + 24},${v + 14})`);
        grd.addColorStop(1, `rgb(${v - 40},${v - 44},${v - 50})`);
        g.fillStyle = grd;
        g.beginPath();
        g.ellipse(px + dx, py + dy, rad, rad * (0.75 + r() * 0.2), r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  return finish(c);
});

/** Plaza paving: big stone slabs 40 x 60 cm. 2.4 m tile. */
export const pavingTex = () => cached('paving', () => {
  const S = 512, { c, g } = canvas(S);
  const r = rng(51);
  g.fillStyle = '#8c8478'; g.fillRect(0, 0, S, S);
  const rows = 6, rh = S / rows;
  for (let j = 0; j < rows; j++) {
    const cw = rh * 1.5;
    const off = (j % 2) * cw * 0.5;
    for (let x = -cw; x < S + cw; x += cw) {
      const v = 190 + Math.floor(r() * 30);
      g.fillStyle = `rgb(${v},${v - 6},${v - 18})`;
      g.fillRect(x + off + 1.5, j * rh + 1.5, cw - 3, rh - 3);
    }
  }
  noise(g, S, 18, 52, 2);
  return finish(c);
});

/** Panot gris (sidewalk tiles 20 x 20 cm with 4 "pastilles"). 1 m tile. */
export const sidewalkTex = () => cached('panot', () => {
  const S = 256, { c, g } = canvas(S);
  const r = rng(61);
  g.fillStyle = '#8d8b86'; g.fillRect(0, 0, S, S);
  const n = 5, w = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const v = 176 + Math.floor((r() - 0.5) * 18);
    const x0 = i * w, y0 = j * w;
    g.fillStyle = `rgb(${v},${v - 1},${v - 5})`;
    g.fillRect(x0 + 1, y0 + 1, w - 2, w - 2);
    g.fillStyle = `rgba(0,0,0,0.13)`;
    for (const [a, b] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      g.beginPath();
      g.arc(x0 + a * w, y0 + b * w, w * 0.12, 0, Math.PI * 2);
      g.fill();
    }
  }
  noise(g, S, 16, 62, 1);
  return finish(c);
});

export const grassTex = () => cached('grass', () => {
  const S = 256, { c, g } = canvas(S);
  const r = rng(71);
  g.fillStyle = '#6f8a3e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = r() * S, y = r() * S;
    const v = r();
    g.strokeStyle = v < 0.5 ? `rgba(60,85,30,0.6)` : `rgba(150,170,80,0.5)`;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
    g.stroke();
  }
  return finish(c);
});

/** Sauló (compacted light gravel of squares and parks). 2 m tile. */
export const gravelTex = () => cached('gravel', () => {
  const S = 256, { c, g } = canvas(S);
  g.fillStyle = '#c9b48f'; g.fillRect(0, 0, S, S);
  noise(g, S, 40, 81, 1);
  noise(g, S, 16, 82, 3);
  return finish(c);
});

export const dirtTex = () => cached('dirt', () => {
  const S = 256, { c, g } = canvas(S);
  g.fillStyle = '#a58a66'; g.fillRect(0, 0, S, S);
  noise(g, S, 36, 91, 1);
  noise(g, S, 24, 92, 5);
  return finish(c);
});

/** Detail noise to break the blur of the orthophoto near the camera (grey, linear). */
export const detailTex = () => cached('detail', () => {
  const S = 256, { c, g } = canvas(S);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  noise(g, S, 60, 101, 1);
  noise(g, S, 40, 102, 4);
  noise(g, S, 30, 103, 16);
  return finish(c, false);
});

export const barkTex = () => cached('bark', () => {
  const S = 128, { c, g } = canvas(S);
  const r = rng(111);
  g.fillStyle = '#6b5a47'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(30,22,15,${0.3 + r() * 0.4})`;
    g.lineWidth = 1 + r() * 2;
    const x = r() * S;
    g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, S / 3, x - 6, (2 * S) / 3, x + 3, S); g.stroke();
  }
  return finish(c);
});

/** Leaf clusters with alpha, for tree crowns. */
export const leavesTex = (hue: 'green' | 'olive' | 'dark' | 'palm') => cached('leaves' + hue, () => {
  const S = 256, { c, g } = canvas(S);
  const r = rng(hue.length * 97 + 13);
  const pal: Record<string, string[]> = {
    green: ['#4f6e2a', '#5f8233', '#3e5a22', '#6f9140'],
    olive: ['#7d8a62', '#6b7852', '#8e9b74', '#5d6848'],
    dark: ['#2f4a28', '#3a5a2e', '#26401f', '#44663a'],
    palm: ['#5e7d34', '#6d8c3c', '#4d6a2a', '#7f9a4a'],
  };
  const cols = pal[hue];
  for (let i = 0; i < 900; i++) {
    const x = r() * S, y = r() * S;
    const rad = 3 + r() * 7;
    const d = Math.hypot(x - S / 2, y - S / 2) / (S / 2);
    if (d > 0.98 && r() < 0.8) continue;
    g.fillStyle = cols[Math.floor(r() * cols.length)];
    g.beginPath();
    g.ellipse(x, y, rad, rad * 0.55, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return finish(c);
});

/** Wrought-iron / metal railing bars with alpha. */
export const railingTex = () => cached('railing', () => {
  const S = 128, { c, g } = canvas(S);
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#1d1d1d';
  g.fillRect(0, 0, S, 7); // handrail
  g.fillRect(0, S - 6, S, 6);
  for (let x = 4; x < S; x += 12) g.fillRect(x, 0, 3, S);
  g.strokeStyle = '#1d1d1d';
  g.lineWidth = 2.5;
  for (let x = 10; x < S; x += 24) { g.beginPath(); g.arc(x, S * 0.45, 5, 0, Math.PI * 2); g.stroke(); }
  const t = finish(c);
  return t;
});

/** Golden sandstone ashlar (carreus), 2 m tile. */
export const ashlarTex = () => cached('ashlar', () => {
  const S = 512, { c, g } = canvas(S);
  const r = rng(121);
  g.fillStyle = '#b39a70'; g.fillRect(0, 0, S, S);
  const rows = 6, rh = S / rows;
  for (let j = 0; j < rows; j++) {
    let x = -(j % 2) * 60;
    while (x < S) {
      const w = 90 + r() * 90;
      const v = 0.86 + r() * 0.2;
      const cr = Math.floor(205 * v), cg = Math.floor(176 * v), cb = Math.floor(118 * v);
      g.fillStyle = `rgb(${cr},${cg},${cb})`;
      g.fillRect(x + 2, j * rh + 2, w - 4, rh - 4);
      // weathering streaks
      g.fillStyle = `rgba(90,80,60,${r() * 0.18})`;
      g.fillRect(x + 2, j * rh + rh * 0.6, w - 4, rh * 0.4 - 2);
      x += w;
    }
  }
  noise(g, S, 26, 122, 2);
  return finish(c);
});

/** Rubble masonry of the side walls, 2 m tile. */
export const rubbleTex = () => cached('rubble', () => {
  const S = 512, { c, g } = canvas(S);
  const r = rng(131);
  g.fillStyle = '#8d8069'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 520; i++) {
    const x = r() * S, y = r() * S, w = 14 + r() * 34, h = 10 + r() * 20;
    const v = 120 + r() * 70;
    g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.78})`;
    g.beginPath();
    g.ellipse(x, y, w / 2, h / 2, r() * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  noise(g, S, 24, 132, 2);
  return finish(c);
});

/** Oval mosaic with the Riudoms arms (river + elms) of the Plaça de l'Església. */
export const mosaicTex = () => cached('mosaic', () => {
  const S = 512, { c, g } = canvas(S);
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#9a4b3a';
  g.beginPath(); g.ellipse(S / 2, S / 2, S / 2 - 2, S / 2 - 2, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b86b52';
  g.beginPath(); g.ellipse(S / 2, S / 2, S / 2 - 22, S / 2 - 22, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#b9c79a';
  g.beginPath(); g.ellipse(S / 2, S / 2, S / 2 - 40, S / 2 - 40, 0, 0, Math.PI * 2); g.fill();
  // two elm crowns
  for (const [x, y] of [[S * 0.33, S * 0.36], [S * 0.66, S * 0.34]]) {
    g.fillStyle = '#9fb77d';
    g.beginPath(); g.ellipse(x, y, 70, 58, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7d6a4d'; g.fillRect(x - 8, y + 40, 16, 50);
  }
  // wavy river
  g.strokeStyle = '#6e8da1'; g.lineWidth = 34; g.lineCap = 'round';
  g.beginPath();
  g.moveTo(60, S * 0.66);
  g.bezierCurveTo(S * 0.3, S * 0.52, S * 0.45, S * 0.8, S * 0.62, S * 0.64);
  g.bezierCurveTo(S * 0.75, S * 0.54, S * 0.85, S * 0.62, S - 60, S * 0.6);
  g.stroke();
  g.strokeStyle = '#c9d6dd'; g.lineWidth = 6;
  g.stroke();
  // tesserae grid
  g.strokeStyle = 'rgba(40,30,20,0.18)'; g.lineWidth = 1;
  for (let i = 0; i < S; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, S); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(S, i); g.stroke(); }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});

/** Glazed tiles (blue / white) for fountains. */
export const tilesTex = () => cached('tiles', () => {
  const S = 128, { c, g } = canvas(S);
  const n = 8, w = S / n;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    g.fillStyle = (i + j) % 2 ? '#e9eef2' : '#3d6fa8';
    g.fillRect(i * w, j * w, w, w);
    g.strokeStyle = 'rgba(0,0,0,0.15)'; g.strokeRect(i * w, j * w, w, w);
  }
  return finish(c);
});

/** Casal Riudomenc sign: red disc with a white "C" and the name. */
export const casalLogoTex = () => cached('casal', () => {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f3f3f0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#c8202a';
  g.beginPath(); g.arc(W / 2, 100, 78, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 26;
  g.beginPath(); g.arc(W / 2, 100, 42, Math.PI * 0.25, Math.PI * 1.75); g.stroke();
  g.fillStyle = '#1b1b1b'; g.font = 'bold 34px Arial, sans-serif'; g.textAlign = 'center';
  g.fillText('CASAL RIUDOMENC', W / 2, 222);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
});

/** Clock face. */
export const clockTex = () => cached('clock', () => {
  const S = 128, { c, g } = canvas(S);
  g.fillStyle = '#f2efe6'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#222'; g.lineWidth = 4; g.stroke();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke();
  }
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 26); g.stroke();
  g.beginPath(); g.moveTo(64, 64); g.lineTo(90, 72); g.stroke();
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
});
