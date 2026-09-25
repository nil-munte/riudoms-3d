# Builds data/raw/heritage/landmarks.json from the verified research (run from project root).
import json, sys, os
sys.path.insert(0, 'data/raw/heritage/sources')
from utm import ll2utm

IPAC = lambda i: f"https://invarquit.cultura.gencat.cat/card/{i}"
IPACAPI = lambda i: f"https://invarquit.cultura.gencat.cat/api/Card/{i} (saved: data/raw/heritage/sources/ipac/ipac_card_{i}.json)"
WD = lambda q: f"https://www.wikidata.org/wiki/{q}"
OSMN = lambda n: f"https://www.openstreetmap.org/node/{n}"
OSMW = lambda n: f"https://www.openstreetmap.org/way/{n}"
OSMR = lambda n: f"https://www.openstreetmap.org/relation/{n}"
LIST = "https://ca.wikipedia.org/wiki/Llista_de_monuments_de_Riudoms"
CAW = lambda t: "https://ca.wikipedia.org/wiki/" + t.replace(' ', '_')
AJ_LLOCS = "https://www.riudoms.cat/llocs-dinteres-turistic"
AJ_PLACES = "https://www.riudoms.cat/places"
TUR = lambda s: f"https://riudomsturisme.cat/{s}/"
CAMP = "https://campaners.com/php/campanar.php?numer=6641"
FIG23 = "https://raco.cat/index.php/LoFloc/article/view/423205 (Figuerola, Lo Floc 244, 2023)"
PEREA07 = "https://raco.cat/index.php/LoFloc/article/view/312106 (Perea, Lo Floc 180, 2007)"
PEREA00E = "https://raco.cat/index.php/LoFloc/article/view/310528 (Perea, Lo Floc 165, 2000)"
PEREA00O = "https://raco.cat/index.php/LoFloc/article/view/310734 (Perea, Lo Floc 166, 2000)"
CATREL = "https://www.catalunyareligio.cat/ca/node/175602"
TINET = "https://usuaris.tinet.cat/jogili/riudoms/ajuntament.html"
TDIG = "https://tarragonadigital.com/noticia/14444/descoberta-muralla-medieval-nucli-antic-riudoms (content seen only via web-search snippet; page itself not retrievable)"
CAD = lambda ref: f"Cadastre INSPIRE building {ref} (local file data/raw/cadastre/gml/A.ES.SDGC.BU.43131.building*.gml)"
LIDAR = "ICGC LiDAR tile 336556/336555 (local data/raw/icgc/lidar/*.laz, summary in data/raw/heritage/sources/lidar_measurements.json; scripts lidar_extract.py, lidar_church*.py, lidar_misc.py, lidar_square_profile.py); heights are orthometric metres"
COMMONS = lambda f: "https://commons.wikimedia.org/wiki/File:" + f.replace(' ', '_')

def utm(lat, lon):
    x, y = ll2utm(lat, lon)
    return {"x": round(x, 1), "y": round(y, 1), "crs": "ETRS89 / UTM 31N (EPSG:25831)", "note": "computed from the WGS84 lat/lon with a local TM formula (ETRS89~WGS84 at <1 m); not read from IPAC (IPAC API exposes no coordinates)"}

L = []
def add(**k):
    k['utm_etrs89_31n'] = utm(k['lat'], k['lon'])
    L.append(k)

# ---------------------------------------------------------------- 1 CHURCH
add(
 id="esglesia_sant_jaume", name="Església parroquial de Sant Jaume Apòstol", category="església (BCIN)",
 lat=41.139104, lon=1.051104,
 coord_source="IPAC monument coordinate as published in the ca.wikipedia list (IPA-9668) and Wikidata Q27928469 (identical); OSM node 2817434597 gives 41.13908,1.0511043. Point lies inside the nave near the facade. Derived: facade centre ≈ 41.139060,1.051180; tower centre ≈ 41.139037,1.051014; apse end ≈ 41.139448,1.050879 (cadastre+LiDAR, estimated).",
 refs={"ipac": 9668, "bcin": "4402-MH-EN (17/09/2019)", "bcil": "4478-I (1993)", "wikidata": "Q27928469", "osm": OSMN(2817434597), "cadastre": "6562201CF3566B"},
 description_ca="Temple parroquial de nau única molt ampla amb sis capelles laterals per banda entre contraforts i capçalera poligonal, cobert amb voltes de creueria estrellades. La façana principal, de carreus de pedra daurada, combina una gran portalada-retaule renaixentista amb fornícules buides, una gran rosassa i un coronament recte amb un pinyó central on hi ha el rellotge. El campanar quadrat s'alça a l'esquerra de la façana i acaba en un terrat amb balustrada.",
 verified_facts=[
  {"fact": "First stone laid by the archbishop of Tarragona on 20 December 1588; consecrated 25 July 1617.", "sources": [FIG23, AJ_LLOCS + " (1588 first stone / 1617 inauguration)", IPACAPI(9668) + " (consecrated 1617)"]},
  {"fact": "Wikipedia (citing Perea, Lo Floc 219, 2017) says the works actually started at the end of 1593 and the church was inaugurated 26 July 1617; campaners.com says 'edificada entre el 1599 i el 1617'. The claim '1588 first stone' is therefore verified, but the construction start is disputed (1588 formal first stone vs 1593 actual works).", "sources": [CAW("Sant Jaume de Riudoms"), CAMP]},
  {"fact": "Declared BCIN (monument històric) by Govern agreement of 17/09/2019 (register 4402-MH-EN); previously BCIL 1993.", "sources": ["https://invarquit.cultura.gencat.cat/api/Inventary/9668/proteccions (saved ipac_inv_9668_proteccions.json)", CAW("Sant Jaume de Riudoms")]},
  {"fact": "Style listed by IPAC as Renaixement + Gòtic tardà, 16th-17th c.; Figuerola: Gothic structural system (rib vaults, roof) with classicist language (Escola del Camp).", "sources": ["https://invarquit.cultura.gencat.cat/api/Inventary/9668/estils", FIG23]},
  {"fact": "Single nave without transept, polygonal apse, six lateral chapels between the buttresses (Figuerola: 4 m deep; 'six per side' in ca.wikipedia and campaners).", "sources": [IPACAPI(9668), FIG23, CAMP]},
  {"fact": "Nave interior 41.97 m long × 13.27 m wide × 20.80 m high; total interior width to the back of the side altars 21.20 m; six bays with star (tercelet) rib vaults on five round transverse arches.", "sources": [CAMP + " (inventory text by D. Dalmau i Argemir)"]},
  {"fact": "Blai persuaded the jurats that a church of 28 × 8 canes would suffice (≈43.5 × 12.4 m if 1 cana ≈ 1.555 m; conversion is my estimate).", "sources": [FIG23]},
  {"fact": "Rose window 9 m in diameter; original stained glass destroyed in the Civil War and replaced in 1947; facade crown straight with a central mixtilinear gable containing a clock.", "sources": [IPACAPI(9668)]},
  {"fact": "Facade: coat of arms relief dated 1606, God the Father relief 1608; 1610 on the apse vault (Figuerola: painted '1610-1947').", "sources": [CAW("Sant Jaume de Riudoms"), FIG23]},
  {"fact": "Sacristy built in a second phase in 1686; Santíssim chapel (where the Beat Bonaventura Gran's remains lie) built 1878 on the left (Gospel) side, attributed to Antoni Ortiga Caparó.", "sources": [CAW("Sant Jaume de Riudoms"), FIG23]},
  {"fact": "Sacked and burned in July 1936 (Figuerola: 23 July; Ajuntament: 25 July), part of the vaults at the foot collapsed; restored by F. Monravà, reopened 9 Sept 1942 (IPAC: back to worship 1942).", "sources": [FIG23, AJ_LLOCS, IPACAPI(9668)]},
  {"fact": "Access ramps to the parish church were installed (accessibility).", "sources": [PEREA07]},
  {"fact": "Wrongly attributed to Pere Blai according to Perea (2017); IPAC and the Ajuntament still name Blai and Joan Sans; Joan Mas was master of works 1593-1626.", "sources": [CAW("Sant Jaume de Riudoms"), IPACAPI(9668), AJ_LLOCS]},
 ],
 claims_check=[
  {"claim": "first stone 1588", "status": "VERIFIED (20 Dec 1588)", "sources": [FIG23, AJ_LLOCS]},
  {"claim": "consecrated 1617", "status": "VERIFIED (25 July 1617)", "sources": [FIG23, IPACAPI(9668)]},
  {"claim": "bell tower finished 1877", "status": "VERIFIED by IPAC and Figuerola 2023 (begun 1689). CONFLICTS: ca.wikipedia 'Riudoms' says crowned 1878 (continued 1665-67); campaners.com calls it a 'campanar renaixentista del 1746'.", "sources": [IPACAPI(9668), FIG23, CAW("Riudoms"), CAMP]},
  {"claim": "BCIN 2019", "status": "VERIFIED (17/09/2019, 4402-MH-EN)", "sources": ["https://invarquit.cultura.gencat.cat/api/Inventary/9668/proteccions"]},
  {"claim": "transition late Gothic-Renaissance", "status": "VERIFIED", "sources": ["https://invarquit.cultura.gencat.cat/api/Inventary/9668/estils", FIG23]},
  {"claim": "accessed by stairs with a ramp", "status": "PARTLY VERIFIED: ramps documented (Perea 2007); LiDAR shows the church sits on a platform ~0.5 m above the Plaça Gran (a few broad steps visible in Commons photo 'Mosaic amb l'escut de Riudoms ... P1130398'); exact ramp position not documented.", "sources": [PEREA07, LIDAR, COMMONS("Mosaic amb l'escut de Riudoms - plaça de l'Església - Riudoms - P1130398.jpg")]},
 ],
 history_line_ca="La primera pedra d'aquesta església es va posar el 20 de desembre de 1588 i el temple es va consagrar el 25 de juliol de 1617.",
 history_line_source=FIG23 + "; " + AJ_LLOCS,
 modelling={
  "orientation": {"value": "Facade faces SSE onto the Plaça de l'Església (facade normal azimuth ≈153°); apse to the NNW (≈333°).", "source": "estimated: long axis of cadastre polygon 6562201CF3566B = 152.7°/332.7° and LiDAR; campaners.com says 'façana principal encarada a migjorn' (south) — consistent", "refs": [CAD("6562201CF3566B"), CAMP]},
  "plan": "Rectangular single nave (6 bays) + 6 chapels per side between buttresses + polygonal apse; sacristy behind the apse; Santíssim chapel as a wing on the left/WSW side behind the bell tower.",
  "dimensions_m": {
   "nave_interior_length": {"value": 41.97, "source": CAMP},
   "nave_interior_width": {"value": 13.27, "source": CAMP},
   "nave_interior_vault_height": {"value": 20.80, "source": CAMP},
   "interior_width_incl_side_chapels": {"value": 21.20, "source": CAMP},
   "side_chapel_depth": {"value": 4.0, "source": FIG23},
   "bay_spacing": {"value": 6.5, "source": "estimated: buttress positions every ~6.3-6.6 m on the cadastre polygon"},
   "exterior_length_facade_to_apse": {"value": 47, "source": "estimated: cadastre polygon (facade line to apse tip ≈46-50 m incl. irregular apse annexes) and LiDAR roof ridge from along -40 to +2 m"},
   "exterior_width_nave_plus_chapels": {"value": 24.5, "source": "estimated: cadastre polygon/LiDAR (chapels outer faces ≈ -14 and +10.5 m from the nave axis offset)"},
   "nave_outer_width_at_roof": {"value": 17, "source": "estimated: LiDAR cross-section at mid-nave (roof at 21-22.5 m spans ~17 m)"},
   "cadastre_footprint_area_m2": {"value": 1357, "source": CAD("6562201CF3566B") + " (whole building incl. tower, Santíssim chapel and sacristy; min. bounding rectangle 55.6 × 33.6 m)"},
   "sacristy_footprint": {"value": "≈13 × 6.6 m, 2 floors, ~8-10 m high", "source": "estimated: cadastre part 6562201CF3566B_part2 (71 m², 2 floors) + LiDAR; identification as sacristy is my inference"},
   "santissim_chapel_wing": {"value": "≈10 m wide × ~15 m long behind the tower on the WSW side; two bays + 5-sided presbytery", "source": "estimated from cadastre wing; bay/presbytery description from " + FIG23},
  },
  "heights_m_above_church_platform": {
   "reference_ground": {"value": "church platform in front of facade ≈124.4 m a.s.l.; Plaça Gran ≈123.0-123.6; Plaça Petita ≈121.5-121.8", "source": LIDAR},
   "nave_roof_ridge": {"value": 22.5, "source": LIDAR},
   "nave_eaves_wall_top": {"value": 21.0, "source": LIDAR},
   "side_chapel_roofs": {"value": 10.5, "source": LIDAR},
   "buttress_tops": {"value": 17.5, "source": LIDAR},
   "facade_crown_lateral": {"value": 22.3, "source": LIDAR},
   "facade_central_clock_gable_top": {"value": 25.8, "source": LIDAR},
   "facade_outer_side_parts": {"value": 19.5, "source": LIDAR},
  },
  "roof": {"value": "Very low-pitch two-slope roof whose tiles follow the extrados of the rib vaults (flat 'Roman' U-tiles capped with Arab tiles), draining through the walls to channels over the buttresses and gargoyles; chapel roofs lower, with gable-like buttress tops visible on the flank.", "source": FIG23 + "; photo " + COMMONS("Sant Jaume de Riudoms.jpg")},
  "materials_colours": {"value": "Main facade and tower: large squared ashlars of golden/ochre sandstone ('pedra d'un to daurat'); corner quoins rusticated; side walls: rough rubble masonry (grey-brown) with buttresses faced in ashlar at the outer part.", "source": CAMP + "; photos"},
  "facade_elements": [
   {"value": "Central round-arched door (wooden leaves) flanked by Ionic semi-columns/pilasters, within a two-storey stone retable: lower storey Ionic, upper storey Corinthian, empty shell-topped niches (campaners counts 11), triangular pediment with God the Father relief (1608) flanked by volutes; oval coat of arms of Riudoms (1606) over the door.", "source": IPACAPI(9668) + "; " + CAMP + "; " + AJ_LLOCS + " (Ajuntament says Doric at the portal — inconsistent with IPAC/campaners)"},
   {"value": "Rose window, 9 m diameter, at mid height above the retable, with stained glass (St James / Clavijo).", "source": IPACAPI(9668) + "; " + CAW("Sant Jaume de Riudoms")},
   {"value": "Straight crown with a small moulded cornice and a central mixtilinear gable ('pinyó') containing a clock, topped by a wrought-iron element.", "source": IPACAPI(9668) + "; " + CAMP + "; photo " + COMMONS("Riudoms esglesia.jpg")},
   {"value": "Main facade width ≈19 m excluding the tower; ≈27 m including the tower.", "source": "estimated: LiDAR facade strip (across -14 to +4.8 m) and tower (+4.8 to +13 m)"},
  ],
  "interior": "Classical Ionic pilasters carrying a frieze along the nave; rib vaults with worked-stone ribs in nave, chapels, sacristy, choir and Santíssim chapel; Beat Bonaventura chapel with coffered polychrome barrel vault; choir and wooden draught screen in the first bay; presbytery originally ~0.5 m above the nave; new polished-stone pavement in three tones (2023). Sources: " + IPACAPI(9668) + "; " + CAMP + "; " + FIG23,
  "bell_tower": {
   "position": {"value": "At the left end of the main facade seen from the square, i.e. the SW/WSW corner, flush with the facade, over the left aisle of chapels, with the Santíssim chapel behind it.", "source": AJ_LLOCS + "; " + IPACAPI(9668) + "; " + CAMP + "; " + LIDAR},
   "plan": {"value": "Square (campaners: 'gairebé quadrada' 6.36 × 6.00 m; Figuerola: 'planta quadrada'). LiDAR top extent ≈8.4 × 8.2 m and photo proportions suggest ~8 m exterior side; 6.36 × 6.00 m may be interior or incorrect — CONFLICT.", "source": CAMP + "; " + FIG23 + "; " + LIDAR},
   "height_total": {"value": "33.75 m (campaners) / 37 m (Figuerola 2023) / LiDAR: top of terrace balustrade ≈32.9 m above the church platform (≈35.5 m above Plaça Petita). The weathervane above is not captured by LiDAR.", "source": CAMP + "; " + FIG23 + "; " + LIDAR},
   "terrace_level": {"value": 31.5, "source": LIDAR + " (dominant LiDAR returns at 31-33 m above platform)"},
   "stages": {"value": "Plain square shaft in ashlar with a plinth moulding; second moulding under the bell chamber; bell chamber with round-arched openings (campaners: two on the east face, one on each of the other faces; Figuerola: 'quatre finestrals'); moulded crowning cornice; flat terrace.", "source": CAMP + "; " + FIG23 + "; " + IPACAPI(9668)},
   "crown": {"value": "No spire. Flat terrace (ceramic tile) with a balustrade: solid ashlar/masonry posts at the four corners and balusters in the centre of each face; small tiled dome over the bell chamber; wrought-iron weathervane (from the old church, once with a small bell 'la Josepa').", "source": CAMP + "; " + FIG23 + "; photo " + COMMONS("Part superior del campanar de Riudoms.jpg")},
   "bells": {"value": "4 bells (Jacoba, Sebastiana, Immaculada, Bonaventura)", "source": CAMP + "; https://reusdigital.cat/noticies/el-camp/lesglesia-sant-jaume-de-riudoms-estrena-campanes"},
   "stair": {"value": "Masonry stair from the choir, then a stone spiral stair in a cylinder attached to the north side of the tower; ladder to the terrace in the SW corner.", "source": CAMP + "; " + FIG23},
   "centre_latlon": {"value": [41.139037, 1.051014], "source": "estimated: centre of LiDAR returns >26 m above platform"},
  },
 },
 commons_photos=["Sant Jaume de Riudoms.jpg", "Sant Jaume de Riudoms - P1130379.jpg", "Riudoms esglesia.jpg", "Església i plaça de Riudoms 01.jpg", "Església i plaça de Riudoms 02.jpg", "Plaça del Comte Arnau i església de Sant Jaume de Riudoms - panoramio.jpg", "Església de Riudoms.jpeg", "Part superior del campanar de Riudoms.jpg", "Teulada de Sant Jaume de Riudoms 02.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Sant_Jaume_de_Riudoms (+ Interior of Sant Jaume de Riudoms, 62 files)",
)

# ---------------------------------------------------------------- 2 PLAÇA DE L'ESGLÉSIA
add(
 id="placa_esglesia", name="Plaça de l'Església (plaça Gran)", category="plaça (BCIL, conjunt amb la plaça Petita)",
 lat=41.13885, lon=1.05153,
 coord_source="OSM pedestrian area way 277215272 (centre). IPAC/Wikidata point for the whole ensemble (IPA-9672, Q58928929): 41.138694,1.051649.",
 refs={"ipac": 9672, "bcil": "4482-I (1993)", "wikidata": "Q58928929", "osm": OSMW(277215272)},
 description_ca="Gran plaça del nucli antic, al pla de l'església, que forma amb la plaça Petita un espai obert d'uns 4.100 m². Està pavimentada amb franges de lloses de colors i un gran mosaic amb l'escut de Riudoms, i la tanquen l'església, l'Abadia, els porxos i cases de façana centenària. Sota el paviment hi ha la Cisterna Vella, que es va reconvertir en refugi antiaeri.",
 verified_facts=[
  {"fact": "The Plaça de l'Església and the Plaça Petita (joined on the south side at a lower level) form an open space of about 4,100 m²; porxos in two runs of ten and six arcades.", "sources": [IPACAPI(9672), AJ_PLACES, TUR("placa-de-lesglesia")]},
  {"fact": "The space was linked to the medieval castle of Arnau de Palomar (settlement charter 25 Jan 1151); grain silos of the Comú documented in 1386; known as plaça del Sitjar or del Castell until the early 20th c.", "sources": [AJ_LLOCS, PEREA00E]},
  {"fact": "Documented from the 17th century, formerly unpaved; remodelled to its present state in 1977.", "sources": [AJ_PLACES, PEREA00E]},
  {"fact": "Walls and stairs of the square date from the late 19th century; houses above the porxos from 1898; in 1983 the old market at the end of the porxos was demolished and a new market and the Llar dels Jubilats were built.", "sources": [AJ_PLACES]},
  {"fact": "Ornamental fountain of the Plaça de l'Església dated 1976-77 (jets and colour effects).", "sources": [PEREA07]},
  {"fact": "Monument to Josep Cros ('Oda a Riudoms') made of upright rough stones, 2005.", "sources": [PEREA07, "https://commons.wikimedia.org/wiki/Category:Plaça_de_l'Església_i_plaça_Petita_(Riudoms)"]},
  {"fact": "Paving mosaic with the Riudoms coat of arms (a river with two elm trees, i.e. a canting 'riu d'oms' device) in the Plaça Gran.", "sources": [COMMONS("Mosaic amb l'escut de Riudoms - plaça de l'Església - Riudoms - P1130398.jpg") + " (visual)"]},
  {"fact": "Statue of Gaudí (Joan Serramià, 20 Jan 2019) stands on the stairs of the square.", "sources": [TUR("estatua-gaudi")]},
 ],
 claims_check=[
  {"claim": "porxos extended 1983", "status": "NOT VERIFIED / probably WRONG: the documented 1983 work is the new market + Llar dels Jubilats built at the end of the porxos after demolishing the old market.", "sources": [AJ_PLACES]},
  {"claim": "paving with mosaic of the Riudoms coat of arms", "status": "VERIFIED (Commons photos)", "sources": [COMMONS("Mosaic amb l'escut de Riudoms - plaça de l'Església - Riudoms - P1130399.jpg")]},
  {"claim": "mosaics of the four provinces", "status": "NOT VERIFIED (no source found; aerial photos show one large and at least one smaller mosaic)", "sources": [COMMONS("Plaça de l'església vista des del campanar 02.jpg")]},
  {"claim": "large fountain with shrubs", "status": "PARTLY VERIFIED: a 1976-77 ornamental fountain is documented; aerial photo shows a round basin with planting in front of the Abadia/tower base", "sources": [PEREA07, CATREL + " (Abadia 'just al davant de la font del poble')", COMMONS("Plaça de l'església vista des del campanar 02.jpg")]},
  {"claim": "benches", "status": "VERIFIED visually (photos)", "sources": [COMMONS("Abadia - casa de la Parròquia - plaça de l'Església 1 - Riudoms - P1130377.jpg")]},
  {"claim": "stairs down to carrer de Sant Bonifaci", "status": "NOT VERIFIED (no text source; plausible from LiDAR level drop to the W/SW)", "sources": []},
  {"claim": "former castle site", "status": "VERIFIED", "sources": [AJ_LLOCS, IPACAPI(9667), PEREA07]},
 ],
 history_line_ca="Aquesta plaça ocupa l'espai de l'antic castell d'Arnau de Palomar, i per això fins a principis del segle XX es deia plaça del Castell o del Sitjar.",
 history_line_source=AJ_LLOCS + "; " + PEREA00E,
 modelling={
  "area_m2": {"value": 4100, "source": IPACAPI(9672) + " (both squares together)"},
  "levels": {"value": "Church platform ≈124.4 m; a few broad steps (~0.5 m) down to the Plaça Gran ≈123.4 m sloping to ≈123.0 m; a flight of steps (~1 m) down to the Plaça Petita ≈121.5-121.8 m; streets to the SE ≈120.8 m.", "source": LIDAR + " (profile along the church axis, script lidar_square_profile.py)"},
  "paving": {"value": "Grid/bands of square slabs in beige, pink and grey laid diagonally; one large shield-shaped mosaic (river + two elms, red border) and smaller mosaics.", "source": "photos " + COMMONS("Plaça de l'església vista des del campanar 01.jpg") + ", " + COMMONS("Mosaic amb l'escut de Riudoms - plaça de l'Església - Riudoms - P1130398.jpg")},
  "edges": "N/NW: church platform and facade; W: Abadia (3 floors) and Casal Riudomenc behind; E and S: porxos buildings (3 storeys, cream stucco, arcaded ground floor); S: stairs down to the Plaça Petita. Source: aerial photos + OSM.",
  "vegetation": {"value": "Large cedar and a jacaranda near the SE edge, further trees at the Plaça Petita; potted/planted beds near the church.", "source": "photos (visual)"},
  "street_furniture": {"value": "Iron benches, cast-iron multi-lamp street lights, flagpoles, café terraces, Gaudí Route panel no. 12.", "source": "photos (visual); " + COMMONS("Ruta Gaudí Riudoms - panell 12.jpg")},
  "fountain_1976_77_location": {"value": [41.138927, 1.051106], "source": "estimated from the tower-top photo and the Catalunya Religió remark (in front of the Abadia)"},
 },
 commons_photos=["Plaça de l'església vista des del campanar 01.jpg", "Plaça de l'església vista des del campanar 02.jpg", "Mosaic amb l'escut de Riudoms - plaça de l'Església - Riudoms - P1130398.jpg", "Plaza de la iglesia Riudoms.jpg", "Plaça a Riudoms - panoramio.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Plaça_de_l'Església_i_plaça_Petita_(Riudoms)",
)

add(
 id="porxos_placa", name="Porxos de la plaça de l'Església", category="porxada / conjunt urbà",
 lat=41.138866, lon=1.051917,
 coord_source="Wikidata Q138508176 (P625).",
 refs={"wikidata": "Q138508176", "ipac": "part of 9672"},
 description_ca="Cases de tres plantes amb la planta baixa porxada que tanquen la plaça pels costats de llevant i migdia, en dos trams de deu i sis arcades. Les façanes, de color clar uniforme, tenen balcons de ferro forjat.",
 verified_facts=[
  {"fact": "Two runs of ten and six arcades.", "sources": [IPACAPI(9672), AJ_PLACES]},
  {"fact": "Rebuilt at the end of the 19th century reusing ashlars of the convent de Sant Joan, burned in 1835 (IPAC: 'segons diuen'); houses above the porxos dated 1898.", "sources": [AJ_PLACES, TUR("placa-de-lesglesia"), IPACAPI(9677)]},
  {"fact": "The east side of the square (the Porxos block between l'Arenal, Sant Isidre and the square) was urbanised in the second half of the 19th century.", "sources": [PEREA07]},
 ],
 claims_check=[{"claim": "porxos extended 1983", "status": "NOT VERIFIED (see placa_esglesia)", "sources": [AJ_PLACES]}],
 history_line_ca="Els porxos, de deu i sis arcades, es van refer a finals del segle XIX aprofitant carreus del convent de Sant Joan, cremat el 1835.",
 history_line_source=AJ_PLACES + "; " + TUR("placa-de-lesglesia"),
 modelling={
  "floors": {"value": 3, "source": "photos (ground-floor arcade + 2 upper floors) — visual"},
  "arcades": {"value": "10 + 6 round arches", "source": IPACAPI(9672)},
  "arch_bay_width": {"value": 3.5, "source": "estimated from aerial photo proportions"},
  "height_to_eaves": {"value": 12.5, "source": "estimated: LiDAR p95 135.5 m vs ground 121.3 m (≈14 m incl. roof); low confidence"},
  "materials_colours": "Cream/ivory stucco facades with white window surrounds, wrought-iron balconies, stone arches and piers at ground floor, low-pitch tiled roofs (photos).",
 },
 commons_photos=["Porxos de la Plaça de Riudoms 02.jpg", "Porxos de la plaça de Riudoms - P1130369.jpg", "Porxos a la plaça de Riudoms - panoramio.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Porxos_de_la_Plaça_de_Riudoms",
)

add(
 id="placa_petita", name="Plaça Petita (o del Llac)", category="plaça (BCIL, conjunt amb la plaça de l'Església)",
 lat=41.13863, lon=1.05181,
 coord_source="estimated: around the Dama Oferent fountain (OSM node 2817438819 41.1386122,1.05182; Wikidata Q138508179 41.138618,1.051831).",
 refs={"ipac": 9672, "wikidata": "Q58928929"},
 description_ca="Plaça situada a un nivell més baix, al sud de la plaça Gran, de la qual la separa un tram d'escales. La presideix la font hexagonal amb l'estàtua metàl·lica de la dama oferent, envoltada de plataners.",
 verified_facts=[
  {"fact": "Juxtaposed on the south side of the big square and at a lower level; contains a hexagonal fountain with a metal figure.", "sources": [IPACAPI(9672)]},
  {"fact": "Inaugurated in 1889 with a central monument designed by the Riudoms engineer Salvador Salvadó Bru (statue of an anonymous woman he brought from a Barcelona foundry; four spouts and four lion heads); remodelled in 1974 keeping its form.", "sources": [AJ_PLACES, TUR("placa-de-lesglesia")]},
  {"fact": "Also called plaça del Llac; separated from the big square by a flight of steps; statue of the Dama 'de 1889'.", "sources": [PEREA00E, PEREA07]},
 ],
 claims_check=[{"claim": "fountain with statue of a 'dama oferent' (1889?)", "status": "VERIFIED (1889)", "sources": [AJ_PLACES, PEREA00E]}, {"claim": "trees", "status": "VERIFIED visually (pollarded plane trees)", "sources": [COMMONS("Font de la Dama Oferent - Riudoms - P1130380.jpg")]}],
 history_line_ca="La plaça Petita es va inaugurar el 1889 amb la font i l'estàtua de la dama que va projectar l'enginyer riudomenc Salvador Salvadó Bru.",
 history_line_source=AJ_PLACES,
 modelling={"ground_level": {"value": "≈121.5-121.8 m a.s.l., ~1 m below the Plaça Gran", "source": LIDAR}, "vegetation": "Pollarded plane trees, shrubs around the fountain enclosure (photos)", "surrounding_buildings": "3-4 storey houses with cream stucco, red-painted window frames and iron balconies (photo)"},
 commons_photos=["Font de la Dama Oferent - Riudoms - P1130380.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Plaça_de_l'Església_i_plaça_Petita_(Riudoms)",
)

add(
 id="font_dama_oferent", name="Font de la Dama Oferent", category="font monumental",
 lat=41.1386122, lon=1.05182,
 coord_source="OSM node 2817438819 (amenity=fountain, name 'La dama oferent'); Wikidata Q138508179: 41.138618,1.051831.",
 refs={"wikidata": "Q138508179", "osm": OSMN(2817438819)},
 description_ca="Font de planta hexagonal amb vas de rajola blava, tancada amb una barana de ferro. Al centre, un pilar de maó amb plafons de rajola sosté un pedestal de fosa i l'estàtua d'una dona que porta un gerro sobre el cap.",
 verified_facts=[
  {"fact": "Hexagonal fountain decorated with a metal figure.", "sources": [IPACAPI(9672)]},
  {"fact": "Statue of an unnamed woman brought by engineer Salvador Salvadó Bru from a Barcelona foundry; the square was inaugurated in 1889.", "sources": [AJ_PLACES, TUR("placa-de-lesglesia")]},
 ],
 claims_check=[{"claim": "statue 1889", "status": "VERIFIED (date also appears cast on the pedestal in the Commons photo — visual, low resolution)", "sources": [AJ_PLACES, COMMONS("Font de la Dama Oferent - Riudoms - P1130380.jpg")]}],
 history_line_ca="L'estàtua de la dama sense nom, portada d'una foneria de Barcelona, presideix aquesta font des de la inauguració de la plaça Petita el 1889.",
 history_line_source=AJ_PLACES,
 modelling={
  "basin": {"value": "hexagonal, ≈7 m across, low parapet ≈0.6 m with glazed tiles, blue interior, iron railing around", "source": "estimated from photo; hexagonal plan from IPAC"},
  "central_pier": {"value": "brick pier ≈1.2 m square, ≈2 m high, with blue-white tile panels and four spout heads", "source": "estimated from photo; four lion-head spouts from " + AJ_PLACES},
  "statue_top_height": {"value": 5.1, "source": "LiDAR max 126.59 vs ground 121.48 m (" + LIDAR + ")"},
  "materials_colours": "Dark grey/black painted cast iron statue and pedestal, red brick, blue/white tiles (photo).",
 },
 commons_photos=["Font de la Dama Oferent - Riudoms - P1130380.jpg", "Font de la Dama Oferent.jpg", "La dama oferent.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Font_de_la_Dama_Oferent_(Riudoms)",
)

add(
 id="cisterna_vella", name="La Cisterna Vella - Refugi de la Guerra Civil", category="cisterna / refugi antiaeri (subterrani)",
 lat=41.13885, lon=1.05153,
 coord_source="estimated: under the Plaça de l'Església (same as the square centre; exact footprint not published).",
 refs={},
 description_ca="Gran cisterna municipal construïda sota la plaça de l'Església, que durant la Guerra Civil es va ampliar amb galeries per fer-ne un refugi antiaeri. Es pot visitar.",
 verified_facts=[
  {"fact": "Located under the Plaça de l'Església; after the 1727 fevers the town decided to build a large cistern at its own cost (document of 12 May 1756, AHMR capsa 5 doc. 302), apparently finished much later.", "sources": [AJ_LLOCS]},
  {"fact": "An air-raid shelter was built there in 1937-1938: a large hall (the cistern) reached through underground passages from several public and private entrances; 2 toilets, electric lighting and signage.", "sources": [AJ_LLOCS, TUR("visita-la-cisterna-vella")]},
  {"fact": "Perea (2000) dates the shelter to 1938 and says it survives half-buried under the 1977 paving.", "sources": [PEREA00E]},
 ],
 claims_check=[{"claim": "Cisterna Vella", "status": "VERIFIED. CONFLICT on date: the tourism site says 17th century, but the Ajuntament's own documentation places the decision after the 1727 epidemic (18th century).", "sources": [TUR("visita-la-cisterna-vella"), AJ_LLOCS]}],
 history_line_ca="Després de l'epidèmia de febres de 1727 el poble va decidir construir aquí una gran cisterna, que el 1937-1938 es va convertir en refugi antiaeri.",
 history_line_source=AJ_LLOCS,
 modelling={"capacity": {"value": "'divuit mil càrregues d'aigua' (18,000 loads) per the 1756 document", "source": AJ_LLOCS}, "dimensions": {"value": "unknown", "source": "not found"}, "entrance": {"value": "visitable; entrance location not documented in the sources read", "source": "not found"}},
 commons_photos=[], commons_category=None,
)

add(
 id="abadia", name="L'Abadia (Casa de la Parròquia)", category="casa rectoral",
 lat=41.1388556, lon=1.0511229,
 coord_source="OSM node 12825395744 ('Abadia - Casa de la Parròquia'); falls inside cadastre building 6461502CF3566B.",
 refs={"osm": OSMN(12825395744), "cadastre": "6461502CF3566B"},
 description_ca="Casa de la parròquia, a la cantonada de la plaça de l'Església tocant al temple. És un edifici de tres plantes amb façana estucada de color crema, porta d'arc de pedra adovellada i balcons de ferro forjat. Es va rehabilitar entre 2013 i 2014 per acollir la rectoria, Càritas i sales parroquials.",
 verified_facts=[
  {"fact": "Seat and office of the parish rector.", "sources": ["https://www.riudoms.cat/ambit-religios"]},
  {"fact": "Documented from the 16th century.", "sources": [PEREA00E]},
  {"fact": "Rehabilitated as the new Casa de la Parròquia (architects T113 Taller d'Arquitectura): project presented Oct 2012, works from May 2013, inaugurated 18 May 2014; it included an added top storey ('remunta') and an exterior access ramp; it stands at the corner of the largest square, next to the church, in front of the fountain.", "sources": [CATREL]},
 ],
 claims_check=[{"claim": "Abadia 1623", "status": "NOT VERIFIED (sources say 'documented from the 16th century'; no 1623 date found)", "sources": [PEREA00E]}, {"claim": "now three storeys", "status": "VERIFIED (cadastre 3 floors; photo ground + 2)", "sources": [CAD("6461502CF3566B"), COMMONS("Abadia - casa de la Parròquia - plaça de l'Església 1 - Riudoms - P1130377.jpg")]}],
 history_line_ca="L'Abadia, documentada des del segle XVI, és la casa de la parròquia i es va rehabilitar entre el 2013 i el 2014.",
 history_line_source=PEREA00E + "; " + CATREL,
 modelling={
  "footprint": {"value": "≈21.9 × 16.8 m (main part 249 m²)", "source": CAD("6461502CF3566B")},
  "floors": {"value": 3, "source": CAD("6461502CF3566B")},
  "height": {"value": "≈11-12.5 m to cornice/roof", "source": "LiDAR p95 136.3 / max 137.9 vs ground 125.2 m"},
  "facade": "Cream stucco, stone quoins on the left corner, round stone-voussoir doorway reached by a few steps, windows with white surrounds and small mixtilinear heads, iron balconies on floors 1-2, projecting eaves; sign 'ABADIA Casa de la Parròquia' (photo).",
  "roof": {"value": "low-pitch tiled roof behind a cornice", "source": "estimated from photo"},
 },
 commons_photos=["Abadia - casa de la Parròquia - plaça de l'Església 1 - Riudoms - P1130377.jpg"],
 commons_category=None,
)

add(
 id="casal_riudomenc", name="Casal Riudomenc (Teatre Auditori)", category="teatre / equipament cultural",
 lat=41.139011, lon=1.050781,
 coord_source="Wikidata Q138508175 (P625); OSM node 12825395767: 41.138993,1.0507877; cadastre building 6562212CF3566B.",
 refs={"wikidata": "Q138508175", "osm": OSMN(12825395767), "cadastre": "6562212CF3566B", "address": "C/ Sant Jaume, 2"},
 description_ca="Teatre auditori municipal al costat de l'església, fruit de la reforma de l'històric Casal Riudomenc. A la part alta de la façana, un plafó metàl·lic blanc llueix el logotip vermell rodó amb una C i el rètol 'Casal Riudomenc 1955-2010'.",
 verified_facts=[
  {"fact": "Theatre-auditorium fully refurbished from the historic Casal Riudomenc building, which was built with the effort of many local families; address C/ Sant Jaume 2.", "sources": [TUR("teatre-auditori-casal-riudomenc")]},
  {"fact": "Red round logo with a 'C' and the text 'Casal Riudomenc 1955-2010' on a white panel at the top of the facade.", "sources": [COMMONS("Casal Riudomenc - Riudoms - P1130400.jpg") + " (visual)"]},
  {"fact": "The parish had a Casal next to the church and sold it to the Ajuntament a few years before 2014.", "sources": [PEREA07 + " ('Casal parroquial adossat')", CATREL]},
 ],
 claims_check=[{"claim": "red logo at top", "status": "VERIFIED (photo)", "sources": [COMMONS("Casal Riudomenc - Riudoms - P1130400.jpg")]}, {"claim": "identity Casal parroquial = Casal Riudomenc", "status": "PROBABLE (inference from location and sources; not stated explicitly)", "sources": [PEREA07, CATREL]}],
 history_line_ca="El Casal Riudomenc, aixecat amb l'esforç de moltes famílies del poble, s'ha reconvertit en el teatre auditori de la vila.",
 history_line_source=TUR("teatre-auditori-casal-riudomenc"),
 modelling={
  "footprint": {"value": "≈40 × 25 m overall (738 m²), parts of 3-4 floors", "source": CAD("6562212CF3566B")},
  "height": {"value": "fly-tower/top ≈22 m above the church platform (LiDAR max 146.1 m a.s.l.)", "source": LIDAR},
  "facade": "Modern: exposed concrete frame with glazing, white metal cladding panel on top with red disc logo and black lettering; adjoins the church's golden ashlar (photo).",
 },
 commons_photos=["Casal Riudomenc - Riudoms - P1130400.jpg", "Casal Riudomenc - Riudoms - P1130401.jpg", "Casal Riudomenc.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Casal_Riudomenc",
)

add(
 id="monument_gaudi", name="Monument a Gaudí (plaça d'Arnau de Palomar)", category="monument",
 lat=41.1394319, lon=1.0511632,
 coord_source="OSM node 2801517337 (historic=monument); Wikidata Q138508174: 41.139439,1.051166.",
 refs={"wikidata": "Q138508174", "osm": OSMN(2801517337)},
 description_ca="Monòlit de marbre en forma de fletxa que s'estreny cap amunt i acaba amb una creu gaudiniana, al centre de la plaça d'Arnau de Palomar, al costat de l'església.",
 verified_facts=[
  {"fact": "Designed by architect Josep Piqué Iserte, inaugurated in August 1975; marble monolith in the shape of an arrow narrowing up to ten metres, topped by a Gaudinian cross; in the centre of the plaça d'Arnau de Palomar beside the church.", "sources": [AJ_LLOCS, TUR("monument-gaudi")]},
 ],
 claims_check=[{"claim": "height 10 m", "status": "SOURCE SAYS 10 m, but LiDAR only records ≈5.3 m above ground (slender top probably missed) — treat 10 m as nominal", "sources": [AJ_LLOCS, LIDAR]}],
 history_line_ca="Aquest monòlit de marbre, obra de l'arquitecte Josep Piqué Iserte, es va inaugurar l'agost de 1975 en homenatge a Antoni Gaudí.",
 history_line_source=AJ_LLOCS,
 modelling={"height": {"value": 10, "source": AJ_LLOCS}, "shape": "tapering arrow-like marble shaft on a base, crowned by a four-armed Gaudí-style cross (photos)", "setting": "traffic distribution square (Perea 2007) N/NE of the church"},
 commons_photos=["Monument a Gaudí - Riudoms - P1130403.jpg", "Monument a Gaudí.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Monument_a_Gaudí_(Riudoms)",
)

add(
 id="escultura_gaudi", name="Escultura de Gaudí", category="escultura",
 lat=41.138705, lon=1.0515638,
 coord_source="OSM node 12825395734 (tourism=artwork 'Antoni Gaudí'); Wikidata Q138508177: 41.138718,1.051605.",
 refs={"wikidata": "Q138508177", "osm": OSMN(12825395734)},
 description_ca="Escultura de bronze d'un Gaudí gran, a mida natural, dempeus sobre dos graons de les escales de la plaça de l'Església i amb una maqueta de les torres de la Sagrada Família a la mà.",
 verified_facts=[{"fact": "Adult Gaudí, 1.70 m tall, one foot on different steps, holding a model of the Sagrada Família towers; by Joan Serramià; inaugurated 20 January 2019; on the stairs of the Plaça de l'Església.", "sources": [TUR("estatua-gaudi")]}],
 claims_check=[],
 history_line_ca="L'escultura de Gaudí, obra de l'artista Joan Serramià, es va inaugurar el 20 de gener de 2019.",
 history_line_source=TUR("estatua-gaudi"),
 modelling={"height": {"value": 1.70, "source": TUR("estatua-gaudi")}, "material": {"value": "dark bronze (visual)", "source": "photos"}},
 commons_photos=["Escultura de Gaudí i font de la Dama Oferent - Riudoms - P1130392.jpg", "Escultures de Gaudí i de la plegadora d'Avellanes - Riudoms - P1130376.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Escultura_Gaudí_(Riudoms)",
)

add(
 id="escultura_plegadora", name="Escultura de la plegadora d'avellanes", category="escultura",
 lat=41.1386913, lon=1.0514495,
 coord_source="OSM node 12825395759; Wikidata Q138508178: 41.138725,1.051426.",
 refs={"wikidata": "Q138508178", "osm": OSMN(12825395759)},
 description_ca="Escultura d'una dona que recull avellanes, a la plaça de l'Església, prop de l'escultura de Gaudí.",
 verified_facts=[{"fact": "Sculpture of a hazelnut picker at the Plaça de l'Església (Commons category, OSM, Wikidata).", "sources": ["https://commons.wikimedia.org/wiki/Category:Escultura_La_plegadora_d'avellanes_(Riudoms)", WD("Q138508178")]}],
 claims_check=[{"claim": "author/date", "status": "NOT FOUND", "sources": []}],
 history_line_ca="A finals del segle XIX, després que la fil·loxera matés la vinya, l'avellaner es va convertir en el conreu principal de Riudoms.",
 history_line_source=CAW("Riudoms") + " (sections Edat contemporània / Economia); the sculpture's own date and author were not found",
 modelling={"height": {"value": 1.5, "source": "estimated from photos (life-size crouching/standing figure)"}},
 commons_photos=["Escultures de Gaudí i de la plegadora d'Avellanes - Riudoms - P1130376.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Escultura_La_plegadora_d'avellanes_(Riudoms)",
)

# ---------------------------------------------------------------- 5 SANT ANTONI
add(
 id="ermita_sant_antoni", name="Ermita de Sant Antoni de Pàdua", category="ermita (BCIL)",
 lat=41.142176, lon=1.048312,
 coord_source="IPAC coordinate via ca.wikipedia list (IPA-9670) = Wikidata Q58461785; OSM way 1058984126 centre 41.142227,1.04835; cadastre 6265506CF3566E.",
 refs={"ipac": 9670, "bcil": "4480-I (1993)", "wikidata": "Q58461785", "osm": OSMW(1058984126), "cadastre": "6265506CF3566E"},
 description_ca="Ermita barroca d'una sola nau amb capelles laterals, a la part alta del poble, enmig del parc arbrat de Sant Antoni. La façana, estucada imitant carreus, té porta d'arc de mig punt amb graons, una finestra, un frontó triangular amb un òcul i una espadanya d'un sol ull.",
 verified_facts=[
  {"fact": "Single nave with lateral chapels; barrel vault with lunettes in the nave, barrel vaults in the chapels; flat head with a 'volta bufada'; Baroque door to the sacristy; single-opening bell gable (espadanya) centred on the facade.", "sources": [IPACAPI(9670)]},
  {"fact": "Completed in 1702 according to the inscription on the portal.", "sources": [IPACAPI(9670), AJ_LLOCS]},
  {"fact": "Construction begun 1684 (Ajuntament) / projected 1690 (ca.wikipedia Riudoms, co-patron declared 1673); built outside the walls in the upper part of the village.", "sources": [AJ_LLOCS, CAW("Riudoms")]},
  {"fact": "Churrigueresque altarpiece of 1745 (Ajuntament); ca.wikipedia gives a Baroque altarpiece of 1730 by Lluís Bonifaç, partly burned in the Civil War — CONFLICT on date.", "sources": [AJ_LLOCS, CAW("Riudoms")]},
  {"fact": "By the stairs leading to the chapel the Racó de l'Avi green area was laid out in 1978, with a monument containing a fragment of the oldest baptismal font of the parish church.", "sources": [AJ_LLOCS, TUR("ermita-de-sant-antoni")]},
  {"fact": "In 1873 Carlists under Isidre Pàmies 'Cercós' entrenched around the chapel.", "sources": [CAW("Riudoms")]},
 ],
 claims_check=[{"claim": "Ermita with its stairs", "status": "VERIFIED (stairs mentioned; photo shows steps at the door and from a lower terrace)", "sources": [AJ_LLOCS, COMMONS("Ermita de Sant Antoni de Riudoms.JPG")]}],
 history_line_ca="Segons la inscripció de la portada, l'ermita de Sant Antoni es va acabar de construir l'any 1702.",
 history_line_source=IPACAPI(9670),
 modelling={
  "footprint": {"value": "≈19.1 × 12.1 m (230 m², 1 floor, cadastre year 1702)", "source": CAD("6265506CF3566E")},
  "orientation": {"value": "long axis ≈162°/342°; facade (with espadanya) at the SSE end, facing SSE toward the park", "source": "estimated: cadastre axis + LiDAR highest point (espadanya) at the SE end"},
  "heights": {"value": "roof/pediment ≈12.5 m, espadanya top ≈15 m above surrounding ground (≈134 m a.s.l.)", "source": LIDAR + " (building p95 146.7, max 149.2 m)"},
  "facade": "Warm ochre stucco scored as ashlar; round-arched door with voussoirs and wooden leaves, 4-5 steps; rectangular window above; cornice and triangular pediment with oculus; espadanya with one bell and small pinnacles (photo).",
  "roof": {"value": "two-slope tiled roof", "source": "estimated from photos"},
 },
 commons_photos=["Ermita de Sant Antoni de Riudoms.JPG", "Ermita de Sant Antoni vista des del Racó de l'Avi.JPG", "Creu i capella de Sant Antoni.jpeg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Ermita_de_Sant_Antoni_de_Riudoms",
)

add(
 id="placa_sant_antoni", name="Plaça i Parc de Sant Antoni", category="plaça / parc",
 lat=41.142049, lon=1.048108,
 coord_source="OSM way 277220967 (Parc de Sant Antoni) centre.",
 refs={"osm": OSMW(277220967), "ipac_address": "Pl. de Sant Antoni (IPAC 9670)"},
 description_ca="Parc arbrat de plataners a la part alta del poble que envolta l'ermita, amb pedrís, pista de ball, bar i les piscines municipals al costat.",
 verified_facts=[
  {"fact": "The chapel is surrounded by a square and an enclosure with a dance floor and bar, run 1981-2001 by Amics de Riudoms, who also built the adjacent swimming pools.", "sources": [AJ_LLOCS]},
  {"fact": "Shaded by plane trees; the stone bench (pedrís) is a shared memory of locals.", "sources": [TUR("ermita-de-sant-antoni")]},
  {"fact": "A stone cross (the 'Pedró') at Sant Antoni was destroyed at the start of the Civil War.", "sources": [PEREA07]},
  {"fact": "The trees of Sant Antoni were saved by popular protest (c. 2001).", "sources": ["https://raco.cat/index.php/LoFloc/article/view/310907 (title only)"]},
 ],
 claims_check=[],
 history_line_ca="El 1978 es va arranjar vora les escales de l'ermita el Racó de l'Avi, amb un fragment de la pica baptismal més antiga de l'església parroquial.",
 history_line_source=AJ_LLOCS,
 modelling={"ground": {"value": "≈132.6-135.6 m a.s.l. (higher than the church square by ~10 m)", "source": LIDAR}, "surface": "gravel/compacted earth under plane trees; stone steps and low walls (photo)"},
 commons_photos=["Ermita de Sant Antoni de Riudoms.JPG"],
 commons_category=None,
)

# ---------------------------------------------------------------- 6 CIVIC / HOUSES
add(
 id="casa_de_la_vila", name="Casa de la Vila (Ajuntament)", category="casa consistorial (BCIL)",
 lat=41.137701, lon=1.050835,
 coord_source="IPAC via ca.wikipedia list (IPA-9679); Wikidata Q23780542 gives 41.137778,1.050833; OSM townhall node 2801517336: 41.1376971,1.0508836; cadastre 6560325CF3566A.",
 refs={"ipac": 9679, "bcil": "4477-I (1993)", "wikidata": "Q23780542", "osm": OSMN(2801517336), "cadastre": "6560325CF3566A", "address": "C/ Major, 52 (Pl. de l'Om)"},
 description_ca="Casa consistorial de planta rectangular i aspecte senyorial, davant la plaça de l'Om. La façana, decorada amb esgrafiats, té dos escuts, un balcó amb balustres i un gran portal d'arc de pedra que dona a una escala noble amb balustrada.",
 verified_facts=[
  {"fact": "Built reusing an earlier house; rectangular plan; facade with esgrafiats; large door to a hall and a luxurious staircase with balustrade to the noble floor; two esgrafiat coats of arms (State and town) with a balustered balcony between them; old cells uncovered in recent works.", "sources": [IPACAPI(9679)]},
  {"fact": "Rebuilt in 1925 (IPAC, Ajuntament); ca.wikipedia adds a 1915 remodelling by Pere Caselles i Tarrats (marble staircase), roof collapse on 26 Oct 1917 and works finished 1925.", "sources": [IPACAPI(9679), AJ_LLOCS, CAW("Casa de la Vila (Riudoms)")]},
  {"fact": "Stands on the Carrer Major facing the Plaça de l'Om, almost opposite the old Hospital and the Verge Maria chapel.", "sources": [IPACAPI(9679)]},
 ],
 claims_check=[{"claim": "balconies", "status": "CONFLICT: IPAC 'un balcó amb balustres'; Ajuntament 'dos balcons amb balustres enmig'", "sources": [IPACAPI(9679), AJ_LLOCS]}],
 history_line_ca="La Casa de la Vila es va refer el 1925 aprofitant una casa anterior i conserva una escala senyorial amb balustrada que puja al pis noble.",
 history_line_source=IPACAPI(9679),
 modelling={
  "footprint": {"value": "≈19.4 × 19.1 m (311 m²)", "source": CAD("6560325CF3566A")},
  "floors": {"value": 3, "source": CAD("6560325CF3566A")},
  "height": {"value": "≈13-15 m", "source": "LiDAR p95 132.6 / max 135.0 vs ground 119.4 m"},
  "facade": "Stuccoed with esgrafiat panels, two esgrafiat coats of arms, central balustered balcony, stone-arched main door (photos).",
  "orientation": {"value": "main facade faces ESE onto the Plaça de l'Om", "source": "estimated from OSM positions of the town hall node and the square"},
 },
 commons_photos=["Casa de la Vila de Riudoms 02.JPG", "Casa de la Vila de Riudoms 01.JPG", "Ajuntament de Riudoms - P1130357.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Casa_de_la_Vila_(Riudoms)",
)

add(
 id="placa_om", name="Plaça de l'Om", category="plaça",
 lat=41.137623, lon=1.05103,
 coord_source="OSM pedestrian area way 460224318 (centre).",
 refs={"osm": OSMW(460224318)},
 description_ca="Plaça pavimentada davant la Casa de la Vila, al carrer Major, amb arbres esporgats, testos amb palmeres, bancs i un gran fanal. És la plaça més antiga del poble.",
 verified_facts=[
  {"fact": "Oldest square of the village; medieval name Plaça del Mercadal (fruit and vegetable market), later 'de l'Om'; officially 'de la Constitució' around 1926 and named after Franco after 1939; hosted the Sant Llorenç fair and cultural events.", "sources": [PEREA00O]},
  {"fact": "A monument to the Francoist war dead was placed in the square in 1954 and later moved to the cemetery (Perea: 1998; press: 1997), where the Ajuntament removed it in March 2023.", "sources": [PEREA07, "https://www.diarimes.com/ca/camp-tarragona/230811/l-ajuntament-riudoms-retira-monument-als-caiguts-del-cementiri_130695.html (via search snippet)"]},
  {"fact": "The square's public fountain was originally presided by a religious image.", "sources": [PEREA07]},
  {"fact": "Completely remodelled: a large street lamp was placed and three elm trees planted.", "sources": [TINET]},
  {"fact": "Opened as a 'plaça castellera' in 2019.", "sources": ["https://www.diarimes.com/ca/camp-tarragona/190428/la-placa-de-riudoms-estrena-com-placa-castellera_69259.html (via search snippet)"]},
 ],
 claims_check=[{"claim": "with a monument — which?", "status": "No monument today. The one historically present was the Francoist 'Monument als Caiguts' (1954, removed to the cemetery 1997/98, dismantled 2023). Current focal element: a large ornamental street lamp + trees.", "sources": [PEREA07, TINET]}],
 history_line_ca="És la plaça més antiga de Riudoms: a l'edat mitjana s'hi feia mercat i es deia plaça del Mercadal.",
 history_line_source=PEREA00O,
 modelling={"ground": {"value": "≈119.5 m a.s.l.", "source": LIDAR}, "elements": "Stone paving, large multi-arm cast-iron lamp post, pollarded plane trees, large black planters with palms, benches (photo " + COMMONS("Plaça de l'Om - Riudoms - P1130363.jpg") + ")", "surrounding": "3-4 storey houses between party walls, stucco in cream/ochre, some stone"},
 commons_photos=["Plaça de l'Om - Riudoms - P1130363.jpg", "Plaça de l'Om - Riudoms 01.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Plaça_de_l'Om_(Riudoms)",
)

add(
 id="hospital_capella_verge_maria", name="Hospital i capella de la Verge Maria", category="capella i antic hospital (BCIL)",
 lat=41.137612, lon=1.050755,
 coord_source="IPAC via ca.wikipedia list (IPA-9669) = Wikidata Q58461702; OSM chapel node 12825433107: 41.1375671,1.0508157.",
 refs={"ipac": 9669, "bcil": "4479-I (1993)", "wikidata": "Q58461702", "cadastre": "6560602CF3566A", "address": "C/ Major, 57"},
 description_ca="Petita capella renaixentista d'una nau amb volta de canó amb llunetes i capçalera plana, al carrer Major, al costat de l'antic hospital de pobres i pelegrins, avui dependències municipals.",
 verified_facts=[
  {"fact": "Hospital for the poor and pilgrims documented from the 16th century until the late 19th; chapel very simple Renaissance, single nave, barrel vault with lunettes and flat head; later used as a funeral depository.", "sources": [IPACAPI(9669)]},
  {"fact": "Chapel restored for Holy Week 1983 and again in 2005 and 2008; houses an image of the Soledat; the hospital building now hosts municipal services (local police).", "sources": [AJ_LLOCS, CAW("Hospital i capella de la Verge Maria")]},
 ],
 claims_check=[],
 history_line_ca="L'hospital, documentat des del segle XVI, acollia pobres i pelegrins i va funcionar fins a finals del segle XIX.",
 history_line_source=IPACAPI(9669),
 modelling={"footprint": {"value": "chapel ≈12.8 × 9.9 m (1 floor, 85 m²); hospital part ≈11 × 7 m, 3 floors", "source": CAD("6560602CF3566A")}, "height": {"value": "≈10-12 m", "source": "LiDAR max 131.3 vs street ≈119 m"}},
 commons_photos=["Capella Verge Maria.JPG", "Antic Hospital Riudoms.JPG"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Hospital_i_capella_de_la_Verge_Maria",
)

add(
 id="cal_marc_masso", name="Cal Marc Massó (Casa de Cultura Antoni Gaudí)", category="casa / equipament cultural",
 lat=41.137457, lon=1.050845,
 coord_source="IPAC via ca.wikipedia list (IPA-9678) = Wikidata Q21530083; cadastre 6560208CF3566B (OSM community_centre node 41.1374706,1.0508398).",
 refs={"ipac": 9678, "wikidata": "Q21530083", "cadastre": "6560208CF3566B", "address": "C/ del Beat Bonaventura, 73"},
 description_ca="Casa pairal del segle XVIII de planta rectangular, amb portal d'arc rebaixat, tres balcons al primer pis i golfes, avui Casa de Cultura amb l'arxiu municipal i la seu del CERAP.",
 verified_facts=[
  {"fact": "18th-century house: ground floor, first floor and attic; rubble masonry; wide segmental-arch door with studded leaves, three aligned balconies, attic openings, projecting eaves; granite staircase in the entrance.", "sources": [IPACAPI(9678)]},
  {"fact": "The Ajuntament agreed to buy it on 19 Feb 1982 for the municipal museum and the Centre d'Estudis.", "sources": [IPACAPI(9678)]},
  {"fact": "Rebuilt behind the preserved facade; now four floors, 700 m² total; original entrance door dated 1789.", "sources": [AJ_LLOCS]},
 ],
 claims_check=[],
 history_line_ca="L'Ajuntament va acordar el 19 de febrer de 1982 comprar aquesta casa del segle XVIII per fer-hi el museu i el Centre d'Estudis.",
 history_line_source=IPACAPI(9678),
 modelling={"footprint": {"value": "≈22.6 × 8.9 m, 4 floors", "source": CAD("6560208CF3566B")}, "height": {"value": "≈11.5 m", "source": "LiDAR p95 130.0 vs ground 118.4 m"}},
 commons_photos=["Cal Marc Massó 01.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Cal_Marc_Massó",
)

add(
 id="casa_beat_bonaventura", name="Casa natal del Beat Bonaventura Gran", category="casa natal / casa museu",
 lat=41.137491, lon=1.050699,
 coord_source="Wikidata Q115626800 (P625); OSM museum node 12825417233: 41.1374941,1.0507047; cadastre 6560603CF3566A.",
 refs={"wikidata": "Q115626800", "osm": OSMN(12825417233), "cadastre": "6560603CF3566A", "address": "C/ del Beat Bonaventura, 48"},
 description_ca="Petit i senzill habitatge de l'antic carrer de la Butxaca on va néixer el franciscà Miquel Gran (Beat Bonaventura), amb una capella annexa dedicada a ell.",
 verified_facts=[
  {"fact": "Born 24 Nov 1620 in a modest house in the old carrer de la Butxaca, now named after him.", "sources": [CAW("Bonaventura Gran")]},
  {"fact": "House at no. 48; small, simple dwelling restored in 1920 (and on other occasions); a simple chapel in his honour beside it; guided visits on request.", "sources": [AJ_LLOCS, TUR("casa-del-beat-bonaventura")]},
 ],
 claims_check=[{"claim": "casa del Beat Bonaventura", "status": "VERIFIED", "sources": [AJ_LLOCS]}],
 history_line_ca="En aquesta casa de l'antic carrer de la Butxaca va néixer el 24 de novembre de 1620 Miquel Gran, el futur Beat Bonaventura.",
 history_line_source=CAW("Bonaventura Gran") + "; " + TUR("casa-del-beat-bonaventura"),
 modelling={"footprint": {"value": "≈6.7 × 5.7 m, 3 floors (37 m²)", "source": CAD("6560603CF3566A")}, "height": {"value": "≈10-11 m", "source": "LiDAR max 129.1 vs ground 118.1 m"}},
 commons_photos=["Casa Beat Bonaventura Gran 01.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Casa_natal_del_Beat_Bonaventura_Gran",
)

add(
 id="centre_riudomenc", name="Centre Riudomenc (el Centre)", category="casa / antic centre social (BCIL)",
 lat=41.138238, lon=1.050167,
 coord_source="IPAC via ca.wikipedia list (IPA-9671) = Wikidata Q58461643.",
 refs={"ipac": 9671, "bcil": "4481-I (1993)", "wikidata": "Q58461643", "address": "C/ Anselm Clavé o de les Galanes"},
 description_ca="Casa quadrangular amb una torre al mig i portal d'arc de mig punt de grans dovelles amb una inscripció del segle XVIII; va ser sala de ball i seu dels carlins (Centro Riudomense).",
 verified_facts=[
  {"fact": "Square house with a central tower; round-arched door with large voussoirs bearing an inscription from c. 1700s; building of 1709, reformed several times; dance hall.", "sources": [IPACAPI(9671)]},
  {"fact": "During the Restoration the Carlists met at the 'Centro Riudomense'.", "sources": [CAW("Riudoms")]},
 ],
 claims_check=[],
 history_line_ca="Edifici del 1709, reformat en diverses èpoques, que va ser sala de ball i punt de trobada social del poble.",
 history_line_source=IPACAPI(9671),
 modelling={"note": {"value": "no cadastre building matched the IPAC point (point may fall on the street); dimensions unknown", "source": "cadastre lookup"}},
 commons_photos=["Centre Riudomenc2.JPG"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Centre_Riudomenc",
)

add(
 id="casa_pairal_gaudi", name="Casa Pairal d'Antoni Gaudí (ca la Calderera)", category="casa pairal / museu",
 lat=41.13874, lon=1.05432,
 coord_source="estimated: OSM 'Epicentre Gaudí' museum node 12825529342 (41.1387441,1.054319, the visitor centre attached to the Casa Pairal) and Commons camera coordinates of the Casa Pairal photos (41.13871-41.13879, 1.05425-1.05428). Address Raval de Sant Francesc, 14.",
 refs={"osm": OSMN(12825529342), "cadastre_candidate": "6863106CF3566D (3 floors) — match not certain", "address": "Raval de Sant Francesc, 14"},
 description_ca="Casa senzilla i austera de tres plantes amb golfes al raval de Sant Francesc, on des del segle XVIII van viure els avis i el pare d'Antoni Gaudí. A la planta baixa hi havia el taller familiar de caldereria.",
 verified_facts=[
  {"fact": "Known as 'ca la Calderera'; three floors (with attic); the architect's ancestors had a coppersmith's workshop (pots, boilers, copper pitchers) on the ground floor, which has been kept.", "sources": [AJ_LLOCS]},
  {"fact": "Belonged from the 18th century to Gaudí's grandparents, father and Gaudí himself; now a visitor space with the workshop, the family home and exhibitions; address Raval de Sant Francesc, 14.", "sources": [TUR("casa-pairal-dantoni-gaudi")]},
  {"fact": "Gaudí's father and grandfather were coppersmiths with the workshop in the family home on the raval de Sant Francesc (Bergós 1954).", "sources": [CAW("Antoni Gaudí i Cornet")]},
  {"fact": "The Epicentre Gaudí, attached to the Casa Pairal, was inaugurated on 22 April 2007.", "sources": [COMMONS("Placa inauguració Epicentre Gaudí.jpg") + " (file description)"]},
 ],
 claims_check=[{"claim": "Casa Pairal Gaudí", "status": "VERIFIED", "sources": [AJ_LLOCS, TUR("casa-pairal-dantoni-gaudi")]}],
 history_line_ca="A la planta baixa d'aquesta casa, el pare i l'avi d'Antoni Gaudí tenien el taller de caldereria on el petit Antoni els mirava treballar.",
 history_line_source=AJ_LLOCS + "; " + CAW("Antoni Gaudí i Cornet"),
 modelling={"floors": {"value": "3 + golfes", "source": AJ_LLOCS}, "height": {"value": "≈13 m", "source": "LiDAR max 125.5 vs ground 112.6 m at the Epicentre point (low confidence on which building)"}, "photos_note": "Commons only has interior photos of the Casa Pairal; exterior must be modelled from other imagery (e.g. cadastre facade photos in data/raw/cadastre/facades)."},
 commons_photos=[],
 commons_category="https://commons.wikimedia.org/wiki/Category:Casa_Pairal_d'Antoni_Gaudí (interiors only)",
)

add(
 id="cal_gallissa", name="Cal Gallissà - Casa dels Germans Nebot", category="casa pairal (BCIL)",
 lat=41.138431, lon=1.053353,
 coord_source="IPAC via ca.wikipedia list (IPA-9673); Wikidata Q18003706: 41.1384,1.05335; cadastre 6761108CF3566B.",
 refs={"ipac": 9673, "bcil": "4483-I (1993)", "wikidata": "Q18003706", "cadastre": "6761108CF3566B"},
 description_ca="Casa pairal dels germans Nebot, reconstruïda als anys 1950 amb materials de la casa antiga: finestres de tipus gòtic dels segles XVI-XVII, una finestra de cantonada, un mirador al pis noble i llindes amb escuts de ferradures.",
 verified_facts=[
  {"fact": "Rebuilt reusing old materials (architect Adell — ca.wikipedia: Francesc Adell Ferré); Gothic-type windows of the 16th or 17th c.; corner window originally over the main door; mirador of the noble floor made from two former doors; lintels with shields bearing horseshoes; rebuilt in the 1950s.", "sources": [IPACAPI(9673), CAW("Cal Gallissà")]},
  {"fact": "Ancestral house of the Nebot brothers, Austrian-party soldiers in the War of the Spanish Succession; Diada (11 Sept) tributes are held at its door.", "sources": [CAW("Cal Gallissà"), AJ_LLOCS, TUR("casa-dels-germans-nebot")]},
  {"fact": "Later a café and cinema until the 1960s (entrance from the Raval de Sant Francesc).", "sources": [CAW("Cal Gallissà"), IPACAPI(9673)]},
 ],
 claims_check=[{"claim": "Casa dels Germans Nebot = Cal Gallissà", "status": "VERIFIED. ADDRESS CONFLICT: IPAC API 'Raval de Sant Francesc, 8'; ca.wikipedia list '29'; tourism site '42'.", "sources": [IPACAPI(9673), LIST, TUR("casa-dels-germans-nebot")]}],
 history_line_ca="Casa pairal dels germans Nebot, militars austriacistes de la Guerra de Successió, reconstruïda als anys 1950 amb elements de la casa antiga.",
 history_line_source=CAW("Cal Gallissà") + "; " + IPACAPI(9673),
 modelling={"footprint": {"value": "≈16.7 × 16.3 m overall (171 m²); parts of 3 and 2 floors", "source": CAD("6761108CF3566B")}, "windows": "Gothic-type stone windows (lobed/ogee lintels), corner window, stone lintels with horseshoe shields (IPAC + photo)"},
 commons_photos=["Cal Gallisa.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Cal_Gallissà",
)

add(
 id="raval_sant_francesc", name="Raval de Sant Francesc", category="carrer / raval històric",
 lat=41.138655, lon=1.054154,
 coord_source="OSM way 222050217 centre (a second segment, way 964964978, centres at 41.138425,1.053205).",
 refs={"osm": OSMW(222050217)},
 description_ca="Carrer del primer creixement fora muralles, format al llarg del camí que entrava al poble pel portal de Reus. Hi ha la Casa Pairal de Gaudí i Cal Gallissà, i continua cap a l'avinguda de Reus, on hi ha les ruïnes del convent franciscà.",
 verified_facts=[
  {"fact": "The only Early Modern growth outside the walls, formed along the access road entering by the Portal de Reus; farmers and herders with sheep pens, probably also Jews.", "sources": [PEREA07]},
  {"fact": "The Casa Pairal of Gaudí (no. 14) and Cal Gallissà stand on it.", "sources": [TUR("casa-pairal-dantoni-gaudi"), IPACAPI(9673)]},
 ],
 claims_check=[{"claim": "raval de Sant Francesc (former convent)", "status": "PARTLY VERIFIED: the Franciscan convent (IPAC 'de Sant Joan dels Franciscans', Perea calls it 'convent de Sant Francesc') stood outside the walls at the end of today's Av. de Reus, beyond the raval; the raval itself is a street, not the convent. Name origin not explicitly documented.", "sources": [PEREA07, IPACAPI(9677)]}],
 history_line_ca="El raval de Sant Francesc va ser la primera expansió fora muralles, al llarg del camí que entrava al poble pel portal de Reus.",
 history_line_source=PEREA07,
 modelling={"street": "Narrow street (living street) with 2-3 storey terraced houses between party walls; ground ≈112-113 m near Plaça de l'Arbre (LiDAR)"},
 commons_photos=[], commons_category=None,
)

add(
 id="convent_sant_joan", name="Convent de Sant Joan dels Franciscans (ruïnes)", category="convent en ruïnes",
 lat=41.138362, lon=1.057976,
 coord_source="IPAC via ca.wikipedia list (IPA-9677); Wikidata Q18003933: 41.1384,1.05798.",
 refs={"ipac": 9677, "wikidata": "Q18003933", "address": "Av. de Reus, 26"},
 description_ca="Restes d'un convent franciscà de planta rectangular al final de l'avinguda de Reus: murs de paredat de pedra i còdols reforçats amb maó, arcs de maó i dovelles de pedra i petxines entre arcs torals.",
 verified_facts=[
  {"fact": "Ruins: rectangular plan, rubble walls of stones and pebbles with brick reinforcements, brick arches and stone voussoirs, pendentives between transverse arches.", "sources": [IPACAPI(9677)]},
  {"fact": "Foundation authorised by archbishop Antoni Agustí (IPAC: 1585; ca.wikipedia: 1582) — CONFLICT; 24 friars in 1787; practically destroyed in 1835; sold in 1844 under Mendizábal's disentailment.", "sources": [IPACAPI(9677), CAW("Convent de Sant Joan dels Franciscans"), CAW("Riudoms")]},
 ],
 claims_check=[],
 history_line_ca="El convent franciscà de Sant Joan es va fundar fora muralles a finals del segle XVI i va quedar pràcticament destruït el 1835.",
 history_line_source=IPACAPI(9677),
 modelling={"note": "ruined walls only; model as partial walls with brick arches"},
 commons_photos=["Convent de Sant Joan2.JPG"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Convent_de_Sant_Joan_de_Riudoms",
)

# ---------------------------------------------------------------- 7 SQUARES
add(
 id="placa_arbre", name="Plaça de l'Arbre", category="plaça / jardí",
 lat=41.138922, lon=1.055481,
 coord_source="OSM relation 19111488 centre (leisure=park, wikidata Q107965873); Wikidata: 41.138959,1.055438.",
 refs={"wikidata": "Q107965873", "osm": OSMR(19111488)},
 description_ca="Plaça jardí projectada per l'arquitecte japonès Hiroya Tanaka, amb una col·lecció de cirerers sakura, una font central on l'aigua fa girar una gran bola, bancs de fusta d'inspiració gaudiniana i zones d'arena blanca d'estil zen.",
 verified_facts=[
  {"fact": "Designed by Japanese architect Hiroya Tanaka; the most important sakura cherry collection in Europe (tourism claim); central fountain turning a large ball; wooden benches inspired by Park Güell; zen-style white sand areas; starting point of the Gaudí route, next to the Casa Pairal.", "sources": [TUR("placa-de-labre")]},
  {"fact": "Traditionally a pine grove; a stone cross stood there until the Civil War.", "sources": [PEREA07]},
 ],
 claims_check=[],
 history_line_ca="La plaça de l'Arbre, antiga pineda, es va transformar en un jardí de cirerers sakura projectat per l'arquitecte japonès Hiroya Tanaka.",
 history_line_source=TUR("placa-de-labre") + "; " + PEREA07,
 modelling={"elements": "rows of cherry trees, circular fountain with rotating stone ball, curved wooden benches, raked white sand beds (photos)"},
 commons_photos=["Plaça de l'Arbre - Riudoms 01.jpg", "Plaça de l'Arbre - Riudoms 04.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Plaça_de_l'Arbre",
)

add(
 id="placa_palmera", name="Plaça de la Palmera", category="plaça / espai enjardinat",
 lat=41.14087, lon=1.050518,
 coord_source="OSM way 1179700366 ('Parc de la palmera') centre.",
 refs={"osm": OSMW(1179700366)},
 description_ca="Espai enjardinat al nord del nucli antic, presidit per una alta palmera sobre un parterre circular de gespa, amb falsos pebrers, bancs i l'Escola Beat Bonaventura Gran al costat.",
 verified_facts=[
  {"fact": "Recent square listed by the Ajuntament among its places.", "sources": [AJ_PLACES]},
  {"fact": "Tall palm on a raised circular lawn with a stone edge, pepper trees, benches, stamped paving; the Escola Beat Bonaventura Gran is on the square (Commons category contents).", "sources": [COMMONS("Plaça de la Palmera (Riudoms) 01.jpg") + " (visual)", "https://commons.wikimedia.org/wiki/Category:Plaça_de_la_Palmera_(Riudoms)"]},
  {"fact": "Perea calls it an 'espai d'enjardinament' rather than a true square; the 1974 and 1977 councils announced a park / botanical garden there, but the school complex was built instead.", "sources": [PEREA07]},
  {"fact": "A monument to the independence referendum stands there (Commons).", "sources": ["https://commons.wikimedia.org/wiki/Category:Plaça_de_la_Palmera_(Riudoms)"]},
 ],
 claims_check=[{"claim": "largest square", "status": "NOT VERIFIED", "sources": []}, {"claim": "lawn, trees, Escola Beat Bonaventura", "status": "VERIFIED (photos, OSM school way 1385395363 at 41.141453,1.050752)", "sources": [OSMW(1385395363)]}],
 history_line_ca="Els ajuntaments de 1974 i 1977 hi volien fer un parc o un jardí botànic, però finalment s'hi va construir el complex escolar.",
 history_line_source=PEREA07,
 modelling={"elements": "one very tall Canary palm (~15 m, estimated) on a round raised lawn bed (~15 m diameter, estimated), weeping pepper trees, iron-and-wood benches, stamped-concrete paving (photo)"},
 commons_photos=["Plaça de la Palmera (Riudoms) 01.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Plaça_de_la_Palmera_(Riudoms)",
)

add(
 id="carrer_major", name="Carrer Major", category="carrer històric",
 lat=41.137928, lon=1.051605,
 coord_source="OSM way 277215254 centre.",
 refs={"osm": OSMW(277215254)},
 description_ca="Un dels carrers lineals del nucli medieval, amb cases entre mitgeres de dues o tres plantes, balcons de ferro i teulades a dues vessants. Hi ha la Casa de la Vila, la capella de la Verge Maria i l'antic Club Casino.",
 verified_facts=[
  {"fact": "One of the linear medieval streets (Sant Jaume, d'Amunt, Nou, Major, d'Avall) laid out between the east and west walls.", "sources": [PEREA07]},
  {"fact": "Old-core buildings are terraced between party walls, two or three storeys, with two-slope roofs, on narrow deep plots.", "sources": [IPACAPI(9667)]},
  {"fact": "Carrer Major 34 (cal Morell / Club Casino) is dated 1683 in a Lo Floc caption; Joan Guinjoan's birthplace is at no. 17.", "sources": ["https://raco.cat/index.php/LoFloc/article/view/980000006723", "https://commons.wikimedia.org/wiki/Category:Casa_natal_de_Joan_Guinjoan"]},
 ],
 claims_check=[],
 history_line_ca="El carrer Major és un dels carrers lineals del nucli medieval, traçats entre les muralles de llevant i de ponent.",
 history_line_source=PEREA07,
 modelling={"width": {"value": "5-7 m", "source": "estimated"}, "facades": "stucco in cream/ochre/grey, stone door frames, iron balconies, green/brown shutters; ground ≈119-120 m (LiDAR)"},
 commons_photos=["Carrer Major - Riudoms 01.jpg"],
 commons_category="https://commons.wikimedia.org/wiki/Category:Carrer_Major_(Riudoms)",
)

add(
 id="centre_historic", name="Centre històric de Riudoms (nucli antic i muralla)", category="conjunt urbà (BCIL)",
 lat=41.138694, lon=1.051649,
 coord_source="IPAC via ca.wikipedia list (IPA-9667) = Wikidata Q58461640.",
 refs={"ipac": 9667, "bcil": "4476-I (1993)", "wikidata": "Q58461640"},
 description_ca="Nucli medieval format a redós de l'antic castell, al lloc de l'actual plaça de l'Església, amb carrers lineals tancats entre muralles i portals que es van enderrocar al segle XIX.",
 verified_facts=[
  {"fact": "The historic core is around the church of Sant Jaume, the historic site of the old castle; buildings between party walls, two or three storeys, two-slope roofs, narrow deep farmhouse plots.", "sources": [IPACAPI(9667)]},
  {"fact": "25 Jan 1151: Robert d'Aguiló gave Riudoms (again) to Arnau de Palomar with the pact to build a castle.", "sources": [IPACAPI(9667), CAW("Riudoms")]},
  {"fact": "Walls: east walls 'de la Font Nova' and 'de l'Arenal', west walls 'Vella' and 'de les Galanes' (streets Carrer de la Muralla de la Font Nova and Carrer de la Muralla Vella still exist in OSM); gates Portal de Reus, Portal de l'Orient (start of Av. Pau Casals), Portal de Ponent (Plaça del Portal); walls and gates demolished or opened in the late 19th c.", "sources": [PEREA07, OSMW(222050340), OSMW(222053642)]},
  {"fact": "Pere el Cerimoniós had walls and towers built at the end of the 14th c.; none survive (ca.wikipedia). Carlists burned the gates and demolished part of the wall in 1873.", "sources": [CAW("Riudoms")]},
  {"fact": "Perimeter of the wall estimated >900 m (E. Perea and J. Morelló); a 14th-c. section 8.25 m long and 3.42 m high was documented in 2023 on Carrer de Sant Jaume during house works.", "sources": [TDIG]},
 ],
 claims_check=[{"claim": "extent of the medieval core", "status": "Only qualitatively known (streets between the named wall lines); perimeter >900 m from press report (search snippet only)", "sources": [PEREA07, TDIG]}],
 history_line_ca="El nucli antic va néixer a redós del castell que el cavaller Arnau de Palomar es va comprometre a bastir el 1151.",
 history_line_source=IPACAPI(9667),
 modelling={"typical_house": {"value": "2-3 storeys, ~3 m floor height, two-slope tiled roofs, narrow deep plots (5-7 m frontage estimated)", "source": IPACAPI(9667) + " + estimated frontage"}, "wall_lines": "East: Carrer de la Muralla de la Font Nova (41.13945,1.051726 → 41.138693,1.05278) / Carrer de l'Arenal; West: Carrer de la Muralla Vella (41.138135,1.049972 → 41.137201,1.05037) / Carrer de les Galanes; wall section found on Carrer de Sant Jaume (OSM centre 41.138789,1.050611)"},
 commons_photos=["Vista de Riudoms.jpg"],
 commons_category=None,
)

add(
 id="la_soleiada", name="La Soleiada", category="casa senyorial (BCIL)",
 lat=41.14229, lon=1.048738,
 coord_source="IPAC via ca.wikipedia list (IPA-9681); Wikidata Q18004181: 41.1423,1.04874.",
 refs={"ipac": 9681, "bcil": "4486-I (1993)", "wikidata": "Q18004181", "address": "Av. Josep M. Sentís, 22"},
 description_ca="Casa senyorial d'estil colonial de dues plantes amb molts finestrals i miradors, una porxada de tres columnes i una torre amb àtic de vidres de colors, rajoles blaves i vermelles i un mosaic de Sant Antoni amb rellotge de sol.",
 verified_facts=[{"fact": "Colonial-style house of two floors, porch on three artificial-stone columns, tower with windowed attic (coloured glass), two-slope roof, blue and red tiles, mosaic of St Anthony and a sundial; built by a returned 'indiano'; early 20th c. Noucentisme.", "sources": [IPACAPI(9681), "https://invarquit.cultura.gencat.cat/api/Inventary/9681/epoques"]}],
 claims_check=[{"claim": "date", "status": "IPAC: early 20th c.; Perea 2007 wrote early 19th c. (likely an error)", "sources": [IPACAPI(9681), PEREA07]}],
 history_line_ca="Casa senyorial d'estil colonial que va fer construir a inicis del segle XX un indià que havia tornat al poble.",
 history_line_source=IPACAPI(9681),
 modelling={"floors": {"value": 2, "source": IPACAPI(9681)}},
 commons_photos=[], commons_category="https://commons.wikimedia.org/wiki/Category:La_Soleiada",
)

add(
 id="vila_romana_mola", name="Vil·la romana de la Mola", category="jaciment arqueològic",
 lat=41.140639, lon=1.053058,
 coord_source="Wikidata Q104841041; OSM node 10957904895: 41.1406256,1.0531524.",
 refs={"wikidata": "Q104841041", "osm": OSMN(10957904895)},
 description_ca="Restes d'una vil·la romana dins el nucli urbà, amb àmbits rústic, industrial i termal, integrades en un passeig enjardinat i visibles des de passeres de fusta.",
 verified_facts=[{"fact": "Remains appeared in 1999 when urbanising the Mola area; dated 1st-6th c.; rustic, industrial and bath areas; excavated 1999-2005; seen from wooden walkways in a garden (Via Romana).", "sources": [CAW("Vil·la romana de la Mola"), TUR("vila-romana-de-la-mola")]}],
 claims_check=[],
 history_line_ca="Les restes d'aquesta vil·la romana, dels segles I al VI, van aparèixer el 1999 quan s'urbanitzava la zona de la Mola.",
 history_line_source=CAW("Vil·la romana de la Mola"),
 modelling={"elements": "low excavated walls, basins and pools, wooden boardwalks, lawn (photos in Commons category)"},
 commons_photos=[], commons_category="https://commons.wikimedia.org/wiki/Category:Vil·la_romana_de_la_Mola",
)

add(
 id="mas_de_la_calderera", name="Mas de la Calderera", category="masia (BCIL)",
 lat=41.154381, lon=1.05046,
 coord_source="IPAC via ca.wikipedia list (IPA-40707); Wikidata Q18004421: 41.1544,1.05042; OSM node 4581633742: 41.1543922,1.0504234. About 1.7 km N of the church.",
 refs={"ipac": 40707, "bcil": "4485-I (1993)", "wikidata": "Q18004421", "osm": OSMN(4581633742)},
 description_ca="Masia de la família Gaudí a la partida de la Clota, vora la riera de Maspujols. La casa principal té una façana noucentista amb esgrafiats de greques i garlandes, estucat que imita carreus i un coronament de línies corbes.",
 verified_facts=[
  {"fact": "Property of Gaudí's family; noucentista facade (esgrafiats with Greek frets, garlands, plant motifs; stucco imitating ashlar; sinuous parapet); reformed in the 1920s keeping the original plan; two plaques on the facade claim it as his birthplace, a claim IPAC says is not documented.", "sources": [IPACAPI(40707)]},
  {"fact": "Plaques placed in 1952 (centenary) and 25 June 2002; Gaudí donated it to the parish in 1924; sold to private owners in 1928.", "sources": [CAW("Mas de la Calderera"), AJ_LLOCS]},
 ],
 claims_check=[{"claim": "Gaudí born here", "status": "DISPUTED/UNDOCUMENTED (tradition; baptised in Reus; IPAC: not documented)", "sources": [IPACAPI(40707), CAW("Antoni Gaudí i Cornet")]}],
 history_line_ca="Aquest mas va ser de la família Gaudí; la tradició diu que hi va néixer l'arquitecte el 1852, tot i que el fet no està documentat.",
 history_line_source=IPACAPI(40707) + "; " + CAW("Mas de la Calderera"),
 modelling={"note": "outside the village core; private property"},
 commons_photos=["Mas calderera.jpg"], commons_category="https://commons.wikimedia.org/wiki/Category:Mas_de_la_Calderera",
)

# ---------------------------------------------------------------- 8 OTHER IPAC ITEMS (outside the core)
for d in [
 dict(id="torre_mas_don_felip", name="Torre del Mas de Don Felip", category="torre de defensa / masia (BCIL)", lat=41.100357, lon=1.077393, ipac=9676, wd="Q19257652",
      desc="Masia adossada a una torre de defensa de planta quadrada amb planta baixa i tres pisos, terrassa superior, merlets i quatre matacans.",
      fact="Square tower c. 4.90 × 4.70 m and about 13 m high, ground + 3 floors, top terrace with merlons and four machicolations; probably 16th c. (coastal raids).",
      hist="Aquesta torre de defensa, probablement del segle XVI, vigilava el camí de la riera de Maspujols davant les incursions de pirates.",
      mod={"tower_plan": {"value": "4.90 × 4.70 m", "source": IPACAPI(9676)}, "tower_height": {"value": 13, "source": IPACAPI(9676)}}),
 dict(id="moli_de_vent", name="Molí de vent (Torre del Fargas / del Fargues)", category="molí de vent (BCIL)", lat=41.158259, lon=1.045465, ipac=9682, wd="Q58928302",
      desc="Torre de planta circular de paredat, antic molí de vent sense coberta, dalt d'un pujol suau.",
      fact="Circular rubble tower, three rows of beam holes inside, raised door; roof lost; partida 'Molí de Vent' documented 1720-1729.",
      hist="La partida del Molí de Vent ja surt esmentada en un document dels anys 1720-1729.",
      mod={"plan": {"value": "circular", "source": IPACAPI(9682)}}),
 dict(id="mas_blau", name="El Mas Blau", category="masia (IPAC)", lat=41.168059, lon=1.047673, ipac=9675, wd="Q21480047",
      desc="Mas del segle XIX de planta quadrada amb un cos de tres plantes i una torre central, estucat de colors blau i groc.",
      fact="Square plan, three-storey body with central tower of two more floors and a tiny four-slope turret; flat roofs; blue stucco with yellow window frames. COORDINATE CONFLICT: ca.wikipedia list 41.168059,1.047673 vs Wikidata 41.167466,1.053705 (~500 m apart).",
      hist="Mas del segle XIX, vora la riera de Maspujols, conegut pels seus estucats de colors blau i groc.",
      mod={}),
 dict(id="mas_del_toda", name="Mas del Toda", category="masia (IPAC)", lat=41.157488, lon=1.053453, ipac=9680, wd="Q18004469",
      desc="Conjunt de tres edificis en un pinar de les Planes del Roquís, amb la casa principal de paredat i finestres decorades amb rajoles blanques i blaves.",
      fact="Three buildings; main house of rubble masonry, nearly square, with windows framed by white and blue chequered tiles; the Toda family was among the main 18th-c. landowners.",
      hist="El 1763 Josep Toda era un dels pocs propietaris amb títol del municipi i el quart contribuent més important.",
      mod={}),
 dict(id="mas_blanc", name="Mas Blanc (Mas Blanch)", category="masia (BCIL)", lat=41.113247, lon=1.077433, ipac=40706, wd="Q58906793",
      desc="Conjunt de construccions amb un cos principal de planta quadrangular, coberta a dues vessants i façana arrebossada i emblanquinada.",
      fact="Main block square with two-slope roof, ridge perpendicular to the facade, annexes forming an L; whitewashed render; projecting eaves. A Republican 'Escola Nova Unificada' was set up there (Perea 2013).",
      hist="Durant la Segona República l'Ajuntament hi va promoure una Escola Nova Unificada per als infants dels masos.",
      mod={}),
]:
    src = IPACAPI(d['ipac'])
    hsrc = src if d['id'] != 'mas_blanc' else "https://raco.cat/index.php/LoFloc/article/view/314094 (Perea, Lo Floc 206, 2013)"
    add(id=d['id'], name=d['name'], category=d['category'], lat=d['lat'], lon=d['lon'],
        coord_source=f"IPAC coordinate via ca.wikipedia list (IPA-{d['ipac']}); Wikidata {d['wd']}",
        refs={"ipac": d['ipac'], "wikidata": d['wd']}, description_ca=d['desc'],
        verified_facts=[{"fact": d['fact'], "sources": [src, LIST]}], claims_check=[],
        history_line_ca=d['hist'], history_line_source=hsrc,
        modelling=d['mod'] or {"note": "outside the village core; not modelled in detail"}, commons_photos=[], commons_category=None)

out = 'data/raw/heritage/landmarks.json'
json.dump(L, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
json.load(open(out, encoding='utf-8'))
print(len(L), 'landmarks written to', out)
for x in L: print(f"{x['id']:30s} {x['lat']:.6f} {x['lon']:.6f}")
