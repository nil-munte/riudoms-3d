"""Street furniture and parked bicycles.

REAL (OSM positions): benches, drinking fountains, fountains, waste baskets,
bus stops, post boxes, bicycle parkings, playgrounds, the single mapped street lamp.
ESTIMATED: street lamps (OSM maps only one in Riudoms): wall-mounted lamps on the
facades of narrow streets (as seen in the Cadastre facade photos) and poles on
wide streets and squares, at a regular spacing; bench orientation; bike spots.
"""
from __future__ import annotations

import math

from shapely import STRtree
from shapely.geometry import Point
from shapely.ops import nearest_points, unary_union
from shapely.prepared import prep

from common import OUT, save_json
from ctx import Ctx
from p_streets import FOOT, lines_of

# places where bicycles are parked for the player (name fragments of OSM features)
BIKE_SPOTS = ["Plaça de l'Església", "Parc de la palmera", "Plaça de l'Om", "Parc de Sant Antoni", "Plaça de l'Arbre",
              "Pavelló Municipal", "Institut Joan Guinjoan i Gispert", "Parc de la Via Romana", "Plaça d'Arnau de Palomar"]


def process_props(ctx: Ctx, sdata):
    world = ctx.world_local
    wprep = prep(world)
    parts = [ctx.local(p.geom) for p in ctx.parts if p.floors != 0]
    btree = STRtree(parts)
    public = sdata["public"]
    sidewalk = sdata["sidewalk"]
    plazas = sdata["plazas"]
    road = sdata["roads"]
    pub_p, side_p, plaza_p, road_p = prep(public), prep(sidewalk), prep(plazas), prep(road)
    buildings_u = unary_union(parts)
    bprep = prep(buildings_u.buffer(0.4))

    def nearest_wall(p: Point, maxd=8.0):
        best, bd = None, maxd
        for j in btree.query(p.buffer(maxd)):
            d = parts[j].exterior.distance(p)
            if d < bd:
                bd, best = d, j
        if best is None:
            return None, None
        q = nearest_points(parts[best].exterior, p)[0]
        return q, bd

    out = {"benches": [], "drinking": [], "fountains": [], "bins": [], "bus": [], "post": [], "lamps": [],
           "bikeRacks": [], "playgrounds": [], "bikes": []}
    veh_lines = [(g, w) for g, t, w, s in sdata["veh"]]
    vtree = STRtree([g for g, _ in veh_lines])

    def road_angle(p: Point):
        j = vtree.nearest(p)
        g = veh_lines[j][0]
        d = g.project(p)
        a, b = g.interpolate(max(0, d - 1)), g.interpolate(min(g.length, d + 1))
        return math.atan2(b.y - a.y, b.x - a.x), g.distance(p), veh_lines[j][1]

    for f in ctx.osm:
        t = f.tags
        if f.type == "node":
            p = ctx.local(f.geom)
            if not wprep.contains(p):
                continue
            am, hw = t.get("amenity"), t.get("highway")
            if am == "bench":
                q, d = nearest_wall(p, 5)
                if q is not None:  # back to the wall
                    ang = math.atan2(p.y - q.y, p.x - q.x)
                else:
                    ra, _, _ = road_angle(p)
                    ang = ra + math.pi / 2
                out["benches"].append([round(p.x, 2), round(p.y, 2), round(ang, 3)])
            elif am == "drinking_water":
                out["drinking"].append([round(p.x, 2), round(p.y, 2)])
            elif am == "fountain":
                out["fountains"].append([round(p.x, 2), round(p.y, 2), t.get("name")])
            elif am == "waste_basket":
                out["bins"].append([round(p.x, 2), round(p.y, 2)])
            elif hw == "bus_stop":
                ra, d, w = road_angle(p)
                out["bus"].append([round(p.x, 2), round(p.y, 2), round(ra, 3), t.get("name")])
            elif am == "post_box":
                out["post"].append([round(p.x, 2), round(p.y, 2)])
            elif hw == "street_lamp":
                out["lamps"].append([round(p.x, 2), round(p.y, 2), 0.0, 1, 0])
            elif am == "bicycle_parking":
                out["bikeRacks"].append([round(p.x, 2), round(p.y, 2)])
        elif t.get("leisure") == "playground" and f.geom.geom_type == "Polygon":
            c = ctx.local(f.geom).representative_point()
            if wprep.contains(c):
                out["playgrounds"].append([round(c.x, 2), round(c.y, 2)])

    # ---- estimated street lamps ------------------------------------------------------
    lamps = [Point(l[0], l[1]) for l in out["lamps"]]
    ltree_pts: list[Point] = list(lamps)

    def far_from_lamps(p: Point, d: float) -> bool:
        return all(p.distance(q) > d for q in ltree_pts[-400:]) and all(p.distance(q) > d for q in lamps)

    n_wall = n_pole = 0
    for g, tags, w, s in [(g, t, w, s) for g, t, w, s in sdata["veh"]] + [(g, t, w, s) for g, t, w, s in []]:
        if tags["highway"] in ("track", "service") or not g.intersects(public):
            continue
        for ln in lines_of(g.intersection(public.buffer(1))):
            L = ln.length
            if L < 6:
                continue
            step = 19.0
            k = 0
            d = 6.0
            while d < L - 2:
                c = ln.interpolate(d)
                a = ln.interpolate(min(L, d + 0.5))
                ang = math.atan2(a.y - c.y, a.x - c.x)
                side = 1 if k % 2 == 0 else -1
                nx, ny = -math.sin(ang) * side, math.cos(ang) * side
                # distance to the facades on this side
                probe = None
                for off in (w / 2 + 0.8, w / 2 + 2.0, w / 2 + 3.5, w / 2 + 5.5):
                    pp = Point(c.x + nx * off, c.y + ny * off)
                    if bprep.contains(pp):
                        probe = off
                        break
                if probe is not None and probe <= w / 2 + 3.6:
                    q, dd = nearest_wall(Point(c.x + nx * probe, c.y + ny * probe), 3)
                    if q is not None and far_from_lamps(q, 9):
                        # wall-mounted lamp facing the street, 4.6 m high
                        out["lamps"].append([round(q.x, 2), round(q.y, 2), round(math.atan2(-ny, -nx), 3), 0, 1])
                        ltree_pts.append(q)
                        n_wall += 1
                else:
                    pp = Point(c.x + nx * (w / 2 + 0.45), c.y + ny * (w / 2 + 0.45))
                    if (side_p.contains(pp) or plaza_p.contains(pp)) and far_from_lamps(pp, 12):
                        out["lamps"].append([round(pp.x, 2), round(pp.y, 2), round(math.atan2(-ny, -nx), 3), 1, 1])
                        ltree_pts.append(pp)
                        n_pole += 1
                d += step
                k += 1
    # squares: lamp posts around the perimeter
    from p_streets import polys

    for pl in polys(plazas):
        if pl.area < 150:
            continue
        for inner in polys(pl.buffer(-1.0)):
            ring = inner.exterior
            n = max(2, int(ring.length / 18))
            for i in range(n):
                q = ring.interpolate(i / n, normalized=True)
                if far_from_lamps(q, 10) and not bprep.contains(q):
                    out["lamps"].append([round(q.x, 2), round(q.y, 2), 0.0, 2, 1])
                    ltree_pts.append(q)
                    n_pole += 1
    ctx.stats["lamps"] = {"osm": sum(1 for l in out["lamps"] if l[4] == 0), "estimated_wall": n_wall,
                          "estimated_pole": n_pole}
    ctx.estimated.append("Fanals: posició estimada (l'OSM només en té 1)")

    # ---- bikes for the player ----------------------------------------------------------
    rng_i = 0
    colors = 5
    for name in BIKE_SPOTS:
        feats = [f for f in ctx.osm if f.tags.get("name") == name]
        if not feats:
            continue
        c = unary_union([ctx.local(f.geom) for f in feats]).centroid
        placed = 0
        for rad in (2, 4, 6, 8, 11, 14, 18, 24):
            for k in range(12):
                a = k / 12 * math.pi * 2 + rad
                p = Point(c.x + math.cos(a) * rad, c.y + math.sin(a) * rad)
                if not (plaza_p.contains(p) or side_p.contains(p) or (pub_p.contains(p) and not road_p.contains(p))):
                    continue
                if bprep.contains(p) or any(p.distance(Point(b[0], b[1])) < 1.6 for b in out["bikes"]):
                    continue
                q, dd = nearest_wall(p, 6)
                heading = math.atan2(q.x - p.x, q.y - p.y) + math.pi / 2 if q is not None else a
                out["bikes"].append([round(p.x, 2), round(p.y, 2), round(heading, 3), rng_i % colors, name])
                rng_i += 1
                placed += 1
                if placed >= 2:
                    break
            if placed >= 2:
                break
    for r in out["bikeRacks"]:
        out["bikes"].append([r[0] + 0.8, r[1], 0.0, rng_i % colors, "aparcament de bicicletes"])
        rng_i += 1
    ctx.stats["props"] = {k: len(v) for k, v in out.items()}
    save_json(OUT / "props.json", out)
