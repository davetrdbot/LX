// Axis-aligned box colliders + the handful of queries the game needs.
// Characters are treated as vertical cylinders; bullets are rays.

export const colliders = [];

export function addBox(minX, minY, minZ, maxX, maxY, maxZ, extra = {}) {
  const c = { minX, minY, minZ, maxX, maxY, maxZ, ...extra };
  colliders.push(c);
  return c;
}

export function removeCollider(c) {
  const i = colliders.indexOf(c);
  if (i >= 0) colliders.splice(i, 1);
}

// Pushes a cylinder (pos is feet position) out of any box it overlaps. Mutates pos.
// Returns true if something was hit.
export function resolveCircle(pos, radius, height) {
  let hit = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (pos.y >= c.maxY - 0.05 || pos.y + height <= c.minY) continue;
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    let dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    hit = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * radius;
      pos.z = cz + (dz / d) * radius;
    } else {
      // center is inside the box: push out along the shallowest axis
      const pl = pos.x - c.minX, pr = c.maxX - pos.x, pb = pos.z - c.minZ, pf = c.maxZ - pos.z;
      const m = Math.min(pl, pr, pb, pf);
      if (m === pl) pos.x = c.minX - radius;
      else if (m === pr) pos.x = c.maxX + radius;
      else if (m === pb) pos.z = c.minZ - radius;
      else pos.z = c.maxZ + radius;
    }
  }
  return hit;
}

// Highest walkable surface under a cylinder whose feet are at y (so you can hop onto crates).
export function groundAt(x, z, y, radius) {
  let g = 0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.maxY > y + 0.35 || c.maxY <= g) continue;
    if (x + radius * 0.6 < c.minX || x - radius * 0.6 > c.maxX || z + radius * 0.6 < c.minZ || z - radius * 0.6 > c.maxZ) continue;
    g = c.maxY;
  }
  return g;
}

// Ray vs all boxes. Returns { t, collider } or null.
export function raycastBoxes(ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT, bestC = null;
  const ix = 1 / (dx || 1e-9), iy = 1 / (dy || 1e-9), iz = 1 / (dz || 1e-9);
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    let t1 = (c.minX - ox) * ix, t2 = (c.maxX - ox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
    t1 = (c.minY - oy) * iy; t2 = (c.maxY - oy) * iy;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (c.minZ - oz) * iz; t2 = (c.maxZ - oz) * iz;
    tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax >= Math.max(tmin, 0) && tmin < best) {
      const t = Math.max(tmin, 0);
      if (t < best) { best = t; bestC = c; }
    }
  }
  return bestC ? { t: best, collider: bestC } : null;
}

// Ray vs vertical capsule-ish character (cylinder with a head sphere). Returns { t, head } or null.
export function raycastCharacter(ox, oy, oz, dx, dy, dz, maxT, ch) {
  const p = ch.pos;
  // head sphere
  const hx = p.x, hy = p.y + 1.6, hz = p.z, hr = 0.22;
  let res = null;
  const tHead = raySphere(ox, oy, oz, dx, dy, dz, hx, hy, hz, hr);
  if (tHead !== null && tHead < maxT) res = { t: tHead, head: true };
  // body cylinder (horizontal distance test, then height check)
  const r = 0.38;
  const fx = ox - p.x, fz = oz - p.z;
  const a = dx * dx + dz * dz;
  if (a > 1e-9) {
    const b = 2 * (fx * dx + fz * dz);
    const cc = fx * fx + fz * fz - r * r;
    const disc = b * b - 4 * a * cc;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0 || t > maxT) continue;
        const y = oy + dy * t;
        if (y >= p.y && y <= p.y + 1.42) {
          if (!res || t < res.t) res = { t, head: false };
          break;
        }
      }
    }
  }
  return res;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const fx = ox - cx, fy = oy - cy, fz = oz - cz;
  const b = fx * dx + fy * dy + fz * dz;
  const c = fx * fx + fy * fy + fz * fz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}

// True if nothing blocks the segment between two points.
export function lineOfSight(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return true;
  return !raycastBoxes(ax, ay, az, dx / len, dy / len, dz / len, len);
}
