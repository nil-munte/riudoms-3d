// Reader for the RDB1 container written by scripts/binfmt.py

export type TypedArray = Int8Array | Uint8Array | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array;

export interface BinFile {
  meta: any;
  arrays: Record<string, TypedArray>;
  shapes: Record<string, number[]>;
}

const CTORS: Record<string, any> = {
  int8: Int8Array, uint8: Uint8Array, int16: Int16Array, uint16: Uint16Array,
  int32: Int32Array, uint32: Uint32Array, float32: Float32Array,
};

export function parseBin(buf: ArrayBuffer): BinFile {
  const dv = new DataView(buf);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== 'RDB1') throw new Error('bad data file');
  const hlen = dv.getUint32(4, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hlen)));
  const base = 8 + hlen;
  const arrays: Record<string, TypedArray> = {};
  const shapes: Record<string, number[]> = {};
  for (const [name, a] of Object.entries<any>(header.arrays)) {
    const C = CTORS[a.dtype];
    arrays[name] = new C(buf, base + a.offset, a.length);
    shapes[name] = a.shape;
  }
  return { meta: header.meta, arrays, shapes };
}

export async function fetchBin(url: string): Promise<BinFile> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return parseBin(await r.arrayBuffer());
}

export async function fetchJSON<T = any>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return r.json();
}
