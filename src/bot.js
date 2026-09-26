import * as THREE from 'three';
import { Character } from './character.js';
import { MEDKIT } from './config.js';
import { groundMove, airMove } from './movement.js';
import { fireWeapon, placeGloo } from './combat.js';
import { lineOfSight } from './physics.js';
import { wants, applyItem } from './loot.js';
import { angleDiff } from './utils.js';
import { useSkill, speedMult, skillReady } from './skills.js';
import { HEROES } from './config.js';

const tmpO = new THREE.Vector3(), tmpD = new THREE.Vector3();

export class Bot extends Character {
  constructor(name) {
    super(name, false);
    this.skill = 0.25 + Math.random() * 0.65;
    this.thinkT = Math.random() * 0.3;
    this.enemy = null;
    this.enemySeenAt = 0;
    this.reactUntil = 0;
    this.goal = null; // {x, z}
    this.goalKind = 'wander';
    this.lootTarget = null;
    this.strafe = 1;
    this.strafeT = 0;
    this.burstT = 0;
    this.pauseT = 0;
    this.stuckT = 0;
    this.detourT = 0;
    this.detour = 0;
    this.lastCheck = new THREE.Vector3();
    this.landing = null;
    this.jumpT = 0;
    this.glooCd = 0;
    this.aggression = Math.random();
    this.hero = Object.keys(HEROES)[Math.floor(Math.random() * 3)];
    this.nadeCd = 0;
  }

  update(dt, game, now) {
    if (!this.alive) return;
    if (this.state === 'fall' || this.state === 'chute') {
      let wx = 0, wz = 0;
      if (this.landing) {
        const dx = this.landing.x - this.pos.x, dz = this.landing.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d > 2) { wx = dx / d; wz = dz / d; }
        this.yaw = Math.atan2(-wx, -wz);
      }
      airMove(this, dt, wx, wz);
      this.animate(dt, 0, game.camera.position);
      return;
    }
    if (this.state !== 'ground') return;

    this.updateReload(now);
    if (this.healEnd && now >= this.healEnd) { this.hp = Math.min(200, this.hp + MEDKIT.heal); this.meds--; this.healEnd = 0; }
    this.glooCd -= dt;

    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.25 + Math.random() * 0.15; this.think(game, now); }

    let wx = 0, wz = 0, speed = 6, jump = false;
    const e = this.enemy;

    if (e && e.alive) {
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, d = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(-dx, -dz);
      this.yaw += angleDiff(this.yaw, want) * Math.min(1, dt * (4 + this.skill * 6));
      this.pitch = Math.atan2(e.pos.y - this.pos.y, d);
      // strafe + range management
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = 0.5 + Math.random() * 1.2; if (Math.random() < 0.15 * this.skill) jump = true; }
      const range = this.weapon ? this.weapon.def.range : 2;
      const pref = this.weapon ? (this.weapon.def.kind === 'shotgun' ? 6 : this.weapon.def.kind === 'sniper' ? 70 : Math.min(28, range * 0.35)) : 1.2;
      let fwd = d > pref * 1.3 ? 1 : d < pref * 0.6 ? -0.6 : 0;
      if (!this.weapon && this.hp < 120) fwd = -1; // unarmed & hurt: run
      const nx = dx / d, nz = dz / d;
      wx = nx * fwd + -nz * this.strafe * 0.8;
      wz = nz * fwd + nx * this.strafe * 0.8;
      speed = this.healEnd ? 3 : 5.5;

      // shoot
      if (now > this.reactUntil && Math.abs(angleDiff(this.yaw, want)) < 0.25 && d < range * 1.05) {
        this.burstT -= dt;
        if (this.burstT < 0) {
          this.pauseT -= dt;
          if (this.pauseT < 0) { this.burstT = 0.4 + Math.random() * 0.9; this.pauseT = 0.25 + Math.random() * 0.6 * (1.2 - this.skill); }
        } else if (this.weapon || d < 2) {
          this.eye(tmpO);
          const aimY = e.pos.y + (Math.random() < this.skill * 0.25 ? 1.6 : 1.1);
          tmpD.set(e.pos.x - tmpO.x, aimY - tmpO.y, e.pos.z - tmpO.z).normalize();
          const err = 0.012 + (1 - this.skill) * 0.05 + (e.state !== 'ground' ? 0.04 : 0);
          if (fireWeapon(game, this, tmpO, tmpD, now, err)) this.healEnd = 0;
        }
      }
      // skills + grenades
      if (skillReady(game, this)) {
        const h = HEROES[this.hero].skill;
        if ((h === 'shield' && this.hp < 120 && this.lastDamagedAt > now - 1) || (h === 'aura' && this.hp < 130) || (h === 'dash' && fwd !== 0 && Math.random() < 0.01)) useSkill(game, this);
      }
      this.nadeCd -= dt;
      if (this.frags > 0 && this.nadeCd <= 0 && d > 9 && d < 32 && Math.random() < 0.004 + this.skill * 0.004) {
        game.grenades.throwAt(this, e.pos.x, e.pos.y, e.pos.z);
        this.nadeCd = 7;
      }
      // pop a gloo wall when hurt under fire
      if (this.gloo > 0 && this.hp < 110 && this.glooCd <= 0 && this.lastDamagedAt > now - 1 && Math.random() < 0.02 + this.skill * 0.03) {
        placeGloo(game, this);
        this.glooCd = 8;
      }
    } else if (this.goal) {
      const dx = this.goal.x - this.pos.x, dz = this.goal.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 0.8) {
        wx = dx / d; wz = dz / d;
        speed = this.goalKind === 'zone' || d > 30 ? 8.5 : 6;
        this.yaw += angleDiff(this.yaw, Math.atan2(-wx, -wz)) * Math.min(1, dt * 6);
        this.pitch *= 0.9;
      } else if (this.goalKind === 'loot' && this.lootTarget) {
        this.tryPickup(game);
      } else {
        this.goal = null;
      }
    }

    // obstacle detour: slide sideways if not making progress
    if (this.detourT > 0) {
      this.detourT -= dt;
      const c = Math.cos(this.detour), s = Math.sin(this.detour);
      const rx = wx * c - wz * s, rz = wx * s + wz * c;
      wx = rx; wz = rz;
    }
    this.stuckT += dt;
    if (this.stuckT > 0.8) {
      const moved = Math.hypot(this.pos.x - this.lastCheck.x, this.pos.z - this.lastCheck.z);
      if ((wx || wz) && moved < speed * 0.8 * 0.3) {
        this.detour = (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2 + Math.random() * 0.6);
        this.detourT = 0.7 + Math.random() * 0.8;
        jump = Math.random() < 0.4;
      }
      this.lastCheck.copy(this.pos);
      this.stuckT = 0;
    }

    const len = Math.hypot(wx, wz);
    if (len > 1) { wx /= len; wz /= len; }
    speed *= speedMult(game, this);
    if (this.goalKind === 'zone' && !e && HEROES[this.hero].skill === 'dash' && game.zone.outside(this.pos.x, this.pos.z)) useSkill(game, this);
    const sp = groundMove(this, dt, wx, wz, speed, jump);
    this.animate(dt, sp, game.camera.position);
  }

  think(game, now) {
    // targets: nearest visible enemy
    let best = null, bestD = this.weapon ? Math.min(110, this.weapon.def.range * 1.1) : 18;
    this.eye(tmpO);
    for (const c of game.characters) {
      if (c === this || !c.alive || c.state === 'plane') continue;
      const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
      if (d >= bestD) continue;
      // players in the air are hard to spot
      if (c.state !== 'ground' && d > 45) continue;
      if (!lineOfSight(tmpO.x, tmpO.y, tmpO.z, c.pos.x, c.pos.y + 1.3, c.pos.z)) continue;
      best = c; bestD = d;
    }
    // retaliate against whoever is shooting us, even if we can't see them yet
    if (!best && this.lastHitBy?.alive && this.lastDamagedAt > now - 3) best = this.lastHitBy;
    if (best !== this.enemy) {
      if (best && !this.enemy) this.reactUntil = now + 0.35 + (1 - this.skill) * 0.7;
      this.enemy = best;
    }
    if (best) {
      // unarmed with no enemy close: go find a gun instead
      if (!this.weapon && bestD > 6) this.enemy = null;
      else return;
    }

    // heal when safe
    if (this.meds > 0 && this.hp < 130 && !this.healEnd && !this.reloading) { this.healEnd = now + MEDKIT.time; }
    // reload when safe
    const w = this.weapon;
    if (w && w.mag < w.def.mag * 0.5) this.startReload(now);
    // switch to the loaded/better gun
    if (this.weapons[1 - this.slot] && (!w || (w.mag === 0 && this.ammo[w.def.ammo] === 0))) this.switchSlot(1 - this.slot, now);

    const zone = game.zone;
    const zoneUrgent = zone.active && (zone.outside(this.pos.x, this.pos.z) ||
      (zone.outsideNext(this.pos.x, this.pos.z, 5) && (zone.stage === 'shrink' || zone.timer < 20 + this.aggression * 15)));
    if (zoneUrgent) {
      if (this.goalKind !== 'zone' || !this.goal || zone.outsideNext(this.goal.x, this.goal.z, 5)) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * zone.next.r * 0.6;
        this.goal = { x: zone.next.x + Math.cos(a) * r, z: zone.next.z + Math.sin(a) * r };
        this.goalKind = 'zone';
      }
      return;
    }
    if (this.goalKind === 'zone' && this.goal) return; // keep heading in

    // loot
    if (!this.lootTarget || !game.loot.items.includes(this.lootTarget)) {
      const need = !this.weapon ? 80 : 45;
      this.lootTarget = game.loot.nearest(this.pos.x, this.pos.z, need, (it) => Math.abs(it.y - this.pos.y) < 2 && wants(this, it) && (!zone.active || !zone.outsideNext(it.x, it.z)));
    }
    if (this.lootTarget) {
      this.goal = { x: this.lootTarget.x, z: this.lootTarget.z };
      this.goalKind = 'loot';
      return;
    }
    // wander inside the (next) safe area, drifting toward the center late game
    if (!this.goal || this.goalKind !== 'wander') {
      const c = zone.active ? zone.next : { x: 0, z: 0, r: 200 };
      const a = Math.random() * Math.PI * 2, r = Math.random() * c.r * 0.7;
      this.goal = { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
      this.goalKind = 'wander';
    }
  }

  tryPickup(game) {
    const it = this.lootTarget;
    this.lootTarget = null;
    this.goal = null;
    if (!game.loot.items.includes(it) || Math.hypot(it.x - this.pos.x, it.z - this.pos.z) > 1.8) return;
    game.loot.remove(it);
    const back = applyItem(this, it);
    if (back) game.loot.spawn(back, this.pos.x + 0.8, this.pos.z, this.pos.y);
    // grab anything else useful right here
    const more = game.loot.nearest(this.pos.x, this.pos.z, 2.5, (x) => wants(this, x));
    if (more) { this.lootTarget = more; this.goal = { x: more.x, z: more.z }; this.goalKind = 'loot'; }
  }
}
