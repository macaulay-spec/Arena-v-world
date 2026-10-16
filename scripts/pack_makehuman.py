#!/usr/bin/env python3
"""Pack the CC0 MakeHuman base mesh, skeleton, weights and a curated target set into
assets/source/makehuman/.  Run once against a sparse checkout of
https://github.com/makehumancommunity/makehuman (makehuman/data).  Output is committed."""
import gzip, json, os, shutil, struct, sys
src = sys.argv[1] if len(sys.argv) > 1 else '/tmp/mh/makehuman/data'
out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'source', 'makehuman')
os.makedirs(out, exist_ok=True)

def gz(path_in, path_out):
    with open(path_in, 'rb') as f, gzip.open(path_out, 'wb', 9) as g: shutil.copyfileobj(f, g)
gz(f'{src}/3dobjs/base.obj', f'{out}/base.obj.gz')
gz(f'{src}/rigs/default.mhskel', f'{out}/default.mhskel.gz')
gz(f'{src}/rigs/default_weights.mhw', f'{out}/default_weights.mhw.gz')

T = f'{src}/targets'
names = []
AGES = ['child', 'young', 'old']; GEN = ['female', 'male']; MW = ['minmuscle', 'averagemuscle', 'maxmuscle']; WW = ['minweight', 'averageweight', 'maxweight']
for g in GEN:
    for a in AGES:
        for e in ['african', 'asian', 'caucasian']: names.append(f'macrodetails/{e}-{g}-{a}')
        for m in MW:
            for w in WW: names.append(f'macrodetails/universal-{g}-{a}-{m}-{w}')
        for h in ['minheight', 'maxheight']: names.append(f'macrodetails/height/{g}-{a}-averagemuscle-averageweight-{h}')
        for p in ['idealproportions', 'uncommonproportions']: names.append(f'macrodetails/proportions/{g}-{a}-averagemuscle-averageweight-{p}')
    for a in AGES:
        if g == 'female':
            for c in ['mincup', 'maxcup']: names.append(f'breast/female-{a}-averagemuscle-averageweight-{c}-averagefirmness')
            for f in ['minfirmness', 'maxfirmness']: names.append(f'breast/female-{a}-averagemuscle-averageweight-averagecup-{f}')
pairs = {
 'head': ['head-oval', 'head-round', 'head-rectangular', 'head-square', 'head-triangular', 'head-invertedtriangular', 'head-diamond',
          'head-scale-horiz-decr', 'head-scale-horiz-incr', 'head-scale-vert-decr', 'head-scale-vert-incr', 'head-scale-depth-decr', 'head-scale-depth-incr',
          'head-fat-decr', 'head-fat-incr', 'head-age-decr', 'head-age-incr', 'head-back-scale-depth-decr', 'head-back-scale-depth-incr'],
 'nose': ['nose-scale-horiz-decr', 'nose-scale-horiz-incr', 'nose-scale-vert-decr', 'nose-scale-vert-incr', 'nose-scale-depth-decr', 'nose-scale-depth-incr',
          'nose-flaring-decr', 'nose-flaring-incr', 'nose-nostrils-width-decr', 'nose-nostrils-width-incr', 'nose-point-width-decr', 'nose-point-width-incr',
          'nose-hump-decr', 'nose-hump-incr', 'nose-curve-concave', 'nose-curve-convex', 'nose-volume-decr', 'nose-volume-incr', 'nose-base-down', 'nose-base-up',
          'nose-point-down', 'nose-point-up', 'nose-septumangle-decr', 'nose-septumangle-incr'],
 'mouth': ['mouth-scale-horiz-decr', 'mouth-scale-horiz-incr', 'mouth-scale-vert-decr', 'mouth-scale-vert-incr', 'mouth-lowerlip-volume-decr', 'mouth-lowerlip-volume-incr',
           'mouth-upperlip-volume-decr', 'mouth-upperlip-volume-incr', 'mouth-angles-down', 'mouth-angles-up', 'mouth-lowerlip-height-decr', 'mouth-lowerlip-height-incr',
           'mouth-upperlip-height-decr', 'mouth-upperlip-height-incr', 'mouth-cupidsbow-decr', 'mouth-cupidsbow-incr', 'mouth-dimples-in', 'mouth-dimples-out',
           'mouth-laugh-lines-in', 'mouth-laugh-lines-out', 'mouth-philtrum-volume-decr', 'mouth-philtrum-volume-incr'],
 'eyes': [f'{s}-eye-{t}' for s in 'lr' for t in ['scale-decr', 'scale-incr', 'trans-in', 'trans-out', 'trans-up', 'trans-down', 'height2-decr', 'height2-incr',
          'bag-decr', 'bag-incr', 'epicanthus-in', 'epicanthus-out', 'corner1-down', 'corner1-up', 'push1-in', 'push1-out', 'eyefold-down', 'eyefold-up']],
 'chin': ['chin-width-decr', 'chin-width-incr', 'chin-prominent-decr', 'chin-prominent-incr', 'chin-height-decr', 'chin-height-incr', 'chin-bones-decr', 'chin-bones-incr',
          'chin-cleft-decr', 'chin-cleft-incr', 'chin-jaw-drop-decr', 'chin-jaw-drop-incr', 'chin-prognathism-decr', 'chin-prognathism-incr', 'chin-triangle'],
 'cheek': [f'{s}-cheek-{t}' for s in 'lr' for t in ['bones-decr', 'bones-incr', 'volume-decr', 'volume-incr', 'inner-decr', 'inner-incr']],
 'forehead': ['forehead-nubian-decr', 'forehead-nubian-incr', 'forehead-scale-vert-decr', 'forehead-scale-vert-incr', 'forehead-temple-decr', 'forehead-temple-incr',
              'forehead-trans-backward', 'forehead-trans-forward'],
 'ears': [f'{s}-ear-{t}' for s in 'lr' for t in ['scale-decr', 'scale-incr', 'flap-decr', 'flap-incr', 'lobe-decr', 'lobe-incr']],
 'neck': ['neck-scale-horiz-decr', 'neck-scale-horiz-incr', 'neck-scale-depth-decr', 'neck-scale-depth-incr', 'neck-double-decr', 'neck-double-incr'],
 'torso': ['torso-vshape-decr', 'torso-vshape-incr', 'torso-scale-horiz-decr', 'torso-scale-horiz-incr', 'torso-scale-depth-decr', 'torso-scale-depth-incr',
           'torso-muscle-pectoral-decr', 'torso-muscle-pectoral-incr', 'torso-muscle-dorsi-decr', 'torso-muscle-dorsi-incr'],
 'stomach': ['stomach-pregnant-decr', 'stomach-pregnant-incr', 'stomach-tone-decr', 'stomach-tone-incr'],
 'buttocks': ['buttocks-volume-decr', 'buttocks-volume-incr'],
 'hip': ['hip-scale-horiz-decr', 'hip-scale-horiz-incr', 'hip-scale-depth-decr', 'hip-scale-depth-incr', 'hip-waist-down', 'hip-waist-up'],
 'breast': ['breast-dist-decr', 'breast-dist-incr', 'breast-point-decr', 'breast-point-incr', 'breast-trans-down', 'breast-trans-up', 'breast-volume-vert-down', 'breast-volume-vert-up'],
 'armslegs': [f'{s}-{t}' for s in 'lr' for t in ['upperarm-fat-decr', 'upperarm-fat-incr', 'lowerarm-fat-decr', 'lowerarm-fat-incr', 'upperleg-fat-decr', 'upperleg-fat-incr',
              'lowerleg-fat-decr', 'lowerleg-fat-incr', 'hand-scale-decr', 'hand-scale-incr', 'foot-scale-decr', 'foot-scale-incr', 'upperarm-muscle-decr', 'upperarm-muscle-incr',
              'upperleg-muscle-decr', 'upperleg-muscle-incr']],
 'eyebrows': ['eyebrows-trans-up', 'eyebrows-trans-down', 'eyebrows-angle-up', 'eyebrows-angle-down'],
}
for folder, lst in pairs.items():
    for n in lst: names.append(f'{folder}/{n}')

header = []; blobs = []; missing = []
for n in names:
    p = f'{T}/{n}.target'
    if not os.path.exists(p): missing.append(n); continue
    idx = []; d = []
    for line in open(p):
        if line.startswith('#') or not line.strip(): continue
        a = line.split(); idx.append(int(a[0])); d.extend((float(a[1]), float(a[2]), float(a[3])))
    mx = max((abs(x) for x in d), default=0.0) or 1.0
    s = mx / 32767.0
    q = [max(-32767, min(32767, round(x / s))) for x in d]
    blob = struct.pack(f'<{len(idx)}H', *idx) + struct.pack(f'<{len(q)}h', *q)
    header.append({'name': n, 'count': len(idx), 'scale': s, 'offset': sum(len(b) for b in blobs)})
    blobs.append(blob)
hj = json.dumps({'format': 'vw-targets-1', 'layout': 'per target: uint16 vertex indices[count], then int16 xyz deltas[count*3] * scale, little endian', 'units': 'dm', 'targets': header}).encode()
data = struct.pack('<I', len(hj)) + hj + b''.join(blobs)
with gzip.open(f'{out}/targets.bin.gz', 'wb', 9) as g: g.write(data)
print(f'{len(header)} targets packed ({len(data)/1e6:.1f} MB raw), missing: {missing}')
