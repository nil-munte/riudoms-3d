"""Rasterise the ICGC LiDAR sheets (data/raw/icgc/lidar/*.laz) into grids.

Outputs data/work/lidar.npz with:
  dsm   0.5 m  highest return per cell (all classes except noise), NaN = no data
  ndvi  0.5 m  NDVI of that highest return (the LAZ carries RGB + NIR)
  dtm   1.0 m  mean of ground points (class 2), gaps filled by diffusion
  gmask 1.0 m  1 where the cell has measured ground points
  x0, y1       west / north edge of the grids (EPSG:25831)
and data/work/lidar_trees.json with detected tree crowns (x, y, height, radius).

Heights are orthometric metres as delivered by the ICGC.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import laspy
import numpy as np
from scipy import ndimage

from common import RAW, ROOT

WORK = ROOT / "data" / "work"
NOISE = {7, 18}
AREA = (335000.0, 4555000.0, 338000.0, 4557000.0)  # must match download_icgc.LIDAR_AREA


def fill_nan(a: np.ndarray, iters: int = 400) -> np.ndarray:
    """Fill NaN holes (e.g. ground under buildings) by nearest valid value,
    then smooth the filled cells a bit so they do not look terraced."""
    mask = np.isnan(a)
    if not mask.any():
        return a
    idx = ndimage.distance_transform_edt(mask, return_distances=False, return_indices=True)
    f = a[tuple(idx)]
    sm = ndimage.uniform_filter(f, size=9)
    f[mask] = sm[mask]
    return f


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    files = sorted((RAW / "icgc" / "lidar").glob("*.laz"))
    if not files:
        print("LiDAR: no sheets found, skipping (heights will come from the Cadastre)")
        return
    x0, y0, x1, y1 = AREA
    W05, H05 = int((x1 - x0) / 0.5), int((y1 - y0) / 0.5)
    W1, H1 = int(x1 - x0), int(y1 - y0)
    dsm = np.full(H05 * W05, -np.inf, dtype=np.float32)
    ndvi = np.zeros(H05 * W05, dtype=np.float32)
    gsum = np.zeros(H1 * W1, dtype=np.float64)
    gcnt = np.zeros(H1 * W1, dtype=np.int32)

    for fp in files:
        print("LiDAR:", fp.name)
        with laspy.open(fp) as f:
            for pts in f.chunk_iterator(6_000_000):
                cls = np.asarray(pts.classification)
                keep = ~np.isin(cls, list(NOISE))
                x = np.asarray(pts.x)[keep]
                y = np.asarray(pts.y)[keep]
                z = np.asarray(pts.z)[keep].astype(np.float32)
                cls = cls[keep]
                red = np.asarray(pts.red)[keep].astype(np.float32)
                nir = np.asarray(pts.nir)[keep].astype(np.float32)
                ins = (x >= x0) & (x < x1) & (y > y0) & (y <= y1)
                x, y, z, cls, red, nir = x[ins], y[ins], z[ins], cls[ins], red[ins], nir[ins]
                # 0.5 m DSM: keep the highest point of each cell (and its NDVI)
                c = ((x - x0) / 0.5).astype(np.int64)
                r = ((y1 - y) / 0.5).astype(np.int64)
                idx = r * W05 + c
                order = np.lexsort((z, idx))
                idx_s = idx[order]
                last = np.r_[idx_s[1:] != idx_s[:-1], True]
                sel = order[last]
                cell = idx[sel]
                better = z[sel] > dsm[cell]
                cell, sel = cell[better], sel[better]
                dsm[cell] = z[sel]
                nv = (nir[sel] - red[sel]) / np.maximum(nir[sel] + red[sel], 1.0)
                ndvi[cell] = nv
                # 1 m ground
                g = cls == 2
                gi = ((y1 - y[g]).astype(np.int64)) * W1 + (x[g] - x0).astype(np.int64)
                gsum += np.bincount(gi, weights=z[g], minlength=H1 * W1)
                gcnt += np.bincount(gi, minlength=H1 * W1).astype(np.int32)

    dsm = dsm.reshape(H05, W05)
    dsm[~np.isfinite(dsm)] = np.nan
    ndvi = ndvi.reshape(H05, W05)
    with np.errstate(invalid="ignore", divide="ignore"):
        dtm = (gsum / gcnt).astype(np.float32).reshape(H1, W1)
    dtm[gcnt.reshape(H1, W1) == 0] = np.nan
    print(f"LiDAR: ground coverage {100 * np.isfinite(dtm).mean():.1f}% of 1 m cells")
    gmask = (gcnt.reshape(H1, W1) > 0).astype(np.uint8)  # cells with measured ground (not interpolated)
    dtm = fill_nan(dtm)
    np.savez_compressed(WORK / "lidar.npz", dsm=dsm, ndvi=ndvi.astype(np.float16), dtm=dtm, gmask=gmask,
                        x0=x0, y1=y1)
    detect_trees(dsm, ndvi, dtm, x0, y1)


def detect_trees(dsm, ndvi, dtm, x0, y1):
    """Tree crowns = local maxima of the vegetation height model. Buildings are
    removed with the NDVI of the top return (roofs are not green)."""
    from loaders import load_cadastre_buildings, world_polygon
    from rasterio import features
    from rasterio.transform import from_origin

    H, W = dsm.shape
    # ground at 0.5 m by repeating the 1 m DTM
    g = np.repeat(np.repeat(dtm, 2, axis=0), 2, axis=1)[:H, :W]
    chm = np.nan_to_num(dsm - g, nan=0.0)
    _, parts = load_cadastre_buildings(world_polygon())
    tr = from_origin(x0, y1, 0.5, 0.5)
    bmask = features.rasterize(((p.geom.buffer(0.6), 1) for p in parts), out_shape=(H, W), transform=tr,
                               fill=0, dtype="uint8")
    veg = (chm > 1.8) & (ndvi.astype(np.float32) > 0.12) & (bmask == 0)
    veg = ndimage.binary_opening(veg, iterations=1)
    h = np.where(veg, chm, 0).astype(np.float32)
    hs = ndimage.gaussian_filter(h, 1.0)
    peaks = (hs == ndimage.maximum_filter(hs, size=7)) & (hs > 2.0) & veg
    lab, n = ndimage.label(peaks)
    cy, cx = np.array(ndimage.center_of_mass(peaks, lab, range(1, n + 1))).T if n else ([], [])
    cy = np.asarray(cy)
    cx = np.asarray(cx)
    # crown size: assign vegetation cells to the nearest peak (Voronoi) and measure the area
    markers = np.zeros((H, W), dtype=np.int32)
    markers[np.round(cy).astype(int), np.round(cx).astype(int)] = np.arange(1, len(cx) + 1)
    dist, ind = ndimage.distance_transform_edt(markers == 0, return_indices=True)
    owner = markers[ind[0], ind[1]]
    owner[~veg | (dist > 16)] = 0  # max crown radius 8 m
    area = np.bincount(owner.ravel(), minlength=len(cx) + 1)[1:] * 0.25
    trees = []
    for i in range(len(cx)):
        r_, c_ = int(round(cy[i])), int(round(cx[i]))
        ht = float(h[max(0, r_ - 2):r_ + 3, max(0, c_ - 2):c_ + 3].max())
        rad = math.sqrt(area[i] / math.pi) if area[i] > 0 else 1.0
        trees.append([round(x0 + (cx[i] + 0.5) * 0.5, 2), round(y1 - (cy[i] + 0.5) * 0.5, 2),
                      round(ht, 1), round(min(max(rad, 0.8), 8.0), 1)])
    with open(WORK / "lidar_trees.json", "w") as f:
        json.dump({"crs": "EPSG:25831", "fields": ["x", "y", "height", "radius"], "trees": trees}, f)
    print(f"LiDAR: {len(trees)} tree crowns detected")


if __name__ == "__main__":
    if "--trees-only" in sys.argv:
        d = np.load(WORK / "lidar.npz")
        detect_trees(d["dsm"], d["ndvi"], d["dtm"], float(d["x0"]), float(d["y1"]))
    else:
        main()
