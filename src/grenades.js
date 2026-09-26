import * as THREE from 'three';
import { FRAG } from './config.js';
import { colliders, lineOfSight } from './physics.js';
import { heightAt } from './terrain.js';
import { damageGloo } from './combat.js';
import { sfxBoom } from './audio.js';

const nadeGeo = new THREE.SphereGeometry(0.1, 10, 8);
const nadeMat = new THREE.MeshStandardMaterial({ color: 0x3f4a2a, roughness: 0.6, metalness: 0.3 });
const boomMat = new THREE.MeshBasicMaterial({ color: 0xffa030, transparent: true, opacity: 0.9, depthWrite: false });
const boomGeo = new THREE.SphereGeometry(1, 16, 10);

export class Grenades {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.booms = [];
  }

  // Throws the character's frag along (dirX, dirY, dirZ).
  throw(ch, dir, speed = FRAG.throwSpeed) {
    if (ch.frags <= 0 || ch.state !== 'ground') return false;
    ch.frags--;
    const mesh = new THREE.Mesh(nadeGeo, nadeMat);
    mesh.castShadow = true;
    const pos = new THREE.Vector3(ch.pos.x, ch.pos.y + 1.6, ch.pos.z);
    const vel = dir.clone().multiplyScalar(speed);
    vel.y += 3;
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.list.push({ pos, vel, t: 0, owner: ch, mesh });
    ch.onPunch?.();
    return true;
  }

  // Ballistic throw at a target point (used by bots): 38° launch angle.
  throwAt(ch, tx, ty, tz) {
    const dx = tx - ch.pos.x, dz = tz - ch.pos.z;
    const d = Math.hypot(dx, dz);
    const ang = 0.66, g = 22;
    const v = Math.min(26, Math.sqrt((g * d) / Math.sin(2 * ang)));
    const dir = new THREE.Vector3((dx / d) * Math.cos(ang), Math.sin(ang), (dz / d) * Math.cos(ang));
    const saved = this.list.length;
    this.throw(ch, dir, v);
    if (this.list.length > saved) this.list[this.list.length - 1].vel.y -= 3; // undo the default lob
  }

  update(dt) {
    for (const n of [...this.list]) {
      n.t += dt;
      n.vel.y -= 22 * dt;
      const prev = n.pos.clone();
      n.pos.addScaledVector(n.vel, dt);
      // bounce on boxes
      for (const c of colliders) {
        if (n.pos.x > c.minX && n.pos.x < c.maxX && n.pos.y > c.minY && n.pos.y < c.maxY && n.pos.z > c.minZ && n.pos.z < c.maxZ) {
          const wasX = prev.x > c.minX && prev.x < c.maxX, wasZ = prev.z > c.minZ && prev.z < c.maxZ, wasY = prev.y > c.minY && prev.y < c.maxY;
          if (!wasY) n.vel.y *= -0.35;
          else if (!wasX) n.vel.x *= -0.4;
          else if (!wasZ) n.vel.z *= -0.4;
          n.pos.copy(prev);
          break;
        }
      }
      const g = heightAt(n.pos.x, n.pos.z) + 0.1;
      if (n.pos.y < g) { n.pos.y = g; n.vel.y *= -0.3; n.vel.x *= 0.6; n.vel.z *= 0.6; }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += dt * 8;
      if (n.t >= FRAG.fuse) this.explode(n);
    }
    for (const b of [...this.booms]) {
      b.t += dt;
      const k = b.t / 0.45;
      b.mesh.scale.setScalar(1 + k * FRAG.radius * 0.7);
      b.mesh.material.opacity = 0.9 * (1 - k);
      if (k >= 1) { this.game.scene.remove(b.mesh); this.booms.splice(this.booms.indexOf(b), 1); }
    }
  }

  explode(n) {
    const game = this.game;
    this.list.splice(this.list.indexOf(n), 1);
    game.scene.remove(n.mesh);
    const p = n.pos;
    const mesh = new THREE.Mesh(boomGeo, boomMat.clone());
    mesh.position.copy(p);
    game.scene.add(mesh);
    this.booms.push({ mesh, t: 0 });
    game.effects.impact(p, 'dust', 24);
    const dPlayer = p.distanceTo(game.player.pos);
    sfxBoom(dPlayer);
    if (dPlayer < 25) game.shake = Math.max(game.shake || 0, 0.6 * (1 - dPlayer / 25));
    for (const c of game.characters) {
      if (!c.alive || c.state === 'plane') continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.y + 0.9 - p.y, c.pos.z - p.z);
      if (d > FRAG.radius) continue;
      if (!lineOfSight(p.x, p.y + 0.3, p.z, c.pos.x, c.pos.y + 1.0, c.pos.z)) continue;
      const hit = new THREE.Vector3(c.pos.x, c.pos.y + 1.2, c.pos.z);
      game.damage(c, FRAG.dmg * Math.pow(1 - d / FRAG.radius, 0.7), false, n.owner, 'FRAG', hit);
    }
    for (const col of [...game.gloos]) {
      const cx = (col.minX + col.maxX) / 2, cz = (col.minZ + col.maxZ) / 2;
      if (Math.hypot(cx - p.x, cz - p.z) < FRAG.radius) damageGloo(game, col, 450);
    }
  }
}
