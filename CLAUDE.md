# Riudoms 3D — notes del projecte

Recreació 3D navegable de Riudoms (Baix Camp) feta amb dades obertes reals.
Vite + Three.js + TypeScript al navegador; pipeline de dades en Python a `scripts/`.

- Dades en brut: `data/raw/` (es regeneren amb `npm run data`).
- Intermedis: `data/work/` (no es versionen).
- Fitxers optimitzats per al joc: `public/data/`.
- Executa els scripts Python amb `.venv/Scripts/python.exe` (Windows) o `.venv/bin/python`,
  sempre des de l'arrel del projecte.

---

## Fase 1 · Informe de recerca i descàrrega de dades

Data de la descàrrega: 24-25/09/2026. Àrea: nucli urbà + franja de camps,
bbox WGS84 41.1235–41.1545 N, 1.0305–1.0735 E (≈3,7 × 3,5 km). En UTM 31N:
334667–338353 E, 4554255–4557778 N.

### Fonts utilitzades

| Font | Què se n'ha tret | Script | Fitxers a `data/raw/` |
|---|---|---|---|
| **OpenStreetMap** (API Overpass) | Carrers amb tipus, nom, superfície i sentit; voreres; places; zones verdes; usos del sòl; cursos d'aigua; arbres; bancs; fonts; papereres; passos de vianants; equipaments i punts d'interès | `download_osm.py` | `osm/area.json`, `osm/boundary.json` (relació 340858) |
| **Cadastre INSPIRE** (Dirección General del Catastro), descàrrega ATOM | Planta de cada edifici i de cada part (*BuildingPart*) amb les plantes sobre rasant, any de construcció i ús; piscines; parcel·les; illes urbanes (manzanas) | `download_cadastre.py` | `cadastre/A.ES.SDGC.BU.43131.zip`, `cadastre/A.ES.SDGC.CP.43131.zip` |
| **Cadastre: fotos de façana** (servei OVCFotoFachada) | Color real de la façana i de les persianes de cada edifici urbà | `download_cadastre.py` | `cadastre/facades/*.jpg` (no es versionen: 129 MB) |
| **ICGC, MET-5** (WCS `icc_mdt`) | Relleu 5 × 5 m de tota l'àrea | `download_icgc.py` | `icgc/met5.asc` |
| **ICGC, ortofoto vigent** (WMS `orto-territorial`, capa `ortofoto_color_vigent`) | Textura del terreny i colors reals de les teulades: 25 cm al nucli (2 × 2 km) i 1 m a tota l'àrea | `download_icgc.py` | `icgc/orto/core_*.jpg`, `icgc/orto/wide_*.jpg` |
| **ICGC, LiDAR territorial** (3a cobertura, fulls d'1 km², LAZ amb RGB + NIR) | Alçades reals de cada edifici (DSM), MDT de 2 m al nucli i posició, alçada i capçada de cada arbre | `download_icgc.py`, `process_lidar.py` | `icgc/lidar/*.laz` (6 fulls, 2 GB, no es versionen) |
| **DUN 2025**, mapa de parcel·les i cultius (Dept. d'Agricultura, WFS `sig.gencat.cat`) | Cultiu declarat a cada parcel·la: olivera, avellaner, ametller, garrofer... | `download_opendata.py` | `opendata/dun2025.json` |
| **Equipaments de Catalunya** (Dades obertes Generalitat, Socrata `8gmd-gz7i`) | Equipaments del municipi amb coordenades | `download_opendata.py` | `opendata/equipaments.json` |
| **Patrimoni**: IPAC (API JSON), Viquipèdia, Wikidata, Wikimedia Commons, riudoms.cat, riudomsturisme.cat, campaners.com i Lo Floc (RACO) | Fitxes, dates, dimensions i fotos dels emblemàtics | Recerca amb scripts propis a `heritage/sources/` | `heritage/landmarks.json`, `photos.json`, `photos/`, `lofloc_evolucio_urbanistica.md`, `research_notes.md` |

### Quantitats carregades (dins de l'àrea)

- **OSM**: 1.276 elements.
  - 244 edificis (cobertura parcial, per això la geometria d'edificis surt del Cadastre).
  - 393 vies (`highway`), de les quals 133 carrers amb nom.
  - 95 passos de vianants, 74 usos del sòl, 40 cursos d'aigua.
  - 30 arbres, 30 bancs, 15 fonts d'aigua potable, 3 fonts ornamentals, 9 papereres.
  - 1 sol fanal.
- **Cadastre**: 2.166 edificis i 6.244 parts d'edifici, 222 piscines, 3.048 parcel·les, 145 illes urbanes.
  També 1.499 fotos de façana (9 edificis urbans no en tenen).
- **ICGC**:
  - MET-5: 758 × 725 cel·les.
  - Ortofoto: 16 tessel·les de 2000 px a 25 cm i 4 de 2000 px a 1 m.
  - LiDAR: 6 fulls d'1 km² (x 335–338 km, y 4555–4557 km), ≈150 milions de punts.
    En surten 77.975 capçades d'arbre.
- **DUN 2025**: 2.307 parcel·les: 817 d'olivera, 304 d'avellaner, 91 d'ametller, 87 de garrofer, 158 de guaret, 467 d'improductiu, etc.
- **Equipaments**: 33 (un amb coordenades errònies, descartat).
- **Patrimoni**: 35 fitxes (17 de l'IPAC) i 25 fotos de Commons amb autor i llicència.

### Emblemàtics localitzats

Coordenades WGS84. La font de cada coordenada és a `landmarks.json` (`coord_source`).

| Element | Lat, lon | Fets verificats clau |
|---|---|---|
| Església de Sant Jaume | 41.139104, 1.051104 | Primera pedra el 20/12/1588; consagrada el 25/7/1617; campanar 1689–1877; BCIN des del 17/9/2019. Nau de 41,97 × 13,27 m i 20,8 m d'alçada, 6 capelles per banda; rosassa de 9 m. Façana orientada al SSE (≈153°). Campanar quadrat a l'angle SW de la façana, amb terrat i balustrada a ≈33 m (LiDAR). |
| Plaça de l'Església (+ Plaça Petita) | 41.13885, 1.05153 | ≈4.100 m²; lloc de l'antic castell d'Arnau de Palomar; porxos de 10 + 6 arcades; mosaic de l'escut al paviment |
| Font de la Dama Oferent (Plaça Petita) | 41.138612, 1.051820 | Plaça Petita inaugurada el 1889 amb aquesta font; estàtua de ≈5 m sobre el terra (LiDAR) |
| Porxos | 41.138866, 1.051917 | Refets a finals del s. XIX amb pedra del convent de Sant Joan |
| L'Abadia | 41.138856, 1.051123 | Documentada des del s. XVI; 3 plantes després de la rehabilitació del 2013–14 |
| Casal Riudomenc | 41.139011, 1.050781 | Logotip vermell rodó «C» a dalt de la façana (confirmat per foto) |
| Cisterna Vella | sota la plaça | Decidida després del 1727; refugi antiaeri el 1937–38 |
| Monument a Gaudí | 41.139432, 1.051163 | Josep Piqué, 1975; 10 m segons l'Ajuntament |
| Escultura de Gaudí | 41.138705, 1.051564 | Joan Serramià, 2019 |
| Ermita de Sant Antoni | 41.142176, 1.048312 | Acabada el 1702 (inscripció); espadanya d'una campana; planta de 19 × 12 m |
| Plaça / Parc de Sant Antoni | 41.142049, 1.048108 | Plàtans; escales cap a l'ermita |
| Casa de la Vila | 41.137701, 1.050835 | Refeta el 1925; esgrafiats; 3 plantes |
| Plaça de l'Om | 41.137623, 1.051030 | La plaça més antiga |
| Casa Pairal Gaudí | 41.13874, 1.05432 (estimada) | Raval de Sant Francesc, 14 |
| Cal Gallissà (Casa dels Germans Nebot) | 41.138431, 1.053353 | BCIL |
| Casa natal del Beat Bonaventura | 41.137491, 1.050699 | Casa museu |
| Convent de Sant Joan (ruïnes) | 41.138362, 1.057976 | Cremat el 1835 |
| Plaça de l'Arbre | 41.138922, 1.055481 | Cirerers japonesos (Hiroya Tanaka) |
| Plaça de la Palmera | 41.14087, 1.050518 | Amb gespa; escola Beat Bonaventura al costat |
| Mas de la Calderera | 41.154381, 1.050460 | Mas de la família Gaudí; que hi nasqués no està documentat |

**Altres elements situats** (OSM i Equipaments):

- Institut Joan Guinjoan (41.1421, 1.0538); escola Beat Bonaventura (41.1415, 1.0508).
- Pavelló Municipal (41.1429, 1.0551); Zona Esportiva, amb futbol, pàdel i tennis (41.1430, 1.0557).
- Piscina (41.1419, 1.0478); gasolinera Shell (41.1376, 1.0612); polígon del Prat (≈41.135, 1.062).
- T-310 i TV-3103.
- Barranc del Portal i lo Rieró.
- Escola Cavaller Arnau: dues posicions (vegeu més avall).

### Correccions a les pistes inicials (verificades)

- **Codi del Cadastre**: Riudoms és el **43131** al Cadastre. El 43129 (codi INE) correspon a Riudecanyes al Cadastre.
- **Lo Floc** l'edita el **Centre d'Estudis Riudomencs Arnau de Palomar**, no l'Associació Amics de l'Om (que edita *L'Om*).
- **Porxos «ampliats el 1983»**: no consta. El 1983 es va enderrocar el mercat vell del final dels porxos i s'hi van fer el mercat nou i la Llar dels Jubilats.
- **Plaça de l'Om «amb un monument»**: avui no n'hi ha. El monument franquista del 1954 es va retirar (traslladat al cementiri; eliminat el 2023). Al centre hi ha un fanal ornamental gran i arbres.
- **Raval de Sant Francesc «antic convent»**: el raval és un carrer. El convent franciscà (Sant Joan) és una ruïna a part, a l'av. de Reus.
- **Carrer Major «empedrat»**: l'OSM el marca com a `living_street` amb `surface=sett`, és a dir, llambordes. Els carrers de l'Arenal i de Sant Isidre i part del Raval també.
- **Campanar**: la cronologia varia segons la font (1689–1877 IPAC/Figuerola; 1746 campaners; 1878 Viquipèdia). L'alçada publicada és de 33,75 m o 37 m; el LiDAR dona ≈33 m fins a la balustrada.
- **Escola Cavaller Arnau**: l'OSM la situa a 41.1411, 1.0518 i el fitxer d'Equipaments a 41.1356, 1.0546. **No resolt**; es fa servir la de l'OSM, que és una àrea dibuixada.

### Què no s'ha trobat

- **MET-2 m en brut**: l'ICGC només l'ofereix com a WMS renderitzat. Per això s'ha derivat un **MDT de 2 m dels punts de terreny del LiDAR** de l'ICGC (el mateix origen del MET-2) al nucli, i fora s'usa el MET-5.
- **Model 3D d'edificis de l'ICGC**: la seva web esmenta un «model de Riudoms» fet a mida per a Virtuelcity, però no és descarregable. S'ha substituït pel Cadastre + LiDAR.
- **Fanals**: l'OSM només en té un. La resta s'hauran d'estimar.
- **Vinya**: la DUN 2025 no declara vinya dins de l'àrea. Els camps són d'olivera, avellaner, ametller i garrofer.
- **Patrimoni**:
  - La data de 1623 de l'Abadia no surt a cap font (només «documentada des del s. XVI»).
  - Els mosaics de les «quatre províncies» no s'han trobat.
  - Les escales cap al carrer de Sant Bonifaci no estan documentades (el desnivell sí).
  - Tampoc s'ha pogut verificar que la de la Palmera sigui la plaça més gran.
  - No hi ha plànols mesurats de l'església ni traçat precís de la muralla i el castell.
  - No hi ha fotos exteriors de la Casa Pairal a Commons.
- **Lo Floc**: RACO bloqueja la descàrrega automàtica. Els PDF es van llegir al navegador i se'n va fer el resum `heritage/lofloc_evolucio_urbanistica.md`. El text no es desa.
- **IPAC**: el web donava error 503. L'API JSON sí que funcionava (fitxes desades), però no dona coordenades.

### Notes tècniques de les fonts

- El WCS de l'ICGC afegeix un «5» al nom de la cobertura: el MET-5 s'ha de demanar com a `icc:met`.
  L'únic format que accepta és ArcGrid.
- El LiDAR i el MET-5 difereixen en una mediana de −0,26 m. El MDT LiDAR es fon amb el MET-5 als 60 m de la vora.
- Convergència de quadrícula a Riudoms: ≈1,3°. El «nord» del món és el nord UTM, no el geogràfic.
