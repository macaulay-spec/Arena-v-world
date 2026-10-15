/** Third-person chase camera with orbit input, zoom, soft follow and occlusion pull-in. */
import * as THREE from 'three';
import type { CollisionWorld } from './collision';

const SIDE_OFFSETS = [-0.35, 0.35];

export class ChaseCamera {
  yaw = Math.PI; pitch = 0.22;
  distance = 3.8; targetDistance = 3.8;
  minDistance = 1.2; maxDistance = 7;
  shoulder = 0.35;
  private cur = new THREE.Vector3(); private look = new THREE.Vector3();
  // scratch vectors reused every frame (no per-update allocation)
  private dir = new THREE.Vector3(); private right = new THREE.Vector3(); private pivotS = new THREE.Vector3();
  private far = new THREE.Vector3(); private probe = new THREE.Vector3(); private want = new THREE.Vector3();
  private initialised = false;
  mode: 'near' | 'far' | 'front' = 'near';
  constructor(public camera: THREE.PerspectiveCamera, private world: CollisionWorld) {}

  cycleMode() {
    this.mode = this.mode === 'near' ? 'far' : this.mode === 'far' ? 'front' : 'near';
    this.targetDistance = this.mode === 'near' ? 3.8 : this.mode === 'far' ? 6.2 : 2.6;
  }
  snapBehind(yaw: number) { this.yaw = yaw + Math.PI; this.initialised = false; }

  update(dt: number, target: THREE.Vector3, facingYaw: number, lookDX: number, lookDY: number, zoom: number, moving: boolean, indoor: boolean) {
    this.yaw -= lookDX; this.pitch = Math.max(-0.35, Math.min(1.1, this.pitch + lookDY));
    if (zoom) this.targetDistance = Math.max(this.minDistance, Math.min(this.maxDistance, this.targetDistance - zoom));
    // soft follow: when moving and the user is not steering, drift behind the player
    if (moving && Math.abs(lookDX) < 1e-5 && this.mode !== 'front') {
      const behind = facingYaw + Math.PI; let d = behind - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 0.9);
    }
    const wantDist = Math.min(this.targetDistance, indoor ? 3.0 : this.maxDistance);
    const pivot = this.look.set(target.x, target.y + 1.45, target.z);
    const yawUse = this.mode === 'front' ? facingYaw : this.yaw;
    const cp = Math.cos(this.pitch);
    const dir = this.dir.set(Math.sin(yawUse) * cp, Math.sin(this.pitch), Math.cos(yawUse) * cp);
    // shoulder offset (right of the player)
    const right = this.right.set(Math.cos(yawUse), 0, -Math.sin(yawUse));
    const pivotS = this.pivotS.copy(pivot).addScaledVector(right, this.mode === 'front' ? 0 : this.shoulder);
    // occlusion: 2D ray against blockers at head height band
    const far = this.far.copy(pivotS).addScaledVector(dir, wantDist);
    // three rays (centre + a camera-width to each side) so the near plane never pokes into a wall
    const y0 = target.y + 0.6, y1 = target.y + 2.2;
    let f = this.world.rayFraction(pivotS.x, pivotS.z, far.x, far.z, y0, y1);
    for (let i = 0; i < SIDE_OFFSETS.length; i++) { const side = SIDE_OFFSETS[i]; f = Math.min(f, this.world.rayFraction(pivotS.x + right.x * side, pivotS.z + right.z * side, far.x + right.x * side, far.z + right.z * side, y0, y1)); }
    const dist = Math.max(this.minDistance * 0.6, wantDist * f - 0.45);
    // ground clearance
    const probe = this.probe.copy(pivotS).addScaledVector(dir, dist);
    const g = this.world.groundAt(probe.x, probe.z, probe.y, 0.3) + 0.35;
    // smooth distance (pull in fast, release slowly)
    this.distance += (dist - this.distance) * Math.min(1, dt * (dist < this.distance ? 20 : 4));
    const want = this.want.copy(pivotS).addScaledVector(dir, this.distance); if (want.y < g) want.y = g;
    if (!this.initialised) { this.cur.copy(want); this.initialised = true; }
    else this.cur.lerp(want, Math.min(1, dt * 18));
    this.camera.position.copy(this.cur);
    this.camera.lookAt(pivot.x, pivot.y + 0.1, pivot.z);
  }
  get position() { return this.cur; }
}
