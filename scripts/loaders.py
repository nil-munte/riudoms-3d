"""Readers for the raw datasets in data/raw/. All geometry is returned in
EPSG:25831 (ETRS89 / UTM 31N) metres; the processing step shifts it to the
local origin."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from lxml import etree
from pyproj import Transformer
from shapely.geometry import LineString, MultiPolygon, Point, Polygon, box
from shapely.ops import unary_union

from common import RAW, EPSG_UTM, load_json

NS = {
    "gml": "http://www.opengis.net/gml/3.2",
    "bu-core2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-core2d/2.0",
    "bu-ext2d": "http://inspire.jrc.ec.europa.eu/schemas/bu-ext2d/2.0",
    "base": "urn:x-inspire:specification:gmlas:BaseTypes:3.2",
    "cp": "http://inspire.ec.europa.eu/schemas/cp/4.0",
    "gmd": "http://www.isotc211.org/2005/gmd",
}

_to_utm = Transformer.from_crs(4326, EPSG_UTM, always_xy=True)


def lonlat_to_utm(lon, lat):
    return _to_utm.transform(lon, lat)


# --------------------------------------------------------------------------
# Cadastre GML
# --------------------------------------------------------------------------

def _poslist(el) -> list[tuple[float, float]]:
    v = el.text.split()
    return [(float(v[i]), float(v[i + 1])) for i in range(0, len(v) - 1, 2)]


def _surface_polys(geom_el) -> list[Polygon]:
    polys = []
    patches = list(geom_el.iter("{%s}PolygonPatch" % NS["gml"], "{%s}Polygon" % NS["gml"]))
    for patch in patches:
        ext = patch.find("gml:exterior//gml:posList", NS)
        if ext is None:
            continue
        holes = [_poslist(h) for h in patch.findall("gml:interior//gml:posList", NS)]
        p = Polygon(_poslist(ext), holes)
        if not p.is_valid:
            p = p.buffer(0)
        if not p.is_empty:
            polys.append(p)
    return polys


def _text(el, path):
    x = el.find(path, NS)
    return x.text.strip() if x is not None and x.text else None


def _iter(path: Path, tag: str):
    for _, el in etree.iterparse(str(path), tag=tag, huge_tree=True):
        yield el
        el.clear()


@dataclass
class CadBuilding:
    id: str
    geom: Polygon | MultiPolygon
    use: str | None
    year: int | None
    condition: str | None
    dwellings: int | None
    area: float | None
    parts: list = field(default_factory=list)


@dataclass
class CadPart:
    id: str
    building: str
    geom: Polygon
    floors: int | None
    floors_below: int | None


def load_cadastre_buildings(clip: Polygon | None = None):
    gml = RAW / "cadastre" / "gml"
    bpath = next(gml.glob("*.building.gml"))
    ppath = next(gml.glob("*.buildingpart.gml"))
    buildings: dict[str, CadBuilding] = {}
    for el in _iter(bpath, "{%s}Building" % NS["bu-ext2d"]):
        lid = _text(el, "bu-core2d:inspireId//base:localId")
        polys = _surface_polys(el.find("bu-ext2d:geometry", NS))
        if not polys:
            continue
        g = polys[0] if len(polys) == 1 else MultiPolygon(polys)
        if clip is not None and not g.intersects(clip):
            continue
        year = _text(el, "bu-core2d:dateOfConstruction//bu-core2d:beginning")
        dw = _text(el, "bu-ext2d:numberOfDwellings")
        area = _text(el, "bu-ext2d:officialArea//bu-ext2d:value")
        buildings[lid] = CadBuilding(
            id=lid,
            geom=g,
            use=_text(el, "bu-ext2d:currentUse"),
            year=int(year[:4]) if year and year[:4].isdigit() else None,
            condition=_text(el, "bu-core2d:conditionOfConstruction"),
            dwellings=int(dw) if dw and dw.isdigit() else None,
            area=float(area) if area else None,
        )
    parts: list[CadPart] = []
    for el in _iter(ppath, "{%s}BuildingPart" % NS["bu-ext2d"]):
        lid = _text(el, "bu-core2d:inspireId//base:localId")
        bid = lid.split("_part")[0]
        if bid not in buildings:
            continue
        fa = _text(el, "bu-ext2d:numberOfFloorsAboveGround")
        fb = _text(el, "bu-ext2d:numberOfFloorsBelowGround")
        for p in _surface_polys(el.find("bu-ext2d:geometry", NS)):
            for q in (p.geoms if isinstance(p, MultiPolygon) else [p]):
                cp = CadPart(lid, bid, q, int(fa) if fa else None, int(fb) if fb else None)
                parts.append(cp)
                buildings[bid].parts.append(cp)
    return buildings, parts


def load_cadastre_other(clip: Polygon | None = None):
    """OtherConstruction features (mostly swimming pools and sheds)."""
    gml = RAW / "cadastre" / "gml"
    path = next(gml.glob("*.otherconstruction.gml"))
    out = []
    tag = None
    # the element name differs between versions; detect it
    for _, el in etree.iterparse(str(path), events=("start",)):
        if el.tag.endswith("OtherConstruction") and "}" in el.tag:
            tag = el.tag
            break
    if tag is None:
        return out
    for el in _iter(path, tag):
        nature = _text(el, "bu-ext2d:constructionNature")
        for p in _surface_polys(el):
            if clip is None or p.intersects(clip):
                out.append((nature, p))
    return out


def load_cadastre_parcels(clip: Polygon | None = None):
    gml = RAW / "cadastre" / "gml"
    path = next(gml.glob("*.cadastralparcel.gml"))
    out = []
    for el in _iter(path, "{%s}CadastralParcel" % NS["cp"]):
        ref = _text(el, "cp:nationalCadastralReference")
        polys = _surface_polys(el)
        for p in polys:
            if clip is None or p.intersects(clip):
                out.append((ref, p))
    return out


def load_cadastre_zoning(clip: Polygon | None = None):
    """Urban blocks (MANZANA) and rural polygons (POLIGONO)."""
    gml = RAW / "cadastre" / "gml"
    path = next(gml.glob("*.cadastralzoning.gml"))
    out = []
    for el in _iter(path, "{%s}CadastralZoning" % NS["cp"]):
        level = None
        for sub in el.iter():
            if isinstance(sub.tag, str) and sub.tag.endswith("LocalisedCharacterString"):
                level = (sub.text or "").strip()
        for p in _surface_polys(el):
            if clip is None or p.intersects(clip):
                out.append((level, p))
    return out


# --------------------------------------------------------------------------
# OpenStreetMap (Overpass JSON with inline geometry)
# --------------------------------------------------------------------------

@dataclass
class OsmFeature:
    type: str
    id: int
    tags: dict
    geom: object  # shapely geometry in UTM


def _way_coords(el):
    return [lonlat_to_utm(p["lon"], p["lat"]) for p in el.get("geometry", []) if p]


def _ring_is_closed(el):
    nodes = el.get("nodes", [])
    return len(nodes) > 3 and nodes[0] == nodes[-1]


AREA_KEYS = {"building", "landuse", "leisure", "natural", "amenity", "area:highway", "place",
             "man_made", "historic", "tourism", "landcover", "parking", "shop"}


def _assemble_rings(ways):
    """Join multipolygon member ways into closed rings."""
    from shapely.ops import linemerge, polygonize

    lines = [LineString(w) for w in ways if len(w) >= 2]
    if not lines:
        return []
    merged = linemerge(lines)
    return list(polygonize(merged))


def load_osm():
    data = load_json(RAW / "osm" / "area.json")
    feats: list[OsmFeature] = []
    for el in data["elements"]:
        tags = el.get("tags", {})
        t = el["type"]
        if t == "node":
            x, y = lonlat_to_utm(el["lon"], el["lat"])
            feats.append(OsmFeature("node", el["id"], tags, Point(x, y)))
        elif t == "way":
            c = _way_coords(el)
            if len(c) < 2:
                continue
            is_area = _ring_is_closed(el) and (
                tags.get("area") == "yes"
                or (any(k in tags for k in AREA_KEYS) and tags.get("area") != "no")
                or (tags.get("highway") in ("pedestrian", "footway") and tags.get("area") == "yes")
            )
            if is_area and len(c) >= 4:
                g = Polygon(c)
                if not g.is_valid:
                    g = g.buffer(0)
            else:
                g = LineString(c)
            feats.append(OsmFeature("way", el["id"], tags, g))
        elif t == "relation" and tags.get("type") == "multipolygon":
            outers = [_way_coords(m) for m in el.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
            inners = [_way_coords(m) for m in el.get("members", []) if m.get("role") == "inner" and m.get("geometry")]
            po = _assemble_rings(outers)
            pi = _assemble_rings(inners)
            if not po:
                continue
            g = unary_union(po)
            if pi:
                g = g.difference(unary_union(pi))
            feats.append(OsmFeature("relation", el["id"], tags, g))
    return feats


def load_boundary():
    data = load_json(RAW / "osm" / "boundary.json")
    rel = data["elements"][0]
    outers = [_way_coords(m) for m in rel.get("members", []) if m.get("role") == "outer" and m.get("geometry")]
    return unary_union(_assemble_rings(outers))


# --------------------------------------------------------------------------
# Rasters
# --------------------------------------------------------------------------

@dataclass
class Grid:
    data: np.ndarray  # row 0 = north
    x0: float  # west edge
    y1: float  # north edge
    res: float

    @property
    def shape(self):
        return self.data.shape

    def sample(self, x, y):
        """Bilinear sample at UTM coords (arrays ok), cell-centre registered."""
        x = np.asarray(x, dtype=np.float64)
        y = np.asarray(y, dtype=np.float64)
        c = (x - self.x0) / self.res - 0.5
        r = (self.y1 - y) / self.res - 0.5
        h, w = self.data.shape
        c = np.clip(c, 0, w - 1.001)
        r = np.clip(r, 0, h - 1.001)
        c0 = np.floor(c).astype(int)
        r0 = np.floor(r).astype(int)
        fc = c - c0
        fr = r - r0
        d = self.data
        v = (d[r0, c0] * (1 - fc) * (1 - fr) + d[r0, c0 + 1] * fc * (1 - fr)
             + d[r0 + 1, c0] * (1 - fc) * fr + d[r0 + 1, c0 + 1] * fc * fr)
        return v


def load_dem() -> Grid:
    import rasterio

    with rasterio.open(RAW / "icgc" / "met5.asc") as ds:
        a = ds.read(1).astype(np.float32)
        nod = ds.nodata
        t = ds.transform
    if nod is not None:
        m = a == nod
        if m.any():
            a[m] = np.nan
            # fill holes with the mean of valid neighbours (rare at the edges)
            a = np.where(np.isnan(a), np.nanmean(a), a)
    return Grid(a, t.c, t.f, t.a)


def load_dun():
    from shapely.geometry import shape

    data = load_json(RAW / "opendata" / "dun2025.json")
    out = []
    for f in data["features"]:
        g = shape(f["geometry"])
        if not g.is_valid:
            g = g.buffer(0)
        out.append((f["properties"], g))
    return out


def load_equipaments():
    out = []
    for e in load_json(RAW / "opendata" / "equipaments.json"):
        try:
            lat, lon = float(e["latitud"]), float(e["longitud"])
        except (KeyError, TypeError, ValueError):
            continue
        if not (40.5 < lat < 42.9 and 0.1 < lon < 3.4):  # discard broken coordinates
            continue
        x, y = lonlat_to_utm(lon, lat)
        out.append((e, Point(x, y)))
    return out


def world_polygon():
    from common import bbox_utm

    return box(*bbox_utm())
