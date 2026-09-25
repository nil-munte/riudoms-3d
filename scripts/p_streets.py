"""Streets: real street space from the Cadastre + OSM.

In the urban area the public space is the gap between the cadastral urban
blocks (manzanas), so street widths and building lines are exact. That space
is split into carriageway (OSM centre line buffered by the asphalt width MEASURED
on the 25 cm orthophoto, or an ESTIMATED width per road type when the measurement
fails), sidewalks (the rest), squares and pedestrian ways. Outside the blocks
the roads are buffered OSM centre lines. Surfaces come from the OSM
`surface` tag (asphalt by default for roads, earth for tracks).

Output: public/data/streets.bin (triangulated 2D meshes per tile and surface,
curbs, crossings, lane marks, steps) and public/data/roads.json (centre lines
with names for the minimap / HUD).
"""
from __future__ import annotations

import math

import mapbox_earcut as earcut
import numpy as np
from scipy import ndimage
from shapely import STRtree
from shapely.geometry import LineString, MultiLineString, MultiPolygon, Polygon, box
from shapely.ops import unary_union

from binfmt import write_bin
from common import OUT, save_json
from ctx import TILE, Ctx

SURFACES = ["asphalt", "sett", "cobble", "sidewalk", "plaza", "paving", "dirt", "gravel", "curbtop", "grass"]

VEHICLE = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
           "living_street", "service", "primary_link", "secondary_link", "tertiary_link", "road", "track"}
FOOT = {"footway", "pedestrian", "path", "cycleway", "steps", "bridleway"}

# ESTIMATED carriageway widths (m) when OSM has no width/lanes tag
WIDTH = {"motorway": 11, "trunk": 9, "primary": 7.5, "secondary": 7.0, "tertiary": 6.4, "unclassified": 5.0,
         "residential": 5.2, "living_street": 3.6, "service": 3.4, "primary_link": 4.5, "secondary_link": 4.2,
         "tertiary_link": 4.0, "road": 5, "track": 3.2, "footway": 2.0, "pedestrian": 4.0, "path": 1.4,
         "cycleway": 2.2, "steps": 2.2, "bridleway": 2}


def surface_of(tags) -> str:
    s = tags.get("surface", "")
    hw = tags.get("highway", "")
    if s in ("sett", "paving_stones", "cobblestone:flattened", "unhewn_cobblestone"):
        return "sett"
    if s in ("cobblestone", "pebblestone"):
        return "cobble"
    if s in ("unpaved", "dirt", "ground", "earth", "sand", "compacted", "fine_gravel", "grass"):
        return "dirt"
    if s == "gravel":
        return "gravel"
    if s in ("asphalt", "paved", "concrete", "concrete:plates"):
        return "asphalt"
    if hw in ("track", "path", "bridleway"):
        return "dirt"
    if hw in ("pedestrian", "footway", "steps"):
        return "paving"
    return "asphalt"


def road_width(tags) -> float:
    hw = tags.get("highway", "")
    w = tags.get("width")
    try:
        if w:
            return max(1.0, min(20.0, float(w.replace("m", "").strip())))
    except ValueError:
        pass
    base = WIDTH.get(hw, 4.0)
    lanes = tags.get("lanes")
    if lanes and lanes.isdigit() and hw in VEHICLE and hw != "track":
        return max(3.2, int(lanes) * 3.2)
    if tags.get("oneway") == "yes" and hw in ("residential", "unclassified", "tertiary"):
        return 3.6
    return base


def grid_pieces(geom, cell: float):
    """Clip a (multi)polygon into grid cells so the meshes can follow the terrain."""
    minx, miny, maxx, maxy = geom.bounds
    out = []
    for gx in np.arange(math.floor(minx / cell) * cell, maxx, cell):
        for gy in np.arange(math.floor(miny / cell) * cell, maxy, cell):
            c = box(gx, gy, gx + cell, gy + cell)
            if not c.intersects(geom):
                continue
            pc = c.intersection(geom)
            for p in getattr(pc, "geoms", [pc]):
                if isinstance(p, Polygon) and p.area > 0.01:
                    out.append(p)
    return out


def triangulate(poly: Polygon):
    rings = [np.asarray(poly.exterior.coords)[:-1]] + [np.asarray(r.coords)[:-1] for r in poly.interiors]
    verts = np.concatenate(rings)
    ends = np.cumsum([len(r) for r in rings]).astype(np.uint32)
    idx = earcut.triangulate_float64(verts.astype(np.float64), ends)
    return verts, idx


def polys(g):
    if g.is_empty:
        return []
    if isinstance(g, Polygon):
        return [g]
    if isinstance(g, MultiPolygon):
        return list(g.geoms)
    return [p for p in getattr(g, "geoms", []) if isinstance(p, Polygon)]


def lines_of(g):
    if g.is_empty:
        return []
    if isinstance(g, LineString):
        return [g]
    if isinstance(g, MultiLineString):
        return list(g.geoms)
    out = []
    for x in getattr(g, "geoms", []):
        out += lines_of(x)
    return out


def measure_widths(ctx: Ctx, veh, public):
    """Carriageway width of each urban street measured on the 25 cm orthophoto:
    every 5 m a luminance profile across the public space is taken; the asphalt is the
    dark run around the centre line, the sidewalks the brighter bands at both sides.
    Returns {index in veh: (width, centre offset)} for streets with enough valid stations."""
    orto = getattr(ctx, "core_ortho", None)
    if orto is None:
        return {}
    arr = orto.arr
    H, W = arr.shape[:2]
    res = orto.res
    out = {}
    for k, (g, t, w, s) in enumerate(veh):
        if t["highway"] in ("living_street", "track", "service") or s != "asphalt" or g.length < 20:
            continue
        if not g.intersects(public):
            continue
        widths, offs = [], []
        stations = np.arange(6.0, g.length - 6.0, 5.0)
        for d in stations:
            p = g.interpolate(d)
            a = g.interpolate(max(0, d - 1.0)); b = g.interpolate(min(g.length, d + 1.0))
            dx, dy = b.x - a.x, b.y - a.y
            L = math.hypot(dx, dy)
            if L < 1e-6:
                continue
            nx, ny = -dy / L, dx / L
            cross = LineString([(p.x - nx * 14, p.y - ny * 14), (p.x + nx * 14, p.y + ny * 14)])
            inter = cross.intersection(public)
            piece = None
            for ln in lines_of(inter):
                if ln.distance(p) < 0.3:
                    piece = ln
                    break
            if piece is None:
                continue
            (x0, y0), (x1, y1) = piece.coords[0], piece.coords[-1]
            t0 = (x0 - p.x) * nx + (y0 - p.y) * ny
            t1 = (x1 - p.x) * nx + (y1 - p.y) * ny
            if t0 > t1:
                t0, t1 = t1, t0
            if t1 - t0 < 4.5:
                continue
            ts = np.arange(t0 + 0.1, t1 - 0.1, res)
            X = p.x + nx * ts + ctx.ox
            Y = p.y + ny * ts + ctx.oy
            cc = ((X - orto.x0) / res).astype(int)
            rr = ((orto.y1 - Y) / res).astype(int)
            if cc.min() < 0 or rr.min() < 0 or cc.max() >= W or rr.max() >= H:
                continue
            px = arr[rr, cc].astype(np.float32)
            lum = px @ np.array([0.299, 0.587, 0.114])
            lum = np.convolve(lum, np.ones(3) / 3, mode="same")
            lo, hi = np.percentile(lum, 20), np.percentile(lum, 85)
            if hi - lo < 16:
                continue  # no contrast (deep shade or uniform surface)
            dark = lum < (lo + hi) / 2
            # close small bright gaps (road markings, manholes) inside the asphalt
            dark = ndimage.binary_closing(dark, structure=np.ones(5))
            i0 = int(np.argmin(np.abs(ts)))
            if not dark[i0]:
                continue
            lab, _ = ndimage.label(dark)
            run = np.nonzero(lab == lab[i0])[0]
            dL, dR = ts[run[0]], ts[run[-1]]
            width = dR - dL
            if width < 2.8 or (dL - t0) < 0.5 and (t1 - dR) < 0.5 or width > (t1 - t0) - 0.5:
                continue
            widths.append(width)
            offs.append((dL + dR) / 2)
        if len(widths) >= 3 and len(widths) >= 0.3 * max(1, len(stations)):
            out[k] = (float(np.median(widths)), float(np.median(offs)))
    return out


def process_streets(ctx: Ctx):
    world = ctx.world_local
    blocks = ctx.local(ctx.blocks_utm)
    ways = []
    for f in ctx.osm:
        hw = f.tags.get("highway")
        if not hw or f.type != "way" or f.tags.get("area") == "yes":
            continue
        if hw not in VEHICLE and hw not in FOOT:
            continue
        if f.tags.get("tunnel") in ("yes", "culvert") or f.tags.get("indoor") == "yes":
            continue
        g = ctx.local(f.geom)
        if g.geom_type != "LineString" or not g.intersects(world):
            continue
        ways.append((g, f.tags, road_width(f.tags), surface_of(f.tags)))
    # squares / pedestrian areas from OSM
    squares = []
    for f in ctx.osm:
        t = f.tags
        g = f.geom
        if g.geom_type not in ("Polygon", "MultiPolygon"):
            continue
        if t.get("place") == "square" or (t.get("highway") in ("pedestrian", "footway") and t.get("area") == "yes") \
                or "area:highway" in t:
            squares.append(ctx.local(g))
    for g, t, w, s in ways:
        n = t.get("name", "")
        if n.startswith("Plaça") or n.startswith("Placeta"):
            squares.append(g.buffer(20))
    squares_u = unary_union(squares) if squares else Polygon()

    veh = [(g, t, w, s) for g, t, w, s in ways if t["highway"] in VEHICLE]
    foot = [(g, t, w, s) for g, t, w, s in ways if t["highway"] in FOOT]

    # ---- urban public space ------------------------------------------------
    road_zone = unary_union([g.buffer(w / 2 + 8, cap_style="flat") for g, t, w, s in veh]
                            + [g.buffer(w / 2 + 3) for g, t, w, s in foot])
    near_blocks = blocks.buffer(22, join_style="mitre")
    public = near_blocks.difference(blocks).intersection(road_zone.union(squares_u)).intersection(world)
    public = public.buffer(0)

    # real carriageway widths measured on the orthophoto replace the per-type estimate
    measured = measure_widths(ctx, veh, public)
    for k, (w_m, off) in measured.items():
        g, t, w, s = veh[k]
        try:
            gg = g.offset_curve(off) if abs(off) > 0.25 else g
            if gg.is_empty or gg.geom_type != "LineString":
                gg = g
        except Exception:
            gg = g
        veh[k] = (gg, t, w_m, s)
    ctx.stats["street_widths_measured"] = len(measured)
    ctx.stats["street_widths_candidates"] = sum(1 for g, t, w, s in veh if t["highway"] not in ("living_street", "track", "service")
                                               and s == "asphalt" and g.intersects(public))

    # carriageway per surface (urban roads clipped to the public space, rural roads as buffers).
    # Shared-space streets (living_street, pedestrian) fill the whole width between the blocks.
    carr = {}
    for g, t, w, s in veh:
        b = g.buffer(w / 2, cap_style="flat", join_style="round")
        if t["highway"] == "living_street":
            b = b.union(g.buffer(w / 2 + 5, cap_style="flat").intersection(public))
        carr.setdefault(s, []).append(b)
    carr = {s: unary_union(v) for s, v in carr.items()}
    carr_all = unary_union(list(carr.values()))
    # pedestrian ways (pedestrian streets also fill their street width)
    ped = unary_union([g.buffer(w / 2, cap_style="flat").union(
        g.buffer(w / 2 + 4, cap_style="flat").intersection(public) if t["highway"] == "pedestrian" else Polygon())
        for g, t, w, s in foot if t["highway"] != "steps"])
    plazas = squares_u.intersection(public).difference(carr_all)
    # sidewalks only along built blocks and close to a carriageway
    sidewalk = (public.difference(carr_all).difference(plazas).difference(ped)
                .intersection(blocks.buffer(5.0)).intersection(carr_all.buffer(5.0)))
    # remove slivers narrower than ~0.7 m: they belong to the carriageway
    thin = sidewalk.difference(sidewalk.buffer(-0.35).buffer(0.35))
    sidewalk = sidewalk.difference(thin)
    sidewalk = unary_union([p for p in polys(sidewalk) if p.area > 1.0])
    # gaps between carriageway and sidewalks / facades become carriageway
    urban_carr_extra = (public.difference(sidewalk).difference(plazas).difference(ped).difference(carr_all)
                        .intersection(carr_all.buffer(2.5)))
    urban_carr_extra = unary_union([p for p in polys(urban_carr_extra) if p.area > 0.5])

    # roundabout islands (lawn): inside closed junction=roundabout rings, beyond the carriageway
    islands = []
    for g, t, w, s in veh:
        if t.get("junction") == "roundabout" and g.is_ring:
            isl = Polygon(g.coords).buffer(-(w / 2 + 0.3))
            if not isl.is_empty and isl.area > 4:
                islands.append(isl)
    islands_u = unary_union(islands) if islands else Polygon()

    # final surface polygons (priority: island > plaza > sidewalk > road surfaces > pedestrian)
    layers: dict[str, object] = {}
    layers["grass"] = islands_u.intersection(world)
    taken = layers["grass"]
    layers["plaza"] = plazas.intersection(world).difference(taken)
    taken = taken.union(layers["plaza"])
    layers["sidewalk"] = sidewalk.intersection(world).difference(taken)
    taken = taken.union(layers["sidewalk"])
    order = ["sett", "cobble", "asphalt", "gravel", "dirt"]
    for s in order:
        if s not in carr:
            continue
        g = carr[s]
        if s == "asphalt":
            g = g.union(urban_carr_extra)
        g = g.intersection(world).difference(taken).difference(blocks)
        layers[s] = g
        taken = taken.union(g)
    layers["paving"] = ped.intersection(world).difference(taken).difference(blocks)

    stats = {k: round(v.area) for k, v in layers.items()}
    ctx.stats["street_areas_m2"] = stats
    ctx.estimated.append("Amplades de calçada (sense etiqueta width/lanes a l'OSM): valors per tipus de via")

    # ---- triangulate per tile ----------------------------------------------
    chunks = []
    verts_all, idx_all = [], []
    voff = 0
    ntiles = ctx.nx * ctx.ny
    for t in range(ntiles):
        tb = box(*ctx.tile_bounds(t))
        for si, s in enumerate(SURFACES):
            g = layers.get(s)
            if g is None or g.is_empty:
                continue
            gt = g.intersection(tb)
            if gt.is_empty:
                continue
            tv, ti = [], []
            n0 = 0
            for p in polys(gt):
                for pc in grid_pieces(p, 4.0 if s not in ("dirt", "gravel") else 6.0):
                    try:
                        v, i = triangulate(pc)
                    except Exception:
                        continue
                    if len(i) == 0:
                        continue
                    tv.append(v)
                    ti.append(i + n0)
                    n0 += len(v)
            if not tv:
                continue
            v = np.concatenate(tv).astype(np.float32)
            i = np.concatenate(ti).astype(np.uint32)
            chunks.append({"t": t, "s": si, "v0": voff, "vn": int(len(v)), "i0": int(sum(len(x) for x in idx_all)),
                           "in": int(len(i))})
            verts_all.append(v)
            idx_all.append(i)
            voff += len(v)

    # ---- curbs: sidewalk edges that touch a carriageway -------------------------
    road_surf = unary_union([layers[s] for s in ("asphalt", "sett", "cobble") if s in layers])
    curb_lines = lines_of(layers["sidewalk"].union(layers["grass"]).boundary.intersection(road_surf.buffer(0.15)))
    curbs, curb_off = [], [0]
    for ln in curb_lines:
        if ln.length < 0.5:
            continue
        ln = ln.simplify(0.05)
        n = max(2, int(ln.length / 3) + 1)
        for k in range(n):
            q = ln.interpolate(k / (n - 1), normalized=True)
            curbs += [q.x, q.y]
        curb_off.append(len(curbs) // 2)

    # ---- crossings -------------------------------------------------------------
    vtree = STRtree([g for g, *_ in veh])
    crossings = []
    for f in ctx.osm:
        if f.type != "node" or f.tags.get("highway") != "crossing":
            continue
        pnt = ctx.local(f.geom)
        if not world.contains(pnt):
            continue
        j = vtree.nearest(pnt)
        g, t, w, s = veh[j]
        if g.distance(pnt) > 4:
            continue
        d = g.project(pnt)
        a = g.interpolate(max(0, d - 1)); b = g.interpolate(min(g.length, d + 1))
        ang = math.atan2(b.y - a.y, b.x - a.x)
        cp = g.interpolate(d)
        crossings += [cp.x, cp.y, ang, w + 0.4, 3.0]

    # ---- centre lane marks on wide two-way roads outside the old centre --------
    marks, mark_off = [], [0]
    for g, t, w, s in veh:
        if s != "asphalt" or w < 6 or t.get("oneway") == "yes" or t["highway"] in ("track", "service", "living_street"):
            continue
        gi = g.intersection(world)
        for ln in lines_of(gi):
            if ln.length < 8:
                continue
            n = max(2, int(ln.length / 4) + 1)
            for k in range(n):
                q = ln.interpolate(k / (n - 1), normalized=True)
                marks += [q.x, q.y]
            mark_off.append(len(marks) // 2)

    # ---- steps -----------------------------------------------------------------
    steps = []
    for g, t, w, s in foot:
        if t["highway"] != "steps":
            continue
        a, b = g.coords[0], g.coords[-1]
        steps += [a[0], a[1], b[0], b[1], w]

    arrays = {
        "verts": np.concatenate(verts_all) if verts_all else np.zeros((0, 2), np.float32),
        "idx": np.concatenate(idx_all) if idx_all else np.zeros(0, np.uint32),
        "curbs": np.asarray(curbs, np.float32),
        "curbOff": np.asarray(curb_off, np.uint32),
        "crossings": np.asarray(crossings, np.float32),
        "marks": np.asarray(marks, np.float32),
        "markOff": np.asarray(mark_off, np.uint32),
        "steps": np.asarray(steps, np.float32),
    }
    size = write_bin(OUT / "streets.bin", arrays, {"surfaces": SURFACES, "chunks": chunks})
    ctx.stats["streets_bin_bytes"] = size

    # ---- road centre lines for the minimap / place names -----------------------
    roads = []
    for g, t, w, s in ways:
        gi = g.intersection(world)
        for ln in lines_of(gi):
            ln = ln.simplify(0.8)
            pts = []
            for x, y in ln.coords:
                pts += [round(x * 10), round(y * 10)]
            roads.append({"n": t.get("name") or t.get("ref"), "k": t["highway"], "w": round(w, 1), "s": s, "p": pts})
    save_json(OUT / "roads.json", {"roads": roads})
    ctx.stats["roads"] = len(roads)
    ctx.stats["named_streets"] = len({r["n"] for r in roads if r["n"]})
    ctx.public_local = public
    ctx.sidewalk_local = layers["sidewalk"]
    ctx.road_local = road_surf
    ctx.plaza_local = layers["plaza"]
    return {"public": public, "sidewalk": layers["sidewalk"], "roads": road_surf, "plazas": layers["plaza"],
            "veh": veh}
