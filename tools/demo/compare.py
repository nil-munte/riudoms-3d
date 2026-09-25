"""Side-by-side sheets: Cadastre facade photo (top) and the rendered facade
(bottom, demo-out/lay_<ref>.jpg from snap.ts), 4 per sheet.

    python tools/demo/compare.py sel.json out_prefix
"""
import json
import sys

from PIL import Image

sel = json.load(open(sys.argv[1]))
for k in range(0, len(sel), 4):
    sheet = Image.new('RGB', (1600, 900), (0, 0, 0))
    for j, s in enumerate(sel[k:k + 4]):
        ref = s[0]
        ph = Image.open(f'data/raw/cadastre/facades/{ref}.jpg').convert('RGB')
        ph.thumbnail((400, 420))
        rn = Image.open(f'demo-out/lay_{ref}.jpg')
        rn.thumbnail((400, 470))
        sheet.paste(ph, (j * 400, 0))
        sheet.paste(rn, (j * 400, 430))
    sheet.save(f'{sys.argv[2]}{k // 4}.jpg', quality=85)
