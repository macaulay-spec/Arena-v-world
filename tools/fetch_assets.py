#!/usr/bin/env python3
"""Fetch + prepare external game assets (not committed to git).

Rocketbox: sparse-clones microsoft/Microsoft-Rocketbox (MIT), copies the requested
avatars (FBX + textures downscaled to game budgets, TGA -> PNG) and mocap clips into
godot/assets/ext/rocketbox/, and writes index.json for the Godot side.

Usage: python3 tools/fetch_assets.py [--src /path/to/rocketbox-clone] [--only rocketbox]
Env:   ROCKETBOX_SRC  (clone dir, default /tmp/rb)
"""
import argparse, json, os, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "assets/manifest/rocketbox.json"
OUT = ROOT / "godot/assets/ext/rocketbox"
REPO = "https://github.com/microsoft/Microsoft-Rocketbox.git"
CATEGORIES = ["Adults", "Professions", "Children"]
ANIM_DIRS = {"static": "all_animations_max_motextr_static", "xy": "all_animations_max_motextr_xy", "xyz": "all_animations_max_motextr_xyz"}


def run(cmd, cwd=None, check=True):
    print("+", " ".join(cmd), flush=True)
    return subprocess.run(cmd, cwd=cwd, check=check, text=True, capture_output=True)


def ensure_clone(src: Path, patterns):
    if not (src / ".git").exists():
        src.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", "--filter=blob:none", "--no-checkout", "--depth", "1", REPO, str(src)])
        run(["git", "sparse-checkout", "init", "--no-cone"], cwd=src)
    existing = set()
    try:
        existing = set(run(["git", "sparse-checkout", "list"], cwd=src).stdout.split())
    except subprocess.CalledProcessError:
        pass
    wanted = set(patterns)
    if not wanted.issubset(existing):
        run(["git", "sparse-checkout", "set", "--no-cone", *sorted(existing | wanted)], cwd=src)
    # checkout (idempotent); depth-1 clone has a single branch
    branch = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=src, check=False).stdout.strip()
    if branch in ("", "HEAD"):
        run(["git", "checkout", "main"], cwd=src, check=False) or run(["git", "checkout", "master"], cwd=src, check=False)
    else:
        run(["git", "checkout", branch], cwd=src, check=False)


def find_avatar_dir(src: Path, name: str):
    for cat in CATEGORIES:
        d = src / "Assets/Avatars" / cat / name
        if (d / "Export" / f"{name}.fbx").exists():
            return d
    return None


def downscale(tga: Path, png: Path, max_size: int):
    from PIL import Image
    img = Image.open(tga)
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA")
    if max(img.size) > max_size:
        img = img.resize((max_size, max_size), Image.LANCZOS)
    png.parent.mkdir(parents=True, exist_ok=True)
    img.save(png, optimize=True)
    return img.size


def fetch_rocketbox(src: Path, manifest: dict):
    patterns = []
    for av in manifest["avatars"]:
        for cat in CATEGORIES:
            patterns.append(f"/Assets/Avatars/{cat}/{av['name']}/Export/{av['name']}.fbx")
            patterns.append(f"/Assets/Avatars/{cat}/{av['name']}/Textures/*")
    for kind, names in manifest["clips"].items():
        for n in names:
            patterns.append(f"/Assets/Animations/{ANIM_DIRS[kind]}/{n}.max.fbx")
    ensure_clone(src, patterns)

    index = {"avatars": [], "clips": []}
    tmax = manifest.get("texture_max", {})
    for av in manifest["avatars"]:
        name = av["name"]
        d = find_avatar_dir(src, name)
        if d is None:
            print(f"!! avatar not found: {name}", file=sys.stderr)
            continue
        dst = OUT / "avatars" / name
        dst.mkdir(parents=True, exist_ok=True)
        shutil.copy2(d / "Export" / f"{name}.fbx", dst / f"{name}.fbx")
        textures = {}
        for tga in sorted((d / "Textures").glob("*_color.tga")):
            stem = tga.stem  # e.g. m002_body_color
            slot = stem.split("_")[-2]  # body / head / opacity / equipment ...
            size = tmax.get(slot, 512)
            png = dst / "tex" / f"{stem}.png"
            if not png.exists():
                downscale(tga, png, size)
            textures[stem.rsplit("_", 1)[0]] = f"tex/{stem}.png"  # key: material name (m002_body)
        index["avatars"].append({"name": name, "sex": av["sex"], "role": av.get("role", "civ"),
                                 "scene": f"avatars/{name}/{name}.fbx", "textures": textures})
        print(f"avatar {name}: {len(textures)} textures")

    adst = OUT / "anim"
    adst.mkdir(parents=True, exist_ok=True)
    for kind, names in manifest["clips"].items():
        for n in names:
            f = src / "Assets/Animations" / ANIM_DIRS[kind] / f"{n}.max.fbx"
            if not f.exists():
                print(f"!! clip not found: {n}", file=sys.stderr)
                continue
            shutil.copy2(f, adst / f"{n}.fbx")
            index["clips"].append({"name": n, "sex": n[0], "kind": kind, "scene": f"anim/{n}.fbx",
                                   "loop": not any(k in n for k in ("start", "stop", "to_"))})
    (OUT / "index.json").write_text(json.dumps(index, indent=1))
    (OUT / ".gdignore_not").write_text("")  # marker: this dir is imported by Godot
    print(f"rocketbox: {len(index['avatars'])} avatars, {len(index['clips'])} clips -> {OUT}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=os.environ.get("ROCKETBOX_SRC", "/tmp/rb"))
    args = ap.parse_args()
    manifest = json.loads(MANIFEST.read_text())
    fetch_rocketbox(Path(args.src), manifest)


if __name__ == "__main__":
    main()
