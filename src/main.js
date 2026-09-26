import * as THREE from 'three';
import { MAP, BOT_NAMES, ZONE_PHASES, AMMO_PICKUP } from './config.js';
import { buildWorld } from './world.js';
import { Grass } from './grass.js';
import { loadAssets } from './assets.js';
import { GFX, QUALITY, setQuality } from './quality.js';
import { LootManager } from './loot.js';
import { Zone } from './zone.js';
import { Effects } from './effects.js';
import { Plane } from './plane.js';
import { Player } from './player.js';
import { Bot } from './bot.js';
import { Hud } from './hud.js';
import { input, initInput } from './input.js';
import { updateGloos } from './combat.js';
import { groundAt } from './physics.js';
import { initAudio, sfxKill, sfxZone, sfxHurt, sfxWin, sfxHit } from './audio.js';

// ?speed=N runs the simulation N times per frame (handy for testing)
const SPEED = Math.max(1, Math.min(8, parseInt(new URLSearchParams(location.search).get('speed')) || 1));

class Game {
  constructor() {
    const container = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ antialias: GFX.antialias && devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, GFX.pixelRatio));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = GFX.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.72;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 5000);
    addEventListener('resize', () => {
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(innerWidth, innerHeight);
    });

    const w = buildWorld(this.scene, this.renderer);
    this.sun = w.sun;
    this.towns = w.towns;
    this.clouds = w.clouds;
    this.beacon = w.beacon;
    this.grass = new Grass(this.scene, w.houseRects, GFX.grass);
    this.loot = new LootManager(this.scene);
    this.loot.populate(w.lootSpots);
    this.zone = new Zone(this.scene);
    this.zone.onPhase = (i, stage) => this.onZonePhase(i, stage);
    this.effects = new Effects(this.scene, this.camera);
    this.plane = new Plane(this.scene);
    this.hud = new Hud();
    this.gloos = [];
    this.pings = [];
    this.time = 0;
    this.running = false;
    this.over = false;
    this.airdrop = null;
    this.characters = [];

    initInput(this.renderer.domElement);
    this.camera.position.set(0, 220, 300);
    this.camera.lookAt(0, 0, 0);
    this.clock = new THREE.Clock();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  start(name) {
    this.player = new Player(name || 'Survivor');
    this.characters.push(this.player);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const spots = this.loot.items.length ? this.loot.items : [{ x: 0, z: 0 }];
    for (let i = 0; i < MAP.botCount; i++) {
      const b = new Bot(names[i % names.length] + (i >= names.length ? i : ''));
      // choose a landing spot: mostly near loot, biased toward the flight path
      let best = null, bd = Infinity;
      for (let k = 0; k < 6; k++) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        const t = this.plane.closestT(s.x, s.z);
        const px = this.plane.start.x + this.plane.dir.x * t, pz = this.plane.start.z + this.plane.dir.z * t;
        const d = Math.hypot(s.x - px, s.z - pz) + Math.random() * 120;
        if (d < bd) { bd = d; best = s; }
      }
      b.landing = { x: best.x + (Math.random() - 0.5) * 6, z: best.z + (Math.random() - 0.5) * 6 };
      // jump when the remaining horizontal distance can be covered during the fall
      b.jumpAt = Math.max(0, this.plane.closestT(b.landing.x, b.landing.z) - 40 - Math.random() * 60);
      this.characters.push(b);
    }
    for (const c of this.characters) this.scene.add(c.mesh);
    this.running = true;
    this.time = 0;
    this.banner('WELCOME TO LX — JUMP WHEN READY', 3);
  }

  aliveCount() { return this.characters.filter((c) => c.alive).length; }

  banner(t, s, small) { this.hud.banner(t, s, small); }

  ping(x, z) {
    if (!this.player || Math.hypot(x - this.player.pos.x, z - this.player.pos.z) > 110) return;
    this.pings.push({ x, z, t: this.time });
    if (this.pings.length > 40) this.pings.shift();
  }

  jumpFromPlane(ch) {
    ch.state = 'fall';
    ch.pos.copy(this.plane.pos);
    ch.pos.y -= 3;
    ch.velY = 0;
    ch.mesh.visible = true;
    if (ch.isPlayer) {
      this.banner('SKYDIVING — STEER WITH WASD', 2, true);
      if (!this.zoneStartAt) this.zoneStartAt = this.time + 20;
    }
  }

  // Central damage entry point. Returns damage dealt.
  damage(victim, raw, head, attacker, weaponName, hitPos) {
    if (!victim.alive) return 0;
    const armored = head ? victim.helm > 0 : victim.vest > 0;
    const dealt = victim.takeDamage(raw, head, attacker);
    victim.lastDamagedAt = this.time;
    this.effects.impact(hitPos, 'blood', 4);
    if (attacker?.isPlayer) {
      this.effects.damageNumber(hitPos, dealt, head, armored);
      this.hud.hitmarker(head);
      if (head) sfxHit(true);
    }
    if (victim.isPlayer) { this.hud.hurt(); sfxHurt(); }
    if (victim.hp <= 0) this.kill(victim, attacker, weaponName);
    return dealt;
  }

  kill(victim, killer, weaponName) {
    victim.alive = false;
    victim.hp = 0;
    victim.state = 'dead';
    victim.deathTime = this.time;
    victim.healEnd = 0;
    victim.onDeath();
    this.loot.dropInventory(victim);
    victim.weapons = [null, null];
    victim.refreshGear();
    if (killer && killer !== victim) killer.kills++;
    const involves = victim.isPlayer || killer?.isPlayer;
    this.hud.feed(killer?.name, victim.name, weaponName, involves);
    if (killer?.isPlayer) {
      sfxKill();
      this.banner(`ELIMINATED ${victim.name.toUpperCase()}  ·  ${killer.kills} KILL${killer.kills > 1 ? 'S' : ''}`, 2);
    }
    if (victim.isPlayer) this.endGame(false, killer);
    else if (this.player.alive && this.aliveCount() === 1) this.endGame(true);
  }

  endGame(won, killer) {
    if (this.over) return;
    this.over = true;
    const rank = won ? 1 : this.aliveCount() + 1;
    if (won) { sfxWin(); this.banner('LX CHAMPION!', 5); }
    setTimeout(() => {
      document.exitPointerLock?.();
      document.getElementById('endTitle').textContent = won ? 'LX CHAMPION!' : 'ELIMINATED';
      document.getElementById('endRank').textContent = '#' + rank;
      const p = this.player;
      document.getElementById('endStats').innerHTML =
        `Kills: <b>${p.kills}</b> · Survived: <b>${fmt(this.time)}</b>` + (killer && !won ? `<br>Eliminated by <b>${escapeHtml(killer.name)}</b>` : '');
      document.getElementById('endscreen').classList.remove('hidden');
    }, won ? 3000 : 2200);
  }

  onZonePhase(i, stage) {
    if (stage === 'wait') {
      if (i > 0) this.banner('NEW SAFE ZONE MARKED', 2);
      if (i === 1) this.spawnAirdrop();
    } else {
      this.banner(i === ZONE_PHASES.length - 1 ? 'FINAL CIRCLE CLOSING!' : 'ZONE IS SHRINKING!', 2.5);
      sfxZone();
    }
  }

  spawnAirdrop() {
    const z = this.zone.next;
    const a = Math.random() * Math.PI * 2, r = Math.random() * z.r * 0.6;
    const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r;
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 1.6), new THREE.MeshLambertMaterial({ color: 0xd63b2a }));
    box.position.y = 0.6; box.castShadow = true;
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.25, 1.65), new THREE.MeshLambertMaterial({ color: 0xffb400 }));
    stripe.position.y = 0.6;
    const chute = new THREE.Mesh(new THREE.SphereGeometry(2.4, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
    chute.position.y = 4.5;
    const smoke = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 1.2, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.35, depthWrite: false }));
    smoke.position.y = 20; smoke.visible = false;
    g.add(box, stripe, chute, smoke);
    const y = groundAt(x, zz, 999, 0.8);
    g.position.set(x, 120, zz);
    this.scene.add(g);
    this.airdrop = { x, z: zz, ground: y, mesh: g, chute, smoke, landed: false, opened: false };
    this.banner('AIRDROP INCOMING!', 3);
  }

  updateAirdrop(dt) {
    const d = this.airdrop;
    if (!d || d.opened) return;
    if (!d.landed) {
      d.mesh.position.y -= 5 * dt;
      if (d.mesh.position.y <= d.ground) {
        d.mesh.position.y = d.ground;
        d.landed = true;
        d.chute.visible = false;
        d.smoke.visible = true;
      }
      return;
    }
    // open when anyone walks up to it
    for (const c of this.characters) {
      if (!c.alive || c.state !== 'ground') continue;
      if (Math.hypot(c.pos.x - d.x, c.pos.z - d.z) < 2.2) {
        d.opened = true;
        this.scene.remove(d.mesh);
        const items = [
          { type: 'gun', key: 'AWM' }, { type: 'ammo', ammo: 'sn', amount: AMMO_PICKUP.sn * 2 },
          { type: 'vest', lvl: 3 }, { type: 'helm', lvl: 3 }, { type: 'med', amount: 3 }, { type: 'gloo', amount: 4 },
        ];
        items.forEach((it, i) => {
          const a = (i / items.length) * Math.PI * 2;
          this.loot.spawn(it, d.x + Math.cos(a) * 1.3, d.z + Math.sin(a) * 1.3, d.ground);
        });
        if (c.isPlayer) this.banner('AIRDROP OPENED!', 1.5, true);
        break;
      }
    }
  }

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.running) for (let i = 0; i < SPEED; i++) this.step(dt);
    else {
      // lobby: slow orbit over the island
      const t = performance.now() / 1000 * 0.05;
      this.camera.position.set(Math.sin(t) * 320, 170, Math.cos(t) * 320);
      this.camera.lookAt(0, 0, 0);
      this.scene.fog.near = 400; this.scene.fog.far = 1600;
    }
    this.renderer.render(this.scene, this.camera);
  }

  step(dt) {
    this.time += dt;
    const now = this.time;
    const p = this.player;

    // plane + drops
    this.plane.update(dt);
    for (const c of this.characters) {
      if (c.state !== 'plane') continue;
      c.pos.copy(this.plane.pos);
      if (!c.isPlayer && this.plane.t >= c.jumpAt && this.plane.overIsland()) this.jumpFromPlane(c);
      if (this.plane.done) this.jumpFromPlane(c); // forced exit
    }
    if (this.plane.done && this.plane.mesh.visible) {
      this.plane.mesh.visible = false;
    }
    if (this.zoneStartAt && !this.zone.active && this.time >= this.zoneStartAt) {
      this.zone.start();
      this.banner('SAFE ZONE MARKED — CHECK YOUR MAP', 2.5);
    }

    p.update(dt, this, now, this.camera);
    for (const c of this.characters) if (!c.isPlayer) c.update(dt, this, now);
    input.pressed.clear();

    // zone damage (ticks once a second)
    this.zone.update(dt);
    if (this.zone.active) {
      this.zoneTick = (this.zoneTick || 0) + dt;
      if (this.zoneTick >= 1) {
        this.zoneTick -= 1;
        for (const c of this.characters) {
          if (!c.alive || c.state === 'plane') continue;
          if (this.zone.outside(c.pos.x, c.pos.z)) {
            c.hp -= this.zone.dps;
            if (c.isPlayer) { this.hud.hurt(); sfxHurt(); }
            if (c.hp <= 0) this.kill(c, null, 'ZONE');
          }
        }
      }
    }

    // dead bodies play their death animation, then fade out
    for (const c of this.characters) {
      if (c.alive) continue;
      const age = this.time - c.deathTime;
      if (age < 10) c.animate(dt, 0, this.camera.position);
      else c.mesh.visible = false;
    }

    updateGloos(this, dt);
    this.updateAirdrop(dt);
    this.loot.update(dt, this.time);
    this.effects.update(dt);
    this.hud.update(dt, this);

    // keep the shadow camera around the player
    const focus = p.state === 'plane' ? this.plane.pos : p.pos;
    this.sun.target.position.set(focus.x, focus.y > 60 ? 0 : focus.y, focus.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sun.userData.dir, 150);
    this.grass.update(dt, focus);
    this.loot.focus = focus;
    for (const c of this.clouds.children) { c.position.x += dt * 2; if (c.position.x > 700) c.position.x = -700; }
    this.beacon.visible = Math.sin(this.time * 4) > 0;
    // see further from the sky
    const alt = Math.max(0, this.camera.position.y - 20);
    this.scene.fog.near = 160 + alt * 1.5;
    this.scene.fog.far = 650 + alt * 4;
  }
}

function fmt(t) { const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }

// ---------- boot ----------
const game = new Game();
window.__lx = game;
const startBtn = document.getElementById('startBtn');
for (const b of document.querySelectorAll('#quality button')) {
  b.classList.toggle('on', b.dataset.q === QUALITY);
  b.addEventListener('click', () => { if (b.dataset.q !== QUALITY) setQuality(b.dataset.q); });
}
loadAssets((f) => { startBtn.textContent = `LOADING ${Math.round(f * 100)}%`; })
  .then(() => { startBtn.disabled = false; startBtn.textContent = 'START'; if (window.__autostart) startBtn.click(); })
  .catch((e) => { startBtn.textContent = 'LOAD FAILED — REFRESH'; console.error(e); });
const nameInput = document.getElementById('nameInput');
try { nameInput.value = localStorage.getItem('lx-name') || ''; } catch {}
document.getElementById('startBtn').addEventListener('click', () => {
  const name = nameInput.value.trim().slice(0, 14) || 'Survivor';
  try { localStorage.setItem('lx-name', name); } catch {}
  initAudio();
  document.getElementById('lobby').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  if (!input.touch) game.renderer.domElement.requestPointerLock?.();
  game.start(name);
});
document.getElementById('againBtn').addEventListener('click', () => {
  try { sessionStorage.setItem('lx-autostart', '1'); } catch {}
  location.reload();
});
try {
  if (sessionStorage.getItem('lx-autostart')) {
    sessionStorage.removeItem('lx-autostart');
    window.__autostart = true;
  }
} catch {}
