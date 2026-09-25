"""Buildings: Cadastre building parts extruded with real heights.

Height source, in order of preference:
  1. LiDAR (ICGC): roof surface fitted on the 0.5 m DSM (flat / shed / gable)
  2. Cadastre: numberOfFloorsAboveGround x 3 m (+0.5 m ground floor)
  3. Estimated: 1 floor when the Cadastre has no floor count

Every wall edge is classified as street facade, yard facade or party wall so
the renderer only draws windows / doors / balconies where they can exist.
"""
from __future__ import annotations

import colorsys
import hashlib
import math

import numpy as np
from rasterio import features
from rasterio.transform import from_origin
from shapely import STRtree
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import split
from shapely.prepared import prep

from ctx import WORK, Ctx

FLOOR_H = 3.0
GROUND_EXTRA = 0.5
PARAPET = 1.0

# edge flags
E_YARD, E_STREET, E_SHARED = 0, 1, 2

# style codes (src/world/buildings.ts must agree)
S_OLD, S_MID, S_NEW, S_INDUSTRIAL, S_RURAL, S_PUBLIC = 0, 1, 2, 3, 4, 5
S_STONE, S_ERMITA = 6, 7  # church ashlar / ermita scored stucco (no windows)

# Fallback palettes (used only when there is no facade photo) - ESTIMATED
PAL = {
    S_OLD: ["#e8dcc4", "#d9c7a3", "#cdb892", "#efe6d2", "#c9b28a", "#dccfb4", "#b9a684", "#e3cfa6"],
    S_MID: ["#d7b48a", "#c98f5c", "#e6d6bc", "#efe7d8", "#cfa276", "#d9c2a0"],
    S_NEW: ["#f1ece2", "#ebe0cc", "#e9dcc3", "#f4f1ea", "#dfcfb5", "#e8d9bd"],
    S_INDUSTRIAL: ["#cfd2d3", "#bfc5c7", "#d9d4c8", "#e2e2dc"],
    S_RURAL: ["#cbb795", "#b9a27c", "#d8c8a8", "#c4ab85"],
    S_PUBLIC: ["#e9dfcc", "#dcc8a6", "#efe9dd"],
    S_STONE: ["#c4a46c"],
    S_ERMITA: ["#d9a960"],
}
SHUTTERS = {S_OLD: ["#3f6b4a", "#4d7a57", "#6b4a2e", "#5a3d25", "#35573f"],
            S_MID: ["#6b4a2e", "#8a6a4a", "#7d7f7d", "#5a3d25"],
            S_NEW: ["#9a9c9b", "#c9c9c4", "#6f7072", "#e6e3db"],
            S_INDUSTRIAL: ["#8e9294"], S_RURAL: ["#5b4630", "#3f6b4a"], S_PUBLIC: ["#5a3d25", "#3f6b4a"],
            S_STONE: ["#5a3d25"], S_ERMITA: ["#5a3d25"]}


def _hash(s: str) -> int:
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16)


def _pick(lst, key):
    return lst[_hash(key) % len(lst)]


class Lidar:
    def __init__(self):
        d = np.load(WORK / "lidar.npz")
        self.dsm = d["dsm"]
        self.ndvi = d["ndvi"].astype(np.float32)
        self.x0 = float(d["x0"])
        self.y1 = float(d["y1"])
        self.h, self.w = self.dsm.shape
        self.x1 = self.x0 + self.w * 0.5
        self.y0 = self.y1 - self.h * 0.5

    def covers(self, poly) -> bool:
        a, b, c, d = poly.bounds
        return a >= self.x0 and c <= self.x1 and b >= self.y0 and d <= self.y1

    def cells(self, poly):
        minx, miny, maxx, maxy = poly.bounds
        c0 = max(int((minx - self.x0) / 0.5), 0)
        c1 = min(int((maxx - self.x0) / 0.5) + 1, self.w)
        r0 = max(int((self.y1 - maxy) / 0.5), 0)
        r1 = min(int((self.y1 - miny) / 0.5) + 1, self.h)
        if c1 <= c0 or r1 <= r0:
            return None
        sub = self.dsm[r0:r1, c0:c1]
        tr = from_origin(self.x0 + c0 * 0.5, self.y1 - r0 * 0.5, 0.5, 0.5)
        mask = features.geometry_mask([poly], out_shape=sub.shape, transform=tr, invert=True)
        xs = self.x0 + (c0 + np.arange(sub.shape[1]) + 0.5) * 0.5
        ys = self.y1 - (r0 + np.arange(sub.shape[0]) + 0.5) * 0.5
        X, Y = np.meshgrid(xs, ys)
        return sub, mask, X, Y, self.ndvi[r0:r1, c0:c1]


def fit_roof(lid: Lidar, poly: Polygon, ground: float):
    """Fit a roof model to the LiDAR DSM inside the footprint.
    Returns dict(type, ...) with absolute heights, or None."""
    er = poly.buffer(-0.5)
    if er.is_empty or er.area < 4:
        er = poly.buffer(-0.25)
    if er.is_empty:
        return None
    c = lid.cells(er)
    if c is None:
        return None
    sub, mask, X, Y, nd = c
    m = mask & np.isfinite(sub) & (nd < 0.30)
    if m.sum() < 6:
        return None
    v = sub[m].astype(np.float64)
    x = X[m] - poly.centroid.x
    y = Y[m] - poly.centroid.y
    lo, hi = np.percentile(v, [3, 98])
    k = (v >= lo) & (v <= hi)
    v, x, y = v[k], x[k], y[k]
    if len(v) < 6:
        return None
    rel = np.median(v) - ground
    if rel < 1.8:
        return {"type": "none", "rel": float(rel)}

    flat_rms = float(np.std(v))
    res = {"n": int(len(v)), "flat_rms": flat_rms}
    # plane (shed)
    A = np.c_[x, y, np.ones_like(x)]
    coef, *_ = np.linalg.lstsq(A, v, rcond=None)
    shed_rms = float(np.sqrt(np.mean((A @ coef - v) ** 2)))
    shed_slope = float(math.hypot(coef[0], coef[1]))
    # dominant slope axis from the DSM gradient (structure tensor)
    if min(sub.shape) >= 3:
        s2 = np.where(np.isfinite(sub), sub, np.nanmedian(sub))
        gy, gx = np.gradient(s2, 0.5)
        gy = -gy
        gm = np.hypot(gx, gy)
        gmask = mask & (gm > 0.08) & (gm < 1.5)
    else:
        gmask = np.zeros_like(mask)
    gable = None
    if min(sub.shape) >= 3 and gmask.sum() >= 6:
        txx = float((gx[gmask] ** 2).sum())
        tyy = float((gy[gmask] ** 2).sum())
        txy = float((gx[gmask] * gy[gmask]).sum())
        ang = 0.5 * math.atan2(2 * txy, txx - tyy)
        e = (math.cos(ang), math.sin(ang))
        s = x * e[0] + y * e[1]
        smin, smax = float(s.min()), float(s.max())
        L = smax - smin
        best = None
        if L > 2:
            for s0 in np.linspace(smin + 0.15 * L, smax - 0.15 * L, 17):
                B = np.c_[np.ones_like(s), -np.abs(s - s0)]
                cc, *_ = np.linalg.lstsq(B, v, rcond=None)
                rms = float(np.sqrt(np.mean((B @ cc - v) ** 2)))
                if best is None or rms < best[0]:
                    best = (rms, float(s0), float(cc[0]), float(cc[1]))
        if best:
            gable = {"rms": best[0], "ang": ang, "s0": best[1], "ridge": best[2], "k": best[3]}

    choice = "flat"
    if flat_rms > 0.25:
        cands = []
        if gable and 0.12 <= gable["k"] <= 1.2:
            cands.append(("gable", gable["rms"]))
        if 0.1 <= shed_slope <= 1.0:
            cands.append(("shed", shed_rms * 1.1))
        if cands:
            t, r = min(cands, key=lambda z: z[1])
            if r < 0.8 * flat_rms:
                choice = t
    res["type"] = choice
    if choice == "flat":
        res["z"] = float(np.percentile(v, 55))
        res["top"] = float(np.percentile(v, 92))
    elif choice == "shed":
        res.update(a=float(coef[0]), b=float(coef[1]), c=float(coef[2]))
    else:
        res.update(ang=gable["ang"], s0=gable["s0"], ridge=gable["ridge"], k=min(gable["k"], 1.0))
    res["max"] = float(np.percentile(v, 97))
    return res


def roof_structures(lid: Lidar, poly: Polygon, f, cx: float, cy: float, flat: bool):
    """Volumes that stick out of the fitted roof (stair housings and water tanks on
    terraces, chimneys on pitched roofs): LiDAR DSM minus roof model, grouped into
    connected blobs. Returns [(polygon, top_abs)]."""
    from scipy import ndimage

    er = poly.buffer(-0.6)
    if er.is_empty or er.area < 6:
        return []
    c = lid.cells(er)
    if c is None:
        return []
    sub, mask, X, Y, nd = c
    if min(sub.shape) < 3:
        return []
    model = np.vectorize(f)(X, Y) if not flat else np.full(sub.shape, f(0, 0))
    res = np.where(mask & np.isfinite(sub) & (nd < 0.3), sub - model, 0.0)
    thr = 1.4 if flat else 1.0
    m = res > thr
    lab, n = ndimage.label(m, structure=np.ones((3, 3)))
    out = []
    for k in range(1, min(n, 12) + 1):
        cells = lab == k
        cnt = int(cells.sum())
        if cnt < (6 if flat else 2) or cnt > 0.6 * mask.sum():
            continue
        xs, ys = X[cells], Y[cells]
        from shapely.geometry import MultiPoint

        hull = MultiPoint(list(zip(xs, ys))).buffer(0.26, cap_style="square").minimum_rotated_rectangle
        if hull.area < (1.2 if flat else 0.25):
            continue
        top = float(np.percentile(sub[cells], 85))
        out.append((hull, top))
    return out


def roof_func(roof, cx, cy):
    t = roof["type"]
    if t == "flat":
        z = roof["z"]
        return lambda px, py: z
    if t == "shed":
        a, b, c = roof["a"], roof["b"], roof["c"]
        return lambda px, py: a * (px - cx) + b * (py - cy) + c
    e = (math.cos(roof["ang"]), math.sin(roof["ang"]))
    s0, ridge, k = roof["s0"], roof["ridge"], roof["k"]
    return lambda px, py: ridge - k * abs((px - cx) * e[0] + (py - cy) * e[1] - s0)


def ridge_line(roof, cx, cy, size):
    e = (math.cos(roof["ang"]), math.sin(roof["ang"]))
    p = (cx + e[0] * roof["s0"], cy + e[1] * roof["s0"])
    d = (-e[1], e[0])
    return LineString([(p[0] - d[0] * size, p[1] - d[1] * size), (p[0] + d[0] * size, p[1] + d[1] * size)])


def insert_ridge_vertices(ring, roof, cx, cy):
    """Insert a vertex wherever an edge crosses the ridge so wall tops follow
    the roof exactly (they are linear between breakpoints)."""
    if roof["type"] != "gable":
        return ring
    e = (math.cos(roof["ang"]), math.sin(roof["ang"]))
    s0 = roof["s0"]
    out = []
    n = len(ring)
    for i in range(n):
        a, b = ring[i], ring[(i + 1) % n]
        out.append(a)
        sa = (a[0] - cx) * e[0] + (a[1] - cy) * e[1] - s0
        sb = (b[0] - cx) * e[0] + (b[1] - cy) * e[1] - s0
        if sa * sb < 0:
            t = sa / (sa - sb)
            if 0.02 < t < 0.98:
                out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    return out


def roof_color(ctx: Ctx, poly: Polygon):
    """Median colour of the brightest half of the ortho pixels on the roof."""
    src = ctx.core_ortho if ctx.core_ortho.contains(*poly.bounds) else ctx.wide_ortho
    er = poly.buffer(-0.4)
    if er.is_empty or er.area < 1:
        er = poly
    minx, miny, maxx, maxy = er.bounds
    res = src.res
    c0, c1 = int((minx - src.x0) / res), int((maxx - src.x0) / res) + 1
    r0, r1 = int((src.y1 - maxy) / res), int((src.y1 - miny) / res) + 1
    c0, r0 = max(c0, 0), max(r0, 0)
    c1, r1 = min(c1, src.arr.shape[1]), min(r1, src.arr.shape[0])
    if c1 <= c0 or r1 <= r0:
        return None
    sub = src.arr[r0:r1, c0:c1]
    tr = from_origin(src.x0 + c0 * res, src.y1 - r0 * res, res, res)
    mask = features.geometry_mask([er], out_shape=sub.shape[:2], transform=tr, invert=True)
    px = sub[mask].astype(np.float32)
    if len(px) < 3:
        px = sub.reshape(-1, 3).astype(np.float32)
    lum = px @ np.array([0.299, 0.587, 0.114])
    bright = px[lum >= np.median(lum)]
    col = np.median(bright, axis=0)
    return col


def is_tile_color(col) -> bool:
    if col is None:
        return False
    h, s, v = colorsys.rgb_to_hsv(*(col / 255))
    return (h < 0.09 or h > 0.97) and s > 0.22 and v > 0.3


def hexc(col):
    return "#%02x%02x%02x" % tuple(int(max(0, min(255, c))) for c in col)


def style_of(b) -> int:
    use = (b.use or "")
    if use.startswith("3_"):
        return S_INDUSTRIAL
    if use.startswith("2_"):
        return S_RURAL
    if use.startswith("4_3"):
        return S_PUBLIC
    y = b.year
    if y is None or y <= 1940:
        return S_OLD
    if y <= 1979:
        return S_MID
    return S_NEW


def clean_poly(p: Polygon) -> Polygon | None:
    p = p.simplify(0.12, preserve_topology=True)
    if p.is_empty or p.area < 3:
        return None
    if isinstance(p, MultiPolygon):
        p = max(p.geoms, key=lambda g: g.area)
    return orient(p, 1.0)


def process_buildings(ctx: Ctx, blocks_utm, osm_feats, facade_cols: dict, landmark_refs: dict):
    parts = [p for p in ctx.parts if p.building in ctx.buildings]
    lid = Lidar() if (WORK / "lidar.npz").exists() else None
    geoms = []
    keep = []
    for p in parts:
        if p.floors == 0:  # underground / open courtyards
            continue
        g = clean_poly(p.geom)
        if g is None or not g.intersects(ctx.world_utm_tiles):
            continue
        keep.append(p)
        geoms.append(g)
    tree = STRtree(geoms)
    blocks_prep = prep(blocks_utm)

    # OSM building tags (names, levels) joined by overlap
    osm_b = [f for f in osm_feats if "building" in f.tags and f.geom.geom_type in ("Polygon", "MultiPolygon")]
    osm_tree = STRtree([f.geom for f in osm_b]) if osm_b else None

    out_parts = []
    ctx.bfacades = {}  # building ref -> street facade edges, for the landmark decorations
    bl_index: dict[str, int] = {}
    bl_list = []
    counts = {"lidar": 0, "cadastre": 0, "estimated": 0, "flat": 0, "gable": 0, "shed": 0,
              "facade_photo": 0, "facade_palette": 0}
    import json as _json

    _json.dump({}, open(WORK / "bfacades.json", "w"))
    level_cmp = []
    for pi, (p, g) in enumerate(zip(keep, geoms)):
        b = ctx.buildings[p.building]
        st = style_of(b)
        lm = landmark_refs.get(b.id)
        if lm is None and b.use and b.use.startswith("4_3"):
            st = S_PUBLIC
        custom = 0
        if lm == "esglesia_sant_jaume":
            st = S_STONE
            custom = 1 if p is max(b.parts, key=lambda q: q.geom.area) else 0  # replaced by the church model
        elif lm == "ermita_sant_antoni":
            st = S_ERMITA
        # ---- ground reference ------------------------------------------
        ext = LineString(g.exterior.coords)
        pts = [ext.interpolate(d) for d in np.arange(0, ext.length, 1.0)]
        cx, cy = g.centroid.x, g.centroid.y
        # sample slightly outside the footprint
        sx = np.array([q.x + (q.x - cx) * 0.6 / max(math.hypot(q.x - cx, q.y - cy), 0.1) for q in pts])
        sy = np.array([q.y + (q.y - cy) * 0.6 / max(math.hypot(q.x - cx, q.y - cy), 0.1) for q in pts])
        hs = ctx.terrain.height(sx, sy)
        ground = float(np.median(hs))
        base = float(np.min(hs)) - 0.3

        # ---- height / roof ---------------------------------------------
        floors = p.floors
        hsrc = "cadastre"
        if floors is None:
            floors = 1
            hsrc = "estimated"
        cad_h = floors * FLOOR_H + GROUND_EXTRA
        roof = None
        if lid is not None and lid.covers(g):
            r = fit_roof(lid, g, ground)
            if r and r["type"] != "none":
                roof = r
                hsrc = "lidar"
                level_cmp.append((floors, r["max"] - ground))
        rc = roof_color(ctx, g)
        tile_col = is_tile_color(rc)
        if roof is None:
            # no LiDAR: tile-coloured roofs get a 30 % gable along the long axis
            mrr = g.minimum_rotated_rectangle
            cc = list(mrr.exterior.coords)
            e1 = (cc[1][0] - cc[0][0], cc[1][1] - cc[0][1])
            e2 = (cc[2][0] - cc[1][0], cc[2][1] - cc[1][1])
            long_ax = e1 if math.hypot(*e1) >= math.hypot(*e2) else e2
            ang = math.atan2(long_ax[1], long_ax[0]) + math.pi / 2  # slope axis perpendicular to ridge
            e = (math.cos(ang), math.sin(ang))
            ss = [(x - cx) * e[0] + (y - cy) * e[1] for x, y in g.exterior.coords]
            half = (max(ss) - min(ss)) / 2
            eave = ground + cad_h
            if (tile_col or st in (S_RURAL, S_OLD)) and st != S_INDUSTRIAL and half < 12:
                k = 0.30
                roof = {"type": "gable", "ang": ang, "s0": (max(ss) + min(ss)) / 2, "ridge": eave + k * half, "k": k}
            elif st == S_INDUSTRIAL and half < 25:
                k = 0.10
                roof = {"type": "gable", "ang": ang, "s0": (max(ss) + min(ss)) / 2, "ridge": eave + k * half, "k": k}
            else:
                roof = {"type": "flat", "z": eave, "top": eave + PARAPET}
        counts[hsrc] += 1
        counts[roof["type"]] += 1
        f = roof_func(roof, cx, cy)
        min_eave = ground + 2.3
        # real storey height: eave height shared between the Cadastre floors (ground floor 15 % taller)
        ext_xy = list(g.exterior.coords)
        eave_rel = (roof["z"] if roof["type"] == "flat" else min(f(x, y) for x, y in ext_xy)) - ground
        fh = (eave_rel - 0.3) / (floors + 0.15) if hsrc == "lidar" else FLOOR_H
        fh = float(min(max(fh, 2.6), 4.3))

        # ---- rings & edges ---------------------------------------------
        rings_out, walls, eflags = [], [], []
        all_rings = [list(g.exterior.coords)[:-1]] + [list(r.coords)[:-1] for r in g.interiors]
        for ri, ring in enumerate(all_rings):
            ring = insert_ridge_vertices(ring, roof, cx, cy)
            n = len(ring)
            flat_xy = []
            for (x, y) in ring:
                flat_xy += [round((x - ctx.ox) * 100), round((y - ctx.oy) * 100)]
            rings_out.append(flat_xy)
            for i in range(n):
                a, bb = ring[i], ring[(i + 1) % n]
                dx, dy = bb[0] - a[0], bb[1] - a[1]
                L = math.hypot(dx, dy)
                if L < 1e-6:
                    eflags.append(E_SHARED)
                    walls += [0, 0]
                    continue
                nx_, ny_ = dy / L, -dx / L  # outward for CCW exterior / CW holes
                mx, my = (a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2
                probe = Point(mx + nx_ * 0.35, my + ny_ * 0.35)
                shared = False
                for j in tree.query(probe):
                    if j != pi and geoms[j].contains(probe):
                        shared = True
                        break
                if shared:
                    fl = E_SHARED
                elif ri == 0 and not blocks_prep.contains(Point(mx + nx_ * 2.5, my + ny_ * 2.5)):
                    fl = E_STREET
                else:
                    fl = E_YARD
                eflags.append(fl)
                za = max(f(*a), min_eave)
                zb = max(f(*bb), min_eave)
                if fl == E_STREET and ri == 0:
                    ctx.bfacades.setdefault(b.id, []).append({
                        "a": [round(a[0] - ctx.ox, 2), round(a[1] - ctx.oy, 2)],
                        "b": [round(bb[0] - ctx.ox, 2), round(bb[1] - ctx.oy, 2)],
                        "n": [round(nx_, 4), round(ny_, 4)], "len": round(L, 2),
                        "ground": round(float(ctx.terrain.height(mx + nx_ * 1.0, my + ny_ * 1.0)), 2),
                        "top": round(min(za, zb), 2), "fh": 0.0, "floors": floors})
                if roof["type"] == "flat" and fl != E_SHARED:
                    par = PARAPET if st not in (S_INDUSTRIAL, S_RURAL) else 0.4
                    za += par
                    zb += par
                walls += [round((za - base) * 100), round((zb - base) * 100)]

        for fe in ctx.bfacades.get(b.id, []):
            if fe["fh"] == 0.0:
                fe["fh"] = round(fh, 2)
        # ---- eaves (pitched roofs) and cornices (flat roofs) ------------------
        eaves, cornices = [], []
        ring0 = insert_ridge_vertices(list(g.exterior.coords)[:-1], roof, cx, cy)
        n0 = len(ring0)
        for i in range(n0):
            a, bb = ring0[i], ring0[(i + 1) % n0]
            if eflags[i] == E_SHARED:
                continue
            dx, dy = bb[0] - a[0], bb[1] - a[1]
            L = math.hypot(dx, dy)
            if L < 0.8:
                continue
            nx_, ny_ = dy / L, -dx / L
            if roof["type"] != "flat":
                mx, my = (a[0] + bb[0]) / 2, (a[1] + bb[1]) / 2
                eave = f(mx + nx_ * 0.3, my + ny_ * 0.3) < f(mx, my) - 0.03
                o = 0.42 if eave else 0.18  # ràfec on eave edges, short verge on gable ends
                pa = (a[0] + nx_ * o, a[1] + ny_ * o)
                pb = (bb[0] + nx_ * o, bb[1] + ny_ * o)
                za, zb = max(f(*a), min_eave), max(f(*bb), min_eave)
                zpa = f(*pa) if eave else za
                zpb = f(*pb) if eave else zb
                q = [a[0], a[1], za, bb[0], bb[1], zb, pb[0], pb[1], zpb, pa[0], pa[1], zpa]
                eaves.append([round((q[k] - (ctx.ox if k % 3 == 0 else ctx.oy if k % 3 == 1 else base)) * 100)
                              for k in range(12)])
            elif eflags[i] == E_STREET and st not in (S_INDUSTRIAL, S_RURAL):
                z = roof["z"]
                cornices.append([round((a[0] - ctx.ox) * 100), round((a[1] - ctx.oy) * 100),
                                 round((bb[0] - ctx.ox) * 100), round((bb[1] - ctx.oy) * 100),
                                 round((z - base) * 100)])
        # rooftop structures measured by LiDAR
        struct = []
        if hsrc == "lidar" and lid is not None:
            for hull, top in roof_structures(lid, g, f, cx, cy, roof["type"] == "flat"):
                bottom = min(f(hull.centroid.x, hull.centroid.y), top - 0.5)
                cs = list(hull.exterior.coords)[:4]
                struct.append({"r": [round(v * 100) for x, y in cs for v in (x - ctx.ox, y - ctx.oy)],
                               "z0": round((bottom - base) * 100), "z1": round((top - base) * 100),
                               "k": 0 if roof["type"] == "flat" else 1})
            counts["roof_structures"] = counts.get("roof_structures", 0) + len(struct)

        # ---- roof surfaces -----------------------------------------------
        roof_polys = []
        if roof["type"] == "gable":
            try:
                pieces = list(split(g, ridge_line(roof, cx, cy, 500)).geoms)
            except Exception:
                pieces = [g]
        else:
            pieces = [g]
        for pc in pieces:
            if pc.is_empty or pc.area < 0.05:
                continue
            pc = orient(pc, 1.0)
            prs = []
            for ring in [list(pc.exterior.coords)[:-1]] + [list(r.coords)[:-1] for r in pc.interiors]:
                xy, zz = [], []
                for (x, y) in ring:
                    xy += [round((x - ctx.ox) * 100), round((y - ctx.oy) * 100)]
                    zz.append(round((max(f(x, y), min_eave) - base) * 100))
                prs.append({"r": xy, "z": zz})
            roof_polys.append(prs)

        # ---- colours -----------------------------------------------------
        fc_info = facade_cols.get(b.id)
        if fc_info and st not in (S_INDUSTRIAL, S_STONE, S_ERMITA):
            fcol, scol, brick = fc_info["wall"], fc_info["shutter"], fc_info["brick"]
            counts["facade_photo"] += 1
        else:
            fcol, scol, brick = _pick(PAL[st], b.id), None, False
            counts["facade_palette"] += 1
        if scol is None:
            scol = _pick(SHUTTERS[st], b.id + "s")

        if b.id not in bl_index:
            name = None
            if osm_tree is not None:
                for j in osm_tree.query(b.geom):
                    of = osm_b[j]
                    inter = of.geom.intersection(b.geom).area
                    if inter > 0.4 * min(of.geom.area, b.geom.area):
                        name = of.tags.get("name") or name
            bl_index[b.id] = len(bl_list)
            bl_list.append({"ref": b.id, "use": b.use, "year": b.year, "name": name, "lm": lm})

        out_parts.append({
            "b": bl_index[b.id],
            "t": ctx.tile_of(cx - ctx.ox, cy - ctx.oy),
            "z0": round(base, 2),
            "rings": rings_out,
            "w": walls,
            "e": eflags,
            "roof": {"k": {"flat": 0, "gable": 1, "shed": 2}[roof["type"]], "p": roof_polys},
            "s": st,
            "f": floors,
            "fc": fcol,
            "sc": scol,
            "br": 1 if brick else 0,
            "rc": hexc(rc) if rc is not None else "#b0643f",
            "hs": hsrc[0],
            "lm": lm,
            "cm": custom,
            "fh": round(fh, 2),
            "ev": eaves,
            "cn": cornices,
            "rs": struct,
        })

    if level_cmp:
        arr = np.array(level_cmp)
        per_floor = arr[:, 1] / np.maximum(arr[:, 0], 1)
        ctx.stats["lidar_height_per_floor_median_m"] = round(float(np.median(per_floor)), 2)
    _json.dump(ctx.bfacades, open(WORK / "bfacades.json", "w"))
    ctx.stats["buildings"] = counts
    ctx.stats["building_parts_exported"] = len(out_parts)
    ctx.stats["buildings_exported"] = len(bl_list)
    return {"parts": out_parts, "buildings": bl_list}
