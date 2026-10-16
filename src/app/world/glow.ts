/** Night-time light pools under street lamps: one instanced additive quad per lamp, faded in by GLOBAL.uNight. */
import * as THREE from 'three';
import type { CityData } from '../../shared/types';
import { GLOBAL } from '../materials';

const RADIUS: Record<string, number> = { lamp: 7, 'lamp-double': 11, 'lamp-tall': 13, floodlight: 26 };

export function buildLampGlow(city: CityData): THREE.InstancedMesh | null {
  const lamps = city.props.filter(p => RADIUS[p.t] !== undefined);
  if (!lamps.length) return null;
  const geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uNight: GLOBAL.uNight },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: `varying vec2 vUv; varying vec3 vCol; attribute vec3 aCol;
      void main(){ vUv = uv; vCol = aCol; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uNight; varying vec2 vUv; varying vec3 vCol;
      void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - d, 0.0), 2.2) * uNight; gl_FragColor = vec4(vCol * a, a); }`,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, lamps.length);
  const cols = new Float32Array(lamps.length * 3);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  lamps.forEach((p, i) => {
    const r = RADIUS[p.t] * (typeof p.s === 'number' ? p.s : 1);
    m.makeScale(r, 1, r).setPosition(p.x, (p.y ?? 0) + 0.32, p.z);
    mesh.setMatrixAt(i, m);
    c.set(p.t === 'floodlight' ? '#dfe8ff' : p.v === 2 ? '#ffd9a0' : '#ffc77a');
    const k = p.t === 'floodlight' ? 0.5 : 0.55;
    cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k;
  });
  geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(cols, 3));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = 'lamp-glow';
  return mesh;
}
