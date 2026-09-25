import * as THREE from 'three';
import './style.css';
import { fetchBin, fetchJSON } from './data/binfmt';
import type { BuildingsFile, Meta } from './data/types';
import { HeightField } from './world/heightfield';
import { Terrain } from './world/terrain';
import { Buildings } from './world/buildings';
import { Collision } from './world/collision';
import { SkySystem } from './world/sky';
import { Streets } from './world/streets';
import { Vegetation } from './world/vegetation';
import { Water } from './world/water';
import { Props, type PropsFile } from './world/props';
import { Landmarks, type LandmarksFile } from './world/landmarks';
import { Input } from './input/input';
import { Player } from './player/player';
import { Bike } from './bike/bike';
import { ThirdPersonCamera } from './camera/thirdPerson';
import { Minimap, type FieldsFile, type RoadsFile } from './minimap/minimap';
import { Hud } from './ui/hud';
import { Relief, type ReliefFile } from './world/relief';

const DATA = './data/';
const $ = (id: string) => document.getElementById(id)!;
const BIKE_COLORS = [0x9c2f2f, 0x2f5f9c, 0x3f7f4a, 0xd0a030, 0x303030];

function progress(p: number, msg: string) {
  ($('load-bar') as HTMLDivElement).style.width = `${Math.round(p * 100)}%`;
  $('load-msg').textContent = msg;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

async function loadTextures(meta: Meta, onP: (f: number) => void) {
  const loader = new THREE.TextureLoader();
  const n = meta.tiles.nx * meta.tiles.ny;
  const active = new Set(meta.tiles.active ?? Array.from({ length: n }, (_, t) => t));
  let done = 0;
  return Promise.all(Array.from({ length: n }, (_, t) => new Promise<THREE.Texture | null>((res) => {
    if (!active.has(t)) { done++; onP(done / n); res(null); return; }
    loader.load(`${DATA}ortho/t${t}.jpg`, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      done++; onP(done / n);
      res(tex);
    }, undefined, () => { done++; onP(done / n); res(new THREE.Texture()); });
  })));
}

async function main() {
  const canvas = $('scene') as HTMLCanvasElement;
  const mobile = matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  progress(0.02, 'Carregant metadades…');
  const meta = await fetchJSON<Meta>(`${DATA}meta.json`);
  progress(0.04, 'Carregant el relleu (ICGC)…');
  const [terrainBin, bdata, sbin, nbin, props, lmData, roads, fields, relief] = await Promise.all([
    fetchBin(`${DATA}terrain.bin`),
    fetchJSON<BuildingsFile>(`${DATA}buildings.json`),
    fetchBin(`${DATA}streets.bin`),
    fetchBin(`${DATA}nature.bin`),
    fetchJSON<PropsFile>(`${DATA}props.json`),
    fetchJSON<LandmarksFile>(`${DATA}landmarks.json`),
    fetchJSON<RoadsFile>(`${DATA}roads.json`),
    fetchJSON<FieldsFile>(`${DATA}fields.json`),
    fetchJSON<ReliefFile>(`${DATA}relief.json`),
  ]);
  const hf = new HeightField(terrainBin);
  progress(0.12, 'Carregant l’ortofoto (ICGC)…');
  const textures = await loadTextures(meta, (f) => progress(0.12 + f * 0.38, 'Carregant l’ortofoto (ICGC)…'));

  const scene = new THREE.Scene();
  const collision = new Collision();
  // the world ends at the edge of the town
  const fence = meta.fence ?? [];
  for (let i = 0; i < fence.length; i++) {
    const a = fence[i], b = fence[(i + 1) % fence.length];
    collision.addSegment(a[0], a[1], b[0], b[1]);
  }
  const sky = new SkySystem(scene, renderer);
  if (mobile) sky.sun.shadow.mapSize.set(1024, 1024);
  progress(0.52, 'Construint el terreny…'); await tick();
  const terrain = new Terrain(hf, meta, textures);
  scene.add(terrain.group);
  progress(0.58, 'Construint els edificis (Cadastre + LiDAR)…'); await tick();
  const landmarkSkip = new Set(['esglesia_sant_jaume']);
  const buildings = new Buildings(bdata, meta, landmarkSkip, collision);
  scene.add(buildings.group);
  progress(0.7, 'Pavimentant els carrers…'); await tick();
  const streets = new Streets(sbin, meta, hf);
  scene.add(streets.group);
  // level changes from the LiDAR DTM: walls, marges, stairs (stairs are walkable platforms)
  const reliefObj = new Relief(relief, meta, hf, collision);
  scene.add(reliefObj.group);
  const surface = (x: number, y: number) => {
    const g = hf.heightAt(x, y) + streets.walkOffset(x, y);
    const p = collision.platformHeight(x, y);
    return p !== null && p > g - 0.3 ? Math.max(g, p) : g;
  };
  progress(0.76, 'Plantant els arbres (LiDAR + DUN)…'); await tick();
  const veg = new Vegetation(nbin, meta, hf, collision);
  scene.add(veg.group);
  scene.add(new Water(nbin, meta, hf).group);
  progress(0.84, 'Mobiliari urbà i fanals…'); await tick();
  const propsObj = new Props(props, surface, collision);
  scene.add(propsObj.group);
  progress(0.88, 'Edificis emblemàtics…'); await tick();
  scene.updateMatrixWorld(true);
  const down = new THREE.Raycaster();
  const roofAt = (x: number, y: number) => {
    down.set(new THREE.Vector3(x, 400, -y), new THREE.Vector3(0, -1, 0));
    const hit = down.intersectObjects(buildings.meshes, false)[0];
    return hit ? hit.point.y : null;
  };
  const landmarks = new Landmarks(lmData, hf, collision, roofAt);
  scene.add(landmarks.group);

  // bicycles parked at the squares
  const bikes: Bike[] = [];
  for (const [x, y, heading, color] of props.bikes) {
    const b = new Bike(BIKE_COLORS[color % BIKE_COLORS.length]);
    b.x = x; b.y = y; b.heading = heading;
    b.update(0.016, null, surface, collision);
    scene.add(b.root);
    bikes.push(b);
  }

  const input = new Input(canvas);
  const player = new Player(scene, collision, surface, bikes);
  /** Nearest spot to (x, y) that is not inside a building, fountain or other obstacle. */
  const freeSpot = (x: number, y: number): [number, number] => {
    for (const r of [0, 2, 3.5, 5, 7, 9, 12, 16, 20]) for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      if (!collision.resolve(px, py, 0.6).hit) return [px, py];
    }
    return [x, y];
  };
  // start in the square in front of the church, looking at its facade
  const ch = lmData.models.church?.frame;
  if (ch) {
    // the oval fountain (1976-77) sits on the axis of the door: start on its east side, where the square is open
    const cx = -ch.ay, cy = ch.ax; // across the church, positive to the left seen from the square
    const [sx, sy] = freeSpot(ch.x - ch.ax * 17 - cx * 10, ch.y - ch.ay * 17 - cy * 10);
    player.teleport(sx, sy, Math.atan2(ch.x - sx, ch.y - sy));
  } else player.teleport(0, 0, 0);
  const cam = new ThirdPersonCamera(window.innerWidth / window.innerHeight);
  cam.yaw = player.heading;
  cam.pitch = 0.12;
  cam.dist = 7;
  cam.setObstacles([...buildings.meshes, ...reliefObj.obstacles]);
  terrain.update(player.x, player.y, true);
  const minimap = new Minimap($('minimap') as HTMLCanvasElement, meta, bdata, roads, fields,
    lmData.signs.filter((s) => s.r >= 12).map((s) => ({ x: s.x, y: s.y, name: s.name })));

  const hud = new Hud({
    teleport: (x, y) => {
      const best = freeSpot(x, y);
      player.teleport(best[0], best[1]);
      terrain.update(best[0], best[1], true);
      veg.update(cam.camera, true);
    },
    setHour: (h) => { sky.hour = h; },
    setRunning: (on) => { sky.running = on; },
    setShadows: (on) => { sky.setShadows(on); },
    setFarTrees: (on) => { veg.farEnabled = on; veg.update(cam.camera, true); },
    onOpen: () => input.releasePointer(),
    onClose: () => {},
  }, lmData.teleports, meta, lmData.credits);
  input.onEscape = () => hud.toggleMenu();

  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.camera.aspect = window.innerWidth / window.innerHeight;
    cam.camera.updateProjectionMatrix();
  });

  progress(1, 'Llest!');
  $('loading').classList.add('hidden');
  $('hud').classList.remove('hidden');

  const timer = new THREE.Timer();
  let placeT = 0;
  (window as any).__game = { player, cam, scene, renderer, sky, buildings, terrain, hf, collision, streets, veg, landmarks, propsObj, minimap, hud, bikes, reliefObj };
  // adaptive resolution: keep the frame time under ~22 ms on modest GPUs
  const maxRatio = Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75);
  let ratio = maxRatio, acc = 0, frames = 0;
  const adapt = (dt: number) => {
    acc += dt; frames++;
    if (acc < 2) return;
    const avg = acc / frames;
    acc = 0; frames = 0;
    const next = avg > 0.022 ? Math.max(0.6, ratio * 0.85) : avg < 0.014 ? Math.min(maxRatio, ratio * 1.1) : ratio;
    if (Math.abs(next - ratio) > 0.02) { ratio = next; renderer.setPixelRatio(ratio); }
  };

  const frame = (dt: number) => {
    if (input.pressed.has('KeyM')) { minimap.big = !minimap.big; $('minimap-wrap').classList.toggle('big', minimap.big); }
    if (input.pressed.has('KeyT')) sky.hour = (sky.hour + 1) % 24;
    if (!hud.paused) {
      player.update(dt, input, cam.yaw);
      sky.update(dt, player.position);
    }
    const p = player.position;
    cam.update(dt, input, p, player.bike ? 1.75 : 1.55, player.bike || player.speed > 0.5 ? player.heading : null, surface);
    const c = cam.camera.position;
    terrain.update(c.x, -c.z);
    buildings.update(c.x, -c.z);
    streets.update(c.x, -c.z);
    veg.update(cam.camera);
    propsObj.update(player.x, player.y);
    reliefObj.update(player.x, player.y);
    landmarks.update();
    for (const b of bikes) b.root.visible = b.ridden || Math.hypot(b.x - player.x, b.y - player.y) < 160;
    minimap.draw(player.x, player.y, cam.yaw, player.heading);
    placeT -= dt;
    if (placeT <= 0) { hud.setPlace(minimap.streetAt(player.x, player.y)); placeT = 0.5; }
    hud.update(dt, landmarks.signAt(player.x, player.y));
    hud.setTime(sky.hour, sky.running);
    hud.setPrompt(player.bike ? '<kbd>E</kbd> per baixar de la bicicleta'
      : player.nearBike ? '<kbd>E</kbd> per pujar a la bicicleta' : null);
    renderer.render(scene, cam.camera);
    input.endFrame();
  };
  // debug / automated tests: advance the game by hand (window.__step(dt, n))
  (window as any).__step = (dt = 1 / 60, n = 1) => { for (let i = 0; i < n; i++) frame(dt); };
  (window as any).__input = input;
  renderer.setAnimationLoop((time) => {
    if ((window as any).__freeze) return; // debug: lets a console camera keep the frame
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.05);
    frame(dt);
    adapt(dt);
  });
}

main().catch((e) => {
  console.error(e);
  progress(0, 'Error: ' + (e?.message ?? e));
});
