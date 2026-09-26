import { MAP, PLAYER } from './config.js';
import { itemLabel } from './loot.js';
import { input } from './input.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = {
      alive: $('aliveCount'), kills: $('killCount'), zone: $('zoneInfo'), hp: $('hpbar'), hpText: $('hptext'), armor: $('armorbar'),
      slots: [$('slot0'), $('slot1')], prompt: $('prompt'), banner: $('banner'), heal: $('healbar'), vign: $('vignette'),
      zoneTint: $('zoneTint'), feed: $('killfeed'), hit: $('hitmarker'), cross: $('crosshair'), scope: $('scope'),
      vest: $('vestIcon'), helm: $('helmIcon'), med: $('medIcon'), gloo: $('glooIcon'), pick: $('tPick'),
    };
    this.map = $('minimap');
    this.mctx = this.map.getContext('2d');
    this.bigMap = false;
    this.bannerT = 0;
    this.hitT = 0;
    this.hurtT = 0;
    this.mapT = 0;
    this.cache = {};
  }

  set(key, el, prop, val) {
    if (this.cache[key] === val) return;
    this.cache[key] = val;
    if (prop === 'text') el.textContent = val;
    else if (prop === 'html') el.innerHTML = val;
    else if (prop === 'width') el.style.width = val;
  }

  banner(text, secs = 2, small = false) {
    const b = this.el.banner;
    b.textContent = text;
    b.style.fontSize = small ? '18px' : '';
    b.classList.add('show');
    this.bannerT = secs;
  }

  hitmarker(head) {
    this.el.hit.classList.toggle('head', head);
    this.el.hit.style.opacity = 1;
    this.hitT = 0.15;
  }

  hurt() { this.hurtT = 0.35; }

  pulseCrosshair() {
    for (const [i, i2] of [[0, 'Y(-4px)'], [1, 'Y(4px)'], [2, 'X(-4px)'], [3, 'X(4px)']]) this.el.cross.children[i].style.transform = 'translate' + i2;
    clearTimeout(this.crossTo);
    this.crossTo = setTimeout(() => { for (const c of this.el.cross.children) c.style.transform = ''; }, 90);
  }

  feed(killer, victim, weapon, involvesPlayer) {
    const d = document.createElement('div');
    if (involvesPlayer) d.className = 'me';
    d.innerHTML = killer ? `${esc(killer)}<span class="gun">[${weapon}]</span>${esc(victim)}` : `${esc(victim)}<span class="gun">[ZONE]</span>`;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => d.remove(), 6000);
  }

  toggleMap() {
    this.bigMap = !this.bigMap;
    const m = this.map;
    if (this.bigMap) Object.assign(m.style, { width: 'min(80vw, 80vh)', height: 'min(80vw, 80vh)', top: '50%', right: '50%', transform: 'translate(50%, -50%)' });
    else Object.assign(m.style, { width: '', height: '', top: '', right: '', transform: '' });
    m.width = m.height = this.bigMap ? 640 : 180;
  }

  update(dt, game) {
    const p = game.player, now = game.time;
    this.set('alive', this.el.alive, 'text', String(game.aliveCount()));
    this.set('kills', this.el.kills, 'text', String(p.kills));
    this.set('zone', this.el.zone, 'text', game.zone.label());
    this.el.zone.classList.toggle('warn', game.zone.active && game.zone.outside(p.pos.x, p.pos.z));

    const hpPct = Math.max(0, p.hp / PLAYER.maxHp) * 100;
    this.set('hp', this.el.hp, 'width', hpPct + '%');
    this.el.hp.classList.toggle('low', hpPct < 30);
    this.set('hpt', this.el.hpText, 'text', String(Math.max(0, Math.ceil(p.hp))));
    this.set('arm', this.el.armor, 'width', ((p.vest + p.helm) / 6) * 100 + '%');

    for (let i = 0; i < 2; i++) {
      const w = p.weapons[i], s = this.el.slots[i];
      s.classList.toggle('active', i === p.slot && !!w);
      const txt = w ? `${w.def.name}|${p.reloadEnd && i === p.slot ? 'RELOAD' : `${w.mag} / ${p.ammo[w.def.ammo]}`}` : 'EMPTY|' + (i === p.slot ? 'FISTS' : '');
      if (this.cache['slot' + i] !== txt) {
        this.cache['slot' + i] = txt;
        const [n, a] = txt.split('|');
        s.querySelector('.wname').textContent = n;
        s.querySelector('.ammo').textContent = a;
      }
    }
    const gear = (el, key, label, v) => { this.set(key, el, 'text', `${label} ${v}`); el.classList.toggle('on', v > 0); };
    gear(this.el.vest, 'vest', 'VEST', p.vest);
    gear(this.el.helm, 'helm', 'HELM', p.helm);
    gear(this.el.med, 'med', 'MED', p.meds);
    gear(this.el.gloo, 'gloo', 'GLOO', p.gloo);

    // prompts
    let prompt = '';
    if (p.state === 'plane') prompt = game.plane.overIsland() ? (input.touch ? 'Tap <b>JUMP</b> to drop' : 'Press <b>F</b> to jump') : 'Wait for the island…';
    else if (p.nearItem) prompt = (input.touch ? '' : '<b>[E]</b> ') + 'Pick up ' + itemLabel(p.nearItem);
    this.set('prompt', this.el.prompt, 'html', prompt);
    this.el.prompt.style.display = prompt ? 'block' : 'none';
    this.el.pick.style.display = p.nearItem ? 'block' : 'none';

    if (p.healEnd) {
      this.el.heal.style.display = 'block';
      this.el.heal.firstElementChild.style.width = (100 * (1 - (p.healEnd - now) / 2.5)) + '%';
    } else this.el.heal.style.display = 'none';

    this.el.scope.classList.toggle('on', !!p.isScoped());
    this.el.cross.style.display = p.isScoped() || p.state !== 'ground' ? 'none' : '';

    if ((this.bannerT -= dt) <= 0) this.el.banner.classList.remove('show');
    if ((this.hitT -= dt) <= 0) this.el.hit.style.opacity = 0;
    this.hurtT -= dt;
    this.el.vign.style.opacity = this.hurtT > 0 ? 1 : p.hp < 50 && p.alive ? 0.5 : 0;
    this.el.zoneTint.style.opacity = game.zone.active && game.zone.outside(p.pos.x, p.pos.z) && p.alive ? 1 : 0;

    if ((this.mapT -= dt) <= 0) { this.mapT = 0.05; this.drawMap(game); }
  }

  drawMap(game) {
    const c = this.mctx, W = this.map.width, p = game.player;
    const big = this.bigMap;
    // big map shows the whole island; minimap is centered on the player
    const scale = big ? W / ((MAP.islandRadius + 40) * 2) : W / 220;
    const cx = big ? 0 : p.state === 'plane' ? game.plane.pos.x : p.pos.x;
    const cz = big ? 0 : p.state === 'plane' ? game.plane.pos.z : p.pos.z;
    const X = (x) => W / 2 + (x - cx) * scale, Y = (z) => W / 2 + (z - cz) * scale;
    c.clearRect(0, 0, W, W);
    c.fillStyle = '#1f6f9a'; c.fillRect(0, 0, W, W);
    c.fillStyle = '#e8d39a'; c.beginPath(); c.arc(X(0), Y(0), (MAP.islandRadius + 30) * scale, 0, 7); c.fill();
    c.fillStyle = '#4c7a3a'; c.beginPath(); c.arc(X(0), Y(0), MAP.islandRadius * scale, 0, 7); c.fill();

    c.font = `${big ? 13 : 9}px sans-serif`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,.85)';
    for (const t of game.towns) {
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(X(t.x), Y(t.z), t.spread * scale, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.9)'; c.fillText(t.name, X(t.x), Y(t.z));
    }

    const z = game.zone;
    if (z.active) {
      c.strokeStyle = '#ffffff'; c.lineWidth = big ? 2 : 1.5;
      c.beginPath(); c.arc(X(z.next.x), Y(z.next.z), z.next.r * scale, 0, 7); c.stroke();
      c.strokeStyle = '#3f8cff'; c.lineWidth = big ? 3 : 2;
      c.beginPath(); c.arc(X(z.cur.x), Y(z.cur.z), z.cur.r * scale, 0, 7); c.stroke();
      // guide line to the safe zone
      if (z.outsideNext(p.pos.x, p.pos.z) && p.alive) {
        c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255,255,255,.7)';
        c.beginPath(); c.moveTo(X(p.pos.x), Y(p.pos.z)); c.lineTo(X(z.next.x), Y(z.next.z)); c.stroke(); c.setLineDash([]);
      }
    }
    if (p.state === 'plane' || !game.plane.done) {
      c.strokeStyle = 'rgba(255,180,0,.8)'; c.setLineDash([6, 4]); c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(X(game.plane.start.x), Y(game.plane.start.z)); c.lineTo(X(game.plane.end.x), Y(game.plane.end.z)); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#ffb400'; c.beginPath(); c.arc(X(game.plane.pos.x), Y(game.plane.pos.z), 4, 0, 7); c.fill();
    }
    if (game.airdrop && !game.airdrop.opened) {
      c.fillStyle = '#ff3b3b'; c.fillRect(X(game.airdrop.x) - 4, Y(game.airdrop.z) - 4, 8, 8);
    }
    // gunshot pings
    for (const pg of game.pings) {
      const a = 1 - (game.time - pg.t) / 2;
      if (a <= 0) continue;
      c.fillStyle = `rgba(255,70,70,${a})`; c.beginPath(); c.arc(X(pg.x), Y(pg.z), 3, 0, 7); c.fill();
    }
    // player arrow
    if (p.state !== 'plane') {
      c.save(); c.translate(X(p.pos.x), Y(p.pos.z)); c.rotate(-p.yaw);
      c.fillStyle = '#ffb400'; c.strokeStyle = '#000'; c.lineWidth = 1;
      c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
