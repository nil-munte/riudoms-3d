// Third-person orbit camera: mouse / touch to orbit, wheel / pinch to zoom,
// pulled in front of walls with a BVH raycast so it never ends up inside a building.
import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh';
import type { Input } from '../input/input';

(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export class ThirdPersonCamera {
  camera: THREE.PerspectiveCamera;
  yaw = 0; // heading the camera looks towards (0 = north, clockwise)
  pitch = 0.32;
  dist = 6;
  private curDist = 6;
  private idle = 0;
  private ray = new THREE.Raycaster();
  private target = new THREE.Vector3();
  private obstacles: THREE.Object3D[] = [];

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 12000);
    (this.ray as any).firstHitOnly = true;
  }

  setObstacles(meshes: THREE.Mesh[]) {
    for (const m of meshes) (m.geometry as any).computeBoundsTree?.();
    this.obstacles = meshes;
  }

  update(dt: number, input: Input, focus: THREE.Vector3, height: number, followHeading: number | null,
         groundAt: (x: number, y: number) => number) {
    const sens = input.touch ? 0.0045 : 0.0024;
    if (input.mouseDX || input.mouseDY) this.idle = 0;
    else this.idle += dt;
    this.yaw += input.mouseDX * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch + input.mouseDY * sens, -0.45, 1.35);
    if (input.wheel) this.dist = THREE.MathUtils.clamp(this.dist * Math.pow(1.12, input.wheel), 1.6, 60);
    // gently swing behind the rider/walker when the mouse is idle
    if (followHeading !== null && this.idle > 1.2) {
      let d = followHeading - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 1.6);
    }
    this.target.set(focus.x, focus.y + height, focus.z);
    const cp = Math.cos(this.pitch);
    const dir = new THREE.Vector3(Math.sin(this.yaw) * cp, -Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    let want = this.dist;
    // obstacle check (walls, roofs)
    this.ray.set(this.target, dir.clone().negate());
    this.ray.far = want + 0.3;
    const near = this.obstacles.filter((o) => o.parent?.visible !== false && o.parent?.parent?.visible !== false);
    const hits = this.ray.intersectObjects(near, false);
    if (hits.length) want = Math.max(0.8, hits[0].distance - 0.3);
    // smooth: pull in fast, push out slowly
    this.curDist += (want - this.curDist) * Math.min(1, dt * (want < this.curDist ? 18 : 3));
    const pos = this.target.clone().addScaledVector(dir, -this.curDist);
    const g = groundAt(pos.x, -pos.z) + 0.35;
    if (pos.y < g) pos.y = g;
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }
}
