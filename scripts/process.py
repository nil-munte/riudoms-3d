"""Build the optimised world files in public/data/ from data/raw/.

Run through `npm run data` (downloads + processing) or directly:
    python scripts/process.py
"""
from __future__ import annotations

import json
import time
from datetime import date

from shapely.ops import unary_union

from common import OUT, REF_LAT, REF_LON, save_json
from ctx import TILE, Ctx, find_origin
from loaders import (load_boundary, load_cadastre_buildings, load_cadastre_other, load_cadastre_parcels,
                     load_cadastre_zoning, load_dun, load_equipaments, load_osm, world_polygon)


def step(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def main(only: set[str] | None = None) -> None:
    """Run the whole pipeline, or only the named steps (terrain, ortho,
    buildings, streets, nature, props, landmarks, relief) with --only a,b,c."""
    run = (lambda name: only is None or name in only)
    import p_buildings
    import p_facades
    import p_landmarks
    import p_nature
    import p_relief
    import p_props
    import p_streets
    import p_terrain

    OUT.mkdir(parents=True, exist_ok=True)
    ctx = Ctx()
    W = world_polygon()

    step("loading OSM")
    ctx.osm = load_osm()
    ctx.boundary = load_boundary()
    ctx.source("osm", name="OpenStreetMap (Overpass API)", license="ODbL 1.0, © OpenStreetMap contributors",
               url="https://overpass-api.de/", elements=len(ctx.osm))
    step("loading Cadastre")
    ctx.buildings, ctx.parts = load_cadastre_buildings(W)
    ctx.pools = load_cadastre_other(W)
    ctx.parcels = load_cadastre_parcels(W)
    zoning = load_cadastre_zoning(W)
    blocks = unary_union([g for lvl, g in zoning if lvl == "MANZANA"]).buffer(0)
    ctx.blocks_utm = blocks
    ctx.source("cadastre", name="Dirección General del Catastro, INSPIRE Buildings + Cadastral Parcels (43131 Riudoms)",
               url="https://www.catastro.hacienda.gob.es/INSPIRE/", license="Font: Dirección General del Catastro",
               buildings=len(ctx.buildings), parts=len(ctx.parts))
    step("loading open data")
    ctx.dun = load_dun()
    ctx.equip = load_equipaments()
    ctx.source("dun2025", name="Mapa de parcel·les i cultius DUN 2025 (Departament d'Agricultura)",
               url="https://sig.gencat.cat/ows/AGRICULTURA/wfs", license="CC BY 4.0 Generalitat de Catalunya")
    ctx.source("equipaments", name="Equipaments de Catalunya (Dades obertes Generalitat)",
               url="https://analisi.transparenciacatalunya.cat/d/8gmd-gz7i", license="CC BY 4.0")

    step("origin: Plaça de l'Església")
    ox, oy, plaza = find_origin(ctx.osm, blocks)
    ctx.set_origin(ox, oy)
    ctx.plaza_esglesia_utm = plaza
    print(f"  origin UTM {ctx.ox}, {ctx.oy}; tiles {ctx.nx}x{ctx.ny} of {TILE} m")

    step("terrain")
    ctx.terrain = p_terrain.build_terrain_model(ctx)
    if run("terrain"):
        p_terrain.export_terrain(ctx)
    urban = blocks.buffer(30)
    step("orthophoto tiles")
    p_terrain.export_ortho(ctx, urban, write=run("ortho"))

    step("landmarks")
    landmarks = p_landmarks.resolve(ctx)
    step("facade colours")
    fcols = p_facades.facade_colors()
    ctx.source("facades", name="Fotografies de façana del Cadastre (color de façana i persianes)",
               url="https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc", photos=len(fcols))
    if run("buildings"):
        step("buildings")
        bdata = p_buildings.process_buildings(ctx, blocks, ctx.osm, fcols, landmarks["refs"])
        save_json(OUT / "buildings.json", bdata)
    sdata = None
    if run("streets") or run("props") or run("nature"):
        step("streets")
        sdata = p_streets.process_streets(ctx)
    if run("nature"):
        step("nature")
        p_nature.process_nature(ctx)
    if run("props"):
        step("props")
        p_props.process_props(ctx, sdata)
    if run("landmarks") or run("relief"):
        step("landmarks export")
        p_landmarks.export(ctx, landmarks)
    if run("relief"):
        step("relief (level changes)")
        if sdata is None:
            sdata = p_streets.process_streets(ctx)
        p_relief.process_relief(ctx, sdata)

    # keep statistics of the steps that were not re-run
    stats = {}
    if only is not None and (OUT / "meta.json").exists():
        stats = json.load(open(OUT / "meta.json", encoding="utf-8")).get("stats", {})
    stats.update(ctx.stats)
    meta = {
        "generated": date.today().isoformat(),
        "origin_utm": [ctx.ox, ctx.oy],
        "crs": "EPSG:25831 (ETRS89 / UTM 31N) shifted to the origin; x = east, y = north (m)",
        "reference_point_wgs84": [REF_LAT, REF_LON],
        "tile": TILE,
        "tiles": {"x0": ctx.tx0, "y0": ctx.ty0, "nx": ctx.nx, "ny": ctx.ny, "ortho_px": ctx.ortho_sizes},
        "sources": ctx.sources,
        "stats": stats,
    }
    save_json(OUT / "meta.json", meta)
    with open(OUT.parent.parent / "data" / "work" / "stats.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)
    step("done")


if __name__ == "__main__":
    import sys

    only = None
    if "--only" in sys.argv:
        only = set(sys.argv[sys.argv.index("--only") + 1].split(","))
    main(only)
