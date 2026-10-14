#!/usr/bin/env python3
"""Render a 2D plan of data/city.json (or a partial debug json) to docs/map.png for layout verification."""
import json, math, sys, os
from PIL import Image, ImageDraw

src = sys.argv[1] if len(sys.argv) > 1 else 'data/city.json'
out = sys.argv[2] if len(sys.argv) > 2 else 'docs/map.png'
scale = float(sys.argv[3]) if len(sys.argv) > 3 else 0.9  # px per meter
data = json.load(open(src))

minX, maxX, minZ, maxZ = -1200, 1200, -950, 950
W, H = int((maxX - minX) * scale), int((maxZ - minZ) * scale)
img = Image.new('RGB', (W, H), (236, 228, 212))
d = ImageDraw.Draw(img)

def P(p):
    return ((p[0] - minX) * scale, (p[1] - minZ) * scale)

# water (approximate from shared terrain definition)
def shoreline(x):
    return 492 + 34 * math.sin((x + 210) / 265) + 13 * math.sin(x / 93)
poly = [P((x, shoreline(x))) for x in range(minX, maxX + 1, 10)] + [P((maxX, maxZ)), P((minX, maxZ))]
d.polygon(poly, fill=(150, 184, 204))
river_pts = [[415, -950], [432, -720], [452, -520], [470, -360], [458, -180], [462, -20], [478, 150], [505, 300], [540, 430], [585, 560], [640, 720], [700, 950]]
river_w = [58, 60, 62, 66, 70, 74, 78, 84, 92, 110, 150, 220]
for i in range(1, len(river_pts)):
    a, b = river_pts[i - 1], river_pts[i]
    w = (river_w[i - 1] + river_w[i]) / 2 * scale
    d.line([P(a), P(b)], fill=(150, 184, 204), width=int(w))
    d.ellipse([P(b)[0] - w / 2, P(b)[1] - w / 2, P(b)[0] + w / 2, P(b)[1] + w / 2], fill=(150, 184, 204))

# districts
colors = {}
for dist in data.get('districts', []):
    col = tuple(int(dist['color'][i:i + 2], 16) for i in (1, 3, 5))
    colors[dist['id']] = col
    pts = [P(p) for p in dist['polygon']]
    d.polygon(pts, outline=col)

use_col = {
    'residential': (214, 204, 182), 'commercial': (190, 196, 214), 'mixed': (205, 198, 200), 'industrial': (196, 190, 180),
    'civic': (200, 186, 214), 'park': (160, 196, 140), 'plaza': (226, 214, 190), 'transport': (210, 200, 170), 'market': (226, 196, 150),
    'water': (150, 184, 204), 'open': (210, 206, 190), 'landmark': (222, 184, 160), 'farmland': (206, 204, 160),
}
# blocks / faces
blocks = data.get('blocks') or [{'polygon': f['polygon'], 'use': 'open'} for f in data.get('faces', [])]
for b in blocks:
    pts = [P(p) for p in b['polygon']]
    if len(pts) >= 3:
        d.polygon(pts, fill=use_col.get(b.get('use', 'open'), (210, 206, 190)))
    bb = b.get('buildable')
    if bb and len(bb) >= 3:
        d.polygon([P(p) for p in bb], outline=(170, 160, 150))
# parcels
for pa in data.get('parcels', []):
    pts = [P(p) for p in pa['polygon']]
    if len(pts) >= 3:
        d.polygon(pts, outline=(188, 178, 166))
# buildings
for bld in data.get('buildings', []):
    for m in bld['masses']:
        pts = [P(p) for p in m['footprint']]
        h = m['floors']
        shade = max(60, 170 - h * 4)
        d.polygon(pts, fill=(shade, shade - 10, shade - 20), outline=(60, 50, 45))
# roads
width = {'arterial': 22, 'waterfront': 18, 'secondary': 15, 'local': 11, 'lane': 6, 'service': 12, 'access': 8}
colr = {'arterial': (70, 70, 76), 'waterfront': (80, 80, 86), 'secondary': (90, 90, 96), 'local': (120, 120, 126), 'lane': (150, 150, 150), 'service': (110, 110, 112), 'access': (140, 140, 140)}
edges = data.get('roads', {}).get('edges') if 'roads' in data else data.get('edges', [])
for e in edges:
    pts = [P(p) for p in e['points']]
    w = max(1, int(width[e['cls']] * scale))
    col = (200, 120, 60) if e.get('bridge') else colr[e['cls']]
    d.line(pts, fill=col, width=w, joint='curve')
nodes = data.get('roads', {}).get('nodes') if 'roads' in data else data.get('nodes', [])
for n in nodes:
    x, y = P((n['x'], n['z']))
    if n['kind'] == 'roundabout':
        r = n.get('radius', 15) * scale
        d.ellipse([x - r, y - r, x + r, y + r], outline=(240, 200, 60), width=2)
    elif n['kind'] == 'end':
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(220, 40, 40))
    elif n.get('signals'):
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=(60, 200, 90))
# props (sparse sampling)
pc = {'tree-palm': (40, 120, 50), 'tree-broad': (30, 100, 40), 'tree-neem': (50, 130, 60), 'tree-small': (70, 140, 70), 'lamp': (255, 220, 60), 'car': (200, 60, 60), 'stall': (220, 120, 40)}
for p in data.get('props', []):
    c = pc.get(p['t'])
    if not c:
        continue
    x, y = P((p['x'], p['z']))
    d.point((x, y), fill=c)
# landmarks
for lm in data.get('landmarks', []):
    x, y = P((lm['x'], lm['z']))
    d.ellipse([x - 5, y - 5, x + 5, y + 5], outline=(200, 30, 60), width=2)
    d.text((x + 7, y - 6), lm['name'], fill=(120, 10, 30))
for dist in data.get('districts', []):
    c = P(dist['center'])
    d.text((c[0] - 30, c[1]), dist['name'].upper(), fill=(20, 20, 20))
os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
img.save(out)
print('wrote', out, W, H)
