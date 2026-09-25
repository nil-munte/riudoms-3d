"""Download open data from the Generalitat de Catalunya.

Outputs (data/raw/opendata/):
  equipaments.json  "Equipaments de Catalunya" (Socrata 8gmd-gz7i), Riudoms only
  dun2025.json      "Mapa de parcel·les i cultius de les explotacions (DUN) 2025"
                    via the WFS of sig.gencat.cat (declared crop per plot)
"""
from __future__ import annotations

import sys

from common import RAW, bbox_utm, http_get, save_json

EQUIP = "https://analisi.transparenciacatalunya.cat/resource/8gmd-gz7i.json"
WFS = "https://sig.gencat.cat/ows/AGRICULTURA/wfs"
DUN_LAYER = "AGRICULTURA:AGRICULTURA_DUN2025"


def main(force: bool = False) -> None:
    out = RAW / "opendata"
    out.mkdir(parents=True, exist_ok=True)

    p = out / "equipaments.json"
    if force or not p.exists():
        print("Open data: Equipaments de Catalunya (Riudoms)")
        r = http_get(EQUIP, params={"poblacio": "Riudoms", "$limit": 1000})
        save_json(p, r.json())

    p = out / "dun2025.json"
    if force or not p.exists():
        print("Open data: DUN 2025 crop parcels (WFS)")
        minx, miny, maxx, maxy = bbox_utm()
        feats = []
        start, page = 0, 5000
        while True:
            params = {
                "SERVICE": "WFS",
                "VERSION": "2.0.0",
                "REQUEST": "GetFeature",
                "TYPENAMES": DUN_LAYER,
                "BBOX": f"{minx},{miny},{maxx},{maxy},urn:ogc:def:crs:EPSG::25831",
                "SRSNAME": "urn:ogc:def:crs:EPSG::25831",
                "OUTPUTFORMAT": "application/json",
                "COUNT": page,
                "STARTINDEX": start,
            }
            fc = http_get(WFS, params=params, timeout=600).json()
            feats += fc["features"]
            print(f"  {len(feats)} parcels")
            if len(fc["features"]) < page:
                break
            start += page
        save_json(p, {"type": "FeatureCollection", "crs": "EPSG:25831", "features": feats})


if __name__ == "__main__":
    main(force="--force" in sys.argv)
