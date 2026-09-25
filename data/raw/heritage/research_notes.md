# Riudoms heritage research: notes (2026-09-25)

**Scope:** heritage landmarks for the 3D walkable model of Riudoms, centred on the Plaça de l'Església. Every fact in `landmarks.json` carries source URLs.

**Outputs:**
- `landmarks.json`: 35 items.
- `photos.json` plus `photos/`: 25 Commons thumbnails, 800 px wide.
- `lofloc_evolucio_urbanistica.md`: summary of the Lo Floc urban-evolution article.
- `sources/`: raw files and scripts. See the list at the end.

## 1. Sources consulted and what they gave

| Source | Access | Used for |
|---|---|---|
| **IPAC**, https://invarquit.cultura.gencat.cat/ | The web front end returned 503 for the whole session. The JSON API the SPA uses works: `api/Card/{id}`, `api/Inventary/{id}/{epoques,estils,proteccions,autors}`, `api/Search/advanced-search-all`. Saved in `sources/ipac/`. | Descriptions, history, periods, styles and protection for all **17 Riudoms records**: 9667-9673, 9675-9682, 40706, 40707. **The API gives no coordinates.** |
| ca.wikipedia "Llista de monuments de Riudoms", plus each monument's article, "Riudoms", "Bonaventura Gran" and "Antoni Gaudí i Cornet" | MediaWiki API; wikitext saved in `sources/cawiki*` | IPAC coordinates (lat/lon), IPAC ids, addresses, extra history. The IPAC card id 9674 does not exist for Riudoms. |
| Wikidata | Search API (`haswbstatement:P131=Q679015`, 120 items) plus `wbgetentities`. WDQS SPARQL returned **502** for every real query; see `wikidata_sparql_FAILED_502.html`. | Coordinates of newer items: porxos, Dama Oferent fountain, sculptures, Casal Riudomenc, Beat Bonaventura house, Plaça de l'Arbre. No useful P2048 heights for buildings. |
| Wikimedia Commons | API crawl of Category:Riudoms to depth 3 (130 categories) plus imageinfo/extmetadata | 25 photos with author, licence and camera coordinates. **Many Commons "camera" coordinates are just the IPAC monument point copied**, so do not treat them as camera GPS. |
| Ajuntament: https://www.riudoms.cat/llocs-dinteres-turistic, https://www.riudoms.cat/places, https://www.riudoms.cat/ambit-religios | curl | Church, Cisterna Vella, Monument a Gaudí, Casa Pairal, Casa de la Vila, Ermita, the squares (1889, 1974, 1977, 1898, 1983) |
| Riudoms Turisme (WordPress REST API): https://riudomsturisme.cat/ | `wp-json/wp/v2/posts` saved | Plaça de l'Església, Gaudí statue (2019), Plaça de l'Arbre, Casal Riudomenc, addresses |
| **Campaners de la Catedral de València**: https://campaners.com/php/campanar.php?numer=6641 | curl | **Church and tower dimensions**: nave 41.97 × 13.27 × 20.80 m; width 21.20 m; tower 6.36 × 6.00 m and 33.75 m high; bell openings; terrace; 4 bells |
| **Lo Floc** on RACO, https://raco.cat/index.php/LoFloc | Cloudflare returns 403 to curl and WebFetch. Read in the browser pane: issue archive crawled (251 issues, about 3,200 articles), PDFs read with pdf.js. **PDF texts are not saved locally.** | Perea 2007 (urban evolution), Perea 2000 (Plaça de l'Església, Plaça de l'Om), **Figuerola 2023 (church restoration: 1588 and 1617 dates, 4 m chapels, 37 m tower, roof, Santíssim chapel)** |
| Catalunya Religió (Abadia rehabilitation): https://www.catalunyareligio.cat/ca/node/175602 | curl | Abadia works 2012-2014, added storey, ramp, position in front of the fountain |
| usuaris.tinet.cat/jogili (Plaça de l'Om), reusdigital.cat (bells) | curl | Plaça de l'Om remodel (big lamp post, three elms), bell names |
| Tarragona Digital, medieval-wall find (tarragonadigital.com/noticia/14444) | Only the homepage came back. **Facts taken from the web-search snippet only.** | Wall section on Carrer de Sant Jaume, 8.25 × 3.42 m (2023); perimeter above 900 m; 1374 context |
| diarimes.com (Plaça de l'Om monument removal; "plaça castellera") | Search snippet only | Francoist monument of 1954, moved to the cemetery and removed in 2023 |
| **Project data, read-only** (not modified): `data/raw/cadastre/gml/*.gml`, `data/raw/icgc/lidar/336555.laz` and `336556.laz`, `data/raw/osm/area.json` | Parsed with my scripts in `sources/` | Footprints, floor counts and construction years from the cadastre; measured heights and ground levels from LiDAR (`sources/lidar_measurements.json`); OSM node positions |
| Overpass API | `sources/osm_overpass_*.json` | Centres of squares and streets, including Carrer de la Muralla Vella and Carrer de la Muralla de la Font Nova |
| Diputació de Tarragona "Mapa de recursos culturals" | 404 (the old URLs are dead) | Not used |
| catalunyamedieval.es | curl | Only a copy of the old IPAC text; nothing new |

## 2. Verified claims (key ones)

### Church
- **Dates**
  - **First stone laid 20 Dec 1588; consecrated 25 Jul 1617.** Sources: Figuerola 2023, the Ajuntament, and IPAC for the consecration.
  - **Bell tower finished 1877.** Sources: IPAC and Figuerola, who gives the start as 1689.
  - **BCIN on 17/09/2019**, register 4402-MH-EN.
  - **Late Gothic / Renaissance.**
- **Layout**
  - Single nave with **6 side chapels per side**, 4 m deep, and a polygonal apse.
  - **Facade faces south / SSE**, about 153°, onto the square.
  - **Tower at the left, SW corner of the facade**, flush with it, with the Santíssim chapel behind it.
- **Tower**
  - **Square plan.**
  - Crowned by a **terrace with balustrade**: masonry corner posts with balusters between. **No spire.** A small tiled dome and a weathervane.
  - Two mouldings and round-arched bell openings.
- **Other elements**
  - Rose window **9 m in diameter**.
  - Clock in a mixtilinear central gable.
  - Access ramps exist.

### Squares and other landmarks
- **Plaça de l'Església plus Plaça Petita**
  - About 4,100 m² together, with porxos of 10 and 6 arcades.
  - Former site of the castle, once called plaça del Castell / del Sitjar.
  - Remodelled in 1977; fountain from 1976-77.
  - Mosaic of the Riudoms coat of arms in the paving, seen in the photo.
  - The Plaça Petita is lower and was **inaugurated in 1889** with the Dama fountain by Salvador Salvadó Bru.
- **Cisterna Vella:** under the square; decided after 1727; air-raid shelter 1937-38.
- **Abadia:** documented from the 16th century; 3 floors after the 2013-14 rehabilitation.
- **Casal Riudomenc:** red round "C" logo at the top of the facade, with "1955-2010".
- **Ermita de Sant Antoni:** completed 1702; single-bell espadanya; stairs and the Racó de l'Avi (1978).
- **Casa de la Vila:** rebuilt 1925; esgrafiats; balustraded stair.
- **Casa Pairal Gaudí:** Raval de Sant Francesc 14; coppersmith's workshop; 3 floors with attic.
- **Cal Gallissà:** the Nebot brothers' house.
- **Casa del Beat Bonaventura:** C/ del Beat Bonaventura 48.
- **Mas de la Calderera:** belonged to the Gaudí family. The claim that he was born there is **undocumented** according to IPAC.
- **Plaça de l'Arbre:** Hiroya Tanaka, sakura cherries.
- **Monument a Gaudí:** Josep Piqué, 1975, 10 m.
- **Gaudí statue:** Joan Serramià, 2019, 1.70 m.

## 3. Contradicted, conflicting or corrected claims

- **Lo Floc publisher.** The brief says Associació Cultural Amics de l'Om. **Wrong.** Lo Floc belongs to the **Centre d'Estudis Riudomencs Arnau de Palomar (CERAP)**. Amics de l'Om publishes *L'Om*.
- **Start of the church works.** 1588 is the formal first stone (Figuerola). Perea (2017, cited by Wikipedia) says the works started at the end of 1593. Campaners gives 1599-1617. IPAC gives the first news of construction in 1576.
- **Designer.** IPAC and the Ajuntament credit Pere Blai and Joan Sans. Perea (via Wikipedia) calls the Blai attribution a mistake: the plan came from the Ulldemolins builders under Joan Sans, with Jaume Amigó. Figuerola says Blai helped draw the plan in Dec 1588.
- **Bell tower chronology.**
  - IPAC and Figuerola: begun 1689, finished 1877.
  - ca.wikipedia "Riudoms": continued 1665-67, crowned 1878.
  - Campaners: "Renaissance tower of 1746".
  - The Ajuntament and Riudoms Turisme still say "inacabat".
- **Tower height.** Campaners gives 33.75 m. Figuerola gives 37 m. LiDAR puts the top of the terrace balustrade at about 32.9 m above the church platform, or about 35.5 m above the Plaça Petita. **Use about 33 m to the balustrade** and add the weathervane on top.
- **Tower plan size.** Campaners gives 6.36 × 6.00 m. LiDAR and the photo proportions give **about 8.2-8.5 m outside at the top**. The 6.36 × 6.00 m figure may be an interior measurement.
- **Number of bell openings.** Campaners: 2 on the east face and 1 on each other face. Figuerola: "four windows". The photos are consistent with campaners.
- **Apse.** Campaners: polygonal with 3 sides. Figuerola: polygonal head of 5 sections.
- **Portal order.** The Ajuntament says Doric at the portal. IPAC and Campaners describe Ionic pilasters or semi-columns.
- **Date of the 1936 fire.** Figuerola: 23 July 1936. Ajuntament: 25 July 1936. Reopened 9 Sep 1942 (IPAC: 1942).
- **"Porxos extended 1983".** **Not supported.** In 1983 the old market at the end of the porxos was demolished, and a new market and the Llar dels Jubilats were built (riudoms.cat/places).
- **Cisterna Vella date.** Riudoms Turisme says 17th century. The Ajuntament's text, based on an archive document, places the decision after the **1727** epidemic.
- **Plaça de l'Om "monument".** There is none today. The historic monument there was the Francoist *Monument als Caiguts* (1954), moved to the cemetery in 1997 or 1998 and removed in 2023. Today the centre of the square is a large ornamental lamp post with trees.
- **Raval de Sant Francesc "former convent".** The raval is a street: the first growth outside the walls, towards the Portal de Reus. The Franciscan convent (IPAC "Sant Joan dels Franciscans", which Perea calls "convent de Sant Francesc") is a separate ruin at Av. de Reus 26.
- **Founding of the Franciscan convent.** IPAC says authorised in 1585. ca.wikipedia and "Riudoms" say 1582.
- **Cal Gallissà address.** IPAC API: Raval de Sant Francesc 8. ca.wikipedia list: no. 29. Riudoms Turisme: no. 42.
- **Mas Blau coordinates.** The ca.wikipedia list and Wikidata differ by about 500 m.
- **La Soleiada date.** Perea 2007 says early 19th century. IPAC says early 20th century (Noucentisme), which is more likely.
- **Monument a Gaudí height.** Published as 10 m. LiDAR captures only about 5.3 m, probably because the slender tip is missed.
- **Ermita de Sant Antoni.** Start given as 1684 (Ajuntament) or planned 1690 (Wikipedia). Altarpiece dated 1745 (Ajuntament) or 1730 (Wikipedia).

## 4. Not verified or not found

- **Abadia "1623".** No source found. Sources only say "documented from the 16th century".
- **Plaça de l'Església mosaics of "the four provinces".** Not found.
- **"Stairs down to carrer de Sant Bonifaci".** Not documented. The LiDAR level drops are consistent with steps, but their position is not confirmed.
- **Plaça de la Palmera as "the largest square".** Not verified. Perea does not even count it as a real square.
- Author and date of the **plegadora d'avellanes** sculpture.
- **Exterior photos of the Casa Pairal Gaudí.** The Commons category has interiors only. The cadastre match for the Casa Pairal is uncertain.
- **Measured drawings.** None found: no plan or section of the church with dimensions beyond campaners and Figuerola. The Lo Floc 219 (2017) monographic articles have no PDF galley on RACO.
- **Walled core.** No precise extent or castle plan. There is a wall perimeter of more than 900 m (press snippet), wall lines inferred from street names, and a 14th-century wall section on Carrer de Sant Jaume (2023, press snippet).
- **Cisterna Vella dimensions and entrance position.**
- **IPAC coordinates.** The IPAC API has no coordinate or UTM field. All "IPAC" coordinates come through the ca.wikipedia list and Wikidata. UTM values in `landmarks.json` are **computed** from WGS84.

## 5. Method notes for the modeller

- **Church local frame.** Origin at UTM 336435.6 / 4556026.9, long axis 152.7°. Details in `sources/lidar_measurements.json`.
- **Ground levels** (LiDAR, orthometric metres):

  | Place | Level (m) |
  |---|---|
  | Church platform | 124.4 |
  | Plaça Gran | 123.4 → 123.0 |
  | Plaça Petita | 121.5-121.8 |
  | Plaça de l'Om / Carrer Major | about 119.5 |
  | Raval / Plaça de l'Arbre | about 112.6 |
  | Sant Antoni | about 134 |

  The village slopes down to the south and east.
- **Photo licences.** 20 of the 25 photos are **CC BY-SA 4.0**, 2 are CC BY-SA 3.0, 2 are CC BY 4.0, and 1 is public domain (Salvany, 1916). Credit the author in-game if any photo or texture from them is shown.

## 6. Files in `sources/`

- `ipac/`: `ipac_card_{id}.json` and `ipac_inv_{id}_{epoques,estils,proteccions,autors}.json` for the 17 records; the search result; the municipality list.
- `cawiki/*.wikitext` and `cawiki_Llista_*`: Wikipedia sources.
- `wikidata_entities_riudoms.json`, `wd_search_*.json`, `wd_summary.jsonl`: Wikidata.
- `commons_category_tree_riudoms.json`, `commons_imageinfo_*.json`: Commons.
- `web/`: pages from riudoms.cat, riudomsturisme.cat (REST JSON), campaners.com, catalunyareligio, reusdigital, tinet and catalunyamedieval.
- `osm_overpass_*.json`: Overpass results.
- `lidar_measurements.json` and `lidar_*.py`: measured heights. The point extracts were deleted to save space; rerun `lidar_extract.py` with `.venv` Python to regenerate them.
- Scripts: `build_landmarks.py` (regenerates `landmarks.json`), `photos_download.py`, `cadastre_lookup.py`, `utm.py`, `commons_*.py`, `wdfetch.py`, `cawiki.py`.
- **Note:** run the scripts with `.venv/Scripts/python.exe` from the project root. The system Python app alias sees a different, virtualised AppData path.
