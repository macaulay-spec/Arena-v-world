/** Sky dome, sun/ambient lighting, fog and time-of-day. */
import * as THREE from 'three';
import { GLOBAL } from './materials';

export interface SkyRig {
  dome: THREE.Mesh;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  fog: THREE.Fog;
  /** 0–24 */
  setHour(h: number): void;
  hour: number;
  /** keep the shadow frustum centred on a point */
  follow(target: THREE.Vector3, radius: number): void;
  sunDir: THREE.Vector3;
}

export function makeSky(scene: THREE.Scene, shadowMapSize: number): SkyRig {
  const uniforms = {
    uZenith: { value: new THREE.Color('#2f6fb8') }, uHorizon: { value: new THREE.Color('#cfe0ee') }, uGround: { value: new THREE.Color('#9aa39b') },
    uSunDir: GLOBAL.uSunDir, uSunColor: { value: new THREE.Color('#fff2d0') }, uNight: GLOBAL.uNight, uHaze: { value: 0.35 },
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3800, 32, 16), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uZenith, uHorizon, uGround, uSunDir, uSunColor; uniform float uNight, uHaze; varying vec3 vDir;
      float hash(vec3 p){ p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vDir);
        float y = d.y;
        float t = pow(clamp(y, 0.0, 1.0), 0.45);
        vec3 sky = mix(uHorizon, uZenith, t);
        vec3 ground = mix(uHorizon, uGround, clamp(-y * 6.0, 0.0, 1.0));
        vec3 c = y >= 0.0 ? sky : ground;
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        float glow = pow(sd, 6.0) * (0.35 + uHaze * 0.5) + pow(sd, 200.0) * 1.6 + pow(sd, 1200.0) * 4.0;
        c += uSunColor * glow * (1.0 - uNight * 0.85);
        // stars at night
        float star = step(0.9985, hash(floor(d * 320.0))) * clamp(y * 3.0, 0.0, 1.0);
        c += vec3(star) * uNight * 0.8;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  dome.frustumCulled = false; dome.renderOrder = -10; dome.name = 'sky';
  scene.add(dome);

  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 1500;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.9;
  sun.shadow.radius = 2;
  scene.add(sun); scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbfd8f2, 0x8a7f66, 0.9);
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  scene.add(hemi, ambient);
  const fog = new THREE.Fog(0xcfe0ee, 500, 2600);
  scene.fog = fog;

  const sunDir = new THREE.Vector3(0.4, 0.8, 0.3);
  const lightDir = sunDir.clone();
  const rig: SkyRig = {
    dome, sun, hemi, ambient, fog, hour: 10, sunDir,
    setHour(h: number) {
      rig.hour = h;
      // sun path: rises east (+x) at 6, sets west at 18; tropical latitude ⇒ high noon sun slightly north
      const a = ((h - 6) / 12) * Math.PI; // 0 at sunrise, π at sunset
      const elev = Math.sin(a);           // -1..1
      const az = Math.cos(a);
      sunDir.set(az * 0.9, Math.max(elev, -0.3), -0.35 * Math.max(0, Math.sin(a))).normalize();
      GLOBAL.uSunDir.value.copy(sunDir);
      const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.22);   // 0 night … 1 day
      const dusk = Math.exp(-Math.pow((elev - 0.05) / 0.16, 2));    // golden/dusk band
      const night = 1 - day;
      GLOBAL.uNight.value = THREE.MathUtils.clamp(night * 1.05, 0, 1);
      // colours
      const dayZenith = new THREE.Color('#2f6fb8'), dayHorizon = new THREE.Color('#d2e2ee');
      const duskZenith = new THREE.Color('#3a4a7a'), duskHorizon = new THREE.Color('#f0a060');
      const nightZenith = new THREE.Color('#06080f'), nightHorizon = new THREE.Color('#1a2130');
      const zen = nightZenith.clone().lerp(dayZenith, day).lerp(duskZenith, dusk * 0.6);
      const hor = nightHorizon.clone().lerp(dayHorizon, day).lerp(duskHorizon, dusk * 0.8);
      uniforms.uZenith.value.copy(zen); uniforms.uHorizon.value.copy(hor);
      uniforms.uSunColor.value.set('#fff2d0').lerp(new THREE.Color('#ff9a3c'), dusk);
      uniforms.uHaze.value = 0.3 + dusk * 0.5;
      fog.color.copy(hor).lerp(new THREE.Color('#0d111a'), night * 0.8);
      // the single directional light is the sun by day and a soft moon by night (no shadows from the moon)
      const moonDir = new THREE.Vector3(-0.35, 0.75, 0.45).normalize();
      const sunI = 2.8 * day * (1 - dusk * 0.35);
      if (day > 0.03) { sun.color.set('#fff4dc').lerp(new THREE.Color('#ff9f4a'), dusk); sun.intensity = sunI; lightDir.copy(sunDir); }
      else { sun.color.set('#8fa3d9'); sun.intensity = 0.32 * night; lightDir.copy(moonDir); }
      sun.visible = sun.intensity > 0.02;
      sun.castShadow = day > 0.03 && sun.intensity > 0.15;
      hemi.color.copy(zen).lerp(new THREE.Color('#bfd8f2'), day * 0.6).lerp(new THREE.Color('#5f6f9a'), night * 0.8); hemi.groundColor.set('#8a7f66').lerp(new THREE.Color('#262a36'), night);
      hemi.intensity = 0.95 * day + 0.45 * night;
      ambient.intensity = 0.12 * day + 0.28 * night; ambient.color.set('#ffffff').lerp(new THREE.Color('#6a7aa8'), night);
      scene.background = null;
    },
    follow(target: THREE.Vector3, radius: number) {
      sun.target.position.copy(target);
      sun.position.copy(target).addScaledVector(lightDir, 600);
      const cam = sun.shadow.camera;
      if (cam.left !== -radius) { cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius; cam.updateProjectionMatrix(); }
      sun.target.updateMatrixWorld();
    },
  };
  rig.setHour(10);
  return rig;
}
