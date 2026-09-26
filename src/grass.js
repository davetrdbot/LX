import * as THREE from 'three';
import { heightAt, fbm } from './terrain.js';
import { MAP } from './config.js';

// Wind-swayed grass tufts that follow the camera focus (only nearby grass is ever drawn).
export class Grass {
  constructor(scene, houseRects, count = 14000, radius = 48) {
    this.count = count;
    this.radius = radius;
    this.houseRects = houseRects;
    this.center = new THREE.Vector2(1e9, 1e9);

    // a tuft = 4 tapered blades
    const pos = [], col = [];
    const base = new THREE.Color(0x3d6b22), tip = new THREE.Color(0xa8c95a);
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * Math.PI + Math.random() * 0.4;
      const ox = (Math.random() - 0.5) * 0.25, oz = (Math.random() - 0.5) * 0.25;
      const w = 0.06, h = 0.45 + Math.random() * 0.3, lean = (Math.random() - 0.5) * 0.2;
      const cx = Math.cos(a) * w, cz = Math.sin(a) * w;
      pos.push(ox - cx, 0, oz - cz, ox + cx, 0, oz + cz, ox + lean, h, oz + lean * 0.5);
      pos.push(ox + cx, 0, oz + cz, ox - cx, 0, oz - cz, ox + lean, h, oz + lean * 0.5); // back face
      for (let k = 0; k < 2; k++) col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    // normals facing up make the grass shade like the ground instead of flickering
    const n = geo.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);

    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.uniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.8 + wp.x * 0.35 + wp.z * 0.25) * 0.12 + sin(uTime * 3.1 + wp.x) * 0.04;
        transformed.x += sway * position.y;
        transformed.z += sway * 0.5 * position.y;`);
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.m4 = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.e = new THREE.Euler();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
    this.mesh.setColorAt(0, this.c.set(0x6a9a3a)); // allocate instanceColor before first compile
    this.mesh.count = 0;
  }

  inHouse(x, z) {
    for (const r of this.houseRects) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return true;
    return false;
  }

  rebuild(cx, cz) {
    this.center.set(cx, cz);
    const R = this.radius, lim = MAP.islandRadius - 16;
    let i = 0;
    // deterministic per world cell so grass doesn't "swim" when re-centering
    const cell = 0.75;
    const x0 = Math.floor((cx - R) / cell), x1 = Math.ceil((cx + R) / cell);
    const z0 = Math.floor((cz - R) / cell), z1 = Math.ceil((cz + R) / cell);
    for (let gx = x0; gx <= x1 && i < this.count; gx++) {
      for (let gz = z0; gz <= z1 && i < this.count; gz++) {
        const hsh = Math.sin(gx * 127.1 + gz * 311.7) * 43758.5453;
        const r1 = hsh - Math.floor(hsh), r2 = (hsh * 7.13) % 1, r3 = (hsh * 3.71) % 1;
        const x = (gx + r1) * cell, z = (gz + Math.abs(r2)) * cell;
        if ((x - cx) ** 2 + (z - cz) ** 2 > R * R) continue;
        if (Math.hypot(x, z) > lim) continue;
        const density = fbm(x * 0.05, z * 0.05, 2);
        if (density < 0.38 + Math.abs(r3) * 0.2) continue;
        if (this.inHouse(x, z)) continue;
        const y = heightAt(x, z);
        const sc = 0.7 + density * 0.9;
        this.e.set(0, r1 * 6.28, 0); this.q.setFromEuler(this.e);
        this.m4.compose(this.v.set(x, y - 0.02, z), this.q, this.s.set(sc, sc * (0.8 + Math.abs(r3) * 0.6), sc));
        this.mesh.setMatrixAt(i, this.m4);
        this.mesh.setColorAt(i, this.c.setHSL(0.22 + r1 * 0.06, 0.55, 0.42 + Math.abs(r2) * 0.12));
        i++;
      }
    }
    this.mesh.count = i;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt, focus) {
    if (!this.count) { this.mesh.visible = false; return; }
    this.uniforms.uTime.value += dt;
    if (this.center.distanceTo(new THREE.Vector2(focus.x, focus.z)) > 14) this.rebuild(focus.x, focus.z);
    this.mesh.visible = focus.y - heightAt(focus.x, focus.z) < 60;
  }
}
