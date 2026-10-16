#!/usr/bin/env python3
"""Turns generated source art (art/src/textures/*.png) into game-ready tiles in godot/assets/textures/.

- material tiles: made seamless (offset + feathered blend), downscaled to <= 512²
- tree cutouts (*_src.png on magenta): keyed to alpha, cropped, squared, edge colours bled
- missing names get procedural placeholders so the scene always has *something* (flagged in the log)

Usage: python3 tools/make_textures.py
"""
import math, os, random
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art/src/textures"
OUT = ROOT / "godot/assets/textures"
OUT.mkdir(parents=True, exist_ok=True)

TILES = {  # name: (size, seamless)
    "asphalt": (512, True), "pavers": (512, True), "grass": (512, True), "roof_tile": (512, True),
    "plaster_win": (512, True), "plaster_win2": (512, True), "plaster_louvre": (512, True), "plaster_plain": (512, True),
    "concrete_grid": (512, True), "compound_wall": (512, True), "mansion_glass": (256, True), "mansion_wall": (256, True),
    "roof_concrete": (256, True), "roof_metal": (256, True), "concrete": (256, True), "stone": (256, True),
    "wood": (256, True), "earth": (256, True),
    "interior_floor": (512, True), "interior_oak": (512, True), "interior_fabric": (512, True),
}
ART_IMAGES = {"jag_house_art": (512, 384)}
TREES = {"tree_palm": 512, "tree_broad": 512, "tree_neem": 512, "tree_small": 256}
ALIASES = {"plaster_louvre": "plaster_win", "concrete_grid": "plaster_win2", "mansion_wall": "compound_wall"}


def seamless(img: Image.Image, frac: float = 0.10) -> Image.Image:
    """Wrap crossfade: overlap the right band onto the left (and bottom onto top) and crop, so the
    new edges are continuous. Keeps centred features (windows) intact — no ghosting."""
    import numpy as np
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    h, w, _ = a.shape
    b = max(4, int(w * frac))
    t = np.linspace(0.0, 1.0, b, dtype=np.float32)[None, :, None]
    left = a[:, :b, :] * t + a[:, w - b:, :] * (1.0 - t)
    a = np.concatenate([left, a[:, b:w - b, :]], axis=1)
    h, w, _ = a.shape
    bb = max(4, int(h * frac))
    tv = np.linspace(0.0, 1.0, bb, dtype=np.float32)[:, None, None]
    top = a[:bb, :, :] * tv + a[h - bb:, :, :] * (1.0 - tv)
    a = np.concatenate([top, a[bb:h - bb, :, :]], axis=0)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB")


def finish_tile(name: str, img: Image.Image, size: int, make_seamless: bool):
    img = img.convert("RGB")
    if img.size[0] != img.size[1]:
        s = min(img.size)
        img = img.crop((0, 0, s, s))
    if make_seamless:
        img = seamless(img)
    img = img.resize((size, size), Image.LANCZOS)
    img.save(OUT / f"{name}.png", optimize=True)


def key_magenta(img: Image.Image) -> Image.Image:
    img = img.convert("RGB")
    px = img.load()
    w, h = img.size
    out = Image.new("RGBA", (w, h))
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y]
            # magenta-ness: high r & b, low g (foliage/bark/white flowers never have min(r,b) >> g)
            spill = min(r, b) - g
            m = max(0.0, min(1.0, spill / 70.0))
            a = int(255 * (1.0 - m))
            if spill > 12:
                # full despill: clamp red and blue down to the green level so edge pixels stay leaf-coloured
                cap = g + 12
                op[x, y] = (min(r, cap), g, min(b, cap), a)
            else:
                op[x, y] = (r, g, b, 255)
    return out


def bleed_edges(img: Image.Image) -> Image.Image:
    """Fill transparent pixels with blurred colour of neighbours (no dark fringes with alpha scissor)."""
    rgb = img.convert("RGB")
    alpha = img.getchannel("A")
    blurred = rgb
    for _ in range(3):
        blurred = blurred.filter(ImageFilter.GaussianBlur(4))
    mask = alpha.point(lambda v: 255 if v > 8 else 0)
    merged = Image.composite(rgb, blurred, mask)
    merged.putalpha(alpha)
    return merged


def finish_tree(name: str, src: Image.Image, size: int):
    img = key_magenta(src)
    bbox = img.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()
    if bbox:
        img = img.crop(bbox)
    w, h = img.size
    s = max(w, h)
    sq = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sq.paste(img, ((s - w) // 2, s - h))  # base at the bottom
    sq = bleed_edges(sq)
    sq = sq.resize((size, size), Image.LANCZOS)
    sq.save(OUT / f"{name}.png", optimize=True)


# --------------------------------------------------------------------- procedural placeholders
def noise_tile(size, base, var=18, seed=1):
    rnd = random.Random(seed)
    img = Image.new("RGB", (size, size), base)
    px = img.load()
    for y in range(size):
        for x in range(size):
            n = rnd.randint(-var, var)
            r, g, b = base
            px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return img.filter(ImageFilter.GaussianBlur(0.8))


def placeholder(name: str, size: int) -> Image.Image:
    if name == "roof_metal":
        img = noise_tile(size, (120, 125, 132), 10, 3)
        d = ImageDraw.Draw(img)
        for x in range(0, size, 16):
            d.line([(x, 0), (x, size)], fill=(90, 94, 100), width=3)
            d.line([(x + 8, 0), (x + 8, size)], fill=(150, 155, 160), width=2)
        return img
    if name == "wood":
        img = noise_tile(size, (110, 72, 42), 14, 4)
        d = ImageDraw.Draw(img)
        for y in range(0, size, size // 6):
            d.line([(0, y), (size, y)], fill=(70, 45, 25), width=3)
        return img
    if name == "stone":
        img = noise_tile(size, (150, 140, 125), 16, 5)
        d = ImageDraw.Draw(img)
        rnd = random.Random(5)
        for y in range(0, size, 48):
            off = 32 if (y // 48) % 2 else 0
            d.line([(0, y), (size, y)], fill=(95, 88, 78), width=3)
            for x in range(off, size + 64, 96):
                d.line([(x, y), (x, y + 48)], fill=(95, 88, 78), width=3)
        return img
    if name == "earth":
        return noise_tile(size, (140, 105, 70), 20, 6)
    if name == "concrete":
        return noise_tile(size, (168, 165, 158), 12, 7)
    if name == "roof_concrete":
        return noise_tile(size, (138, 136, 130), 14, 8)
    if name == "plaster_plain":
        return noise_tile(size, (214, 206, 190), 9, 9)
    if name == "mansion_wall":
        return noise_tile(size, (238, 236, 230), 5, 10)
    return noise_tile(size, (200, 60, 200), 10, 11)


def tree_placeholder(name: str, size: int) -> Image.Image:
    """Trunk + blobby canopy sprite with alpha (until the generated art lands)."""
    rnd = random.Random(hash(name) & 0xffff)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx = size // 2
    trunk_h = int(size * (0.45 if name == "tree_palm" else 0.3))
    d.rectangle([cx - size // 40, size - trunk_h, cx + size // 40, size], fill=(95, 75, 55, 255))
    top = size - trunk_h
    if name == "tree_palm":
        for i in range(14):
            ang = rnd.uniform(0, math.tau)
            L = size * rnd.uniform(0.22, 0.34)
            ex, ey = cx + math.cos(ang) * L, top + math.sin(ang) * L * 0.6 - size * 0.05
            d.line([(cx, top), (ex, ey)], fill=(60 + rnd.randint(0, 30), 120 + rnd.randint(0, 40), 50, 255), width=max(3, size // 60))
    else:
        rad = size * (0.42 if name == "tree_broad" else 0.36)
        for i in range(140):
            a = rnd.uniform(0, math.tau)
            r = rad * math.sqrt(rnd.random())
            x, y = cx + math.cos(a) * r, top - size * 0.1 + math.sin(a) * r * 0.75
            s = size * rnd.uniform(0.04, 0.09)
            g = 90 + rnd.randint(0, 70)
            d.ellipse([x - s, y - s, x + s, y + s], fill=(40 + rnd.randint(0, 30), g, 35 + rnd.randint(0, 25), 255))
    return bleed_edges(img)


def main():
    made, placeholders = [], []
    for name, (size, seam) in TILES.items():
        src = SRC / f"{name}.png"
        if not src.exists() and name in ALIASES and (SRC / f"{ALIASES[name]}.png").exists():
            src = SRC / f"{ALIASES[name]}.png"
        if src.exists():
            finish_tile(name, Image.open(src), size, seam)
            made.append(name)
        else:
            placeholder(name, size).save(OUT / f"{name}.png", optimize=True)
            placeholders.append(name)
    for name, size in ART_IMAGES.items():
        src = SRC / f"{name}.png"
        if src.exists():
            img = Image.open(src).convert("RGB")
            target_w, target_h = size
            # Center-crop to the canvas aspect ratio, then resize without stretching the artwork.
            ratio = target_w / target_h
            w, h = img.size
            if w / h > ratio:
                nw = int(h * ratio)
                x0 = (w - nw) // 2
                img = img.crop((x0, 0, x0 + nw, h))
            else:
                nh = int(w / ratio)
                y0 = (h - nh) // 2
                img = img.crop((0, y0, w, y0 + nh))
            img.resize(size, Image.LANCZOS).save(OUT / f"{name}.png", optimize=True)
            made.append(name)
        else:
            placeholder(name, size[0]).save(OUT / f"{name}.png", optimize=True)
            placeholders.append(name)
    for name, size in TREES.items():
        src = SRC / f"{name}_src.png"
        if src.exists():
            finish_tree(name, Image.open(src), size)
            made.append(name)
        else:
            tree_placeholder(name, size).save(OUT / f"{name}.png", optimize=True)
            placeholders.append(name)
    print("textures from art:", ", ".join(made))
    print("PLACEHOLDERS (replace with generated art):", ", ".join(placeholders))
    total = sum(f.stat().st_size for f in OUT.glob("*.png")) / 1024
    print(f"{len(list(OUT.glob('*.png')))} files, {total:.0f} KB")


if __name__ == "__main__":
    main()
