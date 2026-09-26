import * as THREE from 'three';
import { Character } from './character.js';
import { PLAYER, MEDKIT } from './config.js';
import { input } from './input.js';
import { groundMove, airMove } from './movement.js';
import { fireWeapon, placeGloo } from './combat.js';
import { raycastBoxes } from './physics.js';
import { heightAt } from './terrain.js';
import { wants, applyItem, itemLabel } from './loot.js';
import { clamp } from './utils.js';
import { sfxPickup, sfxReload, sfxHeal, sfxChute } from './audio.js';

const tmp = new THREE.Vector3(), tmpDir = new THREE.Vector3(), pivot = new THREE.Vector3(), want = new THREE.Vector3();

export class Player extends Character {
  constructor(name) {
    super(name, true);
    this.camDist = 3.4;
    this.fov = 70;
    this.recoil = 0;
    this.nearItem = null;
    this.onChute = () => sfxChute();
  }

  update(dt, game, now, camera) {
    const sens = input.touch ? 0.0028 : 0.0022;
    const [lx, ly] = input.consumeLook();
    const scoped = this.isScoped();
    const s = scoped ? sens * 0.25 : input.aim ? sens * 0.6 : sens;
    this.yaw -= lx * s;
    this.pitch = clamp(this.pitch - ly * s, -1.3, 1.2);

    // movement intent relative to camera yaw
    let mx = 0, mz = 0;
    if (input.keys.has('KeyW')) mz -= 1;
    if (input.keys.has('KeyS')) mz += 1;
    if (input.keys.has('KeyA')) mx -= 1;
    if (input.keys.has('KeyD')) mx += 1;
    mx += input.moveX; mz += input.moveY;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = mx * cy + mz * sy;
    const wz = -mx * sy + mz * cy;

    if (this.state === 'plane') {
      if ((input.take('plane') || input.take('jump')) && game.plane.overIsland()) game.jumpFromPlane(this);
      this.updateCamera(dt, game, camera);
      return;
    }
    if (this.state === 'fall' || this.state === 'chute') {
      if (airMove(this, dt, wx, wz)) game.banner('LANDED — FIND A GUN!', 2);
      this.animate(dt, 0, camera.position);
      this.updateCamera(dt, game, camera);
      return;
    }
    if (this.state !== 'ground') { this.updateCamera(dt, game, camera); return; }

    // ---- actions ----
    this.updateReload(now);
    if (input.take('slot0')) this.switchSlot(0, now);
    if (input.take('slot1')) this.switchSlot(1, now);
    if (input.take('swap')) this.switchSlot(1 - this.slot, now);
    if (input.take('reload') && this.startReload(now)) sfxReload();
    if (input.take('heal')) {
      if (this.meds > 0 && this.hp < PLAYER.maxHp && !this.healEnd) { this.healEnd = now + MEDKIT.time; this.reloadEnd = 0; sfxHeal(); }
      else if (!this.meds) game.banner('NO MEDKITS', 1);
    }
    if (this.healEnd && now >= this.healEnd) {
      this.hp = Math.min(PLAYER.maxHp, this.hp + MEDKIT.heal);
      this.meds--; this.healEnd = 0;
    }
    if (input.take('gloo')) {
      if (!placeGloo(game, this)) game.banner(this.gloo ? 'CAN\'T PLACE HERE' : 'NO GLOO WALLS', 1);
    }
    if (input.take('map')) game.hud.toggleMap();

    const sprint = (input.keys.has('ShiftLeft') || input.sprintToggle) && mz < 0 && !input.fire && !input.aim;
    let speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    if (this.healEnd) speed *= 0.45;
    if (input.aim) speed *= 0.6;
    const moveSpeed = groundMove(this, dt, wx, wz, speed * Math.min(1, ml), input.take('jump'));

    // ---- shooting ----
    if (input.fire) {
      this.healEnd = 0;
      this.aimRay(camera, tmp, tmpDir);
      let extra = 0;
      if (!this.onGround) extra += 0.05;
      else if (moveSpeed > 1) extra += (this.weapon?.def.kind === 'sniper' ? 0.04 : 0.012);
      if (input.aim) extra -= (this.weapon?.def.spread || 0) * 0.5;
      if (scoped) extra -= this.weapon.def.spread;
      extra += this.recoil * 0.02;
      if (fireWeapon(game, this, tmp, tmpDir, now, Math.max(-1, extra))) {
        const kind = this.weapon?.def.kind;
        const kick = { sniper: 0.06, shotgun: 0.05, ar: 0.012, smg: 0.008, pistol: 0.015 }[kind] ?? 0;
        this.pitch += kick;
        this.recoil = Math.min(1.5, this.recoil + 0.25);
        game.hud.pulseCrosshair();
        if (kind === 'sniper' || kind === 'shotgun') { input.fire = input.touch ? input.fire : false; }
        if (kind === 'sniper') input.aim = false;
      }
    }
    this.recoil = Math.max(0, this.recoil - dt * 3);

    // ---- loot ----
    this.nearItem = null;
    const it = game.loot.nearest(this.pos.x, this.pos.z, 2.2, (x) => Math.abs(x.y - this.pos.y) < 1.5);
    if (it) {
      const d = Math.hypot(it.x - this.pos.x, it.z - this.pos.z);
      const auto = it.type !== 'gun' || this.weapons.some((w) => !w);
      if (auto && d < 1.4 && wants(this, it)) this.pickup(game, it);
      else this.nearItem = it;
    }
    if (input.take('pickup') && this.nearItem) this.pickup(game, this.nearItem);

    this.animate(dt, moveSpeed, camera.position);
    this.updateCamera(dt, game, camera);
  }

  pickup(game, it) {
    game.loot.remove(it);
    const back = applyItem(this, it);
    if (back) game.loot.spawn(back, this.pos.x + 0.6, this.pos.z + 0.6, this.pos.y);
    game.banner(`+ ${itemLabel(it)}`, 1.2, true);
    sfxPickup();
    this.nearItem = null;
  }

  isScoped() { return input.aim && this.state === 'ground' && this.weapon?.def.scope; }

  aimRay(camera, origin, dir) {
    camera.getWorldDirection(dir);
    origin.copy(camera.position);
    // start the ray beside the player so nothing behind them is hit
    const skip = Math.max(0, origin.distanceTo(pivot) - 0.5);
    origin.addScaledVector(dir, skip);
  }

  updateCamera(dt, game, camera) {
    let dist, height, side, fov = 70;
    if (this.state === 'plane') {
      pivot.copy(game.plane.pos);
      dist = 38; height = 6; side = 0;
    } else if (this.state === 'fall' || this.state === 'chute') {
      pivot.set(this.pos.x, this.pos.y + 1.5, this.pos.z);
      dist = this.state === 'chute' ? 9 : 7; height = 1.5; side = 0; fov = 75;
    } else {
      pivot.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
      if (this.isScoped()) { dist = 0; height = 0; side = 0; fov = 14; }
      else if (input.aim) { dist = 1.8; height = 0.15; side = 0.55; fov = 52; }
      else { dist = 3.3; height = 0.35; side = 0.6; fov = 70; }
    }
    // offset in camera space
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const back = new THREE.Vector3(sy * cp, -sp, cy * cp); // opposite of look dir
    const right = new THREE.Vector3(cy, 0, -sy);
    const base = tmp.copy(pivot).addScaledVector(right, side);
    base.y += height;
    want.copy(base).addScaledVector(back, dist);
    // pull in if a wall is in the way
    if (dist > 0) {
      const hit = raycastBoxes(base.x, base.y, base.z, back.x, back.y, back.z, dist + 0.3);
      if (hit) want.copy(base).addScaledVector(back, Math.max(0.3, hit.t - 0.3));
      const gy = heightAt(want.x, want.z) + 0.35;
      if (want.y < gy) want.y = gy;
    }
    camera.position.lerp(want, this.state === 'ground' ? 1 : Math.min(1, dt * 10));
    const look = base.addScaledVector(back, -20);
    camera.lookAt(look);
    this.fov += (fov - this.fov) * Math.min(1, dt * 14);
    if (Math.abs(camera.fov - this.fov) > 0.01) { camera.fov = this.fov; camera.updateProjectionMatrix(); }
    this.mesh.visible = this.alive && this.state !== 'plane' && !this.isScoped();
  }
}
