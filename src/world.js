import * as THREE from 'three';
import { MAP } from './config.js';
import { addBox } from './physics.js';
import { mulberry32 } from './utils.js';

// Builds the island: ground, ocean, towns, cover, foliage. Returns loot spawn points and town labels.
export function buildWorld(scene) {
  const rng = mulberry32(1337);
  const R = MAP.islandRadius;
  const lootSpots = [];
  const occupied = []; // {x, z, r} to avoid overlap
  const free = (x, z, r) => occupied.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r) && Math.hypot(x, z) < R - r - 8;

  // ---------- sky, light ----------
  scene.background = new THREE.Color(0x8fd0ff);
  scene.fog = new THREE.Fog(0x9fd6ff, 120, 520);
  const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x4a6b2a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(80, 140, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 10; sc.far = 400;
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  // ---------- ocean + island ----------
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshLambertMaterial({ color: 0x1f8fc4 })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.6;
  scene.add(ocean);

  const sand = new THREE.Mesh(new THREE.CircleGeometry(R + 30, 96), new THREE.MeshLambertMaterial({ color: 0xe8d39a }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -0.05;
  sand.receiveShadow = true;
  scene.add(sand);

  const groundGeo = new THREE.CircleGeometry(R, 128, 0, Math.PI * 2);
  const colors = [];
  const pos = groundGeo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const n = Math.sin(x * 0.03) * Math.cos(y * 0.027) * 0.5 + Math.sin(x * 0.11 + y * 0.07) * 0.2;
    c.setHSL(0.26 + n * 0.03, 0.45, 0.38 + n * 0.06);
    colors.push(c.r, c.g, c.b);
  }
  groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // dirt roads between towns
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x9c8460 });

  // ---------- shared materials ----------
  const wallColors = [0xf2e3c6, 0xd9c7a7, 0xc9d6df, 0xf0c9a0, 0xb8c9a8, 0xe6b8a2, 0xd4d4d4];
  const roofColors = [0xa6392b, 0x3b5f8a, 0x5a5a5a, 0x7a4a2a, 0x2f6b4f];
  const wallMats = wallColors.map((col) => new THREE.MeshLambertMaterial({ color: col }));
  const roofMats = roofColors.map((col) => new THREE.MeshLambertMaterial({ color: col }));
  const crateMat = new THREE.MeshLambertMaterial({ color: 0xa8743a });
  const crateGeo = new THREE.BoxGeometry(1, 1, 1);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  function solid(x0, y0, z0, x1, y1, z1, mat, cast = true) {
    const m = new THREE.Mesh(boxGeo, mat);
    m.scale.set(x1 - x0, y1 - y0, z1 - z0);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    m.castShadow = cast;
    m.receiveShadow = true;
    scene.add(m);
    addBox(x0, y0, z0, x1, y1, z1);
    return m;
  }

  function crate(x, z, y = 0, s = 1.2) {
    const m = new THREE.Mesh(crateGeo, crateMat);
    m.scale.setScalar(s);
    m.position.set(x, y + s / 2, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    addBox(x - s / 2, y, z - s / 2, x + s / 2, y + s, z + s / 2);
  }

  // House: 4 walls with a door gap, a window gap on another side, flat roof you can land on.
  function house(cx, cz, w, d, h) {
    const t = 0.3;
    const wall = wallMats[Math.floor(rng() * wallMats.length)];
    const roof = roofMats[Math.floor(rng() * roofMats.length)];
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const doorSide = Math.floor(rng() * 4);
    const door = 1.8, doorH = 2.5;

    // wall along X at z = zz (from xa to xb), or along Z at x = xx
    const wallX = (zz, withDoor) => {
      if (!withDoor) return solid(x0, 0, zz - t / 2, x1, h, zz + t / 2, wall);
      const mid = cx + (rng() - 0.5) * (w - door - 1.2);
      solid(x0, 0, zz - t / 2, mid - door / 2, h, zz + t / 2, wall);
      solid(mid + door / 2, 0, zz - t / 2, x1, h, zz + t / 2, wall);
      solid(mid - door / 2, doorH, zz - t / 2, mid + door / 2, h, zz + t / 2, wall);
    };
    const wallZ = (xx, withDoor) => {
      if (!withDoor) return solid(xx - t / 2, 0, z0, xx + t / 2, h, z1, wall);
      const mid = cz + (rng() - 0.5) * (d - door - 1.2);
      solid(xx - t / 2, 0, z0, xx + t / 2, h, mid - door / 2, wall);
      solid(xx - t / 2, 0, mid + door / 2, xx + t / 2, h, z1, wall);
      solid(xx - t / 2, doorH, mid - door / 2, xx + t / 2, h, mid + door / 2, wall);
    };
    const second = (doorSide + 2) % 4; // back door so houses aren't death traps
    const hasBack = rng() < 0.6;
    wallX(z0, doorSide === 0 || (hasBack && second === 0));
    wallX(z1, doorSide === 1 || (hasBack && second === 1));
    wallZ(x0, doorSide === 2 || (hasBack && second === 2));
    wallZ(x1, doorSide === 3 || (hasBack && second === 3));
    solid(x0 - 0.4, h, z0 - 0.4, x1 + 0.4, h + 0.35, z1 + 0.4, roof);

    // floor tint
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w - t, d - t), new THREE.MeshLambertMaterial({ color: 0x7d6a55 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.02, cz);
    floor.receiveShadow = true;
    scene.add(floor);

    // interior crate + loot
    if (rng() < 0.5) crate(x0 + 0.9, z0 + 0.9);
    const n = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) {
      lootSpots.push({ x: cx + (rng() - 0.5) * (w - 2), z: cz + (rng() - 0.5) * (d - 2), tier: 1 });
    }
    occupied.push({ x: cx, z: cz, r: Math.hypot(w, d) / 2 + 2 });
  }

  function tower(cx, cz, s, h, color) {
    const mat = new THREE.MeshLambertMaterial({ color });
    solid(cx - s / 2, 0, cz - s / 2, cx + s / 2, h, cz + s / 2, mat);
    // glowing bands
    const band = new THREE.MeshBasicMaterial({ color: 0xffb400 });
    for (let y = 8; y < h; y += 10) {
      const b = new THREE.Mesh(boxGeo, band);
      b.scale.set(s + 0.2, 0.5, s + 0.2);
      b.position.set(cx, y, cz);
      scene.add(b);
    }
    occupied.push({ x: cx, z: cz, r: s + 3 });
  }

  // ---------- towns ----------
  const towns = [
    { name: 'LX TOWER', x: 0, z: 0, n: 7, spread: 38, tier: 3 },
    { name: 'NEON DOCKS', x: 190, z: -120, n: 8, spread: 42, tier: 2 },
    { name: 'OLD MILL', x: -170, z: -150, n: 7, spread: 40, tier: 2 },
    { name: 'CACTUS ROW', x: -200, z: 120, n: 8, spread: 45, tier: 2 },
    { name: 'SKYPORT', x: 150, z: 180, n: 7, spread: 40, tier: 2 },
    { name: 'RED HOLLOW', x: 30, z: -240, n: 6, spread: 34, tier: 1 },
    { name: 'PINE CAMP', x: -40, z: 230, n: 5, spread: 30, tier: 1 },
    { name: 'SALT FLATS', x: 260, z: 40, n: 5, spread: 30, tier: 1 },
    { name: 'MOSS RIDGE', x: -270, z: -20, n: 5, spread: 30, tier: 1 },
  ];

  // roads from center to each town
  for (const t of towns.slice(1)) {
    const len = Math.hypot(t.x, t.z);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(7, len), roadMat);
    road.rotation.order = 'YXZ';
    road.rotation.set(-Math.PI / 2, Math.atan2(t.x, t.z), 0);
    road.position.set(t.x / 2, 0.015, t.z / 2);
    road.receiveShadow = true;
    scene.add(road);
  }

  tower(0, 0, 8, 46, 0x2a2f3a);

  // creator billboards on the tower (visible from far away)
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const cx2 = cv.getContext('2d');
  cx2.fillStyle = '#10141c'; cx2.fillRect(0, 0, 1024, 512);
  cx2.strokeStyle = '#ffb400'; cx2.lineWidth = 16; cx2.strokeRect(8, 8, 1008, 496);
  cx2.textAlign = 'center';
  cx2.font = 'italic 900 240px sans-serif'; cx2.fillStyle = '#ffffff'; cx2.fillText('L', 440, 260);
  cx2.fillStyle = '#ffb400'; cx2.fillText('X', 590, 260);
  cx2.font = '900 64px sans-serif'; cx2.fillStyle = '#ffffff'; cx2.fillText('MADE BY INYANG DAVID', 512, 400);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const boardMat = new THREE.MeshBasicMaterial({ map: tex });
  const boardGeo = new THREE.PlaneGeometry(8, 4);
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(boardGeo, boardMat);
    const a = (i * Math.PI) / 2;
    b.position.set(Math.sin(a) * 4.05, 34, Math.cos(a) * 4.05);
    b.rotation.y = a;
    scene.add(b);
  }
  // ground-level billboard next to the tower
  const post = new THREE.MeshLambertMaterial({ color: 0x333333 });
  solid(13.6, 0, 13.6, 14.0, 4, 14.0, post);
  solid(19.6, 0, 13.6, 20.0, 4, 14.0, post);
  const gb = new THREE.Mesh(new THREE.PlaneGeometry(7, 3.5), boardMat);
  gb.position.set(16.8, 5, 13.9);
  scene.add(gb);
  const gb2 = gb.clone(); gb2.rotation.y = Math.PI; gb2.position.z = 13.7; scene.add(gb2);
  occupied.push({ x: 16.8, z: 13.8, r: 5 });
  lootSpots.push({ x: 6, z: 0, tier: 3 }, { x: -6, z: 0, tier: 3 }, { x: 0, z: 6, tier: 3 }, { x: 0, z: -6, tier: 3 });

  for (const t of towns) {
    let placed = 0, tries = 0;
    while (placed < t.n && tries++ < 300) {
      const a = rng() * Math.PI * 2, r = 8 + rng() * t.spread;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      const w = 7 + rng() * 5, d = 6 + rng() * 5;
      if (!free(x, z, Math.hypot(w, d) / 2 + 2)) continue;
      house(x, z, w, d, 3.6 + rng() * 0.8);
      placed++;
    }
    // crate piles around town
    for (let i = 0; i < 6; i++) {
      const a = rng() * Math.PI * 2, r = 5 + rng() * t.spread;
      const x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      if (!free(x, z, 3)) continue;
      crate(x, z); crate(x + 1.25, z);
      if (rng() < 0.5) crate(x + 0.6, z, 1.2);
      lootSpots.push({ x: x + 0.6, z: z + 1.6, tier: t.tier });
      occupied.push({ x, z, r: 3 });
    }
    // tier-boost town loot
    for (const s of lootSpots) if (Math.hypot(s.x - t.x, s.z - t.z) < t.spread + 10) s.tier = Math.max(s.tier, t.tier);
  }

  // ---------- scattered cabins + cover ----------
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2, r = 40 + rng() * (R - 60);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const w = 6 + rng() * 3, d = 6 + rng() * 3;
    if (!free(x, z, Math.hypot(w, d) / 2 + 3)) continue;
    house(x, z, w, d, 3.5);
  }
  const fenceMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, r = 20 + rng() * (R - 30);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 4)) continue;
    if (rng() < 0.5) solid(x - 2.5, 0, z - 0.25, x + 2.5, 1.3, z + 0.25, fenceMat);
    else solid(x - 0.25, 0, z - 2.5, x + 0.25, 1.3, z + 2.5, fenceMat);
    occupied.push({ x, z, r: 3 });
    if (rng() < 0.4) lootSpots.push({ x: x + 1.5, z: z + 1.5, tier: 1 });
  }

  // ---------- rocks (instanced) ----------
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8b8d8f, flatShading: true });
  const rocks = [];
  for (let i = 0; i < 90; i++) {
    const a = rng() * Math.PI * 2, r = 15 + rng() * (R - 20);
    const x = Math.cos(a) * r, z = Math.sin(a) * r, s = 1 + rng() * 2.2;
    if (!free(x, z, s + 1)) continue;
    rocks.push({ x, z, s });
    occupied.push({ x, z, r: s + 1 });
    addBox(x - s * 0.8, 0, z - s * 0.8, x + s * 0.8, s * 1.1, z + s * 0.8);
  }
  const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rocks.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
  rocks.forEach((r, i) => {
    e.set(rng(), rng() * 6, rng());
    q.setFromEuler(e);
    m4.compose(v.set(r.x, r.s * 0.45, r.z), q, sv.set(r.s, r.s * 1.1, r.s));
    rockMesh.setMatrixAt(i, m4);
  });
  rockMesh.castShadow = rockMesh.receiveShadow = true;
  scene.add(rockMesh);

  // ---------- trees (instanced) ----------
  const trees = [];
  for (let i = 0; i < 520 && trees.length < 380; i++) {
    const a = rng() * Math.PI * 2, r = 10 + rng() * (R - 14);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!free(x, z, 1.5)) continue;
    const s = 0.8 + rng() * 0.7;
    trees.push({ x, z, s, pine: rng() < 0.55 });
    occupied.push({ x, z, r: 1.5 });
    addBox(x - 0.3 * s, 0, z - 0.3 * s, x + 0.3 * s, 3.5 * s, z + 0.3 * s, { tree: true });
  }
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.32, 3, 6), new THREE.MeshLambertMaterial({ color: 0x6b4423 }), trees.length);
  const pines = trees.filter((t) => t.pine), oaks = trees.filter((t) => !t.pine);
  const pineMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 5, 7), new THREE.MeshLambertMaterial({ color: 0x2f6b3a, flatShading: true }), pines.length);
  const oakMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.2, 0), new THREE.MeshLambertMaterial({ color: 0x4f8a33, flatShading: true }), oaks.length);
  q.identity();
  trees.forEach((t, i) => {
    m4.compose(v.set(t.x, 1.5 * t.s, t.z), q, sv.set(t.s, t.s, t.s));
    trunkMesh.setMatrixAt(i, m4);
  });
  pines.forEach((t, i) => {
    m4.compose(v.set(t.x, 5 * t.s, t.z), q, sv.set(t.s, t.s, t.s));
    pineMesh.setMatrixAt(i, m4);
  });
  oaks.forEach((t, i) => {
    e.set(0, rng() * 6, 0); q.setFromEuler(e);
    m4.compose(v.set(t.x, 4.2 * t.s, t.z), q, sv.set(t.s, t.s * 0.85, t.s));
    oakMesh.setMatrixAt(i, m4);
  });
  for (const m of [trunkMesh, pineMesh, oakMesh]) { m.castShadow = true; scene.add(m); }

  // open-field loot
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2, r = 20 + rng() * (R - 40);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (free(x, z, 1)) lootSpots.push({ x, z, tier: 0 });
  }

  return { sun, lootSpots, towns };
}
