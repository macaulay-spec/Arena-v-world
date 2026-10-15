/**
 * Clip retargeting for V-WORLD characters: the shared animation library is authored on a
 * reference skeleton; rotations transfer 1:1 (same bone names, same bind orientation), the Hips
 * translation is re-based on the character's own rest position and scaled by relative height.
 */
import * as THREE from 'three';

export interface AnimLibrary { clips: THREE.AnimationClip[]; hipsRest: THREE.Vector3; height: number }

export function libraryFrom(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[]; parser?: any }): AnimLibrary {
  const hips = gltf.scene.getObjectByName('mixamorig:Hips');
  const extras = gltf.parser?.json?.asset?.extras ?? {};
  return { clips: gltf.animations, hipsRest: hips ? hips.position.clone() : new THREE.Vector3(0, 0.95, 0), height: extras.reference_height ?? 1.75 };
}

/** Retarget every library clip to `root` (a character scene whose Hips node is in rest pose). */
export function retargetAll(lib: AnimLibrary, root: THREE.Object3D, height: number): THREE.AnimationClip[] {
  const hips = root.getObjectByName('mixamorig:Hips'); if (!hips) return lib.clips;
  const rest = hips.position.clone(); const k = height / lib.height;
  return lib.clips.map(clip => {
    const c = clip.clone();
    for (const track of c.tracks) {
      if (track.name !== 'mixamorig:Hips.position') continue;
      const v = track.values as Float32Array;
      for (let i = 0; i < v.length; i += 3) { v[i] = rest.x + (v[i] - lib.hipsRest.x) * k; v[i + 1] = rest.y + (v[i + 1] - lib.hipsRest.y) * k; v[i + 2] = rest.z + (v[i + 2] - lib.hipsRest.z) * k; }
    }
    return c;
  });
}
