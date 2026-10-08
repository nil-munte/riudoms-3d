# Riudoms 3D

Recreació 3D navegable de **Riudoms (Baix Camp)** feta amb dades obertes reals: plantes del Cadastre,
alçades del LiDAR de l'ICGC, ortofoto i relleu de l'ICGC, carrers d'OpenStreetMap i cultius declarats a la DUN.
És per passejar pel poble a peu o en bicicleta i reconèixer-lo. No té cap mecànica d'acció.

Tot el projecte l'ha fet una IA, **Claude Opus 5.5** (Anthropic) amb Claude Code, a partir d'un encàrrec i de les revisions de Nil Munté:
la recerca i la descàrrega de les dades, el pipeline, el joc, la lectura de les fotos de façana i el vídeo de demostració.

![Vite](https://img.shields.io/badge/Vite-8-646cff) ![Three.js](https://img.shields.io/badge/three.js-r186-000) ![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6)

## Provar-lo

### Requisits

| | Mínim | Notes |
|---|---|---|
| Navegador | Chrome, Edge, Firefox o Safari recents amb **WebGL2** | També funciona al mòbil, amb controls tàctils |
| Gràfica | Integrada moderna | Mesurat en una AMD Radeon 740M integrada: ~9 ms per fotograma a peu de carrer, amb ombres, a 1280×720. La resolució s'adapta sola si l'equip va just |
| Memòria | ~160 MB de memòria del navegador | Mesura de la memòria JavaScript un cop carregat el poble |
| Descàrrega | ~27 MB de dades la primera vegada | Edificis, carrers, relleu i ortofoto del nucli (42 fitxers) |
| Per executar-lo en local | [Node.js](https://nodejs.org/) 20.19 o més nou | Git és opcional (es pot baixar en ZIP) |
| Per regenerar les dades | Python 3.11 o més nou i ~2,5 GB de disc | Només si vols tornar a processar les dades des de zero |

No cal cap clau d'API ni cap compte.

### 1. Al navegador, sense instal·lar res

**▶ <https://nil-munte.github.io/riudoms-3d/>**

Funciona en qualsevol navegador modern amb WebGL2 (Chrome, Edge, Firefox o Safari recents), també al mòbil.
La primera càrrega baixa uns 25 MB de dades.

### 2. En local, des del codi

Cal tenir **[Node.js](https://nodejs.org/) 20.19 o més nou** (la versió LTS ja serveix) i, opcionalment, Git.

1. Descarrega el projecte: o bé el clones,

   ```bash
   git clone https://github.com/nil-munte/riudoms-3d.git
   ```

   o bé el baixes en ZIP (botó verd **Code → Download ZIP** de GitHub) i el descomprimeixes.
2. Entra a la carpeta i instal·la les dependències (només el primer cop):

   ```bash
   cd riudoms-3d
   npm install
   ```

3. Arrenca'l:

   ```bash
   npm run dev
   ```

4. Obre <http://localhost:5173> al navegador.

Les dades processades ja són a `public/data/`: no cal descarregar res més ni tenir Python.
Python només cal per [regenerar les dades](#regenerar-les-dades) des de zero.

### 3. Com a web estàtica pròpia

```bash
npm run build     # genera dist/ (el web + les dades, ~28 MB)
npm run preview   # la serveix a http://localhost:4173
```

`dist/` fa servir camins relatius (`base: './'`): es pot penjar tal qual a qualsevol servidor estàtic o subcarpeta.
Aquest repositori la publica sol a GitHub Pages a cada `push` a `main` (`.github/workflows/pages.yml`).
Per activar-ho el primer cop: **Settings → Pages → Source: GitHub Actions**.

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

Hi ha bicicletes aparcades a la plaça de l'Església, la de l'Om, la d'Arnau de Palomar, el parc de la Palmera,
el parc de la Via Romana i als aparcaments de bicis de l'OSM.
Quan t'acostes a un emblemàtic, apareix un rètol amb una dada històrica verificada.

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
| `p_region.py` | Contorn del poble (illes cadastrals edificades amb ús urbà + 22 m de carrers): el món es limita a aquest nucli |
| `p_facade_layouts.py` | Valida les fitxes de façana llegides de les fotos del Cadastre (`facade_survey.md`, `data/raw/facade_survey/`) |
| `p_terrain.py` | Model de terreny (MDT LiDAR d'1 m al nucli i de 2 m a la resta, fos amb el MET-5) i ortofoto per tessel·la |
| `p_buildings.py` | Extrusió de les parts del Cadastre amb la teulada ajustada al LiDAR (plana / una aigua / dues aigües), alçada real de planta, ràfecs i cornises, volums de coberta (casetes, dipòsits, xemeneies) mesurats al LiDAR, color de teulada de l'ortofoto, color de façana de la foto del Cadastre, i classificació de cada paret (carrer / pati / mitgera) |
| `p_streets.py` | Espai públic real = buit entre illes del Cadastre → calçada (amplada mesurada a l'ortofoto), voreres, places, illetes de rotonda, vorades, passos de vianants, marques vials |
| `p_nature.py` | Arbres (posició del LiDAR + espècie de la DUN), llits de riera, basses, piscines, camps per al minimapa |
| `p_props.py` | Bancs, fonts, papereres i parades (OSM) + fanals estimats + bicis |
| `p_landmarks.py` | Rètols, teletransports, paràmetres dels models propis (església, ermita, fonts, porxos...) i decoracions documentades de façana (Abadia, Casa de la Vila) |
| `p_relief.py` | Desnivells del MDT LiDAR d'1 m: escales entre nivells de vianants, murs amb barana i *marges* de pedra seca als camps |

Sortida a `public/data/`: `terrain.bin`, `streets.bin` i `nature.bin` fan servir un format binari petit (capçalera JSON + arrays tipats, vegeu `scripts/binfmt.py`). També hi ha `buildings.json`, `roads.json`, `fields.json`, `props.json`, `landmarks.json`, `relief.json`, `meta.json` (fonts i estadístiques) i `ortho/t*.jpg`.

Les fitxes de façana (`data/raw/facade_survey/`) també són dades curades. Les va fer un agent d'IA amb visió a partir de les fotos del Cadastre, seguint `scripts/facade_survey.md`, i el pipeline no les torna a generar.

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
- Terreny en tessel·les de 250 m amb 4 nivells de detall generats a demanda; a prop de la càmera, quadrants de 125 m a 1 m de resolució.
- Arbres amb 3 LOD, recalculats per distància i descartats per tessel·la contra el frustum.
- Resolució adaptativa: baixa el pixel ratio quan un fotograma passa de 22 ms.
- Mesurat en una AMD Radeon 740M integrada: ~13 ms per fotograma a peu de carrer, amb ombres (finestra petita).

## Vídeo de demostració

Vídeo de 720p, 30 fps i ~2 min 18 s (no s'inclou al repositori): vol aeri, passeig a peu i en bicicleta,
menú i teletransport, pas del dia a la nit. Es genera amb el mateix joc, sense gravar la pantalla,
i queda a `demo/riudoms-3d-demo.mp4`:

1. `npm run dev` i obrir `http://localhost:5173` en una finestra de 1280×720 o més gran.
2. A la consola del navegador: `(await import('/tools/demo/director.ts')).record()`.
   El guió (`tools/demo/director.ts`) mou el personatge, la bici i la càmera amb entrades simulades
   (la física i les col·lisions són les del joc), dibuixa el HUD i els rètols explicatius i envia cada
   fotograma al servidor de desenvolupament, que els desa a `demo-out/` (`tools/demo/vite-plugin.ts`).
   `record({ dry: true })` només simula i informa dels recorreguts; `record({ stills: [10, 60] })` en treu fotogrames solts;
   `record({ from: 14.3 })` continua una gravació interrompuda (la simulació és determinista).
3. `python tools/demo/encode.py`: sintetitza el so ambient a partir dels esdeveniments del guió
   (`tools/demo/audio.py`: vent, ocells, grills, fonts, passos, bicicleta, campanes; sense mostres
   de tercers) i codifica el vídeo amb l'ffmpeg d'`imageio-ffmpeg`.

Al vídeo, de nit l'exposició és una mica més alta que al joc perquè s'hi vegi alguna cosa.

## Estadístiques

La web publicada compta les visites de manera **anònima i sense galetes** amb [GoatCounter](https://www.goatcounter.com)
(tauler: <https://riudoms-3d.goatcounter.com>). No es recull cap dada personal ni cap adreça IP, només recomptes:

- visites, d'on venen (X, cercadors, enllaç directe), país, tipus de dispositiu i navegador;
- alguns esdeveniments del joc, com a màxim un cop per visita (`src/analytics.ts`): càrrega completada i temps de càrrega,
  errors en carregar, rendiment (fotogrames per segon, per franges), temps de joc (1, 5 i 15 minuts), ús de la bici,
  del minimapa gran, del canvi d'hora i dels controls tàctils, si s'ha vist el poble de nit, quins llocs s'han visitat
  (rètols) i quins teletransports s'han fet servir.

En local (`npm run dev`) no es compta res. Per afegir la procedència a un enllaç, posa-hi `?ref=nom`,
per exemple `https://nil-munte.github.io/riudoms-3d/?ref=x`.

## Contribuir

Els canvis entren per *pull request*: no es pot fer push directe a `main`.

1. Fes un *fork* del repositori i crea-hi una branca.
2. Prova els canvis en local (`npm run dev`) i comprova que compila (`npm run build`).
3. Obre un *pull request* cap a `main`. GitHub el compila automàticament (*Comprova*, `.github/workflows/ci.yml`).
   Si surt ❌, cal arreglar-ho abans de fusionar-lo.
4. Quan es fusiona, la web es torna a publicar sola a <https://nil-munte.github.io/riudoms-3d/>.

Abans de pujar res, `python tools/secret_scan.py` comprova que no hi hagi cap clau ni credencial; els fluxos de GitHub també ho comproven i aturen la publicació si en troben.
No copiïs al repositori pàgines web senceres de tercers: poden contenir les claus d'altres persones.

Si toques dades, explica'n la font. Si és una estimació, marca-la com a tal a [DADES.md](DADES.md).

## Dades i llicències

El codi és MIT (vegeu [LICENSE](LICENSE)). Les dades conserven la llicència de la seva font i cal citar-les si es reutilitzen:

- © col·laboradors d'OpenStreetMap (ODbL).
- Dirección General del Catastro.
- Institut Cartogràfic i Geològic de Catalunya (CC BY 4.0).
- Generalitat de Catalunya, dades obertes (DUN 2025, Equipaments).
- Wikimedia Commons (fotos de referència; autors i llicències a `data/raw/heritage/photos.json` i als crèdits del joc).
- Fitxes de façana (`data/raw/facade_survey/`): lectura feta per IA de les fotos de façana del Cadastre.
  Les fotos no s'inclouen al repositori; `scripts/download_cadastre.py` les descarrega.

Les descàrregues en brut (ICGC, Cadastre, DUN, OSM) no es versionen: `npm run data` les torna a baixar.
Els fitxers ja processats de `public/data/` sí que hi són, perquè el joc funcioni sense descarregar res.

La llista completa del que és dada real i del que és estimat és a [DADES.md](DADES.md). Les notes tècniques de treball de la IA són a [CLAUDE.md](CLAUDE.md).
