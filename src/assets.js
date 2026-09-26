import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// Quaternius Universal Animation Library mannequin (CC0), dressed at runtime with an outfit shader.
const URL = 'assets/characters/AnimationLibrary_Godot_Standard.gltf';

export const assets = { base: null, clips: {}, ready: false };

// GLTFLoader strips dots from node names: 'DEF-spine.003' -> 'DEF-spine003'
const UPPER = /spine00[23]|neck|head|shoulder|upper_arm|forearm|hand|f_|thumb/;

// Split a full-body clip into upper-body and lower-body halves so we can aim while running.
function split(clip) {
  const up = clip.tracks.filter((t) => UPPER.test(t.name.split('.').slice(0, -1).join('.')));
  const low = clip.tracks.filter((t) => !UPPER.test(t.name.split('.').slice(0, -1).join('.')));
  return {
    full: clip,
    upper: new THREE.AnimationClip(clip.name + '@up', clip.duration, up),
    lower: new THREE.AnimationClip(clip.name + '@low', clip.duration, low),
  };
}

export function loadAssets(onProgress) {
  return new Promise((resolve, reject) => {
    new GLTFLoader().load(URL, (gltf) => {
      assets.base = gltf.scene;
      for (const c of gltf.animations) assets.clips[c.name] = split(c);
      assets.ready = true;
      resolve(assets);
    }, (e) => e.total && onProgress?.(e.loaded / e.total), reject);
  });
}

// ---------- outfit shader ----------
// Colors regions of the mannequin by bind-pose position: boots, pants, shirt, sleeves, skin, hair.
function outfitMaterial(src, o) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 });
  m.userData.outfit = o;
  m.onBeforeCompile = (sh) => {
    for (const k of ['skin', 'shirt', 'pants', 'boots', 'hair', 'accent']) sh.uniforms['u_' + k] = { value: new THREE.Color(o[k]) };
    sh.uniforms.u_sleeve = { value: o.longSleeve ? 1 : 0 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBind;
uniform vec3 u_skin, u_shirt, u_pants, u_boots, u_hair, u_accent;
uniform float u_sleeve;
float hsh(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 p = vBind; float ax = abs(p.x);
  vec3 c = u_shirt;
  if (p.y < 0.13) c = u_boots;
  else if (p.y < 0.98) {
    c = u_pants;
    if (p.y < 0.2) c = mix(u_boots, u_pants, 0.3);
    if (p.y > 0.93) c = u_accent; // belt
  }
  else if (ax > 0.2 && p.y > 1.2) {
    // arms (T-pose)
    float sleeveEnd = u_sleeve > 0.5 ? 0.72 : 0.42;
    c = ax < sleeveEnd ? u_shirt : u_skin;
    if (ax > 0.78) c = u_skin * 0.95;
  }
  else if (p.y > 1.47 && ax < 0.16) {
    c = u_skin;
    // hair cap: top and back of the head
    if (p.y > 1.71 || (p.y > 1.56 && p.z < -0.03)) c = u_hair;
  }
  else if (p.y > 1.4 && ax < 0.09 && p.z > 0.02) c = u_skin; // neckline
  // fabric grain
  c *= 0.93 + 0.07 * hsh(floor(p * 180.0));
  diffuseColor.rgb = c;
}`);
  };
  m.customProgramCacheKey = () => 'outfit';
  return m;
}

const SKINS = [0xf1c9a0, 0xe0ac69, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
const SHIRTS = [0xd7263d, 0x1b998b, 0x2e86ab, 0xf46036, 0x5b5f97, 0x3d3b30, 0x6a8d3a, 0x7b2d26, 0x0b3954, 0x8e44ad, 0xe8e8e8, 0x222222];
const PANTS = [0x2d3142, 0x3a3a3a, 0x4f5d75, 0x5c4033, 0x1f2833, 0x5a6b3c, 0x7a6a50];
const HAIR = [0x1a1a1a, 0x3b2314, 0x6b4423, 0xd9b36c, 0x8b1e1e, 0x222244];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function randomOutfit(isPlayer) {
  return {
    skin: pick(SKINS),
    shirt: isPlayer ? 0xff5a1f : pick(SHIRTS),
    pants: isPlayer ? 0x1f2833 : pick(PANTS),
    boots: 0x2a2018,
    hair: isPlayer ? 0x1a1a1a : pick(HAIR),
    accent: isPlayer ? 0xffb400 : 0x3a2a1a,
    longSleeve: Math.random() < 0.5,
  };
}

// ---------- per-character instance ----------
export function instantiate(outfit) {
  const root = SkeletonUtils.clone(assets.base);
  const bones = {};
  root.traverse((o) => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.material = outfitMaterial(o.material, outfit);
      o.castShadow = true;
      o.frustumCulled = false; // skinned bounds are unreliable
    }
  });
  root.rotation.y = Math.PI; // model faces +Z, game forward is -Z
  return { root, bones };
}

// Two-layer animation: lower body (locomotion) + upper body (aim / locomotion arms).
export class Animator {
  constructor(root) {
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = {};
    this.lower = null;
    this.upper = null;
    this.aimW = null;
  }

  act(name, part, loop = true) {
    const key = name + '@' + part;
    if (!this.actions[key]) {
      const c = assets.clips[name];
      if (!c) return null;
      const a = this.mixer.clipAction(c[part]);
      if (!loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[key] = a;
    }
    return this.actions[key];
  }

  setLower(name, fade = 0.2, speed = 1) {
    const a = this.act(name, 'lower', !/Death|Jump_Start|Jump_Land/.test(name));
    if (!a) return;
    a.timeScale = speed;
    if (this.lower === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.lower) this.lower.fadeOut(fade);
    this.lower = a;
  }

  // armed: blend Pistol_Aim_Up/Neutral/Down by pitch; unarmed: arms follow locomotion clip
  setUpper(name, fade = 0.2, speed = 1) {
    const a = this.act(name, 'upper', !/Death/.test(name));
    if (!a) return;
    a.timeScale = speed;
    if (this.upper === a) return;
    a.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.upper) this.upper.fadeOut(fade);
    this.upper = a;
  }

  setAim(pitch, armed) {
    const up = this.act('Pistol_Aim_Up', 'upper'), mid = this.act('Pistol_Aim_Neutral', 'upper'), dn = this.act('Pistol_Aim_Down', 'upper');
    if (!up || !mid || !dn) return;
    if (!armed) {
      if (this.aimW) { for (const a of [up, mid, dn]) a.fadeOut(0.15); this.aimW = null; }
      return;
    }
    if (!this.aimW) {
      for (const a of [up, mid, dn]) { a.reset().play(); a.setEffectiveWeight(0); }
      if (this.upper) { this.upper.fadeOut(0.15); this.upper = null; }
      this.aimW = true;
    }
    const k = THREE.MathUtils.clamp(pitch / 0.9, -1, 1);
    up.setEffectiveWeight(Math.max(0, k));
    dn.setEffectiveWeight(Math.max(0, -k));
    mid.setEffectiveWeight(1 - Math.abs(k));
  }

  oneShot(name, part = 'upper', weight = 1, speed = 1) {
    const key = name + '@' + part + '#once';
    let b = this.actions[key];
    if (!b) {
      const c = assets.clips[name];
      if (!c) return;
      b = this.mixer.clipAction(c[part].clone());
      b.setLoop(THREE.LoopOnce, 1);
      this.actions[key] = b;
    }
    b.stop().reset();
    b.timeScale = speed;
    b.setEffectiveWeight(weight).play();
    b.fadeOut(Math.max(0.1, b.getClip().duration / speed * 0.8));
  }

  update(dt) { this.mixer.update(dt); }
}
