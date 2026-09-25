// Packs the facade layouts read from the Cadastre photos into a data texture
// that the facade shader reads with texelFetch. One layout = 9 rows of 16 texels:
//   row 0      header (storeys, shutters, colours, materials)
//   rows 1..8  one per storey (ground floor first): texel 0 = count + balcony,
//              texels 1..15 = openings [type, centre, width] (fractions of the facade width)
import * as THREE from 'three';
import type { FacadeLayout } from '../data/types';

export const LAY_W = 16, LAY_ROWS = 9;

const c = new THREE.Color();
function rgb(hex: string | null | undefined, fallback: string): [number, number, number] {
  c.set(hex || fallback);
  return [Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255)];
}

export function layoutTexture(layouts: FacadeLayout[]): THREE.DataTexture {
  const rows = Math.max(1, layouts.length * LAY_ROWS);
  const d = new Uint8Array(LAY_W * rows * 4);
  const put = (x: number, y: number, v: number[]) => d.set(v.map((q) => Math.max(0, Math.min(255, Math.round(q)))), (y * LAY_W + x) * 4);
  layouts.forEach((l, k) => {
    const r = k * LAY_ROWS;
    const wall = l.wall || '#d9cbb0';
    put(0, r, [l.n, l.at, l.sh, l.rl]);
    put(1, r, [...rgb(l.pc, '#8f887c'), l.ph * 50]);
    put(2, r, [...rgb(l.fr, '#e8e6e0'), l.su]);
    put(3, r, [...rgb(l.dc, '#5b4632'), l.pm]);
    put(4, r, [...rgb(l.gw || wall, wall), l.gw || l.gm >= 0 ? (l.gm >= 0 ? l.gm : l.wm) + 1 : 0]);
    put(5, r, [...rgb(l.sc, '#4f6e46'), l.wm]);
    put(6, r, [l.rf, l.oc, 0, 0]);
    const floors = [{ o: l.g, b: 0, b0: 0, b1: 0 }, ...l.u];
    floors.slice(0, LAY_ROWS - 1).forEach((f, fi) => {
      const y = r + 1 + fi;
      const ops = f.o.slice(0, LAY_W - 1);
      put(0, y, [ops.length, f.b, f.b0 * 255, f.b1 * 255]);
      ops.forEach((o, i) => put(1 + i, y, [o[0], o[1] * 255, o[2] * 255, 0]));
    });
  });
  const tex = new THREE.DataTexture(d, LAY_W, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}
