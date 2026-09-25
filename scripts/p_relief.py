"""Level changes (desnivells) from the 1 m LiDAR DTM.

A "step strength" is computed as the height drop over 3 m minus a quarter of
the drop over 12 m in the same direction: uniform slopes (streets, fields)
cancel out, while terraces, platform edges and walls stand out. The step cells
are cut into ≤5 m chunks and each chunk becomes a straight segment with the
upper / lower level measured on both sides. Segments are then classified with
the street layers:

  stairs  both sides are pedestrian (squares, sidewalks, pedestrian streets)
  wall    urban retaining wall (one side is a roadway, or the drop is > 2.5 m);
          walls in public space get a railing on top
  marge   dry-stone terrace wall in the fields (Baix Camp "marges")

Positions and heights are REAL (LiDAR); whether a given urban edge is a stair
or a wall is ESTIMATED from the surface on each side.
"""
from __future__ import annotations

import math

import numpy as np
from rasterio import features
from rasterio.transform import from_origin
from scipy import ndimage
from shapely.geometry import Point
from shapely.prepared import prep

from common import OUT, save_json
from ctx import WORK, Ctx

CHUNK = 5.0
MIN_DROP = 0.28


def _shift(a, dy, dx):
    return ndimage.shift(a, (dy, dx), order=1, mode="nearest")


def step_strength(a):
    best = np.zeros_like(a)
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        L = math.hypot(dy, dx)
        d3 = _shift(a, -dy * 1.5 / L, -dx * 1.5 / L) - _shift(a, dy * 1.5 / L, dx * 1.5 / L)
        d12 = _shift(a, -dy * 6 / L, -dx * 6 / L) - _shift(a, dy * 6 / L, dx * 6 / L)
        best = np.maximum(best, np.abs(d3) - np.abs(d12) / 4.0)
    return best


def process_relief(ctx: Ctx, sdata):
    lp = WORK / "lidar.npz"
    if not lp.exists():
        save_json(OUT / "relief.json", {"segments": []})
        return
    d = np.load(lp)
    dtm, gm = d["dtm"].astype(np.float64), d["gmask"]
    X0, Y1 = float(d["x0"]), float(d["y1"])
    H, W = dtm.shape
    am = ndimage.median_filter(dtm, size=3)
    st = step_strength(am)
    tr = from_origin(X0, Y1, 1.0, 1.0)
    bmask = features.rasterize(((p.geom.buffer(0.9), 1) for p in ctx.parts if p.floors != 0),
                               out_shape=(H, W), transform=tr, fill=0, dtype="uint8")
    valid = ndimage.binary_erosion(gm > 0, iterations=1) & (bmask == 0)
    cand = (st > 0.22) & valid
    cand = ndimage.binary_opening(cand, structure=np.ones((2, 2)))  # drop isolated noise cells
    lab, n = ndimage.label(cand, structure=np.ones((3, 3)))
    gy, gx = np.gradient(am)  # row axis points south
    gyn = -gy  # north component of the uphill gradient

    def sample(x, y):
        c = np.clip(((np.asarray(x) - X0) - 0.5), 0, W - 1.001)
        r = np.clip(((Y1 - np.asarray(y)) - 0.5), 0, H - 1.001)
        return ndimage.map_coordinates(am, [r, c], order=1, mode="nearest")

    public = sdata["public"]
    ped = prep(public.difference(sdata["roads"]))
    road = prep(sdata["roads"])
    church = ctx.church_front_zone if hasattr(ctx, "church_front_zone") else None
    waters = [ctx.local(f.geom) for f in ctx.osm if f.tags.get("waterway") and f.geom.geom_type == "LineString"]
    from shapely.ops import unary_union

    water_zone = prep(unary_union([w.buffer(12) for w in waters])) if waters else None
    blocks = prep(ctx.local(ctx.blocks_utm).buffer(25))

    rows, cols = np.nonzero(lab)
    labels = lab[rows, cols]
    xs = X0 + cols + 0.5
    ys = Y1 - rows - 0.5
    # chunk id = component x 5 m grid cell
    key = labels.astype(np.int64) * 10_000_000 + (np.floor(xs / CHUNK).astype(np.int64) % 3000) * 3000 + \
        (np.floor(ys / CHUNK).astype(np.int64) % 3000)
    order = np.argsort(key, kind="stable")
    key_s = key[order]
    bounds = np.r_[0, np.nonzero(key_s[1:] != key_s[:-1])[0] + 1, len(key_s)]
    segs = []
    counts = {"stairs": 0, "wall": 0, "marge": 0}
    for i in range(len(bounds) - 1):
        idx = order[bounds[i]:bounds[i + 1]]
        if len(idx) < 3:
            continue
        px, py = xs[idx], ys[idx]
        ux = gx[rows[idx], cols[idx]].mean()
        uy = gyn[rows[idx], cols[idx]].mean()
        L = math.hypot(ux, uy)
        if L < 1e-3:
            continue
        nx, ny = -ux / L, -uy / L  # downhill direction
        tx, ty = -ny, nx
        cx, cy = px.mean(), py.mean()
        proj = (px - cx) * tx + (py - cy) * ty
        off = ((px - cx) * nx + (py - cy) * ny).mean()
        cx, cy = cx + nx * off, cy + ny * off
        t0, t1 = proj.min() - 0.5, proj.max() + 0.5
        if t1 - t0 < 1.2:
            continue
        # levels on both sides, sampled along the segment
        ts = np.linspace(t0, t1, 5)
        lx, ly = cx + tx * ts, cy + ty * ts
        hi = float(np.median(sample(lx - nx * 2.0, ly - ny * 2.0)))
        lo = float(np.median(sample(lx + nx * 2.0, ly + ny * 2.0)))
        drop = hi - lo
        if drop < MIN_DROP or drop > 8:
            continue
        a = (cx + tx * t0 - ctx.ox, cy + ty * t0 - ctx.oy)
        b = (cx + tx * t1 - ctx.ox, cy + ty * t1 - ctx.oy)
        mid = Point((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
        up = Point(mid.x - nx * 2.2, mid.y - ny * 2.2)
        dn = Point(mid.x + nx * 2.2, mid.y + ny * 2.2)
        if not ctx.world_local.contains(mid):
            continue
        if water_zone is not None and water_zone.contains(mid) and not blocks.contains(mid):
            continue  # natural stream banks
        if church is not None and church.contains(mid):
            continue  # the church platform has its own modelled steps
        urban = blocks.contains(mid)
        if not urban:
            if drop < 0.5 or len(idx) < 5:
                continue
            kind = "marge"
        else:
            up_ped, dn_ped = ped.contains(up), ped.contains(dn)
            up_road, dn_road = road.contains(up), road.contains(dn)
            if not (public.contains(mid) or up_ped or dn_ped or up_road or dn_road):
                continue  # inside private plots: yards, gardens (not reachable)
            if up_ped and dn_ped and drop <= 2.5:
                kind = "stairs"
            else:
                kind = "wall"
        counts[kind] += 1
        segs.append([round(a[0], 2), round(a[1], 2), round(b[0], 2), round(b[1], 2),
                     round(lo, 2), round(hi, 2), round(nx, 4), round(ny, 4), kind])
    # marges must be continuous: keep those >= 4 m long or with an aligned neighbour within 3 m
    from shapely import STRtree
    from shapely.geometry import LineString

    lines = [LineString([(sg[0], sg[1]), (sg[2], sg[3])]) for sg in segs]
    tree = STRtree(lines)
    keep = []
    for i, sg in enumerate(segs):
        if sg[8] != "marge" or lines[i].length >= 4.0:
            keep.append(sg)
            continue
        ok = False
        for j in tree.query(lines[i].buffer(3.0)):
            if j == i or segs[j][8] != "marge":
                continue
            if abs(sg[6] * segs[j][6] + sg[7] * segs[j][7]) > 0.85:  # similar downhill direction
                ok = True
                break
        if ok:
            keep.append(sg)
    segs = keep
    counts = {k: sum(1 for sg in segs if sg[8] == k) for k in ("stairs", "wall", "marge")}
    ctx.stats["relief_segments"] = counts
    ctx.estimated.append("Desnivells: posició i alçades del LiDAR; escala vs mur segons les superfícies veïnes")
    save_json(OUT / "relief.json", {"fields": ["x0", "y0", "x1", "y1", "low", "high", "nx", "ny", "kind"],
                                    "segments": segs})
