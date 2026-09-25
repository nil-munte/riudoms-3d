// Shapes of the JSON files produced by scripts/process.py

export interface Meta {
  generated: string;
  origin_utm: [number, number];
  reference_point_wgs84: [number, number];
  tile: number;
  tiles: { x0: number; y0: number; nx: number; ny: number; ortho_px: number[]; active?: number[] };
  region?: [number, number][]; // outline of the town (local m): the world is limited to it
  fence?: [number, number][]; // invisible boundary a few metres inside the outline
  sources: Record<string, any>;
  stats: Record<string, any>;
}

export interface RoofRing { r: number[]; z: number[] }

export interface BuildingPart {
  b: number; // index into buildings
  t: number; // tile
  z0: number; // base height (m)
  rings: number[][]; // [x,y,...] in cm, first = exterior (CCW), then holes
  w: number[]; // per edge [zStart, zEnd] cm above z0
  e: number[]; // per edge flag 0 yard, 1 street, 2 party wall
  roof: { k: number; p: RoofRing[][] }; // k 0 flat, 1 gable, 2 shed
  s: number; // style
  f: number; // floors
  fc: string; // facade colour
  sc: string; // shutter colour
  br: number; // exposed brick
  rc: string; // roof colour (orthophoto)
  hs: string; // height source l/c/e
  lm: string | null; // landmark id
  cm: number; // 1 = replaced by the custom landmark model
  fh: number; // storey height (m): LiDAR eave height / Cadastre floors
  ev: number[][]; // eave / verge quads [x,y,z] x 4 (cm, z above z0)
  cn: number[][]; // street cornices [x0,y0,x1,y1,z] (cm)
  rs: { r: number[]; z0: number; z1: number; k: number }[]; // rooftop structures (LiDAR): 0 housing/tank, 1 chimney
  ru?: number[][]; // per edge [offset along its facade run, run length] (cm): collinear edges form one facade
  lx?: number; // index into BuildingsFile.layouts: the facade read from the Cadastre photo
  le?: number[]; // edges (of ring 0) of the facade that shows that layout
}

/** Street facade read from its Cadastre photo (scripts/p_facade_layouts.py). */
export interface FacadeLayout {
  n: number; // storeys, ground floor included
  at: number; // top storey is an attic (golfes)
  g: [number, number, number][]; // ground floor openings [type, centre, width] (fractions of the facade width)
  u: { o: [number, number, number][]; b: number; b0: number; b1: number }[]; // upper floors, bottom to top
  wall: string | null; wm: number; // wall colour, material (0 stucco 1 stone 2 brick 3 tile 4 concrete 5 block)
  gw: string | null; gm: number; // ground floor wall colour / material (-1 = same)
  ph: number; pc: string; pm: number; // plinth height (m), colour, material (0 none 1 paint 2 stone 3 tile)
  fr: string; sh: number; sc: string | null; dc: string; // frames, shutters (0 none 1 wood 2 roller 3 mixed), shutter & door colours
  su: number; rl: number; rf: number; oc: number; // surrounds, railing (0 none 1 iron 2 glass 3 masonry), roof edge, occluded
}

export interface BuildingInfo {
  ref: string;
  use: string | null;
  year: number | null;
  name: string | null;
  lm: string | null;
}

export interface BuildingsFile { parts: BuildingPart[]; buildings: BuildingInfo[]; layouts?: FacadeLayout[] }

export const S_OLD = 0, S_MID = 1, S_NEW = 2, S_INDUSTRIAL = 3, S_RURAL = 4, S_PUBLIC = 5;
export const E_YARD = 0, E_STREET = 1, E_SHARED = 2;
