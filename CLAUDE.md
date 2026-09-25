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
| Església de Sant Jaume | 41.139104, 1.051104 | Primera pedra el 20/12/1588; consagrada el 25/7/1617; campanar 1689–1877; BCIN des del 17/9/2019. Nau de 41,97 × 13,27 m i 20,8 m d'alçada, 6 capelles per banda; rosassa de 9 m segons l'IPAC i la Viquipèdia (les fotos en suggereixen ~4 m de diàmetre). Façana orientada al SSE (≈153°). Campanar quadrat a l'angle SW de la façana, amb terrat i balustrada a ≈33 m (LiDAR). |
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

---

## Fase 2 · Construcció del món: notes tècniques

- **Coordenades**: EPSG:25831 desplaçat a l'origen (336472.5 E, 4556002.4 N), el centroide de l'espai públic
  de la plaça de l'Església. Al món: x = est, y = nord. A Three.js: (x, alçada, −y).
- **Tessel·les**: 14 × 13 de 250 m (3,5 × 3,25 km). El terreny té 4 LOD (64/32/16/8 segments) i
  una textura d'ortofoto per tessel·la: 512 px al nucli (25 cm d'origen), 256 px a fora.
- **Alçada del terreny**: la mateixa funció a Python (`ctx.TerrainModel.height`) i a TS (`world/heightfield.ts`):
  MDT LiDAR de 2 m dins del full LiDAR, MET-5 a fora, amb transició de 60 m a la vora.
- **Edificis**: 5.544 parts d'edifici del Cadastre.
  - Alçades: 4.362 amb LiDAR i 1.182 amb plantes del Cadastre × 3 m.
  - Teulades: 2.973 planes, 2.065 a dues aigües, 506 a una aigua.
  - Cada paret es classifica com a façana al carrer, pati o mitgera. Les finestres, portes i balcons
    (shader + instàncies) només surten on n'hi pot haver.
- **Carrers**: l'espai públic és el buit entre les illes (manzanes) del Cadastre. Els carrers tenen l'amplada real de façana a façana.
- **Emblemàtics amb model propi** (`world/landmarks.ts`):
  - Església de Sant Jaume: volum de les classes de LiDAR sobre la planta del Cadastre, i ornament procedural (retaule, rosassa, frontó del rellotge, campanar amb terrat i balustrada, contraforts).
  - Ermita de Sant Antoni: frontó, òcul, espadanya i escales.
  - Fonts: Dama Oferent i font de la plaça (1976-77).
  - Monument a Gaudí, escultures, porxos, logotip del Casal Riudomenc i mosaic de l'escut.
- **Scripts de depuració a la consola del navegador**:
  - `__freeze = true` atura el bucle.
  - `__step(dt, n)` avança fotogrames a mà.
  - `__game` exposa els objectes del joc.

## Refinament · relleu, edificis, emblemàtics i carrers

- **Relleu**: MDT LiDAR d'**1 m** sobre tot el nucli (2,3 × 2 km), fos amb el de 2 m i el MET-5.
  A prop de la càmera el terreny es dibuixa en quadrants de 125 m a 1 m de resolució.
- **Desnivells** (`p_relief.py`): detector de salts al MDT d'1 m (caiguda en 3 m menys la pendent regional).
  - Surten 263 trams d'escala, 1.832 murs urbans (amb barana si fan més de 0,6 m) i 11.846 *marges* de pedra seca als camps.
  - Les escales són caminables; els murs i marges bloquegen el pas.
  - Exemple: la plaça Gran queda enlairada respecte de la plaça Petita, amb escales i mur, tal com diu la recerca.
- **Edificis**:
  - Alçada de planta real (alçada LiDAR / plantes del Cadastre; mediana 2,89 m), amb les finestres alineades a cada planta.
  - Línies d'imposta a les façanes antigues.
  - Ràfecs que continuen el pla de la teulada i ràfecs curts als testers.
  - Cornises a les façanes de carrer de terrat.
  - 1.888 volums de coberta mesurats al LiDAR: casetes d'escala i dipòsits als terrats, xemeneies a les teulades.
  - El color de façana de les fotos del Cadastre s'extreu de la part assolellada i sense vegetació.
- **Emblemàtics**:
  - **Abadia**: porta adovellada amb graons, placa «ABADIA · Casa de la Parròquia» i carreus a la cantonada.
  - **Casa de la Vila**: porta adovellada, balcó de balustres, esgrafiats i escut.
  - **Font de la plaça** (1976-77): posició, forma oval (8 × 16 m) i orientació mesurades a l'ortofoto.
  - **Plaça de l'Om**: fanal ornamental gran.
  - **Plaça de la Palmera**: parterre elevat de gespa.
  - **Dama Oferent**: figura femenina amb l'ofrena.
  - **Església**: vitrall de la rosassa i cúpula de la capella del Santíssim.
- **Carrers**:
  - Amplada de la calçada **mesurada a l'ortofoto de 25 cm** en 109 dels 206 trams urbans, amb perfils de lluminositat cada 5 m i la mediana per tram.
  - Illetes de gespa a les rotondes.
  - Arbres urbans amb tronc net més alt.
  - El paviment es subdivideix on travessa un desnivell brusc (`refineDrape` a `streets.ts`), perquè el terreny no traspassi les places.
    Passa de 181.000 a ~355.000 triangles.
- **Càmera**: també es posa davant dels murs i marges del relleu, no només dels edificis.
- **Vídeo de demostració** (`tools/demo/`): el guió fa servir la física i les col·lisions del joc. Els recorreguts es calculen amb A\*
  sobre la graella de col·lisions. El so és sintètic, generat a partir dels esdeveniments del guió.
- **Descartat**: plaques solars detectades a l'ortofoto. No tenen un color prou distintiu (quadrícula de cel·les fosques i línies clares), i per no inventar-les no es posen.

## Què és dada real i què és estimat

### Dada real (i font)

| Element | Font |
|---|---|
| Planta de tots els edificis i de cada part | Cadastre INSPIRE Buildings / BuildingParts (43131) |
| Alçada de 4.362 parts i forma de la teulada (plana / una aigua / dues aigües, orientació i carener) | ICGC LiDAR territorial (DSM de 0,5 m) |
| Alçada de les altres 1.182 parts | Cadastre: plantes sobre rasant × 3 m + 0,5 m de planta baixa |
| Any de construcció i ús de cada edifici (estil de façana) | Cadastre INSPIRE Buildings |
| Color de les teulades | Ortofoto vigent de l'ICGC (25 cm) |
| Color de la façana i de les persianes (3.445 parts) | Fotos de façana del Cadastre |
| Relleu | MDT de 2 m derivat dels punts de terreny del LiDAR de l'ICGC; MET-5 de l'ICGC a fora |
| Textura del terreny (camps, patis, parcs) | Ortofoto de l'ICGC |
| Traçat, nom, tipus i superfície dels carrers | OSM. Llambordes al carrer Major, de l'Arenal i de Sant Isidre i al Raval: `surface=sett` a l'OSM |
| Amplada total de cada carrer (de façana a façana) | Cadastre: buit entre illes |
| Passos de vianants | OSM (95) |
| Posició, alçada i capçada de 77.930 arbres | LiDAR de l'ICGC |
| Espècie dels arbres dins de camps declarats (43.774) | DUN 2025 (cultiu declarat de la parcel·la) |
| Palmera de la plaça de la Palmera | Foto de Commons; posició = arbre LiDAR més alt del parc |
| Bancs (30), fonts d'aigua (15), papereres (9), parades de bus (2), bústies (2), parcs infantils (4), 1 fanal | OSM |
| Piscines (222) | Cadastre OtherConstruction |
| Cursos d'aigua i basses | OSM |
| Camps del minimapa | DUN 2025 |
| Història dels rètols (26) | `data/raw/heritage/landmarks.json`, cada frase amb la seva font |
| Massa de l'església: nau (ràfec 20,4 m, carener 22,2 m), capelles (10,3 m), campanar (32,6 m sobre la plataforma) | LiDAR + planta del Cadastre |
| Església: orientació de la façana (SSE), campanar a l'angle SW, 6 capelles per banda, obertures del campanar (2 a l'est, 1 a les altres cares), terrat amb balustrada, cúpula i penell | Recerca de patrimoni: campaners.com, IPAC, Figuerola (*Lo Floc* 244) |
| Alçada de la coronació de la façana (22,3 m) i del frontó del rellotge (25,8 m) | LiDAR (mesura de la recerca) |
| Ermita de Sant Antoni: planta, alçada del frontó (12,5 m) i de l'espadanya (15 m) | Cadastre + LiDAR |
| Font de la Dama Oferent: bassa hexagonal, alçada total (5,1 m) | IPAC + LiDAR |
| Monument a Gaudí: 10 m, obelisc amb la creu de quatre braços | riudoms.cat + fotos |
| Porxos: 10 + 6 arcades | IPAC |
| Logotip vermell del Casal Riudomenc | Foto de Commons |
| Posició del sol | Calculada per a la latitud de Riudoms, la data i l'hora locals |
| Relleu del nucli a 1 m | MDT derivat dels punts de terreny del LiDAR de l'ICGC |
| Posició i alçades de 263 escales, 1.832 murs urbans i 11.846 marges | Salts detectats al MDT LiDAR d'1 m |
| Alçada de planta de cada part amb LiDAR | Alçada del ràfec (LiDAR) / plantes (Cadastre) |
| Ràfecs i cornises: posició i pendent | Arestes de les parts del Cadastre i pla de teulada ajustat al LiDAR |
| 1.888 volums de coberta (casetes, dipòsits, xemeneies) | Residu del DSM LiDAR sobre la teulada ajustada |
| Amplada de la calçada en 109 trams urbans | Perfils de lluminositat de l'ortofoto de 25 cm |
| Font de la plaça de l'Església (1976-77): posició, mida 8 × 16 m i orientació | Ortofoto de l'ICGC de 25 cm |
| Illetes de rotonda | OSM `junction=roundabout` |
| Abadia: porta adovellada amb graons, placa i carreus | Foto de Commons (P1130377) + recerca |
| Casa de la Vila: porta adovellada, balcó de balustres, esgrafiats i escuts | Foto de Commons + IPAC |
| Fanal ornamental al centre de la plaça de l'Om | Recerca (jogili / riudoms.cat) |
| Parterre de gespa elevat amb vora de pedra i palmera a la plaça de la Palmera | Foto de Commons |

### Estimat (cal revisar)

| Element | Com s'ha estimat |
|---|---|
| **Fanals** (843 dels 844) | L'OSM en té 1. S'han posat fanals de braç a les façanes dels carrers estrets (com els de les fotos del Cadastre) i de peu a voreres i places, cada ~19 m |
| Amplada de la calçada dins del carrer (i, per tant, de les voreres) en 97 dels 206 trams urbans | Per tipus de via (residencial 5,2 m, sentit únic 3,6 m, terciària 6,4 m...). Només on la mesura a l'ortofoto no ha estat fiable (ombra, poc contrast) |
| Escala o mur a cada desnivell urbà | Segons la superfície de banda i banda: vianants a les dues bandes → escala; calçada o salt de més de 2,5 m → mur |
| Marges als camps | Poden incloure talussos de camins i carreteres; aspecte de pedra seca genèric |
| Disseny dels esgrafiats i escuts de la Casa de la Vila | Motiu genèric: se sap que hi són, no el dibuix exacte |
| Cúpula i llanterna de la capella del Santíssim | Posició (darrere el campanar) i mida estimades de les fotos del flanc |
| Figura de la Dama Oferent | Forma genèrica de dona amb ofrena (alçada total del LiDAR) |
| Fanal de la plaça de l'Om, parterre de la Palmera | Disseny i mida aproximats |
| Espècie de 34.156 arbres fora de camps declarats | Per context: parcs → plàtan/fulla ampla; vora de riera → om; urbà → fulla ampla; alt i estret → xiprer; camp → garrofer o pi |
| **60.584 arbres fora de l'àrea LiDAR** | Plantació en marc regular dins les parcel·les DUN del cultiu declarat (olivera 7×7 m, avellaner 5×4,5 m...). **Posicions inventades**, cultiu real |
| Façanes sense foto (2.099 parts) | Paleta per estil i època (blancs trencats, ocres, pedra, maó) |
| Finestres, portes, persianes i balcons | Procedurals, segons l'estil, l'any i el tipus de paret. No són les obertures reals de cada façana |
| Teulades fora de l'àrea LiDAR | A dues aigües (30%) si l'ortofoto dona color de teula; si no, plana |
| Església | Mides del retaule, porta i rosassa estimades amb les fotos: rosassa de 4 m (l'IPAC i la Viquipèdia en diuen 9, però no quadra amb les fotos). Detall dels contraforts i gablets de les capelles |
| Posició del mosaic de l'escut | Davant de la porta de l'església, segons les fotos. Disseny aproximat |
| Font de la plaça (1976-77) | Model genèric (bassa oval, sortidors i arbustos); la posició i la mida ja són de l'ortofoto |
| Quines façanes tenen els porxos | Les més properes al punt dels porxos, fins a sumar 16 arcades |
| Escultures de Gaudí i de la plegadora | Figures genèriques de bronze a la posició de l'OSM / Wikidata |
| Esglaons de la plataforma de l'església | Nombre i mida segons el desnivell del LiDAR |
| Bicicletes | Col·locades a les places principals i als aparcaments de bicis de l'OSM |
| Llits de riera | Amplada per tipus (riera 7 m, torrent 3 m) i aspecte de grava seca |

### No localitzat

- **Urbanització Molí d'en Marc** i **barriada Lluís Massó**: no apareixen a l'OSM ni a Nominatim. No s'han pogut situar.
- **Escales cap al carrer de Sant Bonifaci**: no documentades, i l'OSM no té cap `highway=steps` a l'àrea. El desnivell sí que surt al relleu LiDAR, i les escales es generen automàticament allà on hi ha zona de vianants a les dues bandes. Cal revisar-ne la posició exacta.
- **Escola Cavaller Arnau**: posició en conflicte entre l'OSM i Equipaments. Es fa servir la de l'OSM.
- **Cisterna Vella**: és subterrània i no se'n coneixen les mides. Només té rètol.
