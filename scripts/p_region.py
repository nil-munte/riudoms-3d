"""The world is limited to the town (nucli urbà): the Cadastre urban blocks
(MANZANA) that are really built up with houses, shops or public buildings,
plus the streets around them. Fields, the industrial estates, the Riera de
Riudoms outside the town and the scattered farmhouses are left out.

A block is part of the town when buildings cover at least 12 % of it and at
least 45 % of that built area is residential, retail, office or public
(Cadastre currentUse 1_* / 4_*). The kept blocks are grown by 22 m (the
perimeter streets and sidewalks), closed, and the connected piece that
contains the Plaça de l'Església is the region (holes filled)."""
from __future__ import annotations

from shapely import STRtree
from shapely.geometry import Point, Polygon
from shapely.ops import unary_union

MIN_COVER = 0.12
MIN_TOWN_USE = 0.45
GROW = 22.0


def find_region(blocks: list, buildings: dict, parts: list, origin_utm) -> tuple[Polygon, dict]:
    geoms = [p.geom for p in parts]
    tree = STRtree(geoms)
    good = []
    for bl in blocks:
        tot = town = 0.0
        for j in tree.query(bl):
            a = geoms[j].intersection(bl).area
            if a <= 0:
                continue
            b = buildings.get(parts[j].building)
            use = b.use if b else None
            tot += a
            if use and (use.startswith("1_") or use.startswith("4_")):
                town += a
        if tot / bl.area >= MIN_COVER and tot > 0 and town / tot >= MIN_TOWN_USE:
            good.append(bl)
    u = unary_union([g.buffer(GROW) for g in good]).buffer(12).buffer(-12)
    comps = list(u.geoms) if u.geom_type == "MultiPolygon" else [u]
    o = Point(*origin_utm)
    main = min(comps, key=lambda c: c.distance(o))
    region = Polygon(main.exterior).simplify(1.0)
    return region, {"blocks_total": len(blocks), "blocks_town": len(good), "area_ha": round(region.area / 1e4, 1)}
