import * as THREE from 'three';
import { WEAPONS, AMMO_PICKUP, AMMO_NAMES } from './config.js';

const RARITY_COLORS = [0xbfbfbf, 0x4fd06b, 0x3fa9ff, 0xc56bff, 0xffb400];

// item: { type: 'gun'|'ammo'|'med'|'vest'|'helm'|'gloo', key?, ammo?, amount?, lvl? }
export function itemLabel(it) {
  switch (it.type) {
    case 'gun': return WEAPONS[it.key].name;
    case 'ammo': return `${AMMO_NAMES[it.ammo]} ×${it.amount}`;
    case 'med': return `MEDKIT ×${it.amount}`;
    case 'vest': return `VEST LV${it.lvl}`;
    case 'helm': return `HELMET LV${it.lvl}`;
    case 'gloo': return `GLOO WALL ×${it.amount}`;
  }
  return '?';
}

function rarity(it) {
  if (it.type === 'gun') return WEAPONS[it.key].rarity + 1;
  if (it.type === 'vest' || it.type === 'helm') return it.lvl;
  if (it.type === 'gloo') return 2;
  return 0;
}

const geoCache = {};
function itemMesh(it) {
  const g = new THREE.Group();
  const col = RARITY_COLORS[Math.min(4, rarity(it))];
  let body;
  if (it.type === 'gun') {
    const d = WEAPONS[it.key];
    body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, d.len + 0.2), new THREE.MeshLambertMaterial({ color: d.color }));
    body.rotation.y = Math.PI / 2;
  } else if (it.type === 'ammo') {
    body = new THREE.Mesh(geoCache.ammo ||= new THREE.BoxGeometry(0.35, 0.25, 0.25), new THREE.MeshLambertMaterial({ color: { smg: 0xd9a520, ar: 0x6b8e23, sg: 0xb22222, sn: 0x4682b4 }[it.ammo] }));
  } else if (it.type === 'med') {
    body = new THREE.Mesh(geoCache.med ||= new THREE.BoxGeometry(0.4, 0.3, 0.3), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.41, 0.08, 0.2), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    body.add(cross);
  } else if (it.type === 'vest') {
    body = new THREE.Mesh(geoCache.vest ||= new THREE.BoxGeometry(0.5, 0.55, 0.2), new THREE.MeshLambertMaterial({ color: 0x4a5a3a }));
  } else if (it.type === 'helm') {
    body = new THREE.Mesh(geoCache.helm ||= new THREE.SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3d4a2f }));
  } else {
    body = new THREE.Mesh(geoCache.gloo ||= new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshLambertMaterial({ color: 0x9ee7ff, emissive: 0x225566 }));
  }
  body.position.y = 0.45;
  g.add(body);
  const ring = new THREE.Mesh(
    geoCache.ring ||= new THREE.RingGeometry(0.45, 0.6, 20),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  g.add(ring);
  const beam = new THREE.Mesh(
    geoCache.beam ||= new THREE.CylinderGeometry(0.05, 0.05, 2.5, 5, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.25 })
  );
  beam.position.y = 1.25;
  g.add(beam);
  g.userData.body = body;
  return g;
}

// Weighted pick by tier.
function rollItem(tier) {
  const r = Math.random();
  const guns = [['G18', 'MP40', 'M1887'], ['MP40', 'M1887', 'G18', 'M4A1'], ['M4A1', 'AK', 'MP40', 'M1887'], ['M4A1', 'AK', 'AWM', 'M1887']][Math.min(3, tier)];
  if (r < 0.34) return { type: 'gun', key: guns[Math.floor(Math.random() * guns.length)] };
  if (r < 0.58) {
    const ammo = ['smg', 'ar', 'sg', 'sn'][Math.floor(Math.random() * (tier >= 2 ? 4 : 3))];
    return { type: 'ammo', ammo, amount: AMMO_PICKUP[ammo] };
  }
  if (r < 0.72) return { type: 'med', amount: 1 + (Math.random() < 0.3 ? 1 : 0) };
  if (r < 0.82) return { type: 'vest', lvl: Math.min(3, 1 + Math.floor(Math.random() * (tier + 1) * 0.8)) };
  if (r < 0.92) return { type: 'helm', lvl: Math.min(3, 1 + Math.floor(Math.random() * (tier + 1) * 0.8)) };
  return { type: 'gloo', amount: 2 };
}

export class LootManager {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
  }

  spawn(it, x, z, y = 0) {
    it.x = x; it.z = z; it.y = y;
    it.mesh = itemMesh(it);
    it.mesh.position.set(x, y, z);
    it.phase = Math.random() * 6;
    this.scene.add(it.mesh);
    this.items.push(it);
    return it;
  }

  populate(spots) {
    for (const s of spots) {
      const n = 1 + (Math.random() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const it = rollItem(s.tier);
        const ox = (Math.random() - 0.5) * 1.6, oz = (Math.random() - 0.5) * 1.6;
        this.spawn(it, s.x + ox, s.z + oz, s.y || 0);
        if (it.type === 'gun') {
          const a = WEAPONS[it.key].ammo;
          this.spawn({ type: 'ammo', ammo: a, amount: AMMO_PICKUP[a] }, s.x + ox + 0.7, s.z + oz, s.y || 0);
        }
      }
    }
  }

  remove(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    this.scene.remove(it.mesh);
  }

  // Drops everything a dead character carried in a little scatter.
  dropInventory(ch) {
    const out = [];
    for (const w of ch.weapons) if (w) out.push({ type: 'gun', key: w.key });
    for (const k in ch.ammo) if (ch.ammo[k] > 0) out.push({ type: 'ammo', ammo: k, amount: ch.ammo[k] });
    if (ch.meds) out.push({ type: 'med', amount: ch.meds });
    if (ch.gloo) out.push({ type: 'gloo', amount: ch.gloo });
    if (ch.vest) out.push({ type: 'vest', lvl: ch.vest });
    if (ch.helm) out.push({ type: 'helm', lvl: ch.helm });
    out.forEach((it, i) => {
      const a = (i / out.length) * Math.PI * 2;
      this.spawn(it, ch.pos.x + Math.cos(a) * 1.1, ch.pos.z + Math.sin(a) * 1.1, ch.pos.y);
    });
  }

  nearest(x, z, maxD, filter) {
    let best = null, bd = maxD;
    for (const it of this.items) {
      if (it.falling) continue;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd && (!filter || filter(it))) { bd = d; best = it; }
    }
    return best;
  }

  update(dt, t) {
    for (const it of this.items) {
      const b = it.mesh.userData.body;
      b.rotation.y += dt * 1.2;
      b.position.y = 0.45 + Math.sin(t * 2 + it.phase) * 0.08;
      it.mesh.visible = it.mesh.position.distanceToSquared(this.focus || it.mesh.position) < 140 * 140;
    }
  }
}

// Would this item be useful to this character? (auto-pickup + bot logic)
export function wants(ch, it) {
  switch (it.type) {
    case 'gun': {
      if (ch.weapons.some((w) => w && w.key === it.key)) return false;
      if (ch.weapons.some((w) => !w)) return true;
      const worst = Math.min(...ch.weapons.map((w) => w.def.rarity));
      return WEAPONS[it.key].rarity > worst;
    }
    case 'ammo': return ch.weapons.some((w) => w && w.def.ammo === it.ammo) || ch.ammo[it.ammo] < 30;
    case 'med': return ch.meds < 6;
    case 'vest': return it.lvl > ch.vest;
    case 'helm': return it.lvl > ch.helm;
    case 'gloo': return ch.gloo < 8;
  }
  return false;
}

// Applies the item. Returns an item to drop back on the ground (swapped gun/armor) or null.
export function applyItem(ch, it) {
  switch (it.type) {
    case 'gun': {
      let replace = -1;
      if (!ch.weapons.some((w) => !w)) {
        // replace the active slot for players, worst gun for bots
        replace = ch.isPlayer ? ch.slot : ch.weapons.reduce((bi, w, i, arr) => (w.def.rarity < arr[bi].def.rarity ? i : bi), 0);
        ch.slot = replace;
      }
      const old = ch.giveWeapon(it.key, false);
      if (old) ch.ammo[old.def.ammo] += old.mag;
      const w = ch.weapon;
      const take = Math.min(w.def.mag, ch.ammo[w.def.ammo]);
      w.mag = take || Math.ceil(w.def.mag / 2);
      ch.ammo[w.def.ammo] -= take;
      return old ? { type: 'gun', key: old.key } : null;
    }
    case 'ammo': ch.ammo[it.ammo] += it.amount; return null;
    case 'med': ch.meds += it.amount; return null;
    case 'gloo': ch.gloo += it.amount; return null;
    case 'vest': { const old = ch.vest; ch.vest = it.lvl; ch.refreshGear(); return old ? { type: 'vest', lvl: old } : null; }
    case 'helm': { const old = ch.helm; ch.helm = it.lvl; ch.refreshGear(); return old ? { type: 'helm', lvl: old } : null; }
  }
  return null;
}
