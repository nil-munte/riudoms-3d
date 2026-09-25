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


// ---- facades read from the Cadastre photos (see layouts.ts) -------------------------
uniform highp sampler2D uLay;
varying float vLay;
vec4 LT(int x, int y) { return texelFetch(uLay, ivec2(x, y), 0); }
vec3 srgb(vec3 c) { return pow(c, vec3(2.2)); }
// photo colours are read by eye: keep dark ones from turning pure black in the shade
vec3 lumFloor(vec3 c, float m) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return l < m ? (l > 0.0005 ? min(c * (m / l), vec3(1.0)) : vec3(m)) : c;
}
float b255(float v) { return floor(v * 255.0 + 0.5); }

// wall materials: 0 stucco, 1 stone, 2 brick, 3 ceramic tiles, 4 concrete, 5 block
vec3 wallMat(vec3 col, float m, float u, float v, float seed) {
  if (m < 0.5) return col * (0.95 + 0.05 * fh21(floor(vec2(u, v) * 5.0) + seed));
  if (m < 1.5) { // stone (rubble / ashlar)
    float bh = 0.32, row = floor(v / bh);
    float bw = 0.45 + 0.35 * fh21(vec2(row, seed));
    float bu = u + fh21(vec2(row * 1.3, seed)) * bw;
    float j = step(bh - 0.035, mod(v, bh)) + step(bw - 0.035, mod(bu, bw));
    vec3 c = col * (0.82 + 0.3 * fh21(vec2(floor(bu / bw), row) + seed));
    return mix(c, col * 0.62, clamp(j, 0.0, 1.0));
  }
  if (m < 2.5) { // brick
    float row = floor(v / 0.075), bu = u + mod(row, 2.0) * 0.125;
    float mort = step(0.064, mod(v, 0.075)) + step(0.24, mod(bu, 0.25));
    return mix(col * (0.88 + 0.18 * fh21(vec2(floor(bu / 0.25), row))), vec3(0.72, 0.68, 0.62), clamp(mort, 0.0, 1.0));
  }
  if (m < 3.5) { // tiles
    float j = step(0.19, mod(v, 0.2)) + step(0.19, mod(u, 0.2));
    return mix(col * (0.95 + 0.08 * fh21(floor(vec2(u, v) / 0.2))), col * 0.8, clamp(j, 0.0, 1.0));
  }
  if (m < 4.5) return col * (0.93 + 0.07 * fh21(floor(vec2(u, v) * 3.0) + seed));
  float j = step(0.19, mod(v, 0.2)) + step(0.39, mod(u + mod(floor(v / 0.2), 2.0) * 0.2, 0.4));
  return mix(col, col * 0.78, clamp(j, 0.0, 1.0));
}

vec3 glassC(float lh, float cu, float lit, out float glow) {
  glow = lit;
  return vec3(0.13, 0.16, 0.19) + 0.12 * lh + 0.05 * step(abs(cu), 0.02);
}

vec3 layoutFacade(float u, float v, float L, float top, float fH, float seed, out float glow) {
  glow = 0.0;
  int base = int(vLay + 0.5) * 9;
  vec4 h0 = LT(0, base);
  float N = b255(h0.r), attic = b255(h0.g), shT = b255(h0.b);
  vec4 hp = LT(1, base); vec3 plC = lumFloor(srgb(hp.rgb), 0.1); float plH = hp.a * 255.0 / 50.0;
  vec4 hf = LT(2, base); vec3 frC = lumFloor(srgb(hf.rgb), 0.06); float sur = b255(hf.a);
  vec4 hd = LT(3, base); vec3 doorC = lumFloor(srgb(hd.rgb), 0.06);
  doorC = mix(doorC, vec3(dot(doorC, vec3(0.2126, 0.7152, 0.0722))), 0.3) * 1.15; // linear colour is too saturated
  float plM = b255(hd.a);
  bool wood = hd.r > hd.b * 1.25 && hd.r > 0.2; // brownish door colour: wooden planks
  vec4 hg = LT(4, base); vec3 gwC = lumFloor(srgb(hg.rgb), 0.16); float gM = b255(hg.a) - 1.0;
  vec4 hs = LT(5, base); vec3 shC = lumFloor(srgb(hs.rgb), 0.05); float wM = b255(hs.a);
  float gH = fH * 1.15;
  float fl = v < gH ? 0.0 : 1.0 + floor((v - gH) / fH);
  float lv = v < gH ? v : mod(v - gH, fH);
  float flH = fl < 0.5 ? gH : fH;
  vec3 wall = wallMat(vFCol, wM, u, v, seed);
  if (fl < 0.5 && gM >= 0.0) wall = wallMat(gwC, gM, u, v, seed + 3.0);
  wall *= mix(0.86, 1.0, smoothstep(0.0, 1.2, v));
  if (top - v < 0.22) wall *= 0.88;
  if (v < plH && plM > 0.5) {
    vec3 pc = plM > 2.5 ? wallMat(plC, 3.0, u, v, seed) : plM > 1.5 ? wallMat(plC, 1.0, u, v, seed + 7.0) : plC;
    wall = pc * (0.92 + 0.08 * fh21(floor(vec2(u, v) * 4.0)));
  }
  if (fl > N - 0.5 || fl > 7.5) return wall; // parapet / above the last storey seen in the photo
  int row = base + 1 + int(fl);
  vec4 r0 = LT(0, row);
  int cnt = int(b255(r0.r));
  for (int i = 1; i <= 15; i++) {
    if (i > cnt) break;
    vec4 o = LT(i, row);
    float t = b255(o.r);
    float cx = o.g * L, hw = max(o.b * L * 0.5, 0.2);
    float cu = u - cx;
    if (abs(cu) > hw + 0.2) continue;
    float hs1 = fh21(vec2(float(i) * 3.1 + fl, seed));
    float hs2 = fh21(vec2(float(i) * 1.7, fl + seed * 2.3));
    // vertical extent of the opening inside the storey
    float y0, y1;
    if (fl < 0.5) {
      if (t < 2.5) { y0 = 0.0; y1 = min(t > 1.5 ? 2.9 : 2.35, flH - 0.25); }
      else if (t < 4.5) { y0 = 0.0; y1 = min(t > 3.5 ? 3.0 : 2.6, flH - 0.2); }
      else if (t < 5.5) { y0 = 0.25; y1 = min(2.9, flH - 0.25); }
      else if (t < 6.5) { y0 = 1.0; y1 = min(2.25, flH - 0.3); }
      else { y0 = min(1.8, flH - 0.9); y1 = min(2.35, flH - 0.25); }
    } else {
      bool att = attic > 0.5 && fl > N - 1.5;
      if (t < 6.5) { y0 = 0.95; y1 = min(2.3, fH - 0.4); }
      else if (t < 7.5) { y0 = att ? 0.55 : 1.1; y1 = y0 + min(0.85, fH - y0 - 0.35); }
      else if (t < 8.5) { y0 = 0.0; y1 = min(2.35, fH - 0.35); }
      else if (t < 9.5) { y0 = 0.55; y1 = fH - 0.3; }
      else { y0 = 0.0; y1 = fH - 0.2; }
    }
    bool arch = (t > 1.5 && t < 2.5) || (t > 3.5 && t < 4.5);
    float ay = y1 - hw; // arch springing line
    bool inO = abs(cu) < hw && lv > y0 && (arch ? (lv < ay || length(vec2(cu, lv - ay)) < hw) : lv < y1);
    if (!inO) {
      // stone surround / voussoirs, sill shadow
      bool nearO = abs(cu) < hw + 0.16 && lv > y0 - 0.12 && (arch ? (lv < ay || length(vec2(cu, lv - ay)) < hw + 0.16) : lv < y1 + 0.14);
      if (nearO && (sur > 0.5 || arch)) return mix(wall, vec3(0.8, 0.76, 0.68), 0.6) * (0.9 + 0.1 * hs1);
      if (abs(cu) < hw + 0.05 && lv > y0 - 0.1 && lv < y0 && y0 > 0.3) return wall * 0.78;
      continue;
    }
    float lh = (lv - y0) / max(y1 - y0, 0.1);
    float fw = 0.06;
    bool frame = abs(cu) > hw - fw || lv < y0 + fw || (!arch && lv > y1 - fw);
    float lit = step(0.55, hs2);
    if (t < 2.5) { // doors: wood panels in the door colour
      if (frame) return doorC * 0.7;
      float panel = step(0.5, fract(lv * 1.4)) * 0.07 + step(abs(cu), 0.02) * 0.35;
      if (wood) panel = step(0.88, fract(cu / 0.14)) * 0.22 + step(abs(cu), 0.02) * 0.35;
      return doorC * (1.0 - panel) * (0.9 + 0.1 * hs1);
    }
    if (t < 4.5) { // garage / warehouse: roller door or wooden leaves
      if (frame) return doorC * 0.65;
      bool roller = !wood && (hs1 > 0.35 || t < 3.5);
      if (roller) return doorC * (0.78 + 0.22 * step(0.5, fract(lv * 7.0)));
      return doorC * (0.85 + 0.15 * step(abs(cu), 0.03)) * (1.0 - 0.2 * step(0.88, fract(cu / 0.16)) - 0.08 * step(0.5, fract(lv * 1.2)));
    }
    if (t < 5.5) { // shop window
      if (frame || abs(fract(cu / 1.4) - 0.5) < 0.02) return frC * 0.7;
      glow = 0.3 * step(0.4, hs1);
      return vec3(0.25, 0.3, 0.33) + 0.12 * lh;
    }
    if (t > 9.5) return wall * 0.35; // terrace recess
    if (frame) return frC;
    if (t > 8.5) { // gallery: glazed wooden frame grid
      if (abs(fract(cu / 0.6) - 0.5) > 0.44 || abs(fract(lv / 0.7) - 0.5) > 0.44) return frC * 0.85;
      return glassC(lh, cu, lit, glow);
    }
    // windows and balcony doors with their shutters
    float st = shT > 2.5 ? (hs2 < 0.5 ? 1.0 : 2.0) : shT;
    if (st > 0.5 && st < 1.5) { // persianes de llibret: closed, half open, open
      if (hs1 < 0.35) return shC * (0.8 + 0.2 * step(0.5, fract(lv * 16.0))) * (1.0 - 0.5 * step(abs(cu), 0.015));
      if (hs1 < 0.6 && abs(cu) > hw * 0.5) return shC * (0.8 + 0.2 * step(0.5, fract(lv * 16.0)));
    } else if (st > 1.5) { // roller shutter pulled down a random amount, box on top
      if (lh > 0.9) return shC * 0.92;
      float down = hs1 < 0.25 ? 1.0 : hs1 < 0.7 ? hs1 * 0.9 : 0.1;
      if (1.0 - lh < down) return shC * (0.85 + 0.15 * step(0.5, fract(lv * 20.0)));
    }
    if (abs(cu) < 0.03) return frC; // mullion
    return glassC(lh, cu, lit, glow);
  }
  return wall;
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
  if (street && vLay > -0.5) return layoutFacade(u, v, L, top, fH, seed, glow);
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

export function makeFacadeMaterial(layouts: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = nightUniform;
    sh.uniforms.uLay = { value: layouts };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aFac; attribute vec4 aInfo; attribute vec4 aExtra; attribute vec3 aFCol; attribute vec3 aSCol; attribute float aLay;
        varying vec2 vFac; varying vec4 vInfo; varying vec4 vExtra; varying vec3 vFCol; varying vec3 vSCol; varying float vLay;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vFac = aFac; vInfo = aInfo; vExtra = aExtra; vFCol = aFCol; vSCol = aSCol; vLay = aLay;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      .replace('#include <color_fragment>', `
        float fglow;
        diffuseColor.rgb = facadeColor(fglow);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.72, 0.4) * fglow * uNight * 0.75;`);
  };
  mat.customProgramCacheKey = () => 'facade2';
  return mat;
}
