#!/usr/bin/env python3
"""Generate the JAG / VORA CITY launcher icons and splash screens for the Android project.

    python3 scripts/android/make-icons.py            (needs: pip install pillow fonttools)

Draws everything procedurally (no binary sources): black rounded tile, gold "JAG" monogram,
and a landscape/portrait splash with the VORA CITY wordmark. Font: Bebas Neue from @fontsource.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
RES = ROOT / 'android/app/src/main/res'
GOLD, INK, BG = (242, 194, 48), (244, 241, 234), (10, 10, 12)

def font(size: int) -> ImageFont.FreeTypeFont:
    ttf = Path('/tmp/bebas.ttf')
    if not ttf.exists():
        f = TTFont(ROOT / 'node_modules/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff'); f.flavor = None; f.save(ttf)
    return ImageFont.truetype(str(ttf), size)

def text_center(d: ImageDraw.ImageDraw, xy, s, f, fill):
    l, t, r, b = d.textbbox((0, 0), s, font=f); w, h = r - l, b - t
    d.text((xy[0] - w / 2 - l, xy[1] - h / 2 - t), s, font=f, fill=fill)

def icon(size: int, foreground_only=False, round_=False) -> Image.Image:
    S = size * 4  # supersample
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if not foreground_only:
        if round_: d.ellipse((0, 0, S - 1, S - 1), fill=BG)
        else: d.rounded_rectangle((0, 0, S - 1, S - 1), radius=S * 0.22, fill=BG)
        # subtle gold ring
        pad = S * 0.07
        (d.ellipse if round_ else d.rounded_rectangle)((pad, pad, S - pad, S - pad), radius=S * 0.17, outline=(GOLD[0], GOLD[1], GOLD[2], 90), width=max(2, S // 90)) if not round_ else d.ellipse((pad, pad, S - pad, S - pad), outline=(GOLD[0], GOLD[1], GOLD[2], 90), width=max(2, S // 90))
    # monogram: adaptive foregrounds keep content inside the central 66% safe zone
    scale = 0.42 if foreground_only else 0.6
    text_center(d, (S / 2, S / 2 - S * 0.02), 'JAG', font(int(S * scale)), GOLD)
    sub = font(int(S * (0.085 if foreground_only else 0.11)))
    text_center(d, (S / 2, S / 2 + S * (0.2 if foreground_only else 0.3)), 'VORA CITY', sub, INK)
    return im.resize((size, size), Image.LANCZOS)

def splash(w: int, h: int) -> Image.Image:
    S = 2; W, H = w * S, h * S
    im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    # vignette-ish glow behind the wordmark
    glow = Image.new('L', (W, H), 0); gd = ImageDraw.Draw(glow)
    gd.ellipse((W * 0.2, H * 0.2, W * 0.8, H * 0.8), fill=70)
    from PIL import ImageFilter
    glow = glow.filter(ImageFilter.GaussianBlur(min(W, H) * 0.12))
    im.paste(Image.new('RGB', (W, H), (60, 48, 14)), (0, 0), glow)
    d = ImageDraw.Draw(im)
    big = int(min(W, H) * (0.26 if W > H else 0.18))
    f = font(big)
    l, t, r, b = d.textbbox((0, 0), 'VORA ', font=f); wv = r - l
    l2, t2, r2, b2 = d.textbbox((0, 0), 'CITY', font=f); wc = r2 - l2
    x0 = (W - (wv + wc)) / 2; y = H / 2 - (b - t) / 2 - big * 0.1
    d.text((x0 - l, y - t), 'VORA ', font=f, fill=INK); d.text((x0 + wv - l2, y - t2), 'CITY', font=f, fill=GOLD)
    text_center(d, (W / 2, y + (b - t) + big * 0.28), 'J A G   S T U D I O S', font(int(big * 0.22)), (170, 170, 170))
    return im.resize((w, h), Image.LANCZOS)

def main():
    dens = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
    for name, k in dens.items():
        d = RES / f'mipmap-{name}'; d.mkdir(exist_ok=True)
        icon(int(48 * k)).save(d / 'ic_launcher.png')
        icon(int(48 * k), round_=True).save(d / 'ic_launcher_round.png')
        icon(int(108 * k), foreground_only=True).save(d / 'ic_launcher_foreground.png')
    for name, (w, h) in {'land-mdpi': (480, 320), 'land-hdpi': (800, 480), 'land-xhdpi': (1280, 720), 'land-xxhdpi': (1600, 960), 'land-xxxhdpi': (1920, 1280)}.items():
        splash(w, h).save(RES / f'drawable-{name}' / 'splash.png')
    for name, (w, h) in {'port-mdpi': (320, 480), 'port-hdpi': (480, 800), 'port-xhdpi': (720, 1280), 'port-xxhdpi': (960, 1600), 'port-xxxhdpi': (1280, 1920)}.items():
        splash(w, h).save(RES / f'drawable-{name}' / 'splash.png')
    splash(1280, 720).save(RES / 'drawable' / 'splash.png')
    (RES / 'values' / 'ic_launcher_background.xml').write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0A0A0C</color>\n</resources>\n')
    icon(512).save(ROOT / 'docs' / 'icon-512.png')
    print('icons + splash written')

if __name__ == '__main__':
    main()
