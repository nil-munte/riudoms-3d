"""Download the Spanish Cadastre INSPIRE datasets for Riudoms.

Note: the Cadastre uses its own municipality codes. INE 43129 (Riudoms) is
Cadastre 43131; Cadastre 43129 is Riudecanyes. We therefore locate the entry
by name in the province ATOM feeds instead of trusting a hard-coded code.

Buildings (BU) ZIP:
  - Building          (outline, dateOfConstruction, currentUse, ...)
  - BuildingPart      (parts with numberOfFloorsAboveGround / BelowGround)
  - OtherConstruction (pools, sheds, ...)
Cadastral parcels (CP) ZIP:
  - CadastralParcel   (private plots; public space = the gaps between them)
  - CadastralZoning   (urban blocks "manzanas" and rural polygons)
"""
from __future__ import annotations

import re
import sys
import zipfile

from common import RAW, http_get

FEEDS = {
    "BU": "https://www.catastro.hacienda.gob.es/INSPIRE/buildings/43/ES.SDGC.bu.atom_43.xml",
    "CP": "https://www.catastro.hacienda.gob.es/INSPIRE/CadastralParcels/43/ES.SDGC.CP.atom_43.xml",
}
MUNI_NAME = "RIUDOMS"


def fetch(kind: str, url: str, force: bool) -> None:
    out = RAW / "cadastre"
    out.mkdir(parents=True, exist_ok=True)
    atom_path = out / f"atom_43_{kind}.xml"
    if force or not atom_path.exists():
        print(f"Cadastre {kind}: downloading province ATOM feed")
        atom_path.write_bytes(http_get(url).content)
    atom = atom_path.read_text(encoding="utf-8", errors="replace")
    m = re.search(r'href="([^"]+/(\d{5})-' + MUNI_NAME + r'/[^"]+\.zip)"', atom)
    if not m:
        raise SystemExit(f"Riudoms not found in the Cadastre {kind} ATOM feed")
    zurl, code = m.group(1), m.group(2)
    print(f"Cadastre {kind}: {MUNI_NAME} = cadastre code {code}")
    zpath = out / zurl.rsplit("/", 1)[1]
    if force or not zpath.exists():
        print("  downloading", zurl)
        zpath.write_bytes(http_get(zurl, timeout=600).content)
    with zipfile.ZipFile(zpath) as z:
        z.extractall(out / "gml")
        print("  files:", z.namelist())


FACADE = ("https://ovc.catastro.meh.es/OVCServWeb/OVCWcfLibres/OVCFotoFachada.svc/"
          "RecuperarFotoFachadaGet?ReferenciaCatastral={ref}")


def fetch_facades(force: bool) -> None:
    """Facade photo of every urban building (the Building features link them).
    Used only to extract the real wall / shutter colours. Rural buildings
    (references 43131A...) are skipped."""
    import time
    from concurrent.futures import ThreadPoolExecutor

    from loaders import load_cadastre_buildings, world_polygon

    out = RAW / "cadastre" / "facades"
    out.mkdir(parents=True, exist_ok=True)
    buildings, _ = load_cadastre_buildings(world_polygon())
    refs = sorted(r for r in buildings if not re.match(r"^\d{5}[A-Z]\d", r))
    todo = [r for r in refs if force or not (out / f"{r}.jpg").exists() and not (out / f"{r}.none").exists()]
    print(f"Cadastre facades: {len(refs)} urban buildings, {len(todo)} to download")

    def one(ref):
        try:
            r = http_get(FACADE.format(ref=ref), timeout=60, headers={"User-Agent": "Mozilla/5.0"})
            if r.content[:2] == b"\xff\xd8":
                (out / f"{ref}.jpg").write_bytes(r.content)
            else:
                (out / f"{ref}.none").write_text("no photo")
        except Exception as e:  # keep going, mark as missing
            (out / f"{ref}.none").write_text(str(e)[:200])
        time.sleep(0.15)

    with ThreadPoolExecutor(3) as ex:
        for i, _ in enumerate(ex.map(one, todo)):
            if i % 200 == 0:
                print(f"  {i}/{len(todo)}")


def main(argv) -> None:
    force = "--force" in argv
    for kind, url in FEEDS.items():
        fetch(kind, url, force)
    if "--no-facades" not in argv:
        fetch_facades(force)


if __name__ == "__main__":
    main(sys.argv[1:])
