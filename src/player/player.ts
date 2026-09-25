// Player: walking / running on foot, mounting and riding bicycles.
import * as THREE from 'three';
import type { Input } from '../input/input';
import type { Collision } from '../world/collision';
import { Bike, GRIPS, SADDLE } from '../bike/bike';
import { Character } from './character';

const WALK = 1.6, RUN = 4.8, RADIUS = 0.32;

export class Player {
  character = new Character();
  x = 0; y = 0; z = 0; // local coords + height
  heading = 0; // 0 = north
  speed = 0;
  bike: Bike | null = null;
  nearBike: Bike | null = null;
  private vz = 0;
  private tmp = new THREE.Vector3();

  constructor(private scene: THREE.Scene, private col: Collision, private surface: (x: number, y: number) => number,
              private bikes: Bike[]) {
    scene.add(this.character.root);
  }

  teleport(x: number, y: number, heading = this.heading) {
    if (this.bike) this.dismount();
    this.x = x; this.y = y; this.heading = heading;
    this.z = this.surface(x, y);
    this.speed = 0;
    this.sync();
  }

  get position() { return this.tmp.set(this.x, this.z, -this.y); }

  update(dt: number, input: Input, camYaw: number) {
    // find a bike to interact with
    this.nearBike = null;
    if (!this.bike) {
      let best = 2.2;
      for (const b of this.bikes) {
        const d = Math.hypot(b.x - this.x, b.y - this.y);
        if (d < best && !b.ridden) { best = d; this.nearBike = b; }
      }
    }
    if (input.pressed.has('KeyE')) {
      if (this.bike) this.dismount();
      else if (this.nearBike) this.mount(this.nearBike);
    }
    if (this.bike) this.updateBike(dt, input, camYaw);
    else this.updateFoot(dt, input, camYaw);
  }

  private updateFoot(dt: number, input: Input, camYaw: number) {
    const a = input.axes();
    const target = Math.hypot(a.x, a.y) > 0.05 ? (input.run ? RUN : WALK) * Math.min(1, Math.hypot(a.x, a.y)) : 0;
    this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 6 : 9));
    if (Math.hypot(a.x, a.y) > 0.05) {
      // camera-relative direction; camYaw = heading the camera looks at
      const dir = camYaw + Math.atan2(a.x, a.y);
      let d = dir - this.heading;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.heading += d * Math.min(1, dt * 10);
    }
    const nx = this.x + Math.sin(this.heading) * this.speed * dt;
    const ny = this.y + Math.cos(this.heading) * this.speed * dt;
    const r = this.col.resolve(nx, ny, RADIUS);
    this.x = r.x; this.y = r.y;
    // follow the ground (small steps up, smooth falls)
    const g = this.surface(this.x, this.y);
    if (g > this.z - 0.02 || this.z - g < 0.35) { this.z = THREE.MathUtils.lerp(this.z, g, Math.min(1, dt * 18)); this.vz = 0; }
    else { this.vz -= 9.81 * dt; this.z = Math.max(g, this.z + this.vz * dt); }
    this.character.updateWalk(dt, this.speed);
    this.sync();
  }

  private updateBike(dt: number, input: Input, camYaw: number) {
    const b = this.bike!;
    const a = input.axes();
    void camYaw;
    b.update(dt, { throttle: Math.max(0, a.y), brake: Math.max(0, -a.y), steer: a.x, sprint: input.run }, this.surface, this.col);
    this.x = b.x; this.y = b.y; this.heading = b.heading; this.speed = b.speed;
    this.z = this.surface(this.x, this.y);
    // character leg 0 is the right leg (x < 0); pedal 1 is on that side
    const pedals = [b.pedalPos(1), b.pedalPos(0)];
    // feet a bit above the pedal axle
    for (const p of pedals) p.y += 0.04;
    this.character.updateBike(pedals, SADDLE.clone().add(new THREE.Vector3(0, 0.02, 0.02)), GRIPS, b.lean);
  }

  mount(b: Bike) {
    this.bike = b;
    b.ridden = true;
    b.speed = 0;
    this.scene.remove(this.character.root);
    this.character.root.position.set(0, 0, 0);
    this.character.root.rotation.set(0, 0, 0);
    b.body.add(this.character.root);
  }

  dismount() {
    const b = this.bike!;
    b.ridden = false;
    b.speed = 0;
    b.body.remove(this.character.root);
    this.scene.add(this.character.root);
    // step off to the left side of the bike
    const side = b.heading - Math.PI / 2;
    const tx = b.x + Math.sin(side) * 0.8, ty = b.y + Math.cos(side) * 0.8;
    const r = this.col.resolve(tx, ty, RADIUS);
    this.x = r.x; this.y = r.y;
    this.heading = b.heading;
    this.bike = null;
    b.update(0.016, null, this.surface, this.col);
    this.sync();
  }

  private sync() {
    if (this.bike) return;
    const r = this.character.root;
    r.position.set(this.x, this.z, -this.y);
    r.rotation.set(0, Math.PI - this.heading, 0);
  }
}
