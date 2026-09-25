"""Constants and helpers shared by the Riudoms data pipeline."""
from __future__ import annotations

import json
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "public" / "data"

USER_AGENT = "RiudomsVirtual/0.1 (3D walkable village model; data pipeline)"

# Reference point given for the project (Plaça de l'Església).
# 41°08'20.73"N 1°03'07.09"E
REF_LAT = 41 + 8 / 60 + 20.73 / 3600
REF_LON = 1 + 3 / 60 + 7.09 / 3600

OSM_RELATION = 340858
INE_CODE = "43129"

# Area of the world: the urban core plus a belt of fields around it.
# (lat/lon WGS84) ~3.6 km E-W x ~3.4 km N-S
BBOX = {
    "south": 41.1235,
    "west": 1.0305,
    "north": 41.1545,
    "east": 1.0735,
}

# Projected CRS used by Catastro and ICGC (ETRS89 / UTM 31N)
EPSG_UTM = 25831


def http_get(url: str, *, params=None, timeout=180, retries=4, stream=False, headers=None):
    h = {"User-Agent": USER_AGENT}
    if headers:
        h.update(headers)
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, params=params, timeout=timeout, headers=h, stream=stream)
            if r.status_code == 200:
                return r
            last = RuntimeError(f"HTTP {r.status_code} for {r.url}: {r.text[:300]}")
        except requests.RequestException as e:  # network hiccup
            last = e
        time.sleep(3 * (i + 1))
    raise last  # type: ignore[misc]


def http_post(url: str, data: dict, *, timeout=300, retries=4):
    last = None
    for i in range(retries):
        try:
            r = requests.post(url, data=data, timeout=timeout, headers={"User-Agent": USER_AGENT})
            if r.status_code == 200:
                return r
            last = RuntimeError(f"HTTP {r.status_code}: {r.text[:300]}")
        except requests.RequestException as e:
            last = e
        time.sleep(5 * (i + 1))
    raise last  # type: ignore[misc]


def save_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False)


def load_json(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def bbox_utm():
    """Return the world bbox in EPSG:25831 (minx, miny, maxx, maxy)."""
    from pyproj import Transformer

    t = Transformer.from_crs(4326, EPSG_UTM, always_xy=True)
    xs, ys = [], []
    for lon in (BBOX["west"], BBOX["east"]):
        for lat in (BBOX["south"], BBOX["north"]):
            x, y = t.transform(lon, lat)
            xs.append(x)
            ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def ref_utm():
    from pyproj import Transformer

    t = Transformer.from_crs(4326, EPSG_UTM, always_xy=True)
    return t.transform(REF_LON, REF_LAT)
