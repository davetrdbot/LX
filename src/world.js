import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MAP } from './config.js';
import { addBox } from './physics.js';
import { addPad, bakeTerrain, heightAt, fbm } from './terrain.js';
import { mulberry32 } from './utils.js';
import * as TX from './textures.js';
import { GFX } from './quality.js';

// Collects static geometry per material and merges it into a few draw calls.
class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(matrix);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!this.groups.has(mat)) this.groups.set(mat, []);
    this.groups.get(mat).push(g);
  }
  flush(scene) {
    for (const [mat, geos] of this.groups) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = mat.userData.noShadow ? false : true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      geos.forEach((g) => g.dispose());
    }
    this.groups.clear();
  }
}

// Box whose UVs are in meters / texScale so textures don't stretch.
function uvBox(w, h, d, texScale = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v;
    uv.setXY(i, uv.getX(i) * dims[f][0] / texScale, uv.getY(i) * dims[f][1] / texScale);
  }
  return g;
}

const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);

export function buildWorld(scene, renderer) {
  const rng = mulberry32(1337);
  const R = MAP.islandRadius;
  const lootSpots = [];
  const occupied = [];
  const houseRects = [];
  const free = (x, z, r) => occupied.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r) && Math.hypot(x, z) < R - r - 10;

  // =============== 1. plan layout (so terrain can flatten under buildings) ===============
  const towns = [
    { name: 'LX TOWER', x: 0, z: 0, n: 7, spread: 38, tier: 3 },
    { name: 'NEON DOCKS', x: 190, z: -120, n: 9, spread: 44, tier: 2 },
    { name: 'OLD MILL', x: -170, z: -150, n: 8, spread: 40, tier: 2 },
    { name: 'CACTUS ROW', x: -200, z: 120, n: 9, spread: 45, tier: 2 },
    { name: 'SKYPORT', x: 150, z: 180, n: 8, spread: 40, tier: 2 },
    { name: 'RED HOLLOW', x: 30, z: -235, n: 6, spread: 34, tier: 1 },
    { name: 'PINE CAMP', x: -40, z: 225, n: 6, spread: 30, tier: 1 },
    { name: 'SALT FLATS', x: 255, z: 40, n: 6, spread: 30, tier: 1 },
    { name: 'MOSS RIDGE', x: -265, z: -20, n: 6, spread: 30, tier: 1 },
  ];
  const houses = [];
  occupied.push({ x: 0, z: 0, r: 9 }, { x: 16.8, z: 13.8, r: 5 });
  for (const t of towns) {
    addPad(t.x, t.z, t.spread + 12);
    let placed = 0, tries = 0;
    while (placed < t.n && tries++ < 400) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * t.spread;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const w = 7 + rng() * 5, d = 6 + rng() * 5;
      if (!free(x, z, Math.hypot(w, d) / 2 + 2)) continue;
      const floors = t.tier >= 2 && rng() < 0.3 ? 2 : 1;
      houses.push({ x, z, w, d, h: 3.6 + rng() * 0.6, floors, tier: t.tier });
      occupied.push({ x, z, r: Math.hypot(w, d) / 2 + 2 });
      placed++;
    }
  }
  for (let i = 0; i < 30; i++) {
    const a = rng() * Math.PI * 2, r = 50 + rng() * (R - 80);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 6 + rng() * 3, d = 6 + rng() * 3;
    if (!free(x, z, Math.hypot(w, d) / 2 + 4)) continue;
    addPad(x, z, Math.hypot(w, d) / 2 + 3);
    houses.push({ x, z, w, d, h: 3.5, floors: 1, tier: 1 });
    occupied.push({ x, z, r: Math.hypot(w, d) / 2 + 3 });
  }
  bakeTerrain();

  // =============== 2. sky, light, environment ===============
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4; su.rayleigh.value = 1.4; su.mieCoefficient.value = 0.004; su.mieDirectionalG.value = 0.85;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(52), THREE.MathUtils.degToRad(135));
  su.sunPosition.value.copy(sunDir);
  scene.add(sky);
  if (renderer) {
    const pm = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(sky.clone());
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
  }
  scene.fog = new THREE.Fog(0xbcd8ea, 150, 650);

  const hemi = new THREE.HemisphereLight(0xdcefff, 0x5b6b3a, 0.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.userData.dir = sunDir.clone();
  sun.position.copy(sunDir).multiplyScalar(150);
  sun.castShadow = true;
  sun.shadow.mapSize.set(GFX.shadowMap, GFX.shadowMap);
  const sc = sun.shadow.camera;
  sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 10; sc.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // =============== 3. terrain mesh ===============
  const size = (R + 60) * 2, seg = 240;
  const tg = new THREE.PlaneGeometry(size, size, seg, seg);
  tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  const grassA = new THREE.Color(0x6f9a3c), grassB = new THREE.Color(0x4f7f2e), dry = new THREE.Color(0xa3a052);
  const sandC = new THREE.Color(0xe6d29a), dirtC = new THREE.Color(0x9a7a52), rockC = new THREE.Color(0x8a8578);
  const roadDist = (x, z) => {
    let best = 1e9;
    for (const t of towns.slice(1)) {
      const L = Math.hypot(t.x, t.z), ux = t.x / L, uz = t.z / L;
      const p = Math.max(0, Math.min(L, x * ux + z * uz));
      const bend = Math.sin(p * 0.03) * 12; // gentle curve
      best = Math.min(best, Math.hypot(x - ux * p + uz * bend, z - uz * p - ux * bend));
    }
    return best;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const d = Math.hypot(x, z);
    const n = fbm(x * 0.02, z * 0.02, 3);
    col.copy(grassA).lerp(grassB, n);
    col.lerp(dry, Math.max(0, fbm(x * 0.008 + 5, z * 0.008, 2) - 0.55) * 1.5);
    // slope → rock
    const slope = Math.abs(heightAt(x + 1.5, z) - h) + Math.abs(heightAt(x, z + 1.5) - h);
    if (slope > 1.1) col.lerp(rockC, Math.min(1, (slope - 1.1) * 0.9));
    if (h > 26) col.lerp(rockC, Math.min(0.6, (h - 26) / 20));
    // roads + town plazas
    const rd = roadDist(x, z);
    if (rd < 5) col.lerp(dirtC, 1 - rd / 5);
    for (const t of towns) { const td = Math.hypot(x - t.x, z - t.z); if (td < t.spread * 0.35) col.lerp(dirtC, 0.35 * (1 - td / (t.spread * 0.35))); }
    // beach
    if (d > R - 18) col.lerp(sandC, Math.min(1, (d - (R - 18)) / 14));
    cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tg.computeVertexNormals();
  const grassTex = TX.grassTexture();
  grassTex.repeat.set(size / 6, size / 6);
  const ground = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ vertexColors: true, map: grassTex, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // ocean
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshStandardMaterial({ color: 0x1b8fbf, roughness: 0.12, metalness: 0.2, transparent: true, opacity: 0.88 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.55;
  scene.add(ocean);
  // shallow-water foam ring
  const foam = new THREE.Mesh(new THREE.RingGeometry(R + 16, R + 22, 128), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 }));
  foam.rotation.x = -Math.PI / 2; foam.position.y = -0.5;
  scene.add(foam);

  // =============== 4. materials ===============
  const B = new Batcher();
  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, ...opts });
  const wallMats = ['#d9c29a', '#c9ad86', '#9fb3c4', '#d8a878', '#a9c292', '#d39a82', '#bdbdbd', '#e0d2b0', '#8fa9a0', '#c98f6a'].map((c) => std({ map: TX.plasterTexture(c) }));
  wallMats.push(std({ map: TX.brickTexture() }), std({ map: TX.brickTexture() }));
  const roofMats = ['#a6392b', '#3b5f8a', '#5a5a5a', '#7a4a2a', '#2f6b4f'].map((c) => std({ map: TX.roofTexture(c), roughness: 0.7 }));
  const trimMat = std({ color: 0xf4f4f0, roughness: 0.6 });
  const glassMat = std({ color: 0x33506e, roughness: 0.08, metalness: 0.7 });
  const floorMat = std({ map: TX.woodTexture(), color: 0xc9a27a });
  const concMat = std({ map: TX.concreteTexture() });
  const crateMat = std({ map: TX.woodTexture() });
  const metalMat = std({ color: 0x8a9096, roughness: 0.45, metalness: 0.6 });
  const darkMat = std({ color: 0x2a2f3a, roughness: 0.5, metalness: 0.3 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffb400 }); glowMat.userData.noShadow = true;

  const tmpObj = new THREE.Object3D();
  const place = (geo, mat, x, y, z, ry = 0) => {
    tmpObj.position.set(x, y, z); tmpObj.rotation.set(0, ry, 0); tmpObj.scale.set(1, 1, 1); tmpObj.updateMatrix();
    B.add(geo, mat, tmpObj.matrix);
  };
  // axis-aligned solid: visual + collider
  function solid(x0, y0, z0, x1, y1, z1, mat, texScale = 2) {
    place(uvBox(x1 - x0, y1 - y0, z1 - z0, texScale), mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    return addBox(x0, y0, z0, x1, y1, z1);
  }
  function crate(x, z, y = 0, s = 1.2) {
    place(uvBox(s, s, s, s), crateMat, x, y + s / 2, z);
    addBox(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2);
  }

  // =============== 5. houses ===============
  function house(hs) {
    const { x: cx, z: cz, w, d, h, floors } = hs;
    const t = 0.3, H = h * floors;
    const wall = wallMats[Math.floor(rng() * wallMats.length)];
    const roof = roofMats[Math.floor(rng() * roofMats.length)];
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const doorSide = Math.floor(rng() * 4), hasBack = rng() < 0.6, back = (doorSide + 2) % 4;
    const door = 1.8, doorH = 2.5;
    const hasDoor = (s) => s === doorSide || (hasBack && s === back);

    // window glass + frame on a wall segment (visual only)
    const windows = (alongX, fixed, a0, a1, sideSign) => {
      const len = a1 - a0;
      const n = Math.floor(len / 3);
      for (let f = 0; f < floors; f++) {
        for (let i = 0; i < n; i++) {
          const a = a0 + (i + 0.5) * (len / n);
          const y = f * h + 1.7;
          const off = sideSign * (t / 2 + 0.02);
          if (alongX) {
            place(new THREE.BoxGeometry(1.3, 1.2, 0.06), trimMat, a, y, fixed + off);
            place(new THREE.BoxGeometry(1.1, 1.0, 0.08), glassMat, a, y, fixed + off * 1.6);
            place(new THREE.BoxGeometry(1.1, 1.0, 0.08), glassMat, a, y, fixed - off * 1.6);
          } else {
            place(new THREE.BoxGeometry(0.06, 1.2, 1.3), trimMat, fixed + off, y, a);
            place(new THREE.BoxGeometry(0.08, 1.0, 1.1), glassMat, fixed + off * 1.6, y, a);
            place(new THREE.BoxGeometry(0.08, 1.0, 1.1), glassMat, fixed - off * 1.6, y, a);
          }
        }
      }
    };
    const wallX = (zz, side, sign) => {
      if (!hasDoor(side)) { solid(x0, 0, zz - t / 2, x1, H, zz + t / 2, wall); windows(true, zz, x0 + 0.5, x1 - 0.5, sign); return; }
      const mid = cx + (rng() - 0.5) * (w - door - 1.6);
      solid(x0, 0, zz - t / 2, mid - door / 2, H, zz + t / 2, wall);
      solid(mid + door / 2, 0, zz - t / 2, x1, H, zz + t / 2, wall);
      solid(mid - door / 2, doorH, zz - t / 2, mid + door / 2, H, zz + t / 2, wall);
      place(new THREE.BoxGeometry(door + 0.3, 0.15, t + 0.1), trimMat, mid, doorH, zz);
      if (mid - door / 2 - x0 > 3) windows(true, zz, x0 + 0.5, mid - door / 2 - 0.3, sign);
      if (x1 - mid - door / 2 > 3) windows(true, zz, mid + door / 2 + 0.3, x1 - 0.5, sign);
    };
    const wallZ = (xx, side, sign) => {
      if (!hasDoor(side)) { solid(xx - t / 2, 0, z0, xx + t / 2, H, z1, wall); windows(false, xx, z0 + 0.5, z1 - 0.5, sign); return; }
      const mid = cz + (rng() - 0.5) * (d - door - 1.6);
      solid(xx - t / 2, 0, z0, xx + t / 2, H, mid - door / 2, wall);
      solid(xx - t / 2, 0, mid + door / 2, xx + t / 2, H, z1, wall);
      solid(xx - t / 2, doorH, mid - door / 2, xx + t / 2, H, mid + door / 2, wall);
      place(new THREE.BoxGeometry(t + 0.1, 0.15, door + 0.3), trimMat, xx, doorH, mid);
    };
    wallX(z0, 0, -1); wallX(z1, 1, 1); wallZ(x0, 2, -1); wallZ(x1, 3, 1);
    // roof slab + parapet + trim band
    solid(x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 0.3, z1 + 0.3, roof, 3);
    place(uvBox(w + 0.7, 0.45, 0.2), trimMat, cx, H + 0.5, z0 - 0.25);
    place(uvBox(w + 0.7, 0.45, 0.2), trimMat, cx, H + 0.5, z1 + 0.25);
    place(uvBox(0.2, 0.45, d + 0.3), trimMat, x0 - 0.25, H + 0.5, cz);
    place(uvBox(0.2, 0.45, d + 0.3), trimMat, x1 + 0.25, H + 0.5, cz);
    place(uvBox(w + 0.4, 0.25, d + 0.4), trimMat, cx, 0.12, cz); // foundation lip
    // roof props
    if (rng() < 0.6) place(uvBox(1, 0.8, 0.8), metalMat, cx + (rng() - 0.5) * (w - 2), H + 0.7, cz + (rng() - 0.5) * (d - 2));
    if (rng() < 0.4) place(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 10), metalMat, cx + (rng() - 0.5) * (w - 2), H + 1, cz + (rng() - 0.5) * (d - 2));
    // floor
    place(new THREE.BoxGeometry(w - t, 0.06, d - t), floorMat, cx, 0.03, cz);
    // second floor slab with a stair-hole-free ramp: simple interior staircase (blocks)
    if (floors === 2) {
      const sx = x0 + 1.2;
      const holeZ0 = z0 + t, holeZ1 = z0 + 4.6;
      solid(x0 + t / 2, h - 0.2, holeZ1, x1 - t / 2, h, z1 - t / 2, concMat);
      solid(x0 + 2.4, h - 0.2, z0 + t / 2, x1 - t / 2, h, holeZ1, concMat);
      for (let s = 0; s < 8; s++) solid(sx - 0.9, 0, holeZ1 - 0.55 * (s + 1), sx + 0.9, (s + 1) * (h / 8), holeZ1 - 0.55 * s, concMat, 1);
      void holeZ0;
      lootSpots.push({ x: cx + 1, z: cz + d / 4, y: h, tier: hs.tier + 1 });
    }
    // interior crate + loot
    if (rng() < 0.5) crate(x1 - 0.9, z1 - 0.9);
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) lootSpots.push({ x: cx + (rng() - 0.5) * (w - 2.4), z: cz + (rng() - 0.5) * (d - 2.4), y: 0, tier: hs.tier });
    houseRects.push({ x0: x0 - 0.6, x1: x1 + 0.6, z0: z0 - 0.6, z1: z1 + 0.6 });
  }
  houses.forEach(house);

  // =============== 6. LX tower + billboards ===============
  solid(-4, 0, -4, 4, 46, 4, darkMat, 4);
  for (let y = 8; y < 46; y += 9.5) place(new THREE.BoxGeometry(8.3, 0.5, 8.3), glowMat, 0, y, 0);
  place(new THREE.CylinderGeometry(0.15, 0.15, 10, 6), metalMat, 0, 51, 0);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff3030 }));
  beacon.position.set(0, 56, 0); scene.add(beacon);
  lootSpots.push({ x: 6, z: 0, y: 0, tier: 3 }, { x: -6, z: 0, y: 0, tier: 3 }, { x: 0, z: 6, y: 0, tier: 3 }, { x: 0, z: -6, y: 0, tier: 3 });

  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const c2 = cv.getContext('2d');
  const grd = c2.createLinearGradient(0, 0, 1024, 512); grd.addColorStop(0, '#141a26'); grd.addColorStop(1, '#2a1a0a');
  c2.fillStyle = grd; c2.fillRect(0, 0, 1024, 512);
  c2.strokeStyle = '#ffb400'; c2.lineWidth = 16; c2.strokeRect(8, 8, 1008, 496);
  c2.textAlign = 'center';
  c2.font = 'italic 900 240px sans-serif'; c2.fillStyle = '#ffffff'; c2.fillText('L', 440, 260);
  c2.fillStyle = '#ffb400'; c2.fillText('X', 590, 260);
  c2.font = '900 64px sans-serif'; c2.fillStyle = '#ffffff'; c2.fillText('MADE BY INYANG DAVID', 512, 400);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const boardMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 3.8), boardMat);
    const a = (i * Math.PI) / 2;
    b.position.set(Math.sin(a) * 4.02, 34, Math.cos(a) * 4.02);
    b.rotation.y = a;
    scene.add(b);
  }
  solid(13.6, 0, 13.6, 14.0, 4.2, 14.0, metalMat);
  solid(19.6, 0, 13.6, 20.0, 4.2, 14.0, metalMat);
  place(uvBox(7.4, 3.8, 0.2), darkMat, 16.8, 5.1, 13.8);
  for (const [z, ry] of [[13.69, Math.PI], [13.91, 0]]) {
    const gb = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), boardMat);
    gb.position.set(16.8, 5.1, z); gb.rotation.y = ry; scene.add(gb);
  }

  // =============== 7. town props: crates, containers, fences, cars ===============
  const contColors = [0xc0392b, 0x2e86c1, 0x27ae60, 0xd68910].map((c) => std({ color: c, roughness: 0.6, metalness: 0.3 }));
  for (const t of towns) {
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * t.spread;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      if (!free(x, z, 3.5)) continue;
      if (rng() < 0.4) {
        // shipping container (along X or Z)
        const m = contColors[Math.floor(rng() * contColors.length)];
        if (rng() < 0.5) solid(x - 3, 0, z - 1.2, x + 3, 2.6, z + 1.2, m, 6); else solid(x - 1.2, 0, z - 3, x + 1.2, 2.6, z + 3, m, 6);
      } else {
        crate(x, z); crate(x + 1.25, z);
        if (rng() < 0.5) crate(x + 0.6, z, 1.2);
      }
      lootSpots.push({ x: x + 0.6, z: z + 2.2, y: 0, tier: t.tier });
      occupied.push({ x, z, r: 3.5 });
    }
    for (const s of lootSpots) if (Math.hypot(s.x - t.x, s.z - t.z) < t.spread + 10) s.tier = Math.max(s.tier, t.tier);
  }
  // wrecked cars along roads
  const carMats = [0xd0d0d0, 0x8e2b2b, 0x2b4f8e, 0x333333].map((c) => std({ color: c, roughness: 0.35, metalness: 0.6 }));
  for (let i = 0; i < 18; i++) {
    const t = towns[1 + Math.floor(rng() * (towns.length - 1))];
    const k = 0.2 + rng() * 0.6, x = t.x * k, z = t.z * k;
    if (!free(x, z, 3.5)) continue;
    const y = heightAt(x, z), m = carMats[Math.floor(rng() * carMats.length)];
    const along = Math.abs(t.x) > Math.abs(t.z);
    const [hx, hz] = along ? [2.1, 0.9] : [0.9, 2.1];
    solid(x - hx, y, z - hz, x + hx, y + 1.0, z + hz, m, 4);
    place(uvBox(along ? 2 : 1.6, 0.7, along ? 1.6 : 2), glassMat, x, y + 1.35, z);
    addBox(x - hx * 0.5, y + 1, z - hz * 0.5, x + hx * 0.5, y + 1.7, z + hz * 0.5);
    occupied.push({ x, z, r: 3.5 });
    if (rng() < 0.5) lootSpots.push({ x: x + 2.5, z: z + 2.5, y: heightAt(x + 2.5, z + 2.5), tier: 1 });
  }
  const fenceMat = concMat;
  for (let i = 0; i < 80; i++) {
    const a = rng() * Math.PI * 2, r = 20 + rng() * (R - 30);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 4)) continue;
    const y = Math.min(heightAt(x - 2.5, z), heightAt(x + 2.5, z), heightAt(x, z - 2.5), heightAt(x, z + 2.5)) - 0.2;
    if (rng() < 0.5) solid(x - 2.5, y, z - 0.25, x + 2.5, y + 1.5, z + 0.25, fenceMat, 2);
    else solid(x - 0.25, y, z - 2.5, x + 0.25, y + 1.5, z + 2.5, fenceMat, 2);
    occupied.push({ x, z, r: 3 });
    if (rng() < 0.4) lootSpots.push({ x: x + 1.5, z: z + 1.5, y: heightAt(x + 1.5, z + 1.5), tier: 1 });
  }
  B.flush(scene);

  // =============== 8. rocks (instanced, displaced) ===============
  const rockGeo = new THREE.IcosahedronGeometry(1, 1);
  {
    const p = rockGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      V.fromBufferAttribute(p, i);
      V.multiplyScalar(0.8 + fbm(V.x * 2 + 3, V.z * 2 + V.y, 2) * 0.5);
      p.setXYZ(i, V.x, V.y, V.z);
    }
    rockGeo.computeVertexNormals();
  }
  const rocks = [];
  for (let i = 0; i < 110; i++) {
    const a = rng() * Math.PI * 2, r = 15 + rng() * (R - 20);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 1 + rng() * 2.4;
    if (!free(x, z, s + 1)) continue;
    const y = heightAt(x, z);
    rocks.push({ x, z, s, y });
    occupied.push({ x, z, r: s + 1 });
    addBox(x - s * 0.75, y - 1, z - s * 0.75, x + s * 0.75, y + s * 0.95, z + s * 0.75);
  }
  const rockMesh = new THREE.InstancedMesh(rockGeo, std({ map: TX.rockTexture(), color: 0x9a968c, flatShading: true }), rocks.length);
  rocks.forEach((r, i) => {
    E.set(rng() * 0.5, rng() * 6, rng() * 0.5); Q.setFromEuler(E);
    M4.compose(V.set(r.x, r.y + r.s * 0.3, r.z), Q, S.set(r.s, r.s * (0.7 + rng() * 0.5), r.s));
    rockMesh.setMatrixAt(i, M4);
    rockMesh.setColorAt(i, col.setHSL(0.1, 0.05, 0.45 + rng() * 0.2));
  });
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  // =============== 9. trees + bushes (instanced) ===============
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(2.2, 3.2, 8).translate(0, 3.2, 0),
    new THREE.ConeGeometry(1.75, 2.8, 8).translate(0, 4.8, 0),
    new THREE.ConeGeometry(1.2, 2.4, 8).translate(0, 6.3, 0),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  const oakGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(2.0, 1).translate(0, 4.6, 0),
    new THREE.IcosahedronGeometry(1.5, 1).translate(1.3, 4.0, 0.4),
    new THREE.IcosahedronGeometry(1.5, 1).translate(-1.1, 4.2, -0.6),
    new THREE.IcosahedronGeometry(1.3, 1).translate(0.2, 5.6, 0.9),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  const jitter = (geo, amt) => {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      V.fromBufferAttribute(p, i);
      const n = fbm(V.x * 1.3 + 9, V.z * 1.3 + V.y * 0.7, 2) - 0.5;
      p.setXYZ(i, V.x + n * amt, V.y + n * amt * 0.6, V.z - n * amt);
    }
    geo.computeVertexNormals();
  };
  jitter(pineGeo, 0.5); jitter(oakGeo, 0.9);
  const trees = [];
  for (let i = 0; i < 900 && trees.length < 520; i++) {
    // clump trees into forests with noise
    const a = rng() * Math.PI * 2, r = 12 + rng() * (R - 26);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (fbm(x * 0.01 + 40, z * 0.01, 2) < 0.42 && rng() < 0.75) continue;
    if (!free(x, z, 1.6)) continue;
    const s = 0.8 + rng() * 0.8;
    const y = heightAt(x, z);
    trees.push({ x, z, s, y, pine: y > 12 || rng() < 0.45 });
    occupied.push({ x, z, r: 1.6 });
    addBox(x - 0.32 * s, y - 0.5, z - 0.32 * s, x + 0.32 * s, y + 3.4 * s, z + 0.32 * s, { tree: true });
  }
  const barkMat = std({ map: TX.barkTexture() });
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.34, 3.6, 7).translate(0, 1.8, 0), barkMat, trees.length);
  const pines = trees.filter((t) => t.pine), oaks = trees.filter((t) => !t.pine);
  const leafMat = std({ color: 0xffffff, flatShading: true, roughness: 0.9 });
  const pineMesh = new THREE.InstancedMesh(pineGeo, leafMat, pines.length);
  const oakMesh = new THREE.InstancedMesh(oakGeo, leafMat, oaks.length);
  trees.forEach((t, i) => {
    E.set(0, rng() * 6, 0); Q.setFromEuler(E);
    M4.compose(V.set(t.x, t.y - 0.2, t.z), Q, S.set(t.s, t.s, t.s));
    trunkMesh.setMatrixAt(i, M4);
    if (t.pine) {
      pineMesh.setMatrixAt(pines.indexOf(t), M4);
      pineMesh.setColorAt(pines.indexOf(t), col.setHSL(0.36 + rng() * 0.04, 0.45, 0.22 + rng() * 0.08));
    } else {
      oakMesh.setMatrixAt(oaks.indexOf(t), M4);
      oakMesh.setColorAt(oaks.indexOf(t), col.setHSL(0.22 + rng() * 0.08, 0.5, 0.3 + rng() * 0.1));
    }
  });
  for (const m of [trunkMesh, pineMesh, oakMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }

  const bushGeo = mergeGeometries([
    new THREE.IcosahedronGeometry(0.8, 1).translate(0, 0.5, 0),
    new THREE.IcosahedronGeometry(0.6, 1).translate(0.6, 0.4, 0.2),
    new THREE.IcosahedronGeometry(0.55, 1).translate(-0.5, 0.35, -0.3),
  ].map((g) => (g.index ? g.toNonIndexed() : g)));
  jitter(bushGeo, 0.25);
  const bushes = [];
  for (let i = 0; i < 700 && bushes.length < 400; i++) {
    const a = rng() * Math.PI * 2, r = 10 + rng() * (R - 20);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 0.8)) continue;
    bushes.push({ x, z, y: heightAt(x, z), s: 0.7 + rng() * 0.8 });
  }
  const bushMesh = new THREE.InstancedMesh(bushGeo, leafMat, bushes.length);
  bushes.forEach((b, i) => {
    E.set(0, rng() * 6, 0); Q.setFromEuler(E);
    M4.compose(V.set(b.x, b.y - 0.1, b.z), Q, S.set(b.s, b.s, b.s));
    bushMesh.setMatrixAt(i, M4);
    bushMesh.setColorAt(i, col.setHSL(0.25 + rng() * 0.07, 0.5, 0.25 + rng() * 0.1));
  });
  bushMesh.castShadow = true; bushMesh.receiveShadow = true;
  scene.add(bushMesh);

  // =============== 10. clouds ===============
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xc8d2dc, flatShading: true, fog: false, transparent: true, opacity: 0.92 });
  const clouds = new THREE.Group();
  for (let i = 0; i < 28; i++) {
    const parts = [];
    const n = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) parts.push(new THREE.IcosahedronGeometry(8 + rng() * 10, 1).translate(k * 12 - n * 6, rng() * 5, (rng() - 0.5) * 12));
    const cm = new THREE.Mesh(mergeGeometries(parts), cloudMat);
    const a = rng() * Math.PI * 2, r = rng() * 600;
    cm.position.set(Math.cos(a) * r, 230 + rng() * 60, Math.sin(a) * r);
    cm.scale.y = 0.45;
    clouds.add(cm);
  }
  scene.add(clouds);

  // open-field loot
  for (let i = 0; i < 45; i++) {
    const a = rng() * Math.PI * 2, r = 20 + rng() * (R - 40);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (free(x, z, 1)) lootSpots.push({ x, z, y: heightAt(x, z), tier: 0 });
  }

  return { sun, lootSpots, towns, houseRects, clouds, ocean, beacon };
}
