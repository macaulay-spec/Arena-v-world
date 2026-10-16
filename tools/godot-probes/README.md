# Godot probes (S0 proofs)

Headless checks run in the sandbox with the official Godot 4.7.2 Linux build (fetched through
`.github/workflows/tools-fetch.yml` → branch `tools/godot-4.7.2-stable` → `tools/godot/*.xz`, gitignored).

```
xz -dk -c tools/godot/godot-4.7.2-stable-linux.x86_64.xz > /tmp/godot && chmod +x /tmp/godot
# put Rocketbox files under <project>/rb/ (sparse clone of microsoft/Microsoft-Rocketbox), then:
/tmp/godot --headless --path <project> --import
/tmp/godot --headless --path <project> --script inspect_fbx.gd       # meshes, triangles, materials, skeleton, bind pose, clips
/tmp/godot --headless --path <project> --script mocap_on_avatar.gd   # copies mocap tracks onto an avatar and samples the pose
```

Results on 2026-10-16 are recorded in `docs/GODOT.md`.
