"""Shared processing context: loaded datasets, local origin, tile grid and the
terrain height function used by every processing step."""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
from shapely import affinity
from shapely.geometry import Point
from shapely.ops import unary_union

from common import ROOT, bbox_utm
from loaders import Grid

WORK = ROOT / "data" / "work"
TILE = 250.0  # metres per world tile

# Place names used to locate the local origin (Plaça de l'Església)
ORIGIN_WAY_NAME = "Plaça de l'Església"


@dataclass
class TerrainModel:
    coarse: Grid  # MET-5 (ICGC WCS)
    fine: Grid | None  # 2 m DTM from ICGC LiDAR ground points, blended into MET-5 at its edges

    def height(self, x, y):
        """Terrain height at UTM coords. Must match src/world/terrain.ts."""
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        h = self.coarse.sample(x, y)
        if self.fine is not None:
            f = self.fine
            fh, fw = f.shape
            inside = (x >= f.x0 + f.res) & (x <= f.x0 + (fw - 1) * f.res) & (y <= f.y1 - f.res) & (y >= f.y1 - (fh - 1) * f.res)
            if np.any(inside):
                h = np.where(inside, f.sample(x, y), h)
        return h


class Ctx:
    def __init__(self):
        self.world_utm = bbox_utm()
        self.ox = 0.0
        self.oy = 0.0
        self.sources: dict[str, dict] = {}
        self.estimated: list[str] = []
        self.stats: dict[str, object] = {}

    # ---- coordinates -------------------------------------------------------
    def set_origin(self, x: float, y: float):
        self.ox, self.oy = round(x, 1), round(y, 1)
        minx, miny, maxx, maxy = self.world_utm
        self.lminx, self.lminy = minx - self.ox, miny - self.oy
        self.lmaxx, self.lmaxy = maxx - self.ox, maxy - self.oy
        # the tile grid lies entirely inside the downloaded bbox
        self.tx0 = math.ceil(self.lminx / TILE) * TILE
        self.ty0 = math.ceil(self.lminy / TILE) * TILE
        self.nx = math.floor((self.lmaxx - self.tx0) / TILE)
        self.ny = math.floor((self.lmaxy - self.ty0) / TILE)
        from shapely.geometry import box

        self.world_local = box(self.tx0, self.ty0, self.tx0 + self.nx * TILE, self.ty0 + self.ny * TILE)
        self.world_utm_tiles = affinity.translate(self.world_local, self.ox, self.oy)

    def local(self, geom):
        return affinity.translate(geom, -self.ox, -self.oy)

    def tile_of(self, x: float, y: float) -> int:
        """Tile index for local coords (row-major, j * nx + i)."""
        i = min(max(int((x - self.tx0) // TILE), 0), self.nx - 1)
        j = min(max(int((y - self.ty0) // TILE), 0), self.ny - 1)
        return j * self.nx + i

    def tile_bounds(self, t: int):
        i, j = t % self.nx, t // self.nx
        x0, y0 = self.tx0 + i * TILE, self.ty0 + j * TILE
        return x0, y0, x0 + TILE, y0 + TILE

    # ---- terrain (local coords) -------------------------------------------
    def h(self, x, y):
        return self.terrain.height(np.asarray(x) + self.ox, np.asarray(y) + self.oy)

    def source(self, key: str, **info):
        self.sources[key] = info


def find_origin(osm_feats, blocks_utm):
    """Centroid of the public space of Plaça de l'Església (space between the
    cadastral urban blocks around the OSM ways named after the square)."""
    ways = [f.geom for f in osm_feats if f.tags.get("name") == ORIGIN_WAY_NAME]
    if not ways:
        raise SystemExit("Plaça de l'Església not found in OSM")
    u = unary_union(ways)
    zone = u.buffer(25).difference(blocks_utm)
    # keep the connected piece that touches the named ways
    parts = getattr(zone, "geoms", [zone])
    best = max(parts, key=lambda p: p.intersection(u.buffer(2)).area)
    c = best.centroid
    return c.x, c.y, best


def point(x, y):
    return Point(x, y)
