# Credits & licences

Vora City is an original fictional city by JAG. Third-party assets used by the Godot build:

## Microsoft Rocketbox avatar library — MIT
Humans (bodies, clothing textures, skeleton) and the motion-capture clips come from
[microsoft/Microsoft-Rocketbox](https://github.com/microsoft/Microsoft-Rocketbox), released by Microsoft under the MIT licence.
The avatars are fetched at build time (`tools/fetch_assets.py`, manifest `assets/manifest/rocketbox.json`),
downscaled (textures ≤ 512², body/head albedo only) and the clips are baked into one Godot `AnimationLibrary`
(`godot/tools/bake_clips.gd`). No Rocketbox files are committed to this repository.

Please cite when publishing:
> Gonzalez-Franco, M., Ofek, E., Pan, Y., Antley, A., Steed, A., Spanlang, B., Maselli, A., Banakou, D., Pelechano, N., Orts-Escolano, S., Orvalho, V., Trutoiu, L., Wojcik, M., Sanchez-Vives, M. V., Bailenson, J., Slater, M., & Lanier, J. (2020). *The Rocketbox Library and the Utility of Freely Available Rigged Avatars.* Frontiers in Virtual Reality, 1, 561558.

## Kenney Car Kit — CC0 1.0
Parked vehicles in S0 are the [Kenney Car Kit](https://kenney.nl/assets/car-kit) (public domain, CC0), fetched in CI
(`.github/workflows/godot-android.yml`) and merged into single meshes at load time. Thanks, Kenney.

## MakeHuman base mesh — CC0
Phase 2's generated humans used the MakeHuman CC0 base body (kept as variation tooling under `characters/`).

## Engine
[Godot Engine 4.7](https://godotengine.org) — MIT. Jolt Physics — MIT.

## Generated art
Brand, UI, textures and key art in `art/src/` were produced for this project with image-generation tools and are
part of the project.
