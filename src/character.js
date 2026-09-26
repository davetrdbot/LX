import * as THREE from 'three';
import { PLAYER, WEAPONS, ARMOR_REDUCTION, HEADSHOT_MULT } from './config.js';
import { instantiate, randomOutfit, Animator } from './assets.js';

const matCache = new Map();
function mat(color, rough = 0.6, metal = 0.2) {
  const k = color + ':' + rough + ':' + metal;
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }));
  return matCache.get(k);
}
function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.castShadow = true;
  return b;
}
function cyl(r, len, m, x = 0, y = 0, z = 0, seg = 10) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), m);
  c.rotation.x = Math.PI / 2;
  c.position.set(x, y, z);
  c.castShadow = true;
  return c;
}

// Detailed low-poly guns built from parts. Origin = grip, barrel points -Z.
const gunCache = {};
export function gunMesh(def) {
  if (!def) return new THREE.Group();
  if (gunCache[def.name]) return gunCache[def.name].clone();
  const g = new THREE.Group();
  const black = mat(0x1c1d20, 0.45, 0.6), steel = mat(0x55595e, 0.35, 0.8), body = mat(def.color, 0.55, 0.3), wood = mat(0x7a4a22, 0.7, 0);
  switch (def.kind) {
    case 'pistol':
      g.add(box(0.05, 0.07, 0.26, black, 0, 0.07, -0.08), box(0.045, 0.12, 0.06, black, 0, 0, 0.02).rotateX(-0.2), cyl(0.012, 0.05, steel, 0, 0.08, -0.23));
      break;
    case 'smg':
      g.add(box(0.06, 0.09, 0.42, body, 0, 0.07, -0.14), cyl(0.018, 0.22, steel, 0, 0.08, -0.45), box(0.04, 0.2, 0.05, black, 0, -0.09, -0.12),
        box(0.045, 0.1, 0.05, black, 0, -0.02, 0.03).rotateX(-0.25), box(0.02, 0.03, 0.3, steel, 0, 0.06, 0.2));
      break;
    case 'shotgun':
      g.add(cyl(0.025, 0.6, steel, 0, 0.09, -0.4), cyl(0.02, 0.45, black, 0, 0.05, -0.33), box(0.06, 0.09, 0.24, black, 0, 0.07, -0.02),
        box(0.055, 0.12, 0.3, wood, 0, 0.02, 0.2).rotateX(0.12), box(0.05, 0.05, 0.16, wood, 0, 0.04, -0.28));
      break;
    case 'ar':
      g.add(box(0.06, 0.1, 0.42, body, 0, 0.07, -0.12), box(0.05, 0.07, 0.26, black, 0, 0.07, -0.44), cyl(0.014, 0.18, steel, 0, 0.08, -0.65),
        box(0.045, 0.2, 0.07, black, 0, -0.08, -0.2).rotateX(0.25), box(0.045, 0.11, 0.05, black, 0, -0.02, 0.04).rotateX(-0.25),
        box(0.05, 0.1, 0.24, def.name === 'AK' ? wood : black, 0, 0.05, 0.22), box(0.02, 0.04, 0.12, black, 0, 0.14, -0.1));
      break;
    case 'sniper':
      g.add(box(0.06, 0.1, 0.5, body, 0, 0.07, -0.12), cyl(0.016, 0.6, steel, 0, 0.09, -0.65), cyl(0.03, 0.34, black, 0, 0.18, -0.12),
        cyl(0.036, 0.04, black, 0, 0.18, -0.3), box(0.05, 0.13, 0.3, body, 0, 0.03, 0.25), box(0.045, 0.1, 0.05, black, 0, -0.03, 0.02).rotateX(-0.25),
        box(0.04, 0.12, 0.06, black, 0, -0.06, -0.14));
      break;
  }
  gunCache[def.name] = g;
  return g.clone();
}

let nextId = 1;
const tmpV = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);

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
    this.frags = 0;
    this.ep = 0;
    this.hero = 'kai';
    this.skillReadyAt = 0;
    this.kills = 0;
    this.alive = true;
    this.state = 'plane'; // plane | fall | chute | ground | dead
    this.nextShot = 0;
    this.reloadEnd = 0;
    this.healEnd = 0;
    this.onGround = true;
    this.lastHitBy = null;
    this.deathTime = 0;
    this.nearCamera = true;
    this.buildModel();
  }

  buildModel() {
    const outfit = randomOutfit(this.isPlayer);
    const { root, bones } = instantiate(outfit);
    this.bones = bones;
    this.anim = new Animator(root);
    this.mesh = new THREE.Group();
    this.mesh.add(root);
    this.mesh.visible = false;
    this.skin = root;

    // gear attached in bind pose so it follows the skeleton
    root.updateMatrixWorld(true);
    const head = bones['DEF-head'], chest = bones['DEF-spine002'] || bones['DEF-spine003'];
    const olive = mat(0x4a5a3a, 0.8, 0.05), pouch = mat(0x39462c, 0.8, 0), helmMat = mat(0x3d4a2f, 0.6, 0.2);
    const hp = head.getWorldPosition(new THREE.Vector3()), cp = chest.getWorldPosition(new THREE.Vector3());
    // model faces +Z inside root (root is rotated PI), so "front" is -Z in this world frame
    const f = -1;
    const helm = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 8, 0, Math.PI * 2, 0, Math.PI / 1.9), helmMat);
    dome.scale.set(1, 0.95, 1.12); dome.castShadow = true;
    helm.add(dome, box(0.3, 0.025, 0.08, helmMat, 0, -0.005, 0.14 * f));
    helm.position.set(hp.x, hp.y + 0.13, hp.z);
    head.attach(helm);
    const vest = new THREE.Group();
    vest.add(box(0.36, 0.34, 0.07, olive, 0, 0, 0.12 * f), box(0.36, 0.34, 0.07, olive, 0, 0, -0.12 * f),
      box(0.08, 0.1, 0.05, pouch, -0.1, -0.06, 0.17 * f), box(0.08, 0.1, 0.05, pouch, 0.1, -0.06, 0.17 * f),
      box(0.36, 0.06, 0.28, olive, 0, 0.15, 0));
    vest.position.set(cp.x, cp.y - 0.02, cp.z);
    chest.attach(vest);
    const pack = new THREE.Group();
    const packMat = mat(this.isPlayer ? 0x2b2b2b : 0x5b4a33, 0.85, 0);
    pack.add(box(0.26, 0.32, 0.12, packMat), box(0.22, 0.1, 0.05, packMat, 0, -0.07, 0.08 * -f), box(0.26, 0.05, 0.14, mat(0x222222, 0.7, 0), 0, 0.17, 0));
    pack.position.set(cp.x, cp.y - 0.06, cp.z - 0.17 * f);
    chest.attach(pack);
    this.gear = { helm, vest, pack };
    helm.visible = vest.visible = false;

    // gun follows the right hand in world space
    this.gunHolder = new THREE.Group();
    this.mesh.add(this.gunHolder);

    const chute = new THREE.Group();
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(3, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2.6),
      new THREE.MeshStandardMaterial({ color: this.isPlayer ? 0xffb400 : outfit.shirt, side: THREE.DoubleSide, roughness: 0.8 })
    );
    canopy.position.y = 4.4;
    canopy.scale.set(1.2, 0.45, 0.8);
    chute.add(canopy);
    const pts = [];
    for (const [x, z] of [[-3, -1.6], [3, -1.6], [-3, 1.6], [3, 1.6], [0, -2.2], [0, 2.2]]) pts.push(new THREE.Vector3(0, 1.5, 0), new THREE.Vector3(x, 4.8, z));
    chute.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xeeeeee })));
    chute.visible = false;
    this.mesh.add(chute);
    this.chute = chute;
    this.animState = '';
    this.animArmed = null;
  }

  get weapon() { return this.weapons[this.slot]; }

  refreshGear() {
    this.gear.vest.visible = this.vest > 0;
    this.gear.helm.visible = this.helm > 0;
    const g = this.gunHolder;
    while (g.children.length) g.remove(g.children[0]);
    if (this.weapon) g.add(gunMesh(this.weapon.def));
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
    if (this.nearCamera) this.anim.oneShot('Pistol_Reload', 'upper', 1, 2.4 / w.def.reload);
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

  takeDamage(raw, head, attacker) {
    if (!this.alive) return 0;
    const red = head ? ARMOR_REDUCTION[this.helm] : ARMOR_REDUCTION[this.vest];
    const dmg = Math.round(raw * (head ? HEADSHOT_MULT : 1) * (1 - red));
    this.hp -= dmg;
    if (attacker) this.lastHitBy = attacker;
    this.healEnd = 0;
    if (this.hp > 0 && this.nearCamera && Math.random() < 0.5) this.anim.oneShot(head ? 'Hit_Head' : 'Hit_Chest', 'upper', 0.6, 1.5);
    return dmg;
  }

  onFire() { if (this.nearCamera) this.anim.oneShot('Pistol_Shoot', 'upper', 0.7, this.weapon?.def.kind === 'sniper' ? 1 : 2); }
  onPunch() { this.anim.oneShot('Punch_Jab', 'upper', 1, 1.6); }
  onDeath() {
    this.anim.setAim(0, false);
    this.anim.setLower('Death01', 0.15);
    this.anim.setUpper('Death01', 0.15);
    this.gunHolder.visible = false;
    this.chute.visible = false;
    this.skin.rotation.x = 0;
  }

  // Picks animation clips from movement state, then poses the gun at the hand.
  animate(dt, speed, camPos) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw;
    const far = camPos ? camPos.distanceToSquared(this.pos) > 150 * 150 : false;
    this.nearCamera = !far;
    if (this.state === 'dead') { this.anim.update(dt); return; }

    const armed = !!this.weapon;
    let st;
    if (this.state === 'fall') st = 'fall';
    else if (this.state === 'chute') st = 'chute';
    else if (!this.onGround) st = 'air';
    else if (this.healEnd) st = speed > 0.5 ? 'walk' : 'heal';
    else if (speed > 7.5) st = 'sprint';
    else if (speed > 3.5) st = 'jog';
    else if (speed > 0.4) st = 'walk';
    else st = 'idle';

    const aimUpper = armed && !['fall', 'sprint', 'heal', 'chute'].includes(st);
    if (st !== this.animState || armed !== this.animArmed) {
      this.animState = st;
      this.animArmed = armed;
      const L = { fall: 'Swim_Idle_Loop', chute: 'Jump_Loop', air: 'Jump_Loop', heal: 'Crouch_Idle_Loop', sprint: 'Sprint_Loop', jog: 'Jog_Fwd_Loop', walk: 'Walk_Loop', idle: armed ? 'Pistol_Idle_Loop' : 'Idle_Loop' }[st];
      this.anim.setLower(L, 0.2);
      if (!aimUpper) this.anim.setUpper(st === 'heal' ? 'Interact' : L, 0.2);
    }
    this.anim.setAim(this.pitch, aimUpper);
    // far characters animate at a lower rate
    this.animAcc = (this.animAcc || 0) + dt;
    if (!far || this.animAcc > 0.1) { this.anim.update(this.animAcc); this.animAcc = 0; }

    this.skin.rotation.x = st === 'fall' ? -1.2 : 0;
    this.chute.visible = st === 'chute';

    // gun at right hand, aimed along pitch (slung down when sprinting / healing)
    const hand = this.bones['DEF-handR'];
    if (hand && armed && st !== 'fall' && st !== 'chute') {
      this.gunHolder.visible = true;
      this.mesh.updateMatrixWorld(true);
      hand.getWorldPosition(tmpV);
      this.mesh.worldToLocal(tmpV);
      this.gunHolder.position.copy(tmpV);
      this.gunHolder.rotation.set(aimUpper ? this.pitch : -1.0, 0, 0);
    } else this.gunHolder.visible = false;
  }

  muzzleWorld(out) {
    if (this.weapon && this.gunHolder.visible) {
      out.set(0, 0.08, -this.weapon.def.len * 0.85);
      this.gunHolder.localToWorld(out);
      return out;
    }
    return out.set(0.25, 1.4, -0.5).applyAxisAngle(UPV, this.yaw).add(this.pos);
  }

  eye(out) { return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z); }
}
