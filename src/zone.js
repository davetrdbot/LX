import * as THREE from 'three';
import { MAP, ZONE_PHASES } from './config.js';

// Shrinking safe zone. cur is the live circle, next is where it's heading.
export class Zone {
  constructor(scene) {
    const R = MAP.islandRadius + 60;
    this.cur = { x: 0, z: 0, r: R };
    this.from = { ...this.cur };
    this.next = { ...this.cur };
    this.phase = -1;
    this.stage = 'idle'; // idle | wait | shrink | done
    this.timer = 0;
    this.dps = 1;
    this.active = false;

    const geo = new THREE.CylinderGeometry(1, 1, 120, 96, 1, true);
    const mat = new THREE.MeshBasicMaterial({ color: 0x2a6cff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, fog: false });
    this.wall = new THREE.Mesh(geo, mat);
    this.wall.position.y = 60;
    this.wall.renderOrder = 5;
    this.wall.visible = false;
    scene.add(this.wall);

    const ringGeo = new THREE.RingGeometry(0.995, 1, 128);
    this.nextRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide, fog: false }));
    this.nextRing.rotation.x = -Math.PI / 2;
    this.nextRing.position.y = 0.1;
    this.nextRing.visible = false;
    scene.add(this.nextRing);
    this.syncMeshes();
  }

  start() {
    this.active = true;
    this.wall.visible = true;
    this.beginPhase(0);
  }

  beginPhase(i) {
    this.phase = i;
    const p = ZONE_PHASES[i];
    if (!p) { this.stage = 'done'; return; }
    this.stage = 'wait';
    this.timer = p.wait;
    this.dps = i === 0 ? 1 : ZONE_PHASES[i - 1].dps;
    const base = i === 0 ? { x: 0, z: 0, r: MAP.islandRadius * 0.95 } : this.cur;
    const nr = base.r * p.frac;
    // pick next center inside current circle so the new circle fits
    const a = Math.random() * Math.PI * 2, d = Math.random() * (base.r - nr) * 0.85;
    this.next = { x: base.x + Math.cos(a) * d, z: base.z + Math.sin(a) * d, r: Math.max(nr, 0.5) };
    this.nextRing.visible = true;
    this.onPhase?.(i, 'wait');
  }

  update(dt) {
    if (!this.active || this.stage === 'done') return;
    this.timer -= dt;
    const p = ZONE_PHASES[this.phase];
    if (this.stage === 'wait' && this.timer <= 0) {
      this.stage = 'shrink';
      this.timer = p.shrink;
      this.from = { ...this.cur };
      this.dps = p.dps;
      this.onPhase?.(this.phase, 'shrink');
    } else if (this.stage === 'shrink') {
      const k = 1 - Math.max(0, this.timer) / p.shrink;
      this.cur.x = this.from.x + (this.next.x - this.from.x) * k;
      this.cur.z = this.from.z + (this.next.z - this.from.z) * k;
      this.cur.r = this.from.r + (this.next.r - this.from.r) * k;
      if (this.timer <= 0) this.beginPhase(this.phase + 1);
    }
    this.syncMeshes();
  }

  syncMeshes() {
    this.wall.position.x = this.cur.x;
    this.wall.position.z = this.cur.z;
    this.wall.scale.set(this.cur.r, 1, this.cur.r);
    this.nextRing.position.x = this.next.x;
    this.nextRing.position.z = this.next.z;
    this.nextRing.scale.setScalar(this.next.r);
  }

  outside(x, z) { return Math.hypot(x - this.cur.x, z - this.cur.z) > this.cur.r; }
  outsideNext(x, z, margin = 0) { return Math.hypot(x - this.next.x, z - this.next.z) > this.next.r - margin; }

  label() {
    if (!this.active) return 'ZONE';
    if (this.stage === 'done') return 'FINAL ZONE';
    const t = Math.max(0, Math.ceil(this.timer));
    const mm = Math.floor(t / 60), ss = String(t % 60).padStart(2, '0');
    return this.stage === 'wait' ? `SHRINK IN ${mm}:${ss}` : `SHRINKING ${mm}:${ss}`;
  }
}
