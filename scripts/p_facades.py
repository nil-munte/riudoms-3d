"""Real facade and shutter colours from the Cadastre facade photos
(data/raw/cadastre/facades/<ref>.jpg). Results are cached in
data/work/facade_colors.json."""
from __future__ import annotations

import colorsys
import json

import numpy as np
from PIL import Image

from common import RAW
from ctx import WORK


def _kmeans(px: np.ndarray, k: int = 6, iters: int = 10, seed: int = 1):
    rng = np.random.default_rng(seed)
    cent = px[rng.choice(len(px), k, replace=False)].astype(np.float32)
    for _ in range(iters):
        d = ((px[:, None, :] - cent[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for i in range(k):
            m = lab == i
            if m.any():
                cent[i] = px[m].mean(0)
    counts = np.bincount(lab, minlength=k)
    return cent, counts, lab


def _sunlit(c: np.ndarray, pix: np.ndarray) -> np.ndarray:
    """Colour of the sunlit part of a cluster, with the bluish cast of shade removed."""
    lum = pix @ np.array([0.299, 0.587, 0.114])
    bright = pix[lum >= np.median(lum)] if len(pix) > 10 else pix
    col = bright.mean(0) if len(bright) else c
    r, g, b = col
    if b > r and (max(col) - min(col)) / max(max(col), 1) < 0.15:  # grey-blue from shade: warm it up
        col = np.array([r * 1.04, g, b * 0.94])
    lum = 0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]
    if lum < 150:  # photos are often taken in the shade: bring plaster to a daylight level
        col = col * (150 / max(lum, 1))
    return np.clip(col, 0, 255)


def analyse(path) -> dict | None:
    im = Image.open(path).convert("RGB")
    im.thumbnail((160, 160))
    a = np.asarray(im).astype(np.float32)
    h, w, _ = a.shape
    reg = a[int(h * 0.10):int(h * 0.75), int(w * 0.15):int(w * 0.85)].reshape(-1, 3)
    r, g, b = reg[:, 0], reg[:, 1], reg[:, 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    mx, mn = reg.max(1), reg.min(1)
    sat = (mx - mn) / np.maximum(mx, 1)
    sky = ((b > r + 12) & (lum > 140)) | ((lum > 215) & (sat < 0.08))
    green = (g > r * 1.04) & (g > b * 1.04) & (sat > 0.15)  # trees and plants in front of the facade
    loud = sat > 0.62  # signs, cars, awnings
    keep = ~sky & ~green & ~loud & (lum > 45)
    px = reg[keep]
    if len(px) < 200:
        return None
    if len(px) > 4000:
        px = px[np.random.default_rng(0).choice(len(px), 4000, replace=False)]
    cent, counts, lab = _kmeans(px)
    order = np.argsort(-counts)
    share = counts / counts.sum()
    wall = _sunlit(cent[order[0]], px[lab == order[0]])
    hsv = [colorsys.rgb_to_hsv(*(c / 255)) for c in cent]
    wh, ws, wv = colorsys.rgb_to_hsv(*(wall / 255))
    brick = (0.03 <= wh <= 0.10) and (0.30 <= ws <= 0.70) and (0.35 <= wv <= 0.80)
    shutter = None
    for i in order[1:]:
        hh, ss, vv = hsv[i]
        if share[i] < 0.03:
            continue
        green = 0.19 <= hh <= 0.50 and ss > 0.18 and vv > 0.15
        brown = 0.02 <= hh <= 0.11 and ss > 0.35 and vv < 0.45
        if green or brown:
            shutter = cent[i]
            break
    hexc = lambda c: "#%02x%02x%02x" % tuple(int(max(0, min(255, v))) for v in c)
    return {"wall": hexc(wall), "shutter": hexc(shutter) if shutter is not None else None,
            "brick": bool(brick), "share": round(float(share[order[0]]), 2)}


def facade_colors() -> dict:
    cache = WORK / "facade_colors_v3.json"
    d = RAW / "cadastre" / "facades"
    photos = sorted(d.glob("*.jpg")) if d.exists() else []
    old = json.load(open(cache)) if cache.exists() else {}
    changed = False
    for p in photos:
        ref = p.stem
        if ref in old:
            continue
        try:
            old[ref] = analyse(p)
        except Exception:
            old[ref] = None
        changed = True
    if changed:
        WORK.mkdir(parents=True, exist_ok=True)
        json.dump(old, open(cache, "w"))
    return {k: v for k, v in old.items() if v}
