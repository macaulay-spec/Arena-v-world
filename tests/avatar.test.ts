/**
 * Avatar appearance updates under overlapping async loads (synthetic kits with controlled timing),
 * resource cleanup, and the pose-independent culling bounds.
 */
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Avatar, DEFAULT_APPEARANCE, type KitInfo, type Appearance } from '../src/game/player';
import { setSkinnedBounds, BODY_SPHERE } from '../src/characters/bounds';

/** a tiny rigged kit: Armature → Hips → Spine… with LOD0 (morphs), two outfits and one hair node, all skinned */
function syntheticKit(sex: 'f' | 'm'): GLTF {
  const scene = new THREE.Group(); scene.name = 'Scene';
  const armature = new THREE.Group(); armature.name = 'Armature'; scene.add(armature);
  const names = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'];
  const bones: THREE.Bone[] = []; let parent: THREE.Object3D = armature;
  for (const n of names) { const b = new THREE.Bone(); b.name = `mixamorig:${n}`; b.position.set(0, n === 'Hips' ? 0.95 : 0.1, 0); parent.add(b); bones.push(b); parent = b; }
  const skeleton = new THREE.Skeleton(bones);
  const mkMesh = (name: string, morphs?: string[]) => {
    const geo = new THREE.BoxGeometry(0.3, 1.7, 0.3); const n = geo.attributes.position.count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(n * 4).fill(0).map((_, i) => (i % 4 === 0 ? 1 : 0)), 4));
    if (morphs) { geo.morphAttributes.position = morphs.map(() => new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3)); }
    const mat = new THREE.MeshStandardMaterial({ name: name === 'LOD0' ? 'skin' : 'cloth' });
    const m = new THREE.SkinnedMesh(geo, mat); m.name = name; m.bind(skeleton);
    if (morphs) { m.morphTargetDictionary = Object.fromEntries(morphs.map((k, i) => [k, i])); m.morphTargetInfluences = morphs.map(() => 0); }
    armature.add(m); return m;
  };
  mkMesh('LOD0', ['shape_weight_lo', 'shape_weight_hi', 'face_jaw_neg', 'face_jaw_pos']);
  mkMesh('OUTFIT_casual', ['shape_weight_lo', 'shape_weight_hi']); mkMesh('OUTFIT_smart', ['shape_weight_lo', 'shape_weight_hi']);
  mkMesh('HAIR_low_cut'); mkMesh('HAIR_afro');
  scene.userData.sex = sex;
  return { scene, scenes: [scene], animations: [], cameras: [], asset: {}, parser: null as never, userData: {} } as unknown as GLTF;
}
const KITS: KitInfo[] = [
  { sex: 'm', file: 'player_m.gltf', height: 1.88, skin: ['#111', '#222', '#333'], hair: [{ id: 'low_cut', name: 'Low' }, { id: 'afro', name: 'Afro' }], outfits: [{ id: 'casual', name: 'Casual' }, { id: 'smart', name: 'Office' }], morphs: ['shape_weight_lo', 'shape_weight_hi'] },
  { sex: 'f', file: 'player_f.gltf', height: 1.66, skin: ['#111', '#222'], hair: [{ id: 'low_cut', name: 'Low' }, { id: 'afro', name: 'Afro' }], outfits: [{ id: 'casual', name: 'Casual' }, { id: 'smart', name: 'Office' }] },
];
const lib = async () => ({ clips: [] as THREE.AnimationClip[], hipsRest: new THREE.Vector3(0, 0.95, 0), height: 1.708 });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const app = (over: Partial<Appearance>): Appearance => ({ ...DEFAULT_APPEARANCE, face: {}, ...over });
const visibleNodes = (av: Avatar, prefix: string) => { const out: string[] = []; av.root.traverse(o => { if (o.name.startsWith(prefix) && o.visible) out.push(o.name); }); return out; };

describe('Avatar.setAppearance under overlapping calls', () => {
  it('a slow older load never overwrites a newer selection; exactly one model remains', async () => {
    const delays = { m: 60, f: 5 }; let loads = 0;
    const av = new Avatar('x/', false, { kit: async (_b, sex) => { loads++; await sleep(delays[sex]); return syntheticKit(sex); }, lib });
    const p1 = av.setAppearance(app({ sex: 'm', outfit: 'casual' }), KITS);    // slow
    const p2 = av.setAppearance(app({ sex: 'f', outfit: 'casual' }), KITS);    // fast
    const p3 = av.setAppearance(app({ sex: 'f', outfit: 'smart', hair: 'afro', tone: 1 }), KITS);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
    expect([r1, r2, r3]).toEqual([false, false, true]);
    expect(av.root.children.length).toBe(1);
    expect(av.applied).toMatchObject({ sex: 'f', outfit: 'smart', hair: 'afro', tone: 1 });
    expect(av.root.children[0].userData.sex ?? (av.root.children[0] as THREE.Object3D).children.length).toBeTruthy();
    expect(visibleNodes(av, 'OUTFIT_')).toEqual(['OUTFIT_smart']);
    expect(visibleNodes(av, 'HAIR_')).toEqual(['HAIR_afro']);
    expect(loads).toBeLessThanOrEqual(2); // the superseded male request did not trigger a second male load
  });

  it('rapid m/f/m/f switching ends on the last choice with the morph weights of that choice', async () => {
    const av = new Avatar('x/', false, { kit: async (_b, sex) => { await sleep(sex === 'm' ? 20 : 3); return syntheticKit(sex); }, lib });
    const seq: Appearance[] = [];
    for (let i = 0; i < 8; i++) seq.push(app({ sex: i % 2 ? 'f' : 'm', build: i / 7, outfit: i % 3 ? 'smart' : 'casual' }));
    const results = await Promise.all(seq.map(a => av.setAppearance(a, KITS)));
    expect(results.filter(Boolean).length).toBe(1); expect(results[7]).toBe(true);
    expect(av.root.children.length).toBe(1);
    expect(av.applied?.sex).toBe('f'); expect(av.applied?.build).toBe(1);
    const lod0 = av.root.getObjectByName('LOD0') as THREE.SkinnedMesh;
    expect(lod0.morphTargetInfluences![lod0.morphTargetDictionary!.shape_weight_hi]).toBeGreaterThan(1);
    expect(lod0.morphTargetInfluences![lod0.morphTargetDictionary!.shape_weight_lo]).toBe(0);
    expect(visibleNodes(av, 'OUTFIT_')).toEqual(['OUTFIT_smart']);
  });

  it('a failed load keeps the current model and resolves false; a later good load recovers', async () => {
    let fail = false;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const av = new Avatar('x/', false, { kit: async (_b, sex) => { await sleep(2); if (fail) throw new Error('network'); return syntheticKit(sex); }, lib });
    expect(await av.setAppearance(app({ sex: 'm' }), KITS)).toBe(true);
    fail = true;
    expect(await av.setAppearance(app({ sex: 'f' }), KITS)).toBe(false);
    expect(av.root.children.length).toBe(1); expect(av.applied?.sex).toBe('m'); // still the male model, still visible
    fail = false;
    expect(await av.setAppearance(app({ sex: 'f' }), KITS)).toBe(true);
    expect(av.applied?.sex).toBe('f'); expect(av.root.children.length).toBe(1);
    warn.mockRestore();
  });

  it('replacing a model disposes its private skin material clone and detaches it; dispose() empties the avatar', async () => {
    const av = new Avatar('x/', false, { kit: async (_b, sex) => syntheticKit(sex), lib });
    await av.setAppearance(app({ sex: 'm' }), KITS);
    const first = av.model!; const skin = (av.root.getObjectByName('LOD0') as THREE.Mesh).material as THREE.Material;
    const disposed = vi.fn(); skin.addEventListener('dispose', disposed);
    await av.setAppearance(app({ sex: 'f' }), KITS);
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(first.parent).toBeNull(); expect(av.root.children.length).toBe(1); expect(av.model).not.toBe(first);
    av.dispose();
    expect(av.root.children.length).toBe(0); expect(av.model).toBeNull(); expect(av.applied).toBeNull();
  });

  it('height changes bone lengths, not the whole-model scale, and keeps the feet on the ground', async () => {
    const av = new Avatar('x/', false, { kit: async (_b, sex) => syntheticKit(sex), lib });
    await av.setAppearance(app({ sex: 'm', height: 1 }), KITS);
    expect(av.root.scale.x).toBe(1); expect(av.model!.scale.x).toBe(1);
    const spine = av.root.getObjectByName('mixamorig:Spine') as THREE.Bone;
    expect(spine.position.y).toBeCloseTo(0.1 * 1.06, 6);
    expect(av.model!.position.y).toBeCloseTo(0.06 * 0.95, 6); // hips lifted by the extra leg length
    await av.setAppearance(app({ sex: 'm', height: 0 }), KITS);
    expect(spine.position.y).toBeCloseTo(0.1 * 0.94, 6);
  });
});

describe('skinned culling bounds', () => {
  it('sets an explicit sphere that covers the whole animated body and leaves culling enabled', () => {
    const kit = syntheticKit('m'); setSkinnedBounds(kit.scene, 1.88);
    const lod0 = kit.scene.getObjectByName('LOD0') as THREE.SkinnedMesh;
    expect(lod0.frustumCulled).toBe(true);
    const k = 1.88 / 1.75;
    expect(lod0.boundingSphere!.center.y).toBeCloseTo(BODY_SPHERE.cy * k, 6);
    expect(lod0.boundingSphere!.radius).toBeCloseTo(BODY_SPHERE.r * k, 6);
    // the sphere contains the feet, the head top with the clip-driven hip lift of the jump (the real jump height moves
    // the whole object, sphere included), and a lying body (±1 m along the ground)
    for (const p of [[0, 0, 0], [0, 1.88, 0], [0, 1.88 + 0.5, 0], [0.95, 0.2, 0], [0, 0.2, -0.95]]) expect(lod0.boundingSphere!.containsPoint(new THREE.Vector3(...(p as [number, number, number])))).toBe(true);
  });
  it('a camera that looks away culls the character, one that looks at it does not (frustum × sphere)', () => {
    const kit = syntheticKit('m'); setSkinnedBounds(kit.scene, 1.75);
    const lod0 = kit.scene.getObjectByName('LOD0') as THREE.SkinnedMesh;
    kit.scene.position.set(10, 0, 0); kit.scene.updateMatrixWorld(true);
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 100);
    const frustum = new THREE.Frustum(); const sphere = new THREE.Sphere();
    const test = (lookX: number) => { cam.position.set(0, 1.5, 0); cam.lookAt(lookX, 1, 0); cam.updateMatrixWorld(true); frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)); sphere.copy(lod0.boundingSphere!).applyMatrix4(lod0.matrixWorld); return frustum.intersectsSphere(sphere); };
    expect(test(10)).toBe(true);
    expect(test(-10)).toBe(false);
  });
});
