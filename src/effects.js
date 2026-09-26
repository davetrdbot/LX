import * as THREE from 'three';

// Pooled short-lived visuals: tracers, muzzle flashes, impact bits, floating damage numbers.
export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.tracers = [];
    this.bits = [];
    this.flashes = [];
    const tGeo = new THREE.BoxGeometry(1, 1, 1);
    tGeo.translate(0, 0, -0.5); // extends along -Z from origin
    this.tracerGeo = tGeo;
    this.tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9, fog: false });
    this.bitGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
    this.bitMats = {
      dust: new THREE.MeshBasicMaterial({ color: 0xd8c9a8 }),
      blood: new THREE.MeshBasicMaterial({ color: 0xd11a2a }),
      gloo: new THREE.MeshBasicMaterial({ color: 0xaeeaff }),
    };
    this.flashMat = new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.95 });
    this.flashGeo = new THREE.SphereGeometry(0.12, 6, 4);
    this.dmgLayer = document.getElementById('dmgNumbers');
    this.v = new THREE.Vector3();
  }

  tracer(from, to) {
    let t = this.tracers.find((x) => !x.mesh.visible);
    if (!t) {
      t = { mesh: new THREE.Mesh(this.tracerGeo, this.tracerMat), life: 0 };
      this.scene.add(t.mesh);
      this.tracers.push(t);
    }
    const len = from.distanceTo(to);
    t.mesh.position.copy(from);
    t.mesh.lookAt(to);
    t.mesh.scale.set(0.025, 0.025, len);
    t.mesh.visible = true;
    t.life = 0.06;
  }

  flash(pos) {
    let f = this.flashes.find((x) => !x.mesh.visible);
    if (!f) {
      f = { mesh: new THREE.Mesh(this.flashGeo, this.flashMat), life: 0 };
      this.scene.add(f.mesh);
      this.flashes.push(f);
    }
    f.mesh.position.copy(pos);
    f.mesh.scale.setScalar(1 + Math.random());
    f.mesh.visible = true;
    f.life = 0.04;
  }

  impact(pos, kind = 'dust', n = 5) {
    for (let i = 0; i < n; i++) {
      let b = this.bits.find((x) => !x.mesh.visible);
      if (!b) {
        if (this.bits.length > 200) return;
        b = { mesh: new THREE.Mesh(this.bitGeo, this.bitMats.dust), vel: new THREE.Vector3(), life: 0 };
        this.scene.add(b.mesh);
        this.bits.push(b);
      }
      b.mesh.material = this.bitMats[kind];
      b.mesh.position.copy(pos);
      b.vel.set((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4);
      b.mesh.visible = true;
      b.life = 0.4 + Math.random() * 0.3;
    }
  }

  damageNumber(worldPos, amount, head, armored) {
    this.v.copy(worldPos).project(this.camera);
    if (this.v.z > 1) return;
    const el = document.createElement('div');
    el.textContent = amount;
    if (head) el.className = 'head';
    else if (armored) el.className = 'armor';
    el.style.left = ((this.v.x * 0.5 + 0.5) * innerWidth + (Math.random() - 0.5) * 30) + 'px';
    el.style.top = ((-this.v.y * 0.5 + 0.5) * innerHeight) + 'px';
    this.dmgLayer.appendChild(el);
    setTimeout(() => el.remove(), 800);
  }

  update(dt) {
    for (const t of this.tracers) if (t.mesh.visible && (t.life -= dt) <= 0) t.mesh.visible = false;
    for (const f of this.flashes) if (f.mesh.visible && (f.life -= dt) <= 0) f.mesh.visible = false;
    for (const b of this.bits) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      b.vel.y -= 15 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      if (b.life <= 0 || b.mesh.position.y < 0) b.mesh.visible = false;
    }
  }
}
