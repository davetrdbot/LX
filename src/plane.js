import * as THREE from 'three';
import { MAP } from './config.js';

// Transport plane that flies a straight line across the island.
export class Plane {
  constructor(scene) {
    const a = Math.random() * Math.PI * 2;
    const off = (Math.random() - 0.5) * 120;
    const L = MAP.islandRadius + 120;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(off);
    this.start = dir.clone().multiplyScalar(-L).add(side).setY(MAP.planeHeight);
    this.end = dir.clone().multiplyScalar(L).add(side).setY(MAP.planeHeight);
    this.dir = dir;
    this.speed = 48;
    this.length = this.start.distanceTo(this.end);
    this.t = 0; // meters traveled
    this.pos = this.start.clone();
    this.done = false;

    const g = new THREE.Group();
    const body = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
    const accent = new THREE.MeshLambertMaterial({ color: 0xffb400 });
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 22, 12), body);
    fus.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.2, 4, 12), body);
    nose.rotation.x = -Math.PI / 2; nose.position.z = -13;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 0.5, 4), accent);
    wing.position.set(0, -0.5, -1);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 5, 3), accent);
    tail.position.set(0, 3, 10);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(10, 0.4, 2.5), body);
    stab.position.set(0, 1, 10);
    for (const x of [-7, 7]) {
      const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 3.5, 10), new THREE.MeshLambertMaterial({ color: 0x555555 }));
      eng.rotation.x = Math.PI / 2; eng.position.set(x, -1.4, -2);
      g.add(eng);
    }
    g.add(fus, nose, wing, tail, stab);
    g.position.copy(this.start);
    g.lookAt(this.end);
    g.rotateY(Math.PI); // model nose points -Z
    this.mesh = g;
    scene.add(g);
  }

  update(dt) {
    if (this.done) return;
    this.t += this.speed * dt;
    if (this.t >= this.length) { this.t = this.length; this.done = true; }
    this.pos.copy(this.start).addScaledVector(this.dir, this.t);
    this.mesh.position.copy(this.pos);
  }

  overIsland() { return Math.hypot(this.pos.x, this.pos.z) < MAP.islandRadius + 10; }

  // meters along the path where the plane passes closest to (x, z)
  closestT(x, z) {
    const rel = new THREE.Vector3(x - this.start.x, 0, z - this.start.z);
    return Math.max(0, Math.min(this.length, rel.dot(this.dir)));
  }
}
