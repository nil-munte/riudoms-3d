"""Tiny binary container used for public/data/*.bin files.

Layout (little endian):
  4 bytes  magic "RDB1"
  4 bytes  uint32 header length N
  N bytes  UTF-8 JSON header: {"meta": {...}, "arrays": {name: {dtype, offset, length, shape}}}
  padding to a multiple of 8, then the raw arrays (each 8-byte aligned)
Offsets are relative to the start of the data section. The browser reads it
with src/data/binfmt.ts.
"""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np

DTYPES = {"int8", "uint8", "int16", "uint16", "int32", "uint32", "float32"}


def write_bin(path: Path, arrays: dict[str, np.ndarray], meta: dict | None = None) -> int:
    header = {"meta": meta or {}, "arrays": {}}
    blobs = []
    off = 0
    for name, a in arrays.items():
        a = np.ascontiguousarray(a)
        if a.dtype.name not in DTYPES:
            raise TypeError(f"{name}: unsupported dtype {a.dtype}")
        b = a.astype(a.dtype.newbyteorder("<"), copy=False).tobytes()
        header["arrays"][name] = {"dtype": a.dtype.name, "offset": off, "length": int(a.size),
                                  "shape": list(a.shape)}
        pad = (-len(b)) % 8
        blobs.append(b + b"\0" * pad)
        off += len(b) + pad
    h = json.dumps(header, separators=(",", ":")).encode("utf-8")
    hpad = (-(8 + len(h))) % 8
    h += b" " * hpad
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "wb") as f:
        f.write(b"RDB1")
        f.write(struct.pack("<I", len(h)))
        f.write(h)
        for b in blobs:
            f.write(b)
    return path.stat().st_size
