/** Shared materials. One atlas material for every textured surface; one vertex-colour material for props. */
import * as THREE from 'three';
import type { Atlas } from './atlas';
import { ATLAS_COLS, ATLAS_ROWS } from '../shared/tiles';

/** uniforms shared by all materials (time of day etc.) */
export const GLOBAL = {
  uNight: { value: 0 },      // 0 = day, 1 = night (drives emissive windows and lamps)
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
};

/**
 * Atlas material: attributes
 *   uv      – tiling coordinates (1 = one tile repeat)
 *   aTile   – tile origin in atlas uv
 *   color   – tint (applied where mask.r = 1)
 *   aLit    – night emissive strength for glass (mask.g)
 */
export function makeAtlasMaterial(atlas: Atlas, opts: { detail?: THREE.Texture } = {}): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ map: atlas.color, vertexColors: true });
  mat.defines = { USE_UV: '' };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.maskMap = { value: atlas.mask };
    shader.uniforms.detailMap = { value: opts.detail ?? null };
    shader.uniforms.uNight = GLOBAL.uNight;
    shader.uniforms.uTileScale = { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec2 aTile; attribute float aLit; varying vec2 vTile; varying float vLit; varying vec3 vWp;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vTile = aTile; vLit = aLit;`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D maskMap; uniform sampler2D detailMap; uniform float uNight; uniform vec2 uTileScale;
        varying vec2 vTile; varying float vLit; varying vec3 vWp; vec3 vwEmissive;
        float vwHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `
        vec2 tuv = vTile + fract(vMapUv) * uTileScale;
        vec2 ddx = dFdx(vMapUv) * uTileScale, ddy = dFdy(vMapUv) * uTileScale;
        vec4 texel = textureGrad(map, tuv, ddx, ddy);
        vec3 mk = textureGrad(maskMap, tuv, ddx, ddy).rgb;
        diffuseColor.rgb *= mix(texel.rgb, texel.rgb * vColor.rgb, mk.r);
        // world-space face normal (constant per planar face) → per-face seed and tri-planar detail
        vec3 fn = normalize(cross(dFdx(vWp), dFdy(vWp)));
        vec2 duv = abs(fn.y) > 0.6 ? vWp.xz : (abs(fn.x) > abs(fn.z) ? vWp.zy : vWp.xy);
        #ifdef VW_DETAIL
          float det = texture2D(detailMap, duv * 0.21).r;
          diffuseColor.rgb *= 0.86 + det * 0.28;
        #endif
        // windows: each window (tile repeat × half × face × building) decides for itself whether it is lit tonight
        vec2 cell = floor(vMapUv) + vec2(step(0.5, mk.b) * 7.0, 0.0) + floor(fn.xz * 3.0 + 0.5) * vec2(13.0, 29.0) + vec2(vLit * 97.0);
        float rnd = vwHash(cell);
        float litFrac = 0.22 + 0.45 * vLit;
        float on = step(rnd, litFrac) * smoothstep(0.08 + rnd * 0.5, 0.3 + rnd * 0.5, uNight);
        float warm = vwHash(cell + 3.1);
        vec3 lampCol = mix(vec3(1.0, 0.82, 0.55), vec3(0.78, 0.9, 1.0), step(0.6, warm));
        vwEmissive = lampCol * (mk.g * on * (0.7 + 0.5 * vwHash(cell + 7.7)) * 1.35);`)
      .replace('#include <color_fragment>', '')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vwEmissive;`);
  };
  if (opts.detail) mat.defines.VW_DETAIL = '';
  mat.customProgramCacheKey = () => 'vworld-atlas' + (opts.detail ? '-d' : '');
  return mat;
}

/**
 * Prop material (instanced or merged): vertex colour, with
 *   aTint – 1 = multiply by instanceColor (body panels), 0 = keep vertex colour
 *   aEm   – emissive strength at night (lamp heads, signal lights)
 */
export function makePropMaterial(): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = GLOBAL.uNight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aTint; attribute float aEm; varying float vEm;`)
      .replace('#include <color_vertex>', `
        vColor = color;
        #ifdef USE_INSTANCING_COLOR
          vColor.rgb = mix(vColor.rgb, vColor.rgb * instanceColor.rgb, aTint);
        #endif
        vEm = aEm;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight; varying float vEm;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vColor.rgb * (vEm * (0.15 + uNight * 2.2));`);
  };
  mat.customProgramCacheKey = () => 'vworld-prop';
  return mat;
}

/** foliage: same as prop material but double sided and slightly translucent look via vertex colours */
export function makeFoliageMaterial(): THREE.MeshLambertMaterial {
  const m = makePropMaterial(); m.side = THREE.DoubleSide; m.customProgramCacheKey = () => 'vworld-prop-ds'; return m;
}

/** translucent panels: bus shelter glass, fence mesh, railing infill */
export function makeGlassMaterial(): THREE.MeshLambertMaterial {
  const m = makePropMaterial(); m.side = THREE.DoubleSide; m.transparent = true; m.opacity = 0.42; m.depthWrite = false; m.customProgramCacheKey = () => 'vworld-prop-glass'; return m;
}

/** terrain: vertex colours × repeating detail texture */
export function makeTerrainMaterial(detail: THREE.Texture): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 d1 = texture2D(map, vMapUv * 0.5);
      vec4 d2 = texture2D(map, vMapUv * 4.3);
      diffuseColor.rgb *= (d1.rgb * 0.6 + 0.4) * (d2.rgb * 0.5 + 0.5) * 1.15;`);
  };
  mat.customProgramCacheKey = () => 'vworld-terrain';
  return mat;
}

export function makeWaterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: GLOBAL.uTime, uNight: GLOBAL.uNight, uSunDir: GLOBAL.uSunDir, uShallow: { value: new THREE.Color('#3f7f86') }, uDeep: { value: new THREE.Color('#1c4a58') } },
    transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform float uNight; uniform vec3 uSunDir; uniform vec3 uShallow; uniform vec3 uDeep; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      // small wind ripples (metres): two octaves travelling in slightly different directions
      float waves(vec2 p){ return n(p * 0.9 + vec2(uTime * 0.18, uTime * 0.05)) * 0.55 + n(p * 2.7 - vec2(uTime * 0.11, uTime * 0.2)) * 0.3 + n(p * 7.0 + vec2(0.0, uTime * 0.3)) * 0.15; }
      void main(){
        vec2 p = vW.xz;
        float w0 = waves(p);
        float e = 0.35;
        vec3 nrm = normalize(vec3((waves(p + vec2(e, 0.0)) - w0) * 0.9, 1.0, (waves(p + vec2(0.0, e)) - w0) * 0.9));
        vec3 V = normalize(cameraPosition - vW);
        float ndv = max(dot(nrm, V), 0.0);
        float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
        // large-scale colour drift (silt / depth) rather than per-ripple colour change
        float drift = n(p * 0.012 + uTime * 0.004);
        vec3 col = mix(uDeep, uShallow, drift * 0.6 + 0.1);
        vec3 sky = mix(vec3(0.66, 0.78, 0.88), vec3(0.04, 0.05, 0.09), uNight);
        col = mix(col, sky, clamp(fres * 0.85, 0.0, 0.8));
        vec3 L = normalize(uSunDir); vec3 H = normalize(L + V);
        float spec = pow(max(dot(nrm, H), 0.0), 260.0) * (1.0 - uNight) * 1.1 * step(0.02, L.y);
        col += spec * vec3(1.0, 0.95, 0.85);
        col = mix(col, col * 0.22, uNight);
        gl_FragColor = vec4(col, 0.9);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
