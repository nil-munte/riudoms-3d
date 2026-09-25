# Lectura de les fotos de façana del Cadastre

Cada foto (`data/raw/cadastre/facades/<ref>.jpg`, servei OVCFotoFachada del
Cadastre) és la façana de carrer de la finca `<ref>`. Un agent d'IA amb visió
(Claude) la mira i n'escriu una fitxa JSON. `scripts/p_facade_layouts.py` fa
servir aquestes fitxes perquè el shader de façanes dibuixi les obertures reals
de cada edifici, en comptes d'un patró genèric. Les fitxes es desen a
`data/raw/facade_survey/batch_*.json` (una llista d'objectes per lot).

## Regles

- **Edifici objectiu**: el que ocupa el centre de la foto. Si n'hi ha dos a
  parts iguals o no queda clar quin és, `"target": "unclear"`.
- **Només el que es veu.** Si un arbre, un camió o una bastida tapen una part,
  descriu el que es veu i posa `"occluded": true`. No completis de memòria.
  Si no es pot llegir la façana, posa `"usable": false` i deixa la resta buit.
- **Plantes**: totes les que tenen obertures cap al carrer, amb la planta baixa
  inclosa. Unes golfes amb finestres petites compten com a planta, amb
  `"attic": true`.
- **Posicions**: `x` és el centre de l'obertura i `w` la seva amplada, en
  fracció de l'amplada de la façana de l'edifici objectiu (0 = marge esquerre,
  1 = marge dret, tal com es veu a la foto). Són aproximades: n'hi ha prou amb
  dues xifres decimals.
- **Obertures de la planta baixa** (`ground`), d'esquerra a dreta. Tipus:
  `door` (porta de vianants), `arch_door` (portal adovellat o d'arc),
  `garage` (porta de garatge o de magatzem), `arch_garage`, `shop` (aparador o
  local comercial), `window`, `small` (finestra petita o respirall).
- **Plantes pis** (`upper`), de baix a dalt, cadascuna amb:
  - `o`: obertures d'esquerra a dreta. Tipus: `window` (finestra o ampit),
    `balcony` (porta balconera), `small` (finestra petita o de golfes),
    `gallery` (tribuna o galeria tancada), `terrace` (terrassa oberta o reculada).
  - `bal`: balcons d'aquesta planta. `none`, `individual` (un per porta
    balconera) o `continuous` (un de sol per a diverses obertures); si és
    continu, `bx0` i `bx1` en marquen l'inici i el final.
- **Colors** en hexadecimal, tal com els veuries a la llum del dia (corregeix
  l'ombra o el contrallum si cal): `wall`, `ground_wall` (si la planta baixa
  és d'un altre color o material), `frame` (fusteria), `shutter`, `door`.
- **Materials** i altres camps: vegeu l'esquema.

## Esquema

```json
{
  "ref": "6061801CF3566A",
  "usable": true,
  "target": "center",
  "occluded": false,
  "floors": 3,
  "attic": false,
  "wall": "#e8d9b0", "wall_material": "stucco",
  "ground_wall": null, "ground_material": null,
  "plinth": {"h": 0.8, "color": "#9a9186", "material": "stone"},
  "frame": "#f0f0ee", "shutter": "#4f6e46", "shutters": "wood_slat",
  "door": "#6b4a2b",
  "surrounds": false,
  "railing": "iron",
  "roof": "eave",
  "ground": [{"t": "garage", "x": 0.3, "w": 0.3}, {"t": "door", "x": 0.75, "w": 0.15}],
  "upper": [
    {"o": [{"t": "balcony", "x": 0.3, "w": 0.14}, {"t": "balcony", "x": 0.72, "w": 0.14}], "bal": "individual"},
    {"o": [{"t": "window", "x": 0.3, "w": 0.12}, {"t": "window", "x": 0.72, "w": 0.12}], "bal": "none"}
  ],
  "notes": "façana de 2 eixos, sòcol de pedra"
}
```

Valors possibles:
- `wall_material`: `stucco` (arrebossat o pintat), `stone`, `brick`, `tile`
  (aplacat ceràmic), `concrete`, `block`.
- `plinth.material`: `stone`, `tile`, `paint`, `none`.
- `shutters`: `wood_slat` (persianes de llibret), `roller` (persiana
  enrotllable), `none`, `mixed`.
- `railing`: `iron`, `glass`, `masonry`, `none`.
- `roof`: `eave` (ràfec de teula), `cornice` (cornisa), `parapet` (ampit de
  terrat), `unknown`.
