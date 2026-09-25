"""Facade layouts read from the Cadastre facade photos (see facade_survey.md):
validation and normalisation of the survey records in data/work/facade_survey/.

A layout describes the street facade of one building as seen in its photo:
storeys, and for each storey the openings from left to right (type, centre and
width as fractions of the facade width), balconies, shutters, colours and
materials. p_buildings.py places it on the building's main street facade and
the facade shader (src/world/facade.ts) draws exactly those openings."""
from __future__ import annotations

import json
import re

from common import RAW
from ctx import WORK

GROUND_TYPES = {"door": 1, "arch_door": 2, "garage": 3, "arch_garage": 4, "shop": 5, "window": 6, "small": 7}
UPPER_TYPES = {"window": 6, "small": 7, "balcony": 8, "gallery": 9, "terrace": 10, "door": 8}
BALCONY = {"none": 0, "individual": 1, "continuous": 2}
SHUTTERS = {"none": 0, "wood_slat": 1, "roller": 2, "mixed": 3}
RAILING = {"none": 0, "iron": 1, "glass": 2, "masonry": 3}
WALL_MAT = {"stucco": 0, "stone": 1, "brick": 2, "tile": 3, "concrete": 4, "block": 5}
PLINTH_MAT = {"none": 0, "paint": 1, "stone": 2, "tile": 3}
ROOF = {"unknown": 0, "eave": 1, "cornice": 2, "parapet": 3}
MAX_OPEN = 15
MAX_FLOORS = 8

_HEX = re.compile(r"^#?[0-9a-fA-F]{6}$")


def _hex(v, default=None):
    if isinstance(v, str) and _HEX.match(v.strip()):
        s = v.strip().lstrip("#").lower()
        return "#" + s
    return default


def _f(v, lo, hi, default):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return min(max(x, lo), hi)


def _openings(lst, types):
    out = []
    for o in lst or []:
        if not isinstance(o, dict):
            continue
        t = types.get(str(o.get("t", "")).strip().lower())
        if not t:
            continue
        w = _f(o.get("w"), 0.02, 1.0, 0.12)
        x = _f(o.get("x"), w / 2, 1 - w / 2, 0.5)
        out.append([t, round(x, 3), round(w, 3)])
    out.sort(key=lambda o: o[1])
    # drop overlapping duplicates (keep the wider)
    clean = []
    for o in out:
        if clean and abs(o[1] - clean[-1][1]) < (o[2] + clean[-1][2]) / 4:
            if o[2] > clean[-1][2]:
                clean[-1] = o
            continue
        clean.append(o)
    return clean[:MAX_OPEN]


def normalise(r: dict) -> dict | None:
    """Compact layout for buildings.json, or None when the record is not usable."""
    # "unclear" targets are kept: the readers still describe the most likely building
    # (checked against the neighbouring photos); they are flagged like occluded ones
    if not isinstance(r, dict) or not r.get("usable", True):
        return None
    ground = _openings(r.get("ground"), GROUND_TYPES)
    upper = []
    for fl in (r.get("upper") or [])[: MAX_FLOORS - 1]:
        if not isinstance(fl, dict):
            continue
        bal = BALCONY.get(str(fl.get("bal", "none")).lower(), 0)
        bx0 = _f(fl.get("bx0"), 0, 1, 0.0)
        bx1 = _f(fl.get("bx1"), 0, 1, 1.0)
        ops = _openings(fl.get("o"), UPPER_TYPES)
        if bal == 2 and bx1 - bx0 < 0.05:
            xs = [o[1] - o[2] / 2 for o in ops if o[0] == 8] + [o[1] + o[2] / 2 for o in ops if o[0] == 8]
            bx0, bx1 = (min(xs) - 0.04, max(xs) + 0.04) if xs else (0.05, 0.95)
        upper.append({"o": ops, "b": bal, "b0": round(bx0, 3), "b1": round(bx1, 3)})
    floors = int(_f(r.get("floors"), 1, MAX_FLOORS, 1 + len(upper)))
    floors = max(floors, 1 + len(upper)) if upper else floors
    if not ground and not upper:
        return None
    pl = r.get("plinth") or {}
    return {
        "n": floors,
        "at": 1 if r.get("attic") else 0,
        "g": ground,
        "u": upper,
        "wall": _hex(r.get("wall")),
        "wm": WALL_MAT.get(str(r.get("wall_material", "stucco")).lower(), 0),
        "gw": _hex(r.get("ground_wall")),
        "gm": WALL_MAT.get(str(r.get("ground_material") or "").lower(), -1),
        "ph": round(_f(pl.get("h"), 0, 2.5, 0.0), 2) if pl.get("material") not in (None, "none") else 0.0,
        "pc": _hex(pl.get("color"), "#8f887c"),
        "pm": PLINTH_MAT.get(str(pl.get("material", "none")).lower(), 0),
        "fr": _hex(r.get("frame"), "#e8e6e0"),
        "sh": SHUTTERS.get(str(r.get("shutters", "none")).lower(), 0),
        "sc": _hex(r.get("shutter")),
        "dc": _hex(r.get("door"), "#5b4632"),
        "su": 1 if r.get("surrounds") else 0,
        "rl": RAILING.get(str(r.get("railing", "iron")).lower(), 1),
        "rf": ROOF.get(str(r.get("roof", "unknown")).lower(), 0),
        "oc": 1 if r.get("occluded") or r.get("target") == "unclear" else 0,
    }


def load_layouts() -> dict[str, dict]:
    """ref -> normalised layout, from every data/work/facade_survey/batch_*.json."""
    d = RAW / "facade_survey"  # curated survey (committed); work copy while a survey is running
    if not d.exists() or not any(d.glob("batch_*.json")):
        d = WORK / "facade_survey"
    out: dict[str, dict] = {}
    raw = 0
    for f in sorted(d.glob("batch_*.json")) if d.exists() else []:
        try:
            recs = json.load(open(f, encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
        for r in recs if isinstance(recs, list) else []:
            raw += 1
            ref = r.get("ref") if isinstance(r, dict) else None
            lay = normalise(r) if ref else None
            if lay:
                out[ref] = lay
    load_layouts.raw = raw
    return out
