import * as THREE from 'three';
import { PLAYER, WEAPONS, ARMOR_REDUCTION, HEADSHOT_MULT } from './config.js';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}
function part(w, h, d, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(boxGeo, mat(color));
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0xd7263d, 0x1b998b, 0x2e86ab, 0xf46036, 0x5b5f97, 0x3d3b30, 0xc5d86d, 0x7b2d26, 0x0b3954, 0x8e44ad];
const PANTS = [0x2d3142, 0x3a3a3a, 0x4f5d75, 0x5c4033, 0x1f2833];

// Low-poly humanoid facing -Z. Parts are exposed for animation.
export function buildModel(shirt, isPlayer) {
  const g = new THREE.Group();
  const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
  shirt = shirt ?? SHIRTS[Math.floor(Math.random() * SHIRTS.length)];
  const pants = PANTS[Math.floor(Math.random() * PANTS.length)];

  const hipL = new THREE.Group(); hipL.position.set(-0.13, 0.85, 0);
  const hipR = new THREE.Group(); hipR.position.set(0.13, 0.85, 0);
  hipL.add(part(0.22, 0.85, 0.24, pants, 0, -0.42, 0));
  hipR.add(part(0.22, 0.85, 0.24, pants, 0, -0.42, 0));
  const torso = part(0.56, 0.62, 0.3, shirt, 0, 1.16, 0);
  const vest = part(0.6, 0.45, 0.34, 0x4a5a3a, 0, 1.2, 0); vest.visible = false;
  const head = part(0.32, 0.34, 0.32, skin, 0, 1.64, 0);
  const hair = part(0.34, 0.1, 0.34, isPlayer ? 0xffb400 : 0x222222, 0, 1.83, 0.01);
  const helm = part(0.38, 0.2, 0.38, 0x3d4a2f, 0, 1.82, 0); helm.visible = false;

  const shoulderL = new THREE.Group(); shoulderL.position.set(-0.36, 1.42, 0);
  const shoulderR = new THREE.Group(); shoulderR.position.set(0.36, 1.42, 0);
  shoulderL.add(part(0.18, 0.62, 0.18, shirt, 0, -0.28, 0));
  shoulderR.add(part(0.18, 0.62, 0.18, shirt, 0, -0.28, 0));
  // aim pose: arms forward
  shoulderR.rotation.x = -1.35;
  shoulderL.rotation.set(-1.25, 0, 0.45);

  const gun = new THREE.Group();
  gun.position.set(0.22, 1.36, -0.45);
  g.add(hipL, hipR, torso, vest, head, hair, helm, shoulderL, shoulderR, gun);

  // parachute (hidden until used)
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.4),
    new THREE.MeshLambertMaterial({ color: isPlayer ? 0xffb400 : shirt, side: THREE.DoubleSide })
  );
  canopy.position.y = 3.2;
  canopy.scale.set(1, 0.5, 0.8);
  chute.add(canopy);
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const pts = [];
  for (const [x, z] of [[-2.2, -1.5], [2.2, -1.5], [-2.2, 1.5], [2.2, 1.5]]) pts.push(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(x, 4.3, z));
  chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), lineMat));
  chute.visible = false;
  g.add(chute);

  return { group: g, hipL, hipR, shoulderL, shoulderR, gun, chute, vest, helm, head, torso };
}

function gunMesh(def) {
  const g = new THREE.Group();
  if (!def) return g;
  const L = def.len;
  g.add(part(0.08, 0.12, L, def.color, 0, 0, -L / 2));
  g.add(part(0.07, 0.16, 0.1, 0x222222, 0, -0.12, -0.08)); // grip
  if (def.kind !== 'pistol') g.add(part(0.08, 0.14, 0.25, def.color, 0, -0.02, 0.12)); // stock
  if (def.scope) g.add(part(0.06, 0.06, 0.3, 0x111111, 0, 0.1, -L * 0.45));
  if (def.kind === 'ar' || def.kind === 'smg') g.add(part(0.06, 0.18, 0.08, 0x222222, 0, -0.14, -L * 0.45)); // mag
  return g;
}

let nextId = 1;

export class Character {
  constructor(name, isPlayer = false) {
    this.id = nextId++;
    this.name = name;
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.velY = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.hp = PLAYER.maxHp;
    this.vest = 0;
    this.helm = 0;
    this.weapons = [null, null];
    this.slot = 0;
    this.ammo = { smg: 0, ar: 0, sg: 0, sn: 0 };
    this.meds = 0;
    this.gloo = 0;
    this.kills = 0;
    this.alive = true;
    this.state = 'plane'; // plane | fall | chute | ground | dead
    this.nextShot = 0;
    this.reloadEnd = 0;
    this.healEnd = 0;
    this.onGround = true;
    this.walkPhase = 0;
    this.lastHitBy = null;
    this.model = buildModel(isPlayer ? 0xff5a1f : undefined, isPlayer);
    this.mesh = this.model.group;
    this.mesh.rotation.order = 'YXZ';
    this.mesh.visible = false;
    this.deathTime = 0;
  }

  get weapon() { return this.weapons[this.slot]; }

  refreshGear() {
    this.model.vest.visible = this.vest > 0;
    this.model.helm.visible = this.helm > 0;
    const g = this.model.gun;
    while (g.children.length) g.remove(g.children[0]);
    const w = this.weapon;
    if (w) g.add(gunMesh(w.def));
    const armed = !!w;
    this.model.shoulderR.rotation.x = armed ? -1.35 : 0;
    this.model.shoulderL.rotation.set(armed ? -1.25 : 0, 0, armed ? 0.45 : 0);
  }

  giveWeapon(key, withMag = true) {
    const def = WEAPONS[key];
    const entry = { key, def, mag: withMag ? def.mag : 0 };
    let idx = this.weapons.findIndex((w) => !w);
    let dropped = null;
    if (idx < 0) { idx = this.slot; dropped = this.weapons[idx]; }
    this.weapons[idx] = entry;
    this.slot = idx;
    this.reloadEnd = 0;
    this.refreshGear();
    return dropped;
  }

  switchSlot(i, now = 0) {
    if (i === this.slot || !this.weapons[i]) return;
    this.slot = i;
    this.reloadEnd = 0;
    this.nextShot = Math.max(this.nextShot, now + 0.25);
    this.refreshGear();
  }

  startReload(now) {
    const w = this.weapon;
    if (!w || this.reloadEnd > now || w.mag >= w.def.mag || this.ammo[w.def.ammo] <= 0) return false;
    this.reloadEnd = now + w.def.reload;
    this.healEnd = 0;
    return true;
  }

  updateReload(now) {
    const w = this.weapon;
    if (this.reloadEnd && now >= this.reloadEnd && w) {
      const need = w.def.mag - w.mag;
      const take = Math.min(need, this.ammo[w.def.ammo]);
      w.mag += take;
      this.ammo[w.def.ammo] -= take;
      this.reloadEnd = 0;
    }
  }

  get reloading() { return this.reloadEnd > 0; }

  // Returns the damage actually dealt.
  takeDamage(raw, head, attacker) {
    if (!this.alive) return 0;
    const red = head ? ARMOR_REDUCTION[this.helm] : ARMOR_REDUCTION[this.vest];
    const dmg = Math.round(raw * (head ? HEADSHOT_MULT : 1) * (1 - red));
    this.hp -= dmg;
    if (attacker) this.lastHitBy = attacker;
    this.healEnd = 0;
    return dmg;
  }

  // Walk cycle + body orientation.
  animate(dt, speed) {
    const m = this.model;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    if (this.state === 'dead') return;
    if (speed > 0.3 && this.onGround) {
      this.walkPhase += dt * speed * 1.6;
      const s = Math.sin(this.walkPhase) * 0.7;
      m.hipL.rotation.x = s;
      m.hipR.rotation.x = -s;
    } else {
      m.hipL.rotation.x *= 0.8;
      m.hipR.rotation.x *= 0.8;
    }
    if (this.state === 'fall') {
      this.mesh.rotation.x = -1.2; // skydive pose
      m.shoulderL.rotation.set(0, 0, 1.3);
      m.shoulderR.rotation.set(0, 0, -1.3);
    } else if (this.mesh.rotation.x !== 0) {
      this.mesh.rotation.x = 0;
      this.refreshGear();
      m.shoulderL.rotation.z = this.weapon ? 0.45 : 0;
      m.shoulderR.rotation.z = 0;
    }
    m.chute.visible = this.state === 'chute';
    // gun follows pitch a bit
    m.shoulderR.rotation.y = 0;
    m.gun.rotation.x = this.pitch * 0.8;
  }

  muzzleWorld(out) {
    const L = this.weapon ? this.weapon.def.len : 0.3;
    out.set(0.22, 1.36 + Math.sin(this.pitch) * L, -0.45 - L * Math.cos(this.pitch));
    out.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    return out.add(this.pos);
  }

  eye(out) { return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }
}
