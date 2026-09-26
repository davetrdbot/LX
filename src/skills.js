import * as THREE from 'three';
import { HEROES, PLAYER } from './config.js';
import { sfxSkill } from './audio.js';

// Active character skills: dash, healing pulse, barrier dome.
const domeGeo = new THREE.SphereGeometry(1, 24, 14);
const ringGeo = new THREE.RingGeometry(0.8, 1, 40);

export function skillReady(game, ch) { return game.time >= (ch.skillReadyAt || 0); }

export function useSkill(game, ch) {
  const h = HEROES[ch.hero];
  if (!h || !ch.alive || ch.state !== 'ground' || !skillReady(game, ch)) return false;
  ch.skillReadyAt = game.time + h.cd;
  ch.skillEnd = game.time + h.dur;
  ch.skillActive = h.skill;
  if (ch.isPlayer || ch.pos.distanceTo(game.player.pos) < 50) sfxSkill(h.skill);
  if (h.skill === 'shield') {
    const mesh = new THREE.Mesh(domeGeo, new THREE.MeshStandardMaterial({
      color: 0xffc640, emissive: 0x6b4a00, transparent: true, opacity: 0.32, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false,
    }));
    const r = 2.6;
    mesh.scale.setScalar(0.1);
    mesh.position.set(ch.pos.x, ch.pos.y, ch.pos.z);
    game.scene.add(mesh);
    game.shields.push({ x: ch.pos.x, y: ch.pos.y + 0.6, z: ch.pos.z, r, hp: 600, owner: ch, mesh, end: ch.skillEnd, born: game.time });
  } else if (h.skill === 'aura') {
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x3ee07a, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ch.mesh.add(ring);
    ch.auraRing = ring;
  }
  return true;
}

export function speedMult(game, ch) {
  if (!ch.skillActive || game.time > ch.skillEnd) return 1;
  return ch.skillActive === 'dash' ? 1.6 : ch.skillActive === 'aura' ? 1.15 : 1;
}

export function updateSkills(game, dt) {
  for (const ch of game.characters) {
    if (!ch.skillActive) continue;
    if (game.time > ch.skillEnd || !ch.alive) {
      if (ch.auraRing) { ch.mesh.remove(ch.auraRing); ch.auraRing = null; }
      ch.skillActive = null;
      continue;
    }
    if (ch.skillActive === 'aura') {
      ch.hp = Math.min(PLAYER.maxHp, ch.hp + 6 * dt);
      const k = (game.time * 1.5) % 1;
      ch.auraRing.scale.setScalar(1 + k * 4);
      ch.auraRing.position.y = 0.05;
      ch.auraRing.material.opacity = 0.7 * (1 - k);
    }
  }
  for (const s of [...game.shields]) {
    const age = game.time - s.born;
    s.mesh.scale.setScalar(Math.min(1, age * 6) * s.r);
    s.mesh.material.opacity = 0.18 + 0.2 * (s.hp / 600);
    if (game.time > s.end || s.hp <= 0) {
      game.scene.remove(s.mesh);
      game.shields.splice(game.shields.indexOf(s), 1);
      game.effects.impact(s.mesh.position, 'gloo', 10);
    }
  }
}

// Ray vs dome shells (only blocks rays that start outside the dome). Returns {t, shield} or null.
export function raycastShields(game, o, d, maxT) {
  let best = null;
  for (const s of game.shields) {
    const fx = o.x - s.x, fy = o.y - s.y, fz = o.z - s.z;
    const c = fx * fx + fy * fy + fz * fz - s.r * s.r;
    if (c <= 0) continue; // shooter is inside
    const b = fx * d.x + fy * d.y + fz * d.z;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < maxT && (!best || t < best.t)) best = { t, shield: s };
  }
  return best;
}
