// Render still views of the running game to demo-out/<name>.jpg (for checking
// the world without a screen recorder). From the browser console:
//   (await import('/tools/demo/snap.ts')).snap([{ name: 'a', eye: [0, -60, 40], look: [0, 0, 0] }])
// eye / look: local x, y (m) and height above the ground (m).
// Or a third-person view: { name, player: [x, y, heading], dist?, pitch? }.
import * as THREE from 'three';

export interface View {
  name: string;
  eye?: [number, number, number];
  look?: [number, number, number];
  player?: [number, number, number];
  dist?: number;
  pitch?: number;
  hour?: number;
  fov?: number;
  /** facade view: stand in the street in front of the facade point [x, y] with outward normal [nx, ny] */
  facade?: [number, number, number, number];
  w?: number;
  h?: number;
}

export async function snap(views: View[]) {
  const g = (window as any).__game;
  (window as any).__freeze = true;
  const out: string[] = [];
  for (const v of views) {
    const W = v.w ?? 1280, H = v.h ?? 720;
    g.renderer.setPixelRatio(1);
    g.renderer.setSize(W, H, false);
    g.cam.camera.aspect = W / H;
    g.cam.camera.updateProjectionMatrix();
    g.cam.camera.fov = v.fov ?? 60;
    g.cam.camera.updateProjectionMatrix();
    if (v.hour !== undefined) g.sky.hour = v.hour;
    if (v.facade) {
      // walk out along the normal until the opposite building, stand at 85 % of that
      const [x, y, nx, ny] = v.facade;
      let d = 1.5;
      while (d < 30 && g.collision.insideFootprint(x + nx * d, y + ny * d) < 0) d += 0.5;
      const e = Math.max(2.5, Math.min(18, d * 0.85));
      v.eye = [x + nx * e, y + ny * e, 1.6];
      v.look = [x, y, 1.6 + e * 0.45];
    }
    g.sky.running = false;
    if (v.player) {
      const [x, y, hd] = v.player;
      g.player.teleport(x, y, hd);
      g.cam.yaw = hd; g.cam.pitch = v.pitch ?? 0.15; g.cam.dist = v.dist ?? 7;
      g.terrain.update(x, y, true);
      for (let i = 0; i < 40; i++) (window as any).__step(1 / 30);
    } else if (v.eye && v.look) {
      const hf = g.hf;
      const [ex, ey, eh] = v.eye, [lx, ly, lh] = v.look;
      const cam = g.cam.camera as THREE.PerspectiveCamera;
      cam.position.set(ex, hf.heightAt(ex, ey) + eh, -ey);
      cam.lookAt(lx, hf.heightAt(lx, ly) + lh, -ly);
      g.sky.update(0, new THREE.Vector3(lx, hf.heightAt(lx, ly), -ly));
      for (let k = 0; k < 3; k++) {
        g.terrain.update(ex, ey, true);
        g.buildings.update(ex, ey);
        g.streets.update(ex, ey);
        g.veg.update(cam, true);
        g.landmarks.update();
      }
    }
    g.renderer.render(g.scene, g.cam.camera);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    cv.getContext('2d')!.drawImage(g.renderer.domElement, 0, 0);
    const blob: Blob = await new Promise((r) => cv.toBlob((b) => r(b!), 'image/jpeg', 0.88));
    await fetch(`/__demo/file/${v.name}.jpg`, { method: 'POST', body: blob });
    out.push(v.name);
  }
  g.cam.camera.fov = 60;
  g.cam.camera.updateProjectionMatrix();
  (window as any).__freeze = false;
  return out;
}
