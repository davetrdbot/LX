// Rolling-hill heightfield. Towns/cabins register flat "pads" so buildings sit on level ground.
import { MAP } from './config.js';

const pads = []; // {x, z, r}
export function addPad(x, z, r) { pads.push({ x, z, r }); }

// 2D value noise with smooth interpolation
function hash(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
export function fbm(x, z, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s;
}

const smooth = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

// Cache on a grid: heightAt is called a lot (movement, bullets, placement).
const CELL = 2, N = Math.ceil(((MAP.islandRadius + 60) * 2) / CELL) + 2, OFF = MAP.islandRadius + 60;
let grid = null;

function rawHeight(x, z) {
  const d = Math.hypot(x, z);
  const R = MAP.islandRadius;
  // hills: broad shapes + a couple of ridges
  let h = Math.pow(fbm(x * 0.006 + 11, z * 0.006 - 7, 4), 1.6) * 38;
  h += Math.max(0, fbm(x * 0.018, z * 0.018, 3) - 0.45) * 14;
  // shoreline falls off toward the beach
  h *= 1 - smooth(R - 70, R - 5, d);
  // flatten pads
  let m = 1;
  for (const p of pads) {
    const pd = Math.hypot(x - p.x, z - p.z);
    m = Math.min(m, smooth(p.r, p.r + 22, pd));
  }
  // beach dips slightly into the sea
  const beach = -smooth(R - 5, R + 30, d) * 1.2;
  return h * m + beach;
}

export function bakeTerrain() {
  grid = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid[j * N + i] = rawHeight(i * CELL - OFF, j * CELL - OFF);
}

export function heightAt(x, z) {
  if (!grid) return 0;
  const gx = (x + OFF) / CELL, gz = (z + OFF) / CELL;
  const i = Math.floor(gx), j = Math.floor(gz);
  if (i < 0 || j < 0 || i >= N - 1 || j >= N - 1) return -1.2;
  const fx = gx - i, fz = gz - j;
  const a = grid[j * N + i], b = grid[j * N + i + 1], c = grid[(j + 1) * N + i], d = grid[(j + 1) * N + i + 1];
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// March a ray against the terrain. Returns hit distance or null.
export function terrainRay(ox, oy, oz, dx, dy, dz, maxT) {
  const step = 2.5;
  let prevT = 0;
  for (let t = step; t <= maxT + step; t += step) {
    const tt = Math.min(t, maxT);
    const y = oy + dy * tt;
    if (y < heightAt(ox + dx * tt, oz + dz * tt)) {
      // refine
      let lo = prevT, hi = tt;
      for (let k = 0; k < 5; k++) {
        const mid = (lo + hi) / 2;
        if (oy + dy * mid < heightAt(ox + dx * mid, oz + dz * mid)) hi = mid; else lo = mid;
      }
      return hi;
    }
    prevT = tt;
    if (tt >= maxT) break;
  }
  return null;
}
