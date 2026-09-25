"""Landmarks: signs with verified history, teleport points and parameters for
the custom 3D models (church of Sant Jaume, Ermita de Sant Antoni, fountains,
monuments, porxos, Casal Riudomenc logo...).

Source: data/raw/heritage/landmarks.json (every fact carries its source URL),
the Cadastre footprints and the ICGC LiDAR DSM for the measured heights.
"""
from __future__ import annotations

import json
import math

import numpy as np
from rasterio import features
from rasterio.transform import from_origin
from shapely.geometry import MultiPolygon, Point, Polygon, box, shape
from shapely.ops import unary_union

from common import OUT, RAW, save_json
from ctx import WORK, Ctx
from loaders import lonlat_to_utm

CHURCH_REF = "6562201CF3566B"
ERMITA_REF = "6265506CF3566E"
CASAL_REF = "6562212CF3566B"

# which landmarks get a sign, with the radius (m) in which it shows
SIGN_RADIUS = {
    "esglesia_sant_jaume": 34, "placa_esglesia": 22, "porxos_placa": 12, "placa_petita": 12, "font_dama_oferent": 10,
    "cisterna_vella": 0, "abadia": 12, "casal_riudomenc": 14, "monument_gaudi": 12, "escultura_gaudi": 6,
    "escultura_plegadora": 6, "ermita_sant_antoni": 22, "placa_sant_antoni": 30, "casa_de_la_vila": 14,
    "placa_om": 14, "hospital_capella_verge_maria": 9, "cal_marc_masso": 9, "casa_beat_bonaventura": 9,
    "centre_riudomenc": 10, "casa_pairal_gaudi": 10, "cal_gallissa": 10, "raval_sant_francesc": 0,
    "convent_sant_joan": 16, "placa_arbre": 18, "placa_palmera": 26, "carrer_major": 0, "centre_historic": 0,
    "la_soleiada": 14, "vila_romana_mola": 16, "mas_de_la_calderera": 30,
}
# teleport destinations (landmark id or "x,y,name")
TELEPORTS = ["esglesia_sant_jaume", "font_dama_oferent", "casa_de_la_vila", "placa_om", "carrer_major",
             "casa_beat_bonaventura", "casa_pairal_gaudi", "cal_gallissa", "placa_arbre", "ermita_sant_antoni",
             "placa_palmera", "monument_gaudi", "convent_sant_joan", "vila_romana_mola", "mas_de_la_calderera"]
EXTRA_PLACES = [  # OSM features used as extra teleports
    ("Institut Joan Guinjoan i Gispert", "Institut Joan Guinjoan"),
    ("Pavelló Municipal", "Pavelló Municipal"),
    ("Riudoms CD", "Camp de futbol"),
    ("Escola Cavaller Arnau", "Escola Cavaller Arnau"),
    ("Shell", "Gasolinera i polígon del Prat"),
    ("Parc de la Via Romana", "Parc de la Via Romana"),
]


# Facade decorations of emblematic buildings, from the Commons photos and the heritage
# research (data/raw/heritage/landmarks.json). "at" = position along the facade (0..1),
# "face" = point the facade looks at (the square it opens onto).
DECOR = {
    "abadia": {"ref": "6461502CF3566B", "face": "placa_esglesia",
               "src": "Commons: Abadia_-_casa_de_la_Parròquia (P1130377); IPAC / Catalunya Religió",
               "items": [{"k": "door", "at": 0.6, "w": 1.7, "h": 3.3, "stone": True, "steps": 3},
                         {"k": "plaque", "at": 0.44, "h": 1.75, "text": ["ABADIA", "Casa de la Parròquia"]},
                         {"k": "quoins", "at": 0.0}]},
    "casa_de_la_vila": {"ref": "6560325CF3566A", "face": "placa_om",
                        "src": "Commons: Casa_de_la_Vila_de_Riudoms_02; IPAC (esgrafiats, balcó de balustres, porta adovellada)",
                        "items": [{"k": "door", "at": 0.5, "w": 2.3, "h": 3.8, "stone": True, "steps": 1},
                                  {"k": "balcony", "at": 0.5, "w": 4.4, "floor": 1},
                                  {"k": "esgrafiat", "at": 0.24, "floor": 1}, {"k": "esgrafiat", "at": 0.76, "floor": 1},
                                  {"k": "shield", "at": 0.5, "floor": 2}]},
    "hospital_capella_verge_maria": {"face": None, "src": "Commons: Capella_Verge_Maria (porta adovellada, òcul)",
                                     "items": [{"k": "door", "at": 0.5, "w": 1.6, "h": 3.2, "stone": True, "steps": 0},
                                               {"k": "oculus", "at": 0.5, "floor": 1}]},
}


def _load():
    return json.load(open(RAW / "heritage" / "landmarks.json", encoding="utf-8"))


def resolve(ctx: Ctx):
    """Match landmarks to Cadastre buildings before the buildings step."""
    items = _load()
    refs = {CHURCH_REF: "esglesia_sant_jaume", ERMITA_REF: "ermita_sant_antoni"}
    for it in items:
        if it.get("lat") is None:
            continue
        x, y = lonlat_to_utm(it["lon"], it["lat"])
        p = Point(x, y)
        for b in ctx.buildings.values():
            if b.geom.contains(p) and b.id not in refs:
                if it["category"] and any(k in it["category"] for k in ("casa", "teatre", "capella", "ermita", "rectoral", "consistorial", "equipament")):
                    refs[b.id] = it["id"]
                break
    return {"refs": refs, "items": items}


def _sign_text(it):
    line = it.get("history_line_ca") or ""
    src = it.get("history_line_source") or ""
    first = src.split(";")[0].strip()
    host = first.split("/")[2] if first.startswith("http") and len(first.split("/")) > 2 else first[:60]
    return line, host


def church_params(ctx: Ctx, items):
    """Massing of the church from the LiDAR DSM inside the Cadastre footprint,
    plus the frame used by the procedural facade / tower ornament."""
    it = next(i for i in items if i["id"] == "esglesia_sant_jaume")
    b = ctx.buildings[CHURCH_REF]
    main = max(b.parts, key=lambda p: p.geom.area)
    fp = main.geom
    lm = json.load(open(RAW / "heritage" / "sources" / "lidar_measurements.json", encoding="utf-8"))["church"]
    fx, fy = lonlat_to_utm(lm["facade_centre_latlon"][1], lm["facade_centre_latlon"][0])
    tx, ty = lonlat_to_utm(lm["tower_centre_latlon"][1], lm["tower_centre_latlon"][0])
    bearing = math.radians(152.7 + 180)  # axis from the facade towards the apse (NNW)
    ax, ay = math.sin(bearing), math.cos(bearing)
    cx_, cy_ = -ay, ax  # across, positive to the left seen from the square (WSW)
    # snap the facade line to the footprint: minimum "along" coordinate of the footprint near the axis
    coords = np.asarray(fp.exterior.coords)
    s = (coords[:, 0] - fx) * ax + (coords[:, 1] - fy) * ay
    t = (coords[:, 0] - fx) * cx_ + (coords[:, 1] - fy) * cy_
    s_front = float(np.percentile(s[np.abs(t) < 12], 5)) if np.any(np.abs(t) < 12) else float(s.min())
    fx, fy = fx + ax * s_front, fy + ay * s_front
    platform = float(ctx.terrain.height(fx - ax * 2.0, fy - ay * 2.0))
    d = np.load(WORK / "lidar.npz")
    dsm = d["dsm"]
    X0, Y1 = float(d["x0"]), float(d["y1"])
    minx, miny, maxx, maxy = fp.bounds
    c0, c1 = int((minx - X0) / 0.5) - 2, int((maxx - X0) / 0.5) + 3
    r0, r1 = int((Y1 - maxy) / 0.5) - 2, int((Y1 - miny) / 0.5) + 3
    sub = dsm[r0:r1, c0:c1]
    tr = from_origin(X0 + c0 * 0.5, Y1 - r0 * 0.5, 0.5, 0.5)
    inside = features.geometry_mask([fp], out_shape=sub.shape, transform=tr, invert=True)
    rel = np.where(np.isfinite(sub), sub - platform, 0)
    zones = {}
    masks = {"tower": inside & (rel > 27.5), "nave": inside & (rel > 18.8) & (rel <= 27.5)}
    from scipy import ndimage

    for k, m in masks.items():
        m = ndimage.binary_opening(m, iterations=1)
        m = ndimage.binary_closing(m, iterations=2)
        shapes = [shape(g) for g, v in features.shapes(m.astype(np.uint8), mask=m, transform=tr) if v == 1]
        if not shapes:
            continue
        u = unary_union(shapes).buffer(0)
        u = max(getattr(u, "geoms", [u]), key=lambda g: g.area)
        zones[k] = u
    # tower: clean square aligned with the church, centred on the LiDAR tower top
    tvals = rel[masks["tower"]]
    tower_top = float(np.percentile(tvals, 97)) if tvals.size else 33.0
    side = 8.3
    tsq = Polygon([(tx + ax * sa * side / 2 + cx_ * sb * side / 2, ty + ay * sa * side / 2 + cy_ * sb * side / 2)
                   for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
    nave = zones.get("nave", fp).difference(tsq.buffer(0.3)).buffer(0.8).buffer(-0.8).simplify(0.35)
    nave = max(getattr(nave, "geoms", [nave]), key=lambda g: g.area)
    nvals = rel[masks["nave"]]
    eave = float(np.percentile(nvals, 25)) if nvals.size else 21.0
    ridge = float(np.percentile(nvals, 96)) if nvals.size else 22.5
    chapels = fp.difference(nave).difference(tsq).buffer(-0.2).buffer(0.2)
    ch_vals = rel[inside & (rel > 4) & (rel < 16)]
    chapel_top = float(np.median(ch_vals)) if ch_vals.size else 10.5
    # nave across extent at the facade → facade width and centre offset
    nc = np.asarray(nave.exterior.coords)
    ns = (nc[:, 0] - fx) * ax + (nc[:, 1] - fy) * ay
    nt = (nc[:, 0] - fx) * cx_ + (nc[:, 1] - fy) * cy_
    front = ns < 3
    t0, t1 = (float(nt[front].min()), float(nt[front].max())) if front.sum() >= 2 else (-8.0, 8.0)
    length = float(ns.max())

    def ring(poly):
        return [round(v, 2) for x, y in list(poly.exterior.coords)[:-1] for v in (x - ctx.ox, y - ctx.oy)]

    # zone in front of the facade where the platform steps are modelled by hand (no automatic stairs)
    W = lambda sv, tv: (fx + ax * sv + cx_ * tv - ctx.ox, fy + ay * sv + cy_ * tv - ctx.oy)
    ctx.church_front_zone = Polygon([W(-9, t0 - 11), W(-9, t1 + 3), W(1.5, t1 + 3), W(1.5, t0 - 11)])

    out = {
        "frame": {"x": round(fx - ctx.ox, 2), "y": round(fy - ctx.oy, 2), "ax": round(ax, 5), "ay": round(ay, 5),
                  "platform": round(platform, 2)},
        "nave": {"ring": ring(nave), "eave": round(eave, 2), "ridge": round(ridge, 2), "t0": round(t0, 2), "t1": round(t1, 2),
                 "length": round(length, 2)},
        "chapels": [{"ring": ring(p.simplify(0.3)), "top": round(chapel_top, 2)} for p in getattr(chapels, "geoms", [chapels])
                    if isinstance(p, Polygon) and p.area > 6],
        "tower": {"x": round(tx - ctx.ox, 2), "y": round(ty - ctx.oy, 2), "side": side, "top": round(tower_top, 2)},
        "facade": {"crown": 22.3, "gable_top": 25.8, "rose_d": 4.0, "rose_h": 15.0, "door_w": 2.6, "door_h": 5.2,
                   "retable_w": 8.5, "retable_h": 12.5},
        "sources": {
            "footprint": "Cadastre INSPIRE " + CHURCH_REF,
            "heights": "ICGC LiDAR DSM (nave eave/ridge, chapels, tower top) measured in this pipeline",
            "facade": "crown 22.3 m and clock gable 25.8 m: LiDAR (heritage research); rose window 4 m and retable size "
                      "ESTIMATED from Commons photos (IPAC/Viquipèdia give 9 m for the rose window, which does not match the photos)",
        },
    }
    ctx.stats["church_model"] = {"eave_rel": round(eave, 2), "ridge_rel": round(ridge, 2), "tower_top_rel": round(tower_top, 2),
                                 "chapel_top_rel": round(chapel_top, 2), "nave_len": round(length, 1),
                                 "facade_width": round(t1 - t0, 1)}
    return out


def porxos_edges(ctx: Ctx, items):
    """Street edges of the buildings around the porxos point that face the square."""
    it = next(i for i in items if i["id"] == "porxos_placa")
    px, py = lonlat_to_utm(it["lon"], it["lat"])
    plaza = ctx.plaza_esglesia_utm
    edges = []
    skip = {CHURCH_REF, CASAL_REF, "6461502CF3566B"}  # church, Casal, Abadia
    for p in ctx.parts:
        g = p.geom
        if p.building in skip or g.distance(Point(px, py)) > 32 or (p.floors or 0) < 2:
            continue
        cs = list(g.exterior.coords)
        for a, b in zip(cs[:-1], cs[1:]):
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            if L < 2.5:
                continue
            nx, ny = (b[1] - a[1]) / L, -(b[0] - a[0]) / L
            if not g.exterior.is_ccw:
                nx, ny = -nx, -ny
            mx, my = (a[0] + b[0]) / 2 + nx * 1.5, (a[1] + b[1]) / 2 + ny * 1.5
            if plaza.contains(Point(mx, my)) and not ctx.blocks_utm.contains(Point(mx, my)):
                edges.append([round(a[0] - ctx.ox, 2), round(a[1] - ctx.oy, 2), round(b[0] - ctx.ox, 2),
                              round(b[1] - ctx.oy, 2), round(nx, 4), round(ny, 4)])
    # IPAC: 10 + 6 arcades (~3.7 m each). Keep the square-facing edges closest to the
    # porxos point until that length is reached (which facades exactly is ESTIMATED).
    lp = (px - ctx.ox, py - ctx.oy)
    edges.sort(key=lambda e: math.hypot((e[0] + e[2]) / 2 - lp[0], (e[1] + e[3]) / 2 - lp[1]))
    kept, total = [], 0.0
    for e in edges:
        if total >= 16 * 3.7:
            break
        kept.append(e)
        total += math.hypot(e[2] - e[0], e[3] - e[1])
    ctx.stats["porxos_length_m"] = round(total, 1)
    return kept


def facade_anchor(ctx: Ctx, ref: str, toward_utm):
    """Top-centre of the longest facade edge of a building facing a point."""
    b = ctx.buildings.get(ref)
    if not b:
        return None
    best = None
    for p in b.parts:
        cs = list(p.geom.exterior.coords)
        for a, c in zip(cs[:-1], cs[1:]):
            L = math.hypot(c[0] - a[0], c[1] - a[1])
            m = ((a[0] + c[0]) / 2, (a[1] + c[1]) / 2)
            d = math.hypot(m[0] - toward_utm[0], m[1] - toward_utm[1])
            score = L - d * 0.6
            if best is None or score > best[0]:
                nx, ny = (c[1] - a[1]) / L, -(c[0] - a[0]) / L
                if not p.geom.exterior.is_ccw:
                    nx, ny = -nx, -ny
                best = (score, m, (nx, ny), p)
    _, m, n, part = best
    return {"x": round(m[0] - ctx.ox, 2), "y": round(m[1] - ctx.oy, 2), "nx": round(n[0], 4), "ny": round(n[1], 4)}


def export(ctx: Ctx, lm):
    items = lm["items"]
    world = ctx.world_local
    out = {"signs": [], "teleports": [], "models": {}, "credits": []}
    by_id = {i["id"]: i for i in items}
    for it in items:
        if it.get("lat") is None:
            continue
        x, y = lonlat_to_utm(it["lon"], it["lat"])
        lx, ly = x - ctx.ox, y - ctx.oy
        if not world.contains(Point(lx, ly)):
            continue
        rad = SIGN_RADIUS.get(it["id"], 10)
        line, host = _sign_text(it)
        if rad and line:
            out["signs"].append({"id": it["id"], "name": it["name"], "x": round(lx, 2), "y": round(ly, 2), "r": rad,
                                 "text": line, "src": host})
    for tid in TELEPORTS:
        it = by_id.get(tid)
        if not it or it.get("lat") is None:
            continue
        x, y = lonlat_to_utm(it["lon"], it["lat"])
        out["teleports"].append({"name": it["name"], "x": round(x - ctx.ox, 2), "y": round(y - ctx.oy, 2)})
    for name, label in EXTRA_PLACES:
        f = next((f for f in ctx.osm if f.tags.get("name") == name), None)
        if f is None:
            continue
        c = f.geom.centroid
        if world.contains(Point(c.x - ctx.ox, c.y - ctx.oy)):
            out["teleports"].append({"name": label, "x": round(c.x - ctx.ox, 2), "y": round(c.y - ctx.oy, 2)})

    def pos(i, dx=0.0, dy=0.0):
        it = by_id[i]
        x, y = lonlat_to_utm(it["lon"], it["lat"])
        return [round(x - ctx.ox + dx, 2), round(y - ctx.oy + dy, 2)]

    m = out["models"]
    m["church"] = church_params(ctx, items)
    m["damaOferent"] = {"pos": pos("font_dama_oferent"), "statue_top": 5.1,
                        "source": "IPAC hexagonal basin; LiDAR statue top 5.1 m; sizes ESTIMATED from photos"}
    # the 1976-77 fountain surrounded by shrubs: an oval ~8 x 16 m clearly visible on the 25 cm
    # orthophoto (UTM 336450.0, 4556005.5), long axis ~7 degrees east of north
    m["plazaFountain"] = {"pos": [round(336450.0 - ctx.ox, 2), round(4556005.5 - ctx.oy, 2)], "rx": 3.9, "ry": 7.9,
                          "bearing": 7.0,
                          "source": "position, size and orientation measured on the ICGC 25 cm orthophoto; design ESTIMATED"}
    m["monumentGaudi"] = {"pos": pos("monument_gaudi"), "height": 10.0,
                          "source": "Josep Piqué 1975, 10 m (riudoms.cat); shape from Commons photos"}
    m["statueGaudi"] = {"pos": pos("escultura_gaudi"), "height": 1.7, "source": "Joan Serramià 2019, 1.70 m"}
    m["plegadora"] = {"pos": pos("escultura_plegadora"), "source": "OSM / Wikidata position; shape ESTIMATED"}
    m["porxos"] = {"edges": porxos_edges(ctx, items), "arches": "10 + 6 (IPAC)"}
    x, y = lonlat_to_utm(by_id["placa_esglesia"]["lon"], by_id["placa_esglesia"]["lat"])
    m["casalLogo"] = facade_anchor(ctx, CASAL_REF, (x, y))
    m["ermita"] = ermita_params(ctx, by_id["ermita_sant_antoni"])
    x, y = lonlat_to_utm(1.05153, 41.13885)
    m["mosaic"] = {"pos": [round(x - ctx.ox, 2), round(y - ctx.oy, 2)], "size": 4.0,
                   "source": "mosaic of the Riudoms coat of arms confirmed by Commons photo; position and size ESTIMATED"}
    m["decor"] = decorations(ctx, by_id, lm["refs"])
    # Plaça de l'Om: large ornamental lamp post in the centre (heritage research, jogili / riudoms.cat)
    m["omLamp"] = {"pos": pos("placa_om"), "source": "research: 'the centre of the square is a large ornamental lamp post with trees'"}
    m["palmBed"] = palm_bed(ctx)
    # credits of the heritage photos used for modelling (not shown as textures)
    photos = json.load(open(RAW / "heritage" / "photos.json", encoding="utf-8"))
    out["credits"] = [{"title": p.get("commons_title") or p.get("title"), "author": p.get("author"),
                       "license": p.get("license")} for p in (photos if isinstance(photos, list) else photos.get("photos", []))]
    save_json(OUT / "landmarks.json", out)
    ctx.stats["signs"] = len(out["signs"])
    ctx.stats["teleports"] = len(out["teleports"])


def decorations(ctx: Ctx, by_id, refs):
    """Pick the street facade of each decorated landmark and export where to put things."""
    import json as _json

    fac = getattr(ctx, "bfacades", None)
    if fac is None:
        fp = WORK / "bfacades.json"
        fac = _json.load(open(fp)) if fp.exists() else {}
    out = []
    for lid, spec in DECOR.items():
        it = by_id.get(lid)
        if not it:
            continue
        ref = spec.get("ref") or next((r for r, l in refs.items() if l == lid), None)
        edges = fac.get(ref) or []
        if not edges:
            continue
        target = None
        if spec.get("face") and by_id.get(spec["face"]):
            t = by_id[spec["face"]]
            x, y = lonlat_to_utm(t["lon"], t["lat"])
            target = (x - ctx.ox, y - ctx.oy)
        else:
            x, y = lonlat_to_utm(it["lon"], it["lat"])
            target = (x - ctx.ox, y - ctx.oy)

        def score(e):
            mx, my = (e["a"][0] + e["b"][0]) / 2, (e["a"][1] + e["b"][1]) / 2
            facing = (target[0] - mx) * e["n"][0] + (target[1] - my) * e["n"][1]
            return e["len"] + (6 if facing > 0 else -20) - 0.15 * math.hypot(target[0] - mx, target[1] - my)
        e = max(edges, key=score)
        out.append({"id": lid, "edge": e, "items": spec["items"], "src": spec["src"]})
    return out


def palm_bed(ctx: Ctx):
    """Raised round lawn bed around the palm of the Plaça de la Palmera (Commons photo)."""
    park = next((ctx.local(f.geom) for f in ctx.osm if f.tags.get("name", "").lower() == "parc de la palmera"
                 and f.geom.geom_type in ("Polygon", "MultiPolygon")), None)
    lp = WORK / "lidar_trees.json"
    if park is None or not lp.exists():
        return None
    best = None
    for x, y, h, r in json.load(open(lp))["trees"]:
        p = Point(x - ctx.ox, y - ctx.oy)
        if park.contains(p) and (best is None or h > best[2]):
            best = (p.x, p.y, h)
    if best is None:
        return None
    return {"pos": [round(best[0], 2), round(best[1], 2)], "r": 6.5,
            "source": "Commons photo Pla_a_de_la_Palmera_Riudoms_01: raised round lawn with a stone rim; size ESTIMATED"}


def ermita_params(ctx: Ctx, it):
    b = ctx.buildings.get(ERMITA_REF)
    if not b:
        return None
    g = max(b.parts, key=lambda p: p.geom.area).geom
    bearing = math.radians(162.0)  # long axis, facade at the SSE end (heritage research)
    ax, ay = math.sin(bearing), math.cos(bearing)
    cs = np.asarray(g.exterior.coords)
    c = g.centroid
    s = (cs[:, 0] - c.x) * ax + (cs[:, 1] - c.y) * ay
    front = float(s.max())
    fx, fy = c.x + ax * front, c.y + ay * front
    t = (cs[:, 0] - c.x) * -ay + (cs[:, 1] - c.y) * ax
    width = float(t.max() - t.min())
    ground = float(ctx.terrain.height(fx + ax * 2, fy + ay * 2))
    return {"x": round(fx - ctx.ox, 2), "y": round(fy - ctx.oy, 2), "ax": round(ax, 5), "ay": round(ay, 5),
            "width": round(min(width, 13.0), 2), "ground": round(ground, 2), "pediment": 12.5, "espadanya": 15.0,
            "source": "Cadastre footprint; LiDAR heights (pediment 12.5 m, espadanya 15 m) from the heritage research"}
