/**
 * City world construction shared by the city viewer (city.html) and the game (index.html):
 * materials → terrain/water → roads → buildings → walls → props → text. Everything is merged into
 * chunked meshes; the result exposes what the runtimes need (ground, pickables, detail culling list).
 */
import * as THREE from 'three';
import type { CityData } from '../../shared/types';
import { buildAtlas, buildDetailTexture } from '../atlas';
import { makeAtlasMaterial, makePropMaterial, makeFoliageMaterial, makeGlassMaterial, makeTerrainMaterial, makeWaterMaterial } from '../materials';
import { AtlasBuilder, ColorBuilder } from '../geom';
import { TextAtlas, TextBuilder, makeTextMaterial } from '../signs';
import { ChunkSet } from './chunks';
import { makeWorldBase, buildTerrain, buildWater, buildSurfaces, type WorldBase } from './terrain';
import { buildRoads } from './roads';
import { buildBuildings } from './buildings';
import { buildWalls } from './walls';
import { buildProps } from './props';
import { buildLampGlow } from './glow';

export interface WorldQuality { atlasPx: number; detail: number }
export interface BuildWorldOptions {
  /** progress callback (label, 0..1) — awaited so the UI can repaint between stages */
  progress?: (label: string, f: number) => Promise<void> | void;
  /** half-resolution sign text (phones) */
  smallText?: boolean;
}
export interface DetailMesh { obj: THREE.Object3D; cx: number; cz: number; r: number }
export interface CityWorld {
  world: THREE.Group;
  base: WorldBase;
  detailMeshes: DetailMesh[];
  buildingMeshes: THREE.Mesh[];
  roadMeshes: THREE.Mesh[];
  instanceCount: number;
  materials: { atlas: THREE.Material; prop: THREE.Material; foliage: THREE.Material; glass: THREE.Material; terrain: THREE.Material; water: THREE.Material };
  height: (x: number, z: number) => number;
}

export async function buildCityWorld(city: CityData, Q: WorldQuality, opts: BuildWorldOptions = {}): Promise<CityWorld> {
  const setProgress = async (t: string, f: number) => { if (opts.progress) await opts.progress(t, f); };

  // materials
  await setProgress('Painting material atlas…', 0.06);
  const atlas = buildAtlas(Q.atlasPx);
  const detailTex = buildDetailTexture(256);
  const atlasMat = makeAtlasMaterial(atlas, { detail: detailTex });
  const propMat = makePropMaterial(), foliageMat = makeFoliageMaterial(), glassMat = makeGlassMaterial();
  const terrainMat = makeTerrainMaterial(detailTex);
  const waterMat = makeWaterMaterial();
  const textAtlas = new TextAtlas(2048, 4096, opts.smallText ? 0.5 : 1);
  const textMat = makeTextMaterial(textAtlas);
  const markMat = makePropMaterial(); markMat.polygonOffset = true; markMat.polygonOffsetFactor = -1; markMat.polygonOffsetUnits = -1; markMat.customProgramCacheKey = () => 'vworld-prop';

  // world base
  await setProgress('Grading terrain…', 0.1);
  const base = makeWorldBase(city);
  const world = new THREE.Group(); world.name = 'world';
  const terrain = buildTerrain(city, base, terrainMat); world.add(terrain);
  world.add(buildWater(city, waterMat));

  const detailMeshes: DetailMesh[] = [];
  const addChunks = <B extends { empty: boolean; build(): THREE.BufferGeometry }>(set: ChunkSet<B>, mat: THREE.Material, o: { cast?: boolean; receive?: boolean; detail?: boolean; name: string; renderOrder?: number }) => {
    const meshes: THREE.Mesh[] = [];
    for (const c of set.entries()) {
      if (c.b.empty) continue;
      const mesh = new THREE.Mesh(c.b.build(), mat);
      mesh.castShadow = !!o.cast; mesh.receiveShadow = o.receive !== false; mesh.name = o.name + ':' + c.key;
      if (o.renderOrder !== undefined) mesh.renderOrder = o.renderOrder;
      world.add(mesh); meshes.push(mesh);
      if (o.detail) detailMeshes.push({ obj: mesh, cx: c.cx, cz: c.cz, r: set.cell * 0.75 });
    }
    return meshes;
  };

  // roads
  await setProgress('Laying roads…', 0.18);
  const roadAtlas = new ChunkSet(300, () => new AtlasBuilder(atlas)), roadMarks = new ChunkSet(300, () => new ColorBuilder());
  buildRoads(city, base, { atlas: roadAtlas, marks: roadMarks });
  const surfaceAtlas = new ChunkSet(300, () => new AtlasBuilder(atlas));
  buildSurfaces(city, base, atlas, surfaceAtlas.get(0, 0) as AtlasBuilder);
  await setProgress('Laying roads…', 0.3);
  const roadMeshes = addChunks(roadAtlas, atlasMat, { name: 'roads', receive: true });
  addChunks(roadMarks, markMat, { name: 'markings', receive: false, detail: true });
  addChunks(surfaceAtlas, atlasMat, { name: 'surfaces', receive: true });

  // buildings
  await setProgress('Raising buildings…', 0.36);
  const bAtlas = new ChunkSet(200, () => new AtlasBuilder(atlas)), bColor = new ChunkSet(200, () => new ColorBuilder()), bText = new ChunkSet(400, () => new TextBuilder());
  buildBuildings(city, base, { atlas: bAtlas, color: bColor, text: bText, textAtlas });
  await setProgress('Raising buildings…', 0.55);
  const buildingMeshes = addChunks(bAtlas, atlasMat, { name: 'buildings', cast: true, receive: true });
  addChunks(bColor, propMat, { name: 'features', cast: true, receive: true, detail: true });

  // walls & fences
  await setProgress('Building compound walls…', 0.6);
  const wAtlas = new ChunkSet(200, () => new AtlasBuilder(atlas)), wColor = new ChunkSet(200, () => new ColorBuilder()), wGlass = new ChunkSet(320, () => new ColorBuilder()), wFol = new ChunkSet(320, () => new ColorBuilder());
  buildWalls(city, base, { atlas: wAtlas, color: wColor, glass: wGlass, foliage: wFol });
  addChunks(wAtlas, atlasMat, { name: 'walls', cast: true, receive: true, detail: true });
  addChunks(wColor, propMat, { name: 'wall-details', cast: false, receive: true, detail: true });
  addChunks(wFol, foliageMat, { name: 'hedges', cast: false, receive: true, detail: true });

  // props
  await setProgress('Planting trees and street furniture…', 0.68);
  const pColor = new ChunkSet(320, () => new ColorBuilder()), pFol = new ChunkSet(320, () => new ColorBuilder()), pGlass = new ChunkSet(320, () => new ColorBuilder()), pText = new ChunkSet(400, () => new TextBuilder());
  const propRes = buildProps(city, { color: pColor, foliage: pFol, glass: pGlass, text: pText, textAtlas }, (x, z) => base.ground.height(x, z));
  await setProgress('Planting trees and street furniture…', 0.8);
  addChunks(pColor, propMat, { name: 'props-static', cast: true, receive: true, detail: true });
  addChunks(pFol, foliageMat, { name: 'props-foliage', cast: false, receive: false, detail: true });
  const matFor = (m: 'prop' | 'foliage' | 'glass') => m === 'prop' ? propMat : m === 'foliage' ? foliageMat : glassMat;
  let instanceCount = 0;
  for (const b of propRes.instanced) {
    const im = new THREE.InstancedMesh(b.geo, matFor(b.mat), b.matrices.length);
    for (let i = 0; i < b.matrices.length; i++) { im.setMatrixAt(i, b.matrices[i]); im.setColorAt(i, b.colors[i]); }
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = b.shadow && b.mat !== 'glass'; im.receiveShadow = b.mat !== 'glass';
    im.computeBoundingSphere(); im.frustumCulled = true;
    if (b.mat === 'glass') im.renderOrder = 3;
    world.add(im);
    detailMeshes.push({ obj: im, cx: b.cx, cz: b.cz, r: 320 * 0.75 });
    instanceCount += b.matrices.length;
  }
  // glass chunks (shelters, fence mesh) last for blending
  addChunks(wGlass, glassMat, { name: 'wall-glass', cast: false, receive: false, detail: true, renderOrder: 3 });
  addChunks(pGlass, glassMat, { name: 'prop-glass', cast: false, receive: false, detail: true, renderOrder: 3 });
  const glow = buildLampGlow(city); if (glow) world.add(glow);
  // text
  textAtlas.commit();
  addChunks(bText, textMat, { name: 'signs', cast: false, receive: false, detail: true, renderOrder: 4 });
  addChunks(pText, textMat, { name: 'sign-text', cast: false, receive: false, detail: true, renderOrder: 4 });

  return {
    world, base, detailMeshes, buildingMeshes, roadMeshes, instanceCount,
    materials: { atlas: atlasMat, prop: propMat, foliage: foliageMat, glass: glassMat, terrain: terrainMat, water: waterMat },
    height: (x, z) => base.ground.height(x, z),
  };
}

/** distance-based visibility for the detail chunk list (call every few frames) */
export function cullDetail(detail: DetailMesh[], cam: THREE.Vector3, radius: number): void {
  for (const d of detail) { const dist = Math.hypot(d.cx - cam.x, d.cz - cam.z) - d.r; d.obj.visible = dist < radius; }
}
