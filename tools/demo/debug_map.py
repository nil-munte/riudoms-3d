"""Draw scripted paths / traces (JSON from the director's dry run) over the
orthophoto and the collision-relevant building outlines, for checking routes.

    python tools/demo/debug_map.py paths.json out.png [cx cy size res]
"""
import json
import sys

from PIL import Image, ImageDraw

src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src, encoding='utf-8'))
pts = [p for v in d['paths'].values() for p in v] + d.get('trace', [])
xs, ys = [p[0] for p in pts], [p[1] for p in pts]
if len(sys.argv) > 3:
    cx, cy, S, res = map(float, sys.argv[3:7])
else:
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    S = max(max(xs) - min(xs), max(ys) - min(ys)) + 40
    res = max(0.25, S / 1400)
meta = json.load(open('public/data/meta.json', encoding='utf-8'))
ox, oy = meta['origin_utm']
X0, Y1 = cx + ox - S / 2, cy + oy + S / 2
img = Image.new('RGB', (int(S / res),) * 2)
for name in ('core', 'wide'):
    try:
        idx = json.load(open(f'data/raw/icgc/orto/{name}.json'))
    except FileNotFoundError:
        continue
    if name == 'wide' and res < 0.9:
        continue
    for t in idx['tiles']:
        bx0, by0, bx1, by1 = t['bbox']
        if bx1 < X0 or bx0 > X0 + S or by1 < Y1 - S or by0 > Y1:
            continue
        im = Image.open('data/raw/icgc/orto/' + t['file']).resize((max(1, int((bx1 - bx0) / res)),) * 2)
        img.paste(im, (int((bx0 - X0) / res), int((Y1 - by1) / res)))
T = lambda x, y: ((x - (cx - S / 2)) / res, ((cy + S / 2) - y) / res)
dr = ImageDraw.Draw(img)
b = json.load(open('public/data/buildings.json', encoding='utf-8'))
for p in b['parts']:
    r = p['rings'][0]
    poly = [T(r[i] / 100, r[i + 1] / 100) for i in range(0, len(r), 2)]
    dr.polygon(poly, outline=(255, 230, 0))
cols = [(255, 40, 200), (40, 220, 255), (80, 255, 80), (255, 120, 40), (255, 255, 255)]
for k, (name, path) in enumerate(d['paths'].items()):
    dr.line([T(*p) for p in path], fill=cols[k % len(cols)], width=3)
    dr.text(T(*path[0]), name, fill=cols[k % len(cols)])
for p in d.get('trace', []):
    x, y = T(*p)
    dr.ellipse((x - 2, y - 2, x + 2, y + 2), fill=(255, 0, 0))
img.save(out)
print(out, img.size, res)
