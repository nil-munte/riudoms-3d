// Procedural Mediterranean facade shader: windows with wooden or roller
// shutters, doors and shop fronts on street facades, balcony doors, stone
// plinths, brick, cornices and lit windows at night. Patched into
// MeshLambertMaterial so it keeps three.js lighting, shadows and fog.
import * as THREE from 'three';

/** Window grid parameters per style (must match balcony placement in buildings.ts). */
export const STYLE_SPACING = [3.1, 3.4, 3.6, 6.0, 5.0, 3.8, 99, 99];
export const GROUND_FLOOR_H = 3.5;
export const FLOOR_H = 3.0;

export const nightUniform = { value: 0 };

const GLSL = /* glsl */ `
varying vec2 vFac;
varying vec4 vInfo;
varying vec4 vExtra;
varying vec3 vFCol;
varying vec3 vSCol;
uniform float uNight;

float fh21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float bitAt(float mask, float i) {
  return mod(floor(mask / exp2(i)), 2.0);
}
float box(vec2 p, vec2 lo, vec2 hi) {
  return step(lo.x, p.x) * step(p.x, hi.x) * step(lo.y, p.y) * step(p.y, hi.y);
}

// returns colour; glow receives emission strength (0..1)
vec3 facadeColor(out float glow) {
  glow = 0.0;
  float u = vFac.x, v = vFac.y;
  float L = vInfo.x, flag = vInfo.y, floors = vInfo.z;
  float st = mod(vInfo.w, 10.0);
  float retail = mod(floor(vInfo.w / 10.0), 2.0);
  float brick = step(19.5, vInfo.w);
  float top = vExtra.x, seed = vExtra.y, bal = vExtra.z;
  float fH = vExtra.w;          // real storey height of this building part
  float gH = fH * 1.15;         // ground floor a bit taller
  vec3 wall = vFCol;
  float n1 = fh21(floor(vec2(u, v) * 6.0) + seed);
  float n2 = fh21(floor(vec2(u, v) * 1.3) + seed * 1.7);
  wall *= 0.95 + 0.05 * n1 + 0.04 * (n2 - 0.5);
  if (brick > 0.5) {
    float row = floor(v / 0.075);
    float bu = u + mod(row, 2.0) * 0.125;
    float mort = step(0.064, mod(v, 0.075)) + step(0.24, mod(bu, 0.25));
    wall = mix(wall * (0.9 + 0.15 * fh21(vec2(floor(bu / 0.25), row))), vec3(0.78, 0.74, 0.68), clamp(mort, 0.0, 1.0));
  }
  // weathering near the ground and under the eaves
  wall *= mix(0.86, 1.0, smoothstep(0.0, 1.2, v));
  if (top - v < 0.22 && flag < 1.5) wall *= 0.86;
  if (st > 5.5) {
    // monuments (church ashlar, ermita stucco scored as ashlar): no openings
    float bh = st < 6.5 ? 0.38 : 0.45, bw = st < 6.5 ? 0.62 : 0.9;
    float row = floor(v / bh);
    float bu = u + mod(row, 2.0) * bw * 0.5;
    float joint = step(bh - 0.03, mod(v, bh)) + step(bw - 0.03, mod(bu, bw));
    vec3 c = vFCol * (0.88 + 0.16 * fh21(vec2(floor(bu / bw), row) + seed));
    return mix(c, c * (st < 6.5 ? 0.7 : 0.85), clamp(joint, 0.0, 1.0));
  }
  if (flag > 1.5) return wall * 0.92; // party wall: blank

  bool street = flag > 0.5;
  // stone plinth (socol) on old / public street facades
  if (street && (st < 0.5 || st > 4.5) && v < 0.85) wall = mix(wall, vec3(0.62, 0.58, 0.52), 0.7) * (0.9 + 0.1 * n1);

  float fl = v < gH ? 0.0 : 1.0 + floor((v - gH) / fH);
  float lv = v < gH ? v : mod(v - gH, fH);
  float flBase = v - lv;
  if (street && (st < 0.5 || st > 4.5) && fl > 0.5 && lv < 0.14) return mix(wall, vec3(0.9, 0.87, 0.8), 0.35) * 0.97;
  if (fl > floors - 0.5) return wall;

  float sp = st < 0.5 ? ${'3.1'} : st < 1.5 ? 3.4 : st < 2.5 ? 3.6 : st < 3.5 ? 6.0 : st < 4.5 ? 5.0 : 3.8;
  float ncol = max(1.0, floor(L / sp));
  float cw = L / ncol;
  float ci = min(floor(u / cw), ncol - 1.0);
  float cu = u - (ci + 0.5) * cw;
  float hh = fh21(vec2(ci, fl) + seed * 7.13);
  float hs = fh21(vec2(ci * 1.7, fl + 3.1) + seed * 3.7);

  // ---- ground floor ------------------------------------------------------
  if (fl < 0.5) {
    if (street) {
      if (st > 2.5 && st < 3.5) {
        // industrial: big sectional door every other column
        if (mod(ci, 2.0) < 0.5) {
          float inD = box(vec2(cu, lv), vec2(-min(2.2, cw * 0.4), 0.0), vec2(min(2.2, cw * 0.4), 4.0));
          if (inD > 0.5) return vec3(0.55, 0.57, 0.58) * (0.85 + 0.15 * step(0.5, fract(lv * 3.0)));
        }
        return wall;
      }
      if (retail > 0.5) {
        float w2 = cw * 0.4;
        float inS = box(vec2(cu, lv), vec2(-w2, 0.25), vec2(w2, 2.9));
        if (inS > 0.5) {
          float fr = 1.0 - box(vec2(cu, lv), vec2(-w2 + 0.08, 0.33), vec2(w2 - 0.08, 2.82));
          if (fr > 0.5) return vec3(0.22, 0.22, 0.23);
          glow = 0.3 * step(0.45, hh); // some shops keep the lights on at night
          return vec3(0.28, 0.33, 0.36) + 0.12 * smoothstep(0.3, 2.8, lv);
        }
        return wall;
      }
      // houses: door or garage on alternate columns, window otherwise
      float kind = hh;
      if (kind < 0.42) {
        float dw = st < 0.5 ? 0.62 : 0.55;
        float inD = box(vec2(cu, lv), vec2(-dw, 0.0), vec2(dw, st < 0.5 ? 2.6 : 2.3));
        if (inD > 0.5) {
          float fr = 1.0 - box(vec2(cu, lv), vec2(-dw + 0.07, 0.0), vec2(dw - 0.07, (st < 0.5 ? 2.6 : 2.3) - 0.07));
          vec3 wood = st < 0.5 ? mix(vec3(0.33, 0.21, 0.12), vSCol, 0.35) : vec3(0.42, 0.3, 0.2);
          if (fr > 0.5) return st < 0.5 ? vec3(0.72, 0.68, 0.6) : wall * 0.7;
          float panel = step(0.5, fract(lv * 1.6)) * 0.08 + step(abs(cu), 0.02) * 0.3;
          return wood * (1.0 - panel);
        }
      } else if (kind < 0.62 && st > 0.5 && cw > 2.8) {
        float inG = box(vec2(cu, lv), vec2(-1.25, 0.0), vec2(1.25, 2.3));
        if (inG > 0.5) return vec3(0.6, 0.6, 0.58) * (0.8 + 0.2 * step(0.5, fract(lv * 5.0)));
      }
    }
    // window on the ground floor (with iron bars on old houses)
    float ww = st < 0.5 ? 0.45 : 0.6;
    float inW = box(vec2(cu, lv), vec2(-ww, 1.0), vec2(ww, 2.25));
    if (inW < 0.5) return wall;
    float frm = 1.0 - box(vec2(cu, lv), vec2(-ww + 0.07, 1.07), vec2(ww - 0.07, 2.18));
    if (frm > 0.5) return st < 0.5 ? vec3(0.75, 0.71, 0.63) : vec3(0.7, 0.7, 0.7);
    if (st < 0.5 && street && abs(fract(cu * 8.0) - 0.5) < 0.08) return vec3(0.1);
    glow = step(0.55, hs);
    return vec3(0.16, 0.19, 0.22) + 0.08 * smoothstep(1.1, 2.2, lv);
  }

  // ---- upper floors ------------------------------------------------------
  bool balc = street && bitAt(bal, ci) > 0.5;
  bool attic = st < 0.5 && floors >= 3.0 && fl > floors - 1.5;
  float ww = st < 0.5 ? 0.5 : st < 1.5 ? 0.65 : st < 2.5 ? 0.75 : st < 3.5 ? 1.2 : st < 4.5 ? 0.35 : 0.7;
  float wb = balc ? 0.0 : (st > 2.5 && st < 3.5 ? 1.6 : 0.95);
  float wt = balc ? min(2.25, fH - 0.45) + max(0.0, fH - 3.0) * 0.5 : (st > 2.5 && st < 3.5 ? 2.3 : min(2.2, fH - 0.5) + max(0.0, fH - 3.0) * 0.5);
  if (attic && !balc) { ww = 0.38; wb = 1.2; wt = 2.0; }
  if (st > 3.5 && st < 4.5) { wb = 1.3; wt = 2.1; }
  if (flBase + wt > top - 0.15) wt = top - 0.15 - flBase;
  if (wt - wb < 0.4) return wall;
  float inW = box(vec2(cu, lv), vec2(-ww, wb), vec2(ww, wt));
  // stone surround on old facades
  if (inW < 0.5) {
    if (st < 0.5 && street && box(vec2(cu, lv), vec2(-ww - 0.12, wb - 0.1), vec2(ww + 0.12, wt + 0.14)) > 0.5)
      return mix(wall, vec3(0.86, 0.82, 0.74), 0.55);
    // sill shadow
    if (box(vec2(cu, lv), vec2(-ww - 0.05, wb - 0.12), vec2(ww + 0.05, wb)) > 0.5) return wall * 0.8;
    return wall;
  }
  float frm = 1.0 - box(vec2(cu, lv), vec2(-ww + 0.06, wb + 0.06), vec2(ww - 0.06, wt - 0.06));
  vec3 frameC = st < 0.5 ? vec3(0.8, 0.77, 0.7) : st < 1.5 ? vec3(0.45, 0.33, 0.22) : vec3(0.72, 0.73, 0.74);
  if (frm > 0.5) return frameC;
  float lh = (lv - wb) / (wt - wb);
  vec3 glass = vec3(0.14, 0.17, 0.2) + 0.12 * lh + 0.05 * step(abs(cu), 0.02);
  float lit = step(0.52, hs);
  if (st < 0.5 || st > 3.5) {
    // persianes de llibret (hinged wooden shutters): closed, half or open
    if (hh < 0.33) {
      float slat = 0.8 + 0.2 * step(0.5, fract(lv * 16.0));
      float mid = step(abs(cu), 0.015);
      return vSCol * slat * (1.0 - 0.5 * mid);
    }
    if (hh < 0.55 && abs(cu) > ww * 0.5) return vSCol * (0.8 + 0.2 * step(0.5, fract(lv * 16.0)));
  } else {
    // roller shutter pulled down a random amount
    float down = hh < 0.25 ? 1.0 : hh < 0.7 ? hh * 0.9 : 0.1;
    if (1.0 - lh < down) return vSCol * (0.85 + 0.15 * step(0.5, fract(lv * 20.0)));
  }
  glow = lit;
  return glass;
}
`;

export function makeFacadeMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = nightUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aFac; attribute vec4 aInfo; attribute vec4 aExtra; attribute vec3 aFCol; attribute vec3 aSCol;
        varying vec2 vFac; varying vec4 vInfo; varying vec4 vExtra; varying vec3 vFCol; varying vec3 vSCol;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFac = aFac; vInfo = aInfo; vExtra = aExtra; vFCol = aFCol; vSCol = aSCol;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <color_fragment>', `
        float fglow;
        diffuseColor.rgb = facadeColor(fglow);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.4) * fglow * uNight * 0.75;`);
  };
  mat.customProgramCacheKey = () => 'facade1';
  return mat;
}
