/**
 * Frustum culling for generated skinned characters. three.js computes a SkinnedMesh's bounding
 * sphere lazily from the current pose; we set an explicit, pose-independent sphere in character
 * space (feet at the origin) that covers every clip (jump, lie, carried props), so culling can stay
 * enabled without characters popping out at the frame edge.
 */
import * as THREE from 'three';

/** body sphere for a 1.75 m character: centre height and radius (metres) */
export const BODY_SPHERE = { cy: 0.95, r: 1.6 };

export function setSkinnedBounds(root: THREE.Object3D, heightM = 1.75): void {
  const k = Math.max(0.6, heightM / 1.75);
  root.traverse(o => {
    const sm = o as THREE.SkinnedMesh;
    if (!(sm as THREE.Mesh).isMesh) return;
    if (sm.isSkinnedMesh) { sm.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, BODY_SPHERE.cy * k, 0), BODY_SPHERE.r * k); }
    sm.frustumCulled = true;
  });
}
