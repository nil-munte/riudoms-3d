"""Download terrain, orthophoto and LiDAR from the Institut Cartogràfic i
Geològic de Catalunya (ICGC).

Outputs (data/raw/icgc/):
  met5.asc            MET-5 terrain model (5x5 m, EPSG:25831) via WCS icc:met5 (ArcGrid)
  orto/wide_*.jpg     current colour orthophoto at 1 m/px over the whole world bbox
  orto/core_*.jpg     current colour orthophoto at 0.25 m/px over the urban core
  orto/*.json         georeference (bbox, pixel size) for each image
  lidar/*.laz         LiDAR territorial 3rd coverage, 1x1 km sheets over the core

The MET-2 m is only exposed as a rendered WMS (no raw values) and the
datacloud has no public MET-2 folder, so terrain uses MET-5 (raw WCS) and
building/tree heights come from the LiDAR point cloud (see process_lidar.py).
"""
from __future__ import annotations

import json
import math
import sys

from common import RAW, bbox_utm, http_get

WCS = "https://geoserveis.icgc.cat/icc_mdt/wcs/service"
WMS_ORTO = "https://geoserveis.icgc.cat/servei/catalunya/orto-territorial/wms"
ORTO_LAYER = "ortofoto_color_vigent"
LIDAR = "https://datacloud.icgc.cat/datacloud/lidar-territorial/vigent/laz_unzip/full10km{k10}/lidar-territorial-full1km{k1}.laz"

# Urban core (EPSG:25831) where we want the 25 cm orthophoto.
CORE = (335700.0, 4555100.0, 337700.0, 4557100.0)
# 1x1 km LiDAR sheets covering the built-up area (x 335-338 km, y 4555-4557 km).
LIDAR_AREA = (335000.0, 4555000.0, 338000.0, 4557000.0)


def download_dem(out, force):
    p = out / "met5.asc"
    if p.exists() and not force:
        return
    minx, miny, maxx, maxy = bbox_utm()
    # pad and snap to the 5 m grid
    pad = 50
    minx, miny = math.floor((minx - pad) / 5) * 5, math.floor((miny - pad) / 5) * 5
    maxx, maxy = math.ceil((maxx + pad) / 5) * 5, math.ceil((maxy + pad) / 5) * 5
    params = {
        "SERVICE": "WCS",
        "VERSION": "1.0.0",
        "REQUEST": "GetCoverage",
        # The service proxy inserts a "5" after "met" (icc:met5 -> icc:met55),
        # so the MET-5 coverage has to be requested as "icc:met".
        "COVERAGE": "icc:met",
        "CRS": "EPSG:25831",
        "BBOX": f"{minx},{miny},{maxx},{maxy}",
        "WIDTH": int((maxx - minx) / 5),
        "HEIGHT": int((maxy - miny) / 5),
        "FORMAT": "ArcGrid",  # the only format this coverage offers
    }
    print("ICGC: MET-5 via WCS", params["BBOX"])
    r = http_get(WCS, params=params, timeout=600)
    head = r.content[:300].decode("ascii", "replace").upper()
    if not head.lstrip().startswith("NCOLS"):
        raise RuntimeError("WCS did not return an ArcGrid: " + r.text[:500])
    if "CELLSIZE 5.0" not in head:
        raise RuntimeError("unexpected cell size (expected MET-5): " + head)
    p.write_bytes(r.content)


def wms_tiles(out, name, bounds, res, tile_px, force):
    """Download a WMS mosaic as tiles of tile_px pixels at `res` m/px."""
    minx, miny, maxx, maxy = bounds
    span = tile_px * res
    nx, ny = math.ceil((maxx - minx) / span), math.ceil((maxy - miny) / span)
    index = []
    for j in range(ny):
        for i in range(nx):
            x0, y0 = minx + i * span, miny + j * span
            x1, y1 = x0 + span, y0 + span
            fn = f"{name}_{i}_{j}.jpg"
            index.append({"file": fn, "bbox": [x0, y0, x1, y1], "res": res, "px": tile_px})
            p = out / fn
            if p.exists() and not force:
                continue
            params = {
                "SERVICE": "WMS",
                "VERSION": "1.3.0",
                "REQUEST": "GetMap",
                "LAYERS": ORTO_LAYER,
                "STYLES": "",
                "CRS": "EPSG:25831",
                "BBOX": f"{x0},{y0},{x1},{y1}",
                "WIDTH": tile_px,
                "HEIGHT": tile_px,
                "FORMAT": "image/jpeg",
            }
            r = http_get(WMS_ORTO, params=params, timeout=300)
            if not r.content.startswith(b"\xff\xd8"):
                raise RuntimeError("WMS error: " + r.text[:500])
            p.write_bytes(r.content)
            print(f"  {fn}")
    with open(out / f"{name}.json", "w") as f:
        json.dump({"layer": ORTO_LAYER, "crs": "EPSG:25831", "tiles": index}, f, indent=1)


def download_ortho(out, force):
    out.mkdir(parents=True, exist_ok=True)
    minx, miny, maxx, maxy = bbox_utm()
    print("ICGC: orthophoto wide (1 m/px)")
    wms_tiles(out, "wide", (math.floor(minx), math.floor(miny), maxx, maxy), 1.0, 2000, force)
    print("ICGC: orthophoto core (0.25 m/px)")
    wms_tiles(out, "core", CORE, 0.25, 2000, force)


def download_lidar(out, force):
    out.mkdir(parents=True, exist_ok=True)
    for x in range(int(LIDAR_AREA[0] // 1000), int(math.ceil(LIDAR_AREA[2] / 1000))):
        for y in range(int(LIDAR_AREA[1] // 1000), int(math.ceil(LIDAR_AREA[3] / 1000))):
            k1 = f"{x}{y - 4000}"
            k10 = f"{x // 10}{(y - 4000) // 10}"
            p = out / f"{k1}.laz"
            if p.exists() and not force:
                continue
            url = LIDAR.format(k10=k10, k1=k1)
            print("ICGC: LiDAR", url)
            r = http_get(url, timeout=1800, stream=True, headers={"User-Agent": "Mozilla/5.0"})
            tmp = p.with_suffix(".part")
            with open(tmp, "wb") as f:
                for chunk in r.iter_content(1 << 20):
                    f.write(chunk)
            tmp.rename(p)


def main(argv):
    force = "--force" in argv
    out = RAW / "icgc"
    out.mkdir(parents=True, exist_ok=True)
    download_dem(out, force)
    download_ortho(out / "orto", force)
    if "--no-lidar" not in argv:
        download_lidar(out / "lidar", force)


if __name__ == "__main__":
    main(sys.argv[1:])
