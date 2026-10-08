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

Les fonts, les quantitats, els emblemàtics, les correccions a les pistes inicials i el que no s'ha trobat
són a [DADES.md](DADES.md) (document públic).

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

## Nucli urbà i façanes reals

- **Només el poble** (`p_region.py`). El món es limita a les illes cadastrals del nucli que són de debò poble: com a mínim un 12 % construït, i d'això, almenys un 45 % d'ús residencial, comercial, d'oficines o públic.
  - A cada illa s'hi afegeix una franja de 22 m (els carrers i les voreres perimetrals). Es queda la peça connexa que conté la plaça de l'Església, d'unes 80 ha.
  - Queden fora: els camps, els polígons industrials, la riera fora del poble i els masos.
  - Tots els passos del pipeline retallen amb aquest contorn. Fora s'hi veu el relleu en un color neutre, com una maqueta, i una tanca invisible impedeix sortir-ne.
  - L'ortofoto del nucli s'exporta a 0,25 m/píxel (resolució completa de l'ortofoto de 25 cm).
- **Façanes llegides de les fotos del Cadastre** (`facade_survey.md`, `p_facade_layouts.py`).
  - Un agent d'IA amb visió (Claude) ha mirat cada foto de façana del nucli i n'ha fet una fitxa: plantes; obertures de cada planta d'esquerra a dreta, amb tipus, posició i amplada; balcons; persianes; colors; materials; sòcol.
  - Resultat: 1.003 fotos llegides. 991 són aprofitables, i en 51 d'aquestes l'edifici objectiu no és del tot clar (el centre de la foto cau entre dues cases): s'ha triat el més probable mirant les fotos veïnes, i queden marcades.
  - Al final hi ha 928 edificis amb la façana principal dibuixada segons la seva foto.
  - Les fitxes són a `data/raw/facade_survey/batch_*.json`. El shader dibuixa aquestes obertures i els balcons es col·loquen allà on surten a la foto.
  - Els trams de contorn col·lineals es tracten com una sola façana.
  - És una lectura visual: les posicions són aproximades (±10 % de l'amplada) i la foto pot ser antiga.
- **No es pot entrar als edificis.** La planta de cada edifici és sòlida (`Collision.addPolygon`): si el personatge, la bici o un teletransport queden dins d'una planta, en surten pel punt lliure més proper.

## Què és dada real i què és estimat

És a [DADES.md](DADES.md). Quan s'afegeixi o es canviï una dada, s'hi ha d'actualitzar la taula corresponent.
