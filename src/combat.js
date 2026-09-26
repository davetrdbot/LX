import * as THREE from 'three';
import { GLOO } from './config.js';
import { raycastBoxes, raycastCharacter, addBox, removeCollider } from './physics.js';
import { terrainRay } from './terrain.js';
import { raycastShields } from './skills.js';
import { sfxShot, sfxHit, sfxEmpty, sfxReload, sfxGloo } from './audio.js';

const tmpDir = new THREE.Vector3();
const tmpEnd = new THREE.Vector3();
const tmpMuzzle = new THREE.Vector3();
const tmpHit = new THREE.Vector3();

// Fires the shooter's active weapon along dir from origin. extraSpread is added (movement, bot inaccuracy).
// Returns true if a shot went off.
export function fireWeapon(game, shooter, origin, dir, now, extraSpread = 0) {
  const w = shooter.weapon;
  if (!w) return melee(game, shooter, now);
  if (now < shooter.nextShot || shooter.reloading) return false;
  if (w.mag <= 0) {
    if (shooter.startReload(now)) { if (shooter.isPlayer) sfxReload(); }
    else if (shooter.isPlayer) { sfxEmpty(); shooter.nextShot = now + 0.3; }
    return false;
  }
  const def = w.def;
  w.mag--;
  shooter.nextShot = now + def.rate;
  shooter.healEnd = 0;
  shooter.lastShotAt = now;

  shooter.onFire();
  shooter.muzzleWorld(tmpMuzzle);
  game.effects.flash(tmpMuzzle);
  const distToPlayer = shooter.isPlayer ? 0 : shooter.pos.distanceTo(game.player.pos) || 0.01;
  sfxShot(def.kind, distToPlayer);
  if (!shooter.isPlayer) game.ping(shooter.pos.x, shooter.pos.z);

  const spread = def.spread + extraSpread;
  let dealtTotal = 0;
  for (let p = 0; p < def.pellets; p++) {
    tmpDir.copy(dir);
    if (spread > 0) {
      tmpDir.x += (Math.random() - 0.5) * 2 * spread;
      tmpDir.y += (Math.random() - 0.5) * 2 * spread;
      tmpDir.z += (Math.random() - 0.5) * 2 * spread;
      tmpDir.normalize();
    }
    const res = traceShot(game, shooter, origin, tmpDir, def.range);
    tmpEnd.copy(origin).addScaledVector(tmpDir, res.t);
    if (res.char) {
      // shotgun damage falls off with distance
      let dmg = def.dmg;
      if (def.pellets > 1) dmg *= Math.max(0.25, 1 - res.t / def.range);
      dealtTotal += game.damage(res.char, dmg, res.head, shooter, def.name, tmpEnd);
    } else if (res.shield) {
      res.shield.hp -= def.dmg;
      game.effects.impact(tmpEnd, 'gloo', 3);
    } else if (res.box || res.ground) {
      if (res.box?.gloo) damageGloo(game, res.box, def.dmg);
      game.effects.impact(tmpEnd, res.box?.gloo ? 'gloo' : 'dust', def.pellets > 1 ? 2 : 4);
    }
    if (p < 3 || Math.random() < 0.3) game.effects.tracer(tmpMuzzle, tmpEnd);
  }
  if (shooter.isPlayer && dealtTotal > 0) sfxHit(false);
  if (w.mag === 0 && shooter.ammo[def.ammo] > 0) shooter.startReload(now + def.rate) && shooter.isPlayer && sfxReload();
  return true;
}

// Nearest thing the ray hits: a box or a character.
export function traceShot(game, shooter, origin, dir, range) {
  const box = raycastBoxes(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, range);
  let best = { t: box ? box.t : range, box: box ? box.collider : null, char: null, head: false };
  const tt = terrainRay(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best.t);
  if (tt !== null) best = { t: tt, box: null, char: null, head: false, ground: true };
  const sh = raycastShields(game, origin, dir, best.t);
  if (sh) best = { t: sh.t, box: null, char: null, head: false, shield: sh.shield };
  for (const c of game.characters) {
    if (c === shooter || !c.alive || c.state === 'plane') continue;
    // cheap reject: distance from ray
    tmpHit.set(c.pos.x - origin.x, c.pos.y + 1 - origin.y, c.pos.z - origin.z);
    const along = tmpHit.dot(dir);
    if (along < 0 || along > best.t + 1) continue;
    if (tmpHit.lengthSq() - along * along > 4) continue;
    const h = raycastCharacter(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, best.t, c);
    if (h && h.t < best.t) best = { t: h.t, box: null, char: c, head: h.head };
  }
  return best;
}

function melee(game, shooter, now) {
  if (now < shooter.nextShot) return false;
  shooter.nextShot = now + 0.5;
  const fx = -Math.sin(shooter.yaw), fz = -Math.cos(shooter.yaw);
  let hit = null;
  for (const c of game.characters) {
    if (c === shooter || !c.alive || c.state !== 'ground') continue;
    const dx = c.pos.x - shooter.pos.x, dz = c.pos.z - shooter.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.9 && (dx * fx + dz * fz) / (d || 1) > 0.5 && Math.abs(c.pos.y - shooter.pos.y) < 1.2) { hit = c; break; }
  }
  shooter.onPunch();
  if (hit) {
    tmpEnd.copy(hit.pos); tmpEnd.y += 1.3;
    const d = game.damage(hit, 16, false, shooter, 'FIST', tmpEnd);
    if (shooter.isPlayer && d) sfxHit(false);
  }
  return true;
}

// ---------- gloo walls ----------
const glooMat = new THREE.MeshLambertMaterial({ color: 0xbfefff, transparent: true, opacity: 0.85, emissive: 0x1a4a5a });
const glooGeo = new THREE.BoxGeometry(1, 1, 1);

export function placeGloo(game, ch) {
  if (ch.gloo <= 0 || ch.state !== 'ground') return false;
  // snap facing to nearest axis so the collider is a true AABB
  const q = Math.round(ch.yaw / (Math.PI / 2));
  const fx = -Math.sin(q * Math.PI / 2), fz = -Math.cos(q * Math.PI / 2);
  const cx = ch.pos.x + fx * 2.2, cz = ch.pos.z + fz * 2.2;
  const alongX = Math.abs(fz) > 0.5; // wall spans X when facing along Z
  const hw = GLOO.width / 2, ht = GLOO.thickness / 2;
  const x0 = cx - (alongX ? hw : ht), x1 = cx + (alongX ? hw : ht);
  const z0 = cz - (alongX ? ht : hw), z1 = cz + (alongX ? ht : hw);
  const base = ch.pos.y;
  const mesh = new THREE.Mesh(glooGeo, glooMat.clone());
  mesh.position.set(cx, base + GLOO.height / 2, cz);
  mesh.scale.set(x1 - x0, 0.01, z1 - z0);
  mesh.castShadow = true;
  game.scene.add(mesh);
  const col = addBox(x0, base, z0, x1, base + GLOO.height, z1, { gloo: { hp: GLOO.hp, mesh, born: game.time } });
  game.gloos.push(col);
  ch.gloo--;
  if (ch.isPlayer || ch.pos.distanceTo(game.player.pos) < 40) sfxGloo();
  return true;
}

export function damageGloo(game, col, dmg) {
  col.gloo.hp -= dmg;
  if (col.gloo.hp <= 0) destroyGloo(game, col);
}

export function destroyGloo(game, col) {
  removeCollider(col);
  game.scene.remove(col.gloo.mesh);
  game.gloos.splice(game.gloos.indexOf(col), 1);
  const p = col.gloo.mesh.position;
  game.effects.impact(p, 'gloo', 12);
}

export function updateGloos(game, dt) {
  for (const col of [...game.gloos]) {
    const m = col.gloo.mesh;
    const age = game.time - col.gloo.born;
    // grow-in animation
    m.scale.y = Math.min(1, age * 5) * GLOO.height;
    m.position.y = col.minY + m.scale.y / 2;
    m.material.opacity = 0.55 + 0.3 * (col.gloo.hp / GLOO.hp);
    if (age > 40) destroyGloo(game, col);
  }
}
