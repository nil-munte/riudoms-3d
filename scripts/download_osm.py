"""Download OpenStreetMap data for Riudoms via the Overpass API.

Outputs (data/raw/osm/):
  area.json      every node/way/relation inside the world bbox (with geometry)
  boundary.json  the municipal boundary relation (340858) with geometry
"""
from __future__ import annotations

import sys

from common import BBOX, OSM_RELATION, RAW, http_post, save_json

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]


def overpass(query: str):
    last = None
    for ep in ENDPOINTS:
        try:
            print(f"  overpass: {ep}")
            return http_post(ep, {"data": query}, timeout=600).json()
        except Exception as e:  # try the next mirror
            print(f"  failed: {e}")
            last = e
    raise last  # type: ignore[misc]


def main(force: bool = False) -> None:
    out = RAW / "osm"
    out.mkdir(parents=True, exist_ok=True)
    b = f'{BBOX["south"]},{BBOX["west"]},{BBOX["north"]},{BBOX["east"]}'

    if force or not (out / "area.json").exists():
        # Everything useful in the bbox: tagged nodes (trees, lamps, benches,
        # fountains, POIs), all ways (buildings, streets, landuse, water...) and
        # multipolygon relations. Route/admin relations are skipped on purpose:
        # their geometry is huge and not needed. Downloaded in quadrants to stay
        # under the Overpass time limits, then de-duplicated by (type, id).
        print("OSM: downloading features in bbox", b)
        s, w, n, e = BBOX["south"], BBOX["west"], BBOX["north"], BBOX["east"]
        ms, mw = (s + n) / 2, (w + e) / 2
        quads = [(s, w, ms, mw), (s, mw, ms, e), (ms, w, n, mw), (ms, mw, n, e)]
        seen: dict = {}
        for qs, qw, qn, qe in quads:
            qb = f"{qs},{qw},{qn},{qe}"
            q = (
                f"[out:json][timeout:300][bbox:{qb}];"
                "(node(if:count_tags()>0);way;rel[type=multipolygon];);"
                "out body geom qt;"
            )
            data = overpass(q)
            for el in data["elements"]:
                seen[(el["type"], el["id"])] = el
            print(f"  quad {qb}: {len(data['elements'])} elements")
        data = {"generator": "Overpass API", "bbox": BBOX, "elements": list(seen.values())}
        save_json(out / "area.json", data)
        print(f"  total {len(data['elements'])} unique elements")

    if force or not (out / "boundary.json").exists():
        print("OSM: downloading municipal boundary")
        q = f"[out:json][timeout:120];rel({OSM_RELATION});out body geom;"
        save_json(out / "boundary.json", overpass(q))


if __name__ == "__main__":
    main(force="--force" in sys.argv)
