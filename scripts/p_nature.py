"""Vegetation, water and fields.

Trees
  * positions + height + crown radius: ICGC LiDAR crown detection (REAL)
  * species: the crop declared in the DUN 2025 parcel that contains the tree
    (REAL declaration); outside crop parcels the species is ESTIMATED from
    context (street tree, pine, riparian elm near streams...)
  * outside the LiDAR area: tree crops of the DUN parcels are planted on a
    regular grid with typical spacing (ESTIMATED positions)
  * OSM natural=tree nodes are added when LiDAR has nothing within 2 m
Water: OSM waterways (dry gravel beds of rieres), OSM water areas, Cadastre pools.
Fields: DUN parcels by crop class (for the minimap).
"""
from __future__ import annotations

import json
import math

import numpy as np
from shapely import STRtree
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union
from shapely.prepared import prep

from binfmt import write_bin
from common import OUT, save_json
from ctx import WORK, Ctx
from p_streets import grid_pieces, lines_of, polys, triangulate

# tree types (src/world/vegetation.ts must agree)
T = {name: i for i, name in enumerate(
    ["olive", "hazel", "almond", "carob", "citrus", "fruit", "pine", "broadleaf", "palm", "cypress", "elm", "shrub", "walnut"])}

CROP_TREE = {
    "OLIVERA": "olive", "AVELLANER": "hazel", "AMETLLER": "almond", "GARROFER": "carob",
    "TARONGER": "citrus", "CLEMENTINA": "citrus", "LLIMONER": "citrus", "MANDARINER HÍBRID": "citrus",
    "MANDARINER": "citrus", "ALT FRUIT": "fruit", "PRESSEGUER": "fruit", "PRUNERA": "fruit", "PERERA": "fruit",
    "POMERA": "fruit", "FIGUERA": "fruit", "MAGRANER": "fruit", "ALVOCAT": "citrus", "NOGUERA": "walnut",
    "PROD. FORESTALS": "pine", "CIRERER": "fruit", "ALBERCOQUER": "fruit",
}
# ESTIMATED planting frames (m) and typical sizes (height, crown radius)
SPACING = {"olive": (7.0, 7.0), "hazel": (5.0, 4.5), "almond": (7.0, 6.0), "carob": (9.0, 9.0),
           "citrus": (5.0, 4.0), "fruit": (5.0, 4.0), "walnut": (9.0, 9.0), "pine": (6.0, 6.0)}
SIZE = {"olive": (4.5, 2.6), "hazel": (4.0, 2.2), "almond": (4.5, 2.6), "carob": (6.0, 3.8), "citrus": (3.2, 1.8),
        "fruit": (3.6, 2.0), "walnut": (8.0, 4.0), "pine": (11.0, 3.5)}

# crop classes for the minimap
CROP_CLASS = {"olive": 1, "hazel": 2, "almond": 3, "carob": 4, "citrus": 5, "fruit": 6, "walnut": 6, "pine": 7}
VEG = ["HORTA", "TOMÀQUET", "CEBA I CALÇOT", "CARXOFA", "ENCIAM", "PATATA", "BRÒQUIL", "PEBROT", "ALBERGÍNIA",
       "MONGETA", "JULIVERT", "CORIANDRE"]


def crop_kind(prod: str | None) -> tuple[str | None, int]:
    if not prod:
        return None, 0
    p = prod.upper()
    if p in CROP_TREE:
        k = CROP_TREE[p]
        return k, CROP_CLASS.get(k, 6)
    if p.startswith("VINYA") or "RAÏM" in p:
        return None, 8
    if p in VEG:
        return None, 9
    if p in ("ORDI", "CIVADA", "BLAT TOU", "TRITICALE", "RAIGRÀS MULTIFLORUM", "PAST. PERM", "PAST<5 ANY"):
        return None, 10
    if p == "GUARET":
        return None, 11
    return None, 0


def process_nature(ctx: Ctx):
    world = ctx.world_local
    wprep = prep(world)
    # ---- DUN parcels ----------------------------------------------------------
    parcels = []
    for props, g in ctx.dun:
        gl = ctx.local(g)
        if not gl.intersects(world):
            continue
        kind, cls = crop_kind(props.get("PRODUCTE"))
        parcels.append((gl, kind, cls, props.get("PRODUCTE")))
    ptree = STRtree([p[0] for p in parcels])

    # buildings & roads to keep trees out of them
    parts_u = unary_union([ctx.local(p.geom) for p in ctx.parts]).buffer(0.3)
    bprep = prep(parts_u)
    roads = getattr(ctx, "road_local", None)
    rprep = prep(roads) if roads is not None else None
    public = getattr(ctx, "public_local", None)
    pubprep = prep(public) if public is not None else None
    blocks_l = prep(ctx.local(ctx.blocks_utm))

    waters = [ctx.local(f.geom) for f in ctx.osm if f.tags.get("waterway") in ("river", "stream", "ditch", "drain", "canal")
              and f.geom.geom_type == "LineString"]
    water_near = prep(unary_union([w.buffer(22) for w in waters])) if waters else None
    forest = [ctx.local(f.geom) for f in ctx.osm if (f.tags.get("landuse") == "forest" or f.tags.get("natural") in ("wood", "scrub"))
              and f.geom.geom_type in ("Polygon", "MultiPolygon")]
    fprep = prep(unary_union(forest)) if forest else None
    parks = [ctx.local(f.geom) for f in ctx.osm if f.tags.get("leisure") in ("park", "garden")
             and f.geom.geom_type in ("Polygon", "MultiPolygon")]
    parkprep = prep(unary_union(parks)) if parks else None

    trees = []  # x, y, h, r, type, src(0 lidar,1 osm,2 estimated)
    lidar_bounds = None
    lp = WORK / "lidar_trees.json"
    counts = {"lidar": 0, "osm": 0, "estimated_grid": 0, "species_dun": 0, "species_estimated": 0}
    if lp.exists():
        lt = json.load(open(lp))["trees"]
        from process_lidar import AREA
        lidar_bounds = box(AREA[0] - ctx.ox, AREA[1] - ctx.oy, AREA[2] - ctx.ox, AREA[3] - ctx.oy)
        for x, y, h, r in lt:
            x, y = x - ctx.ox, y - ctx.oy
            p = Point(x, y)
            if not wprep.contains(p) or bprep.contains(p):
                continue
            if rprep is not None and rprep.contains(p) and h < 6:
                continue  # probably a vehicle or awning, not a tree
            kind = None
            for j in ptree.query(p):
                if parcels[j][0].contains(p):
                    kind = parcels[j][1]
                    break
            if kind:
                counts["species_dun"] += 1
            else:
                counts["species_estimated"] += 1
                urban = blocks_l.contains(p) or (pubprep is not None and pubprep.contains(p))
                in_park = parkprep is not None and parkprep.contains(p)
                if h < 2.6:
                    kind = "shrub"
                elif in_park:
                    kind = "broadleaf"  # e.g. the plane trees of the Parc de Sant Antoni (heritage research)
                elif h > 8 and r < h / 7.5:
                    kind = "cypress"
                elif fprep is not None and fprep.contains(p):
                    kind = "pine"
                elif water_near is not None and water_near.contains(p) and not urban:
                    kind = "elm"  # riparian trees along the rieres: elms ("riu d'oms")
                elif urban:
                    kind = "broadleaf"
                elif h > 8:
                    kind = "pine"
                else:
                    kind = "carob"
            trees.append((x, y, h, r, T[kind], 0))
            counts["lidar"] += 1

    # the palm of the Plaça de la Palmera (Commons photo Pla_a_de_la_Palmera_Riudoms_01): the tallest
    # LiDAR crown inside the OSM park "Parc de la palmera" becomes a palm tree
    palm_park = next((ctx.local(f.geom) for f in ctx.osm if f.tags.get("name", "").lower() == "parc de la palmera"
                      and f.geom.geom_type in ("Polygon", "MultiPolygon")), None)
    if palm_park is not None:
        cand = [i for i, t in enumerate(trees) if t[5] == 0 and palm_park.contains(Point(t[0], t[1]))]
        if cand:
            i = max(cand, key=lambda k: trees[k][2])
            x, y, h, r, _, src = trees[i]
            trees[i] = (x, y, h, min(r, 3.5), T["palm"], src)
            counts["palm_from_photo"] = 1

    # ---- estimated plantations outside the LiDAR area ---------------------------
    rng = np.random.default_rng(7)
    for gl, kind, cls, prod in parcels:
        if not kind or kind == "pine":
            continue
        area = gl if lidar_bounds is None else gl.difference(lidar_bounds)
        area = area.intersection(world).buffer(-1.8)
        if area.is_empty or area.area < 30:
            continue
        dx, dy = SPACING[kind]
        mrr = gl.minimum_rotated_rectangle
        cc = list(mrr.exterior.coords)
        e = (cc[1][0] - cc[0][0], cc[1][1] - cc[0][1])
        ang = math.atan2(e[1], e[0])
        ca, sa = math.cos(ang), math.sin(ang)
        cx, cy = area.centroid.x, area.centroid.y
        minx, miny, maxx, maxy = area.bounds
        R = math.hypot(maxx - minx, maxy - miny) / 2 + dx
        ap = prep(area)
        hh, rr = SIZE[kind]
        for u in np.arange(-R, R, dx):
            for v in np.arange(-R, R, dy):
                x = cx + u * ca - v * sa + rng.normal(0, 0.25)
                y = cy + u * sa + v * ca + rng.normal(0, 0.25)
                p = Point(x, y)
                if not ap.contains(p) or bprep.contains(p):
                    continue
                trees.append((x, y, hh * rng.uniform(0.75, 1.2), rr * rng.uniform(0.8, 1.15), T[kind], 2))
                counts["estimated_grid"] += 1

    # ---- OSM single trees and tree rows ------------------------------------------
    arr = np.array([(t[0], t[1]) for t in trees]) if trees else np.zeros((0, 2))
    ttree = STRtree([Point(a) for a in arr]) if len(arr) else None

    def free(x, y, d=2.0):
        if ttree is None:
            return True
        for j in ttree.query(Point(x, y).buffer(d)):
            if math.hypot(arr[j][0] - x, arr[j][1] - y) < d:
                return False
        return True

    for f in ctx.osm:
        t = f.tags
        if f.type == "node" and t.get("natural") == "tree":
            p = ctx.local(f.geom)
            if not wprep.contains(p) or not free(p.x, p.y):
                continue
            sp = (t.get("species", "") + t.get("genus", "") + t.get("taxon", "")).lower()
            kind = "palm" if ("phoenix" in sp or "washingtonia" in sp or "palm" in sp) else \
                "pine" if "pinus" in sp else "cypress" if "cupressus" in sp else "olive" if "olea" in sp else "broadleaf"
            h = float(t.get("height", "7").split()[0]) if t.get("height", "").replace(".", "").split(" ")[0].isdigit() else 7.0
            trees.append((p.x, p.y, h, 2.8, T[kind], 1))
            counts["osm"] += 1
        elif f.type == "way" and t.get("natural") == "tree_row" and f.geom.geom_type == "LineString":
            g = ctx.local(f.geom)
            n = max(2, int(g.length / 8) + 1)
            for k in range(n):
                q = g.interpolate(k / (n - 1), normalized=True)
                if wprep.contains(q) and free(q.x, q.y, 3):
                    trees.append((q.x, q.y, 8.0, 3.0, T["broadleaf"], 2))
                    counts["osm"] += 1

    trees_np = np.array(trees, dtype=np.float64) if trees else np.zeros((0, 6))
    ctx.stats["trees"] = counts
    ctx.stats["trees_total"] = len(trees)
    tile = np.array([ctx.tile_of(x, y) for x, y in trees_np[:, :2]], dtype=np.int32) if len(trees_np) else np.zeros(0, np.int32)
    order = np.argsort(tile, kind="stable")
    trees_np = trees_np[order]
    tile = tile[order]

    # ---- water ------------------------------------------------------------------
    beds = []
    for f in ctx.osm:
        ww = f.tags.get("waterway")
        if ww not in ("river", "stream", "ditch", "drain", "canal") or f.geom.geom_type != "LineString":
            continue
        if f.tags.get("tunnel") in ("culvert", "yes"):
            continue
        g = ctx.local(f.geom)
        w = {"river": 7.0, "stream": 3.0, "canal": 3.0}.get(ww, 1.2)  # ESTIMATED bed widths
        beds.append(g.buffer(w / 2, cap_style="round"))
    beds_u = unary_union(beds).intersection(world) if beds else Polygon()
    if roads is not None:
        beds_u = beds_u.difference(roads)
    water_areas = [ctx.local(f.geom) for f in ctx.osm if (f.tags.get("natural") == "water" or f.tags.get("landuse") in ("reservoir", "basin"))
                   and f.geom.geom_type in ("Polygon", "MultiPolygon") and f.tags.get("leisure") != "swimming_pool"]
    pools = [ctx.local(g) for nature, g in ctx.pools]
    pools += [ctx.local(f.geom) for f in ctx.osm if f.tags.get("leisure") == "swimming_pool" and f.geom.geom_type == "Polygon"]
    water_u = unary_union(water_areas).intersection(world) if water_areas else Polygon()
    pools_u = unary_union(pools).intersection(world) if pools else Polygon()
    water_u = water_u.difference(pools_u)

    layers = {"bed": beds_u, "water": water_u, "pool": pools_u}
    chunks, verts_all, idx_all, z_all = [], [], [], []
    voff = ioff = 0
    for li, name in enumerate(["bed", "water", "pool"]):
        g = layers[name]
        for t in range(ctx.nx * ctx.ny):
            gt = g.intersection(box(*ctx.tile_bounds(t)))
            if gt.is_empty:
                continue
            tv, ti, tz, n0 = [], [], [], 0
            for p in polys(gt):
                pieces = grid_pieces(p, 5.0) if name == "bed" else [p]
                # flat water level per pool / pond: lowest terrain on its outline
                ring = np.asarray(p.exterior.coords)
                level = float(np.min(ctx.h(ring[:, 0], ring[:, 1])))
                for pc in pieces:
                    try:
                        v, i = triangulate(pc)
                    except Exception:
                        continue
                    if len(i):
                        tv.append(v); ti.append(i + n0); n0 += len(v)
                        tz.append(np.full(len(v), level, np.float32))
            if not tv:
                continue
            v = np.concatenate(tv).astype(np.float32)
            i = np.concatenate(ti).astype(np.uint32)
            chunks.append({"t": t, "s": li, "v0": voff, "vn": len(v), "i0": ioff, "in": len(i)})
            verts_all.append(v); idx_all.append(i); z_all.append(np.concatenate(tz))
            voff += len(v); ioff += len(i)
    # pool / pond rims for the renderer: per polygon, its ground height reference is sampled in JS
    ctx.stats["water_m2"] = {k: round(v.area) for k, v in layers.items()}

    arrays = {
        "tx": np.round(trees_np[:, 0] * 10).astype(np.int16) if len(trees_np) else np.zeros(0, np.int16),
        "ty": np.round(trees_np[:, 1] * 10).astype(np.int16) if len(trees_np) else np.zeros(0, np.int16),
        "th": np.clip(np.round(trees_np[:, 2] * 10), 5, 255).astype(np.uint8) if len(trees_np) else np.zeros(0, np.uint8),
        "tr": np.clip(np.round(trees_np[:, 3] * 10), 5, 255).astype(np.uint8) if len(trees_np) else np.zeros(0, np.uint8),
        "tt": trees_np[:, 4].astype(np.uint8) if len(trees_np) else np.zeros(0, np.uint8),
        "ts": trees_np[:, 5].astype(np.uint8) if len(trees_np) else np.zeros(0, np.uint8),
        "ttile": tile.astype(np.uint16),
        "wverts": np.concatenate(verts_all) if verts_all else np.zeros((0, 2), np.float32),
        "widx": np.concatenate(idx_all) if idx_all else np.zeros(0, np.uint32),
        "wz": np.concatenate(z_all) if z_all else np.zeros(0, np.float32),
    }
    size = write_bin(OUT / "nature.bin", arrays, {"types": list(T.keys()), "layers": ["bed", "water", "pool"],
                                                    "chunks": chunks})
    ctx.stats["nature_bin_bytes"] = size

    # ---- fields for the minimap ---------------------------------------------------
    fields = []
    for gl, kind, cls, prod in parcels:
        if cls == 0:
            continue
        for p in polys(gl.intersection(world)):
            p = p.simplify(1.0)
            if p.is_empty or p.area < 20:
                continue
            pts = []
            for x, y in list(p.exterior.coords)[:-1]:
                pts += [round(x * 10), round(y * 10)]
            fields.append({"c": cls, "p": pts})
    water_lines = []
    for g in waters:
        for ln in lines_of(g.intersection(world)):
            pts = []
            for x, y in ln.simplify(1.0).coords:
                pts += [round(x * 10), round(y * 10)]
            water_lines.append(pts)
    save_json(OUT / "fields.json", {"classes": ["", "olivera", "avellaner", "ametller", "garrofer", "cítrics",
                                                "fruiters", "bosc", "vinya", "horta", "cereal", "guaret"],
                                    "fields": fields, "water": water_lines})
    ctx.trees_np = trees_np
