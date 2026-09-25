"""Terrain: combined height model + orthophoto texture per world tile."""
from __future__ import annotations

import json

import numpy as np
from PIL import Image

from binfmt import write_bin
from common import OUT, RAW
from ctx import TILE, WORK, Ctx, TerrainModel
from loaders import Grid, load_dem

BLEND = 60.0  # metres over which the LiDAR DTM fades into MET-5 at its border


def build_terrain_model(ctx: Ctx) -> TerrainModel:
    coarse = load_dem()
    ctx.source("terrain_met5", name="ICGC MET-5 (Model d'Elevacions del Terreny 5x5 m)",
               url="https://geoserveis.icgc.cat/icc_mdt/wcs/service", license="CC BY 4.0 ICGC")
    lp = WORK / "lidar.npz"
    fine = None
    if lp.exists():
        d = np.load(lp)
        dtm1 = d["dtm"]
        h, w = dtm1.shape
        dtm2 = dtm1[: h // 2 * 2, : w // 2 * 2].reshape(h // 2, 2, w // 2, 2).mean(axis=(1, 3))
        fine = Grid(dtm2.astype(np.float32), float(d["x0"]), float(d["y1"]), 2.0)
        # vertical consistency check with MET-5 and edge blending
        fh, fw = fine.shape
        xs = fine.x0 + (np.arange(fw) + 0.5) * 2.0
        ys = fine.y1 - (np.arange(fh) + 0.5) * 2.0
        X, Y = np.meshgrid(xs, ys)
        C = coarse.sample(X, Y).astype(np.float32)
        diff = float(np.median(fine.data - C))
        ctx.stats["lidar_vs_met5_median_diff_m"] = round(diff, 3)
        edge = np.minimum.reduce([X - xs[0], xs[-1] - X, ys[0] - Y, Y - ys[-1]])
        wgt = np.clip(edge / BLEND, 0, 1).astype(np.float32)
        fine.data = (fine.data * wgt + C * (1 - wgt)).astype(np.float32)
        ctx.source("terrain_lidar", name="ICGC LiDAR territorial (3a cobertura), punts de terreny (classe 2) → MDT 1 m (nucli) i 2 m",
                   url="https://datacloud.icgc.cat/datacloud/lidar-territorial/", license="CC BY 4.0 ICGC")
        # 1 m DTM over the built-up area (+40 m), blended into the 2 m grid over its last 12 m
        bx0, by0, bx1, by1 = ctx.blocks_utm.buffer(40).bounds
        X0, Y1 = float(d["x0"]), float(d["y1"])
        c0, c1 = max(int(bx0 - X0), 0), min(int(bx1 - X0), w)
        r0, r1 = max(int(Y1 - by1), 0), min(int(Y1 - by0), h)
        sub = dtm1[r0:r1, c0:c1].astype(np.float32)
        g1 = Grid(sub, X0 + c0, Y1 - r0, 1.0)
        sh, sw = sub.shape
        xs1 = g1.x0 + (np.arange(sw) + 0.5)
        ys1 = g1.y1 - (np.arange(sh) + 0.5)
        X1g, Y1g = np.meshgrid(xs1, ys1)
        F2 = fine.sample(X1g, Y1g).astype(np.float32)
        edge = np.minimum.reduce([X1g - xs1[0], xs1[-1] - X1g, ys1[0] - Y1g, Y1g - ys1[-1]])
        wg = np.clip(edge / 12.0, 0, 1).astype(np.float32)
        g1.data = (sub * wg + F2 * (1 - wg)).astype(np.float32)
        return TerrainModel(coarse, fine, g1)
    return TerrainModel(coarse, fine)


def export_terrain(ctx: Ctx) -> None:
    tm = ctx.terrain
    arrays, meta = {}, {"grids": []}
    for name, g in (("coarse", tm.coarse), ("fine", tm.fine), ("fine1", tm.fine1)):
        if g is None:
            continue
        # crop the coarse grid to the world bbox (+1 cell)
        a = g.data
        x0, y1 = g.x0, g.y1
        hmin = float(np.floor(np.nanmin(a)))
        q = np.clip(np.round((a - hmin) * 100), 0, 65535).astype(np.uint16)
        arrays[name] = q
        meta["grids"].append({
            "name": name, "x0": round(x0 - ctx.ox, 3), "y1": round(y1 - ctx.oy, 3), "res": g.res,
            "w": int(a.shape[1]), "h": int(a.shape[0]), "hmin": hmin, "scale": 0.01,
        })
    size = write_bin(OUT / "terrain.bin", arrays, meta)
    ctx.stats["terrain_bin_bytes"] = size


# ---------------------------------------------------------------------------
# Orthophoto textures
# ---------------------------------------------------------------------------

class OrthoMosaic:
    def __init__(self, name: str):
        idx = json.load(open(RAW / "icgc" / "orto" / f"{name}.json"))
        self.tiles = idx["tiles"]
        self.res = self.tiles[0]["res"]
        xs = [t["bbox"][0] for t in self.tiles] + [t["bbox"][2] for t in self.tiles]
        ys = [t["bbox"][1] for t in self.tiles] + [t["bbox"][3] for t in self.tiles]
        self.x0, self.x1, self.y0, self.y1 = min(xs), max(xs), min(ys), max(ys)
        w = round((self.x1 - self.x0) / self.res)
        h = round((self.y1 - self.y0) / self.res)
        img = Image.new("RGB", (w, h))
        for t in self.tiles:
            im = Image.open(RAW / "icgc" / "orto" / t["file"]).convert("RGB")
            img.paste(im, (round((t["bbox"][0] - self.x0) / self.res), round((self.y1 - t["bbox"][3]) / self.res)))
        self.img = img
        self.arr = np.asarray(img)

    def contains(self, x0, y0, x1, y1):
        return x0 >= self.x0 and x1 <= self.x1 and y0 >= self.y0 and y1 <= self.y1

    def crop(self, x0, y0, x1, y1, px):
        box = ((x0 - self.x0) / self.res, (self.y1 - y1) / self.res, (x1 - self.x0) / self.res, (self.y1 - y0) / self.res)
        return self.img.resize((px, px), Image.LANCZOS, box=box)


def export_ortho(ctx: Ctx, urban_utm, write: bool = True) -> None:
    """One JPEG per world tile. Tiles close to the built-up area get 512 px
    (~0.5 m/px, from the 25 cm ortho), the rest 256 px (~1 m/px)."""
    core = OrthoMosaic("core")
    wide = OrthoMosaic("wide")
    ctx.core_ortho, ctx.wide_ortho = core, wide
    ctx.source("ortho", name="ICGC Ortofoto de Catalunya vigent (25 cm i 1 m)",
               url="https://geoserveis.icgc.cat/servei/catalunya/orto-territorial/wms", layer="ortofoto_color_vigent",
               license="CC BY 4.0 ICGC")
    out = OUT / "ortho"
    out.mkdir(parents=True, exist_ok=True)
    from shapely.geometry import box

    near = urban_utm.buffer(200)
    sizes = []
    for t in range(ctx.nx * ctx.ny):
        x0, y0, x1, y1 = ctx.tile_bounds(t)
        X0, Y0, X1, Y1 = x0 + ctx.ox, y0 + ctx.oy, x1 + ctx.ox, y1 + ctx.oy
        hi = box(X0, Y0, X1, Y1).intersects(near) and core.contains(X0, Y0, X1, Y1)
        src = core if hi else wide
        px = 512 if hi else 256
        if write or not (out / f"t{t}.jpg").exists():
            im = src.crop(X0, Y0, X1, Y1, px)
            im.save(out / f"t{t}.jpg", quality=82, optimize=True)
        sizes.append(px)
    ctx.ortho_sizes = sizes
