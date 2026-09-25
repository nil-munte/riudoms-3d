# Riudoms 3D

Recreació 3D navegable de **Riudoms (Baix Camp)** feta amb dades obertes reals: plantes del Cadastre,
alçades del LiDAR de l'ICGC, ortofoto i relleu de l'ICGC, carrers d'OpenStreetMap i cultius declarats a la DUN.
És per passejar pel poble a peu o en bicicleta i reconèixer-lo. No té cap mecànica d'acció.

![Vite](https://img.shields.io/badge/Vite-8-646cff) ![Three.js](https://img.shields.io/badge/three.js-r186-000) ![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6)

## Posar-lo en marxa

```bash
npm install && npm run dev
```

Després obre <http://localhost:5173>. Les dades processades ja són a `public/data/`: no cal descarregar res per jugar.

## Controls

| Acció | Teclat / ratolí | Mòbil |
|---|---|---|
| Caminar | `W A S D` o fletxes | joystick esquerre |
| Córrer | `Shift` | botó *Córrer* |
| Pujar / baixar de la bicicleta | `E` a prop d'una bici | botó *E* |
| Càmera | ratolí (clica per capturar-lo) o arrossegar | arrossegar a la pantalla |
| Zoom | roda | pessic |
| Minimapa gran | `M` | — |
| Avançar una hora | `T` | — |
| Menú de pausa (controls, hora del dia, qualitat, teletransport, crèdits) | `Esc` / botó ☰ | botó ☰ |

Hi ha bicicletes aparcades a la plaça de l'Església, la de la Palmera, la de l'Om, la d'Arnau de Palomar,
el parc de Sant Antoni, la plaça de l'Arbre, el parc de la Via Romana i als aparcaments de bicis de l'OSM.
Quan t'acostes a un emblemàtic, apareix un rètol amb una dada històrica verificada.

## Build estàtica

```bash
npm run build     # genera dist/ (el web + public/data, ~23 MB)
npm run preview   # serveix dist/ a http://localhost:4173
```

`dist/` fa servir camins relatius (`base: './'`), de manera que es pot penjar a qualsevol servidor estàtic o carpeta.

## Regenerar les dades

Cal Python ≥ 3.11 (el primer cop es crea un `.venv/` amb `requirements.txt`) i uns 2,5 GB lliures per al LiDAR.

```bash
npm run data                 # descarrega el que falti a data/raw/ + processa → public/data/
npm run data -- --force      # torna a descarregar-ho tot
npm run data -- --no-lidar   # sense LiDAR (les alçades surten només del Cadastre)
npm run data:process         # només el processat (data/raw/ ha d'existir)
```

També es pot regenerar un sol pas:

```bash
.venv/Scripts/python.exe scripts/process.py --only streets,props
```

A Linux o macOS és `.venv/bin/python`.

### Pipeline (`scripts/`)

| Script | Què fa |
|---|---|
| `download_osm.py` | OSM via Overpass: tot l'àrea (per quadrants) i el límit municipal |
| `download_cadastre.py` | Cadastre INSPIRE (Riudoms = **43131** al Cadastre): edificis, parts, piscines, parcel·les i illes, i les fotos de façana |
| `download_icgc.py` | MET-5 de l'ICGC (WCS), ortofoto vigent a 25 cm i 1 m (WMS), fulls LiDAR d'1 km² |
| `download_opendata.py` | DUN 2025 (WFS, cultiu per parcel·la) i Equipaments de Catalunya |
| `process_lidar.py` | LiDAR → DSM de 0,5 m, MDT d'1 m, NDVI (banda NIR) i detecció de capçades d'arbre |
| `process.py` | Orquestrador: origen local a la plaça de l'Església, tessel·les de 250 m i els passos `p_*.py` |
| `p_terrain.py` | Model de terreny (MDT LiDAR de 2 m fos amb el MET-5) i ortofoto per tessel·la |
| `p_buildings.py` | Extrusió de les parts del Cadastre amb la teulada ajustada al LiDAR (plana / una aigua / dues aigües), color de teulada de l'ortofoto, color de façana de la foto del Cadastre, i classificació de cada paret (carrer / pati / mitgera) |
| `p_streets.py` | Espai públic real = buit entre illes del Cadastre → calçada, voreres, places, vorades, passos de vianants, marques vials |
| `p_nature.py` | Arbres (posició del LiDAR + espècie de la DUN), llits de riera, basses, piscines, camps per al minimapa |
| `p_props.py` | Bancs, fonts, papereres i parades (OSM) + fanals estimats + bicis |
| `p_landmarks.py` | Rètols, teletransports i paràmetres dels models propis (església, ermita, fonts, porxos...) |

Sortida a `public/data/`: `terrain.bin`, `streets.bin` i `nature.bin` fan servir un format binari petit (capçalera JSON + arrays tipats, vegeu `scripts/binfmt.py`). També hi ha `buildings.json`, `roads.json`, `fields.json`, `props.json`, `landmarks.json`, `meta.json` (fonts i estadístiques) i `ortho/t*.jpg`.

La recerca de patrimoni (`data/raw/heritage/`) és una dada curada, amb la font de cada fet. No es torna a descarregar automàticament: el web de l'IPAC i RACO bloquegen l'accés automatitzat. Els scripts que s'hi van fer servir són a `data/raw/heritage/sources/`.

## Estructura del codi (`src/`)

| Carpeta | Contingut |
|---|---|
| `data/` | Lectura del format binari i tipus de dades |
| `world/` | Terreny amb LOD, edificis amb shader de façana procedural, carrers, vegetació, aigua, mobiliari, emblemàtics, cel / cicle dia-nit, col·lisions |
| `player/` | Personatge low-poly amb animació procedural, controlador del jugador |
| `bike/` | Bicicleta: model i física |
| `camera/` | Càmera en tercera persona amb col·lisió BVH (three-mesh-bvh) |
| `minimap/` | Minimapa giratori generat a partir de les dades |
| `ui/` | HUD, rètols, menú de pausa |
| `input/` | Teclat, ratolí / pointer lock, controls tàctils |

### Rendiment

- Malles fusionades per blocs de 500 m (edificis, carrers, aigua) i instancing (arbres, balcons, mobiliari).
- Terreny en tessel·les de 250 m amb 4 nivells de detall, generats a demanda.
- Arbres amb 3 LOD, recalculats per distància i descartats per tessel·la contra el frustum.
- Resolució adaptativa: baixa el pixel ratio quan un fotograma passa de 22 ms.
- Mesurat en una AMD Radeon 740M integrada: ~14 ms per fotograma a peu de carrer, amb ombres.

## Dades i llicències

- © col·laboradors d'OpenStreetMap (ODbL).
- Dirección General del Catastro.
- Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0).
- Generalitat de Catalunya, dades obertes (DUN 2025, Equipaments).
- Wikimedia Commons (fotos de referència; autors i llicències a `data/raw/heritage/photos.json` i als crèdits del joc).

La llista completa del que és dada real i del que és estimat és a [CLAUDE.md](CLAUDE.md).
