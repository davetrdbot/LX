import { MAP, PLAYER } from './config.js';
import { resolveCircle, groundAt } from './physics.js';

// Ground locomotion with gravity, step-up onto crates/roofs and island bounds.
// wishX/wishZ is a world-space direction (length <= 1). Returns horizontal speed achieved.
export function groundMove(ch, dt, wishX, wishZ, speed, wantJump) {
  const ox = ch.pos.x, oz = ch.pos.z;
  ch.pos.x += wishX * speed * dt;
  ch.pos.z += wishZ * speed * dt;
  resolveCircle(ch.pos, PLAYER.radius, PLAYER.height);

  if (wantJump && ch.onGround) { ch.velY = PLAYER.jumpVel; ch.onGround = false; }
  ch.velY -= PLAYER.gravity * dt;
  ch.pos.y += ch.velY * dt;
  const g = groundAt(ch.pos.x, ch.pos.z, ch.pos.y, PLAYER.radius);
  if (ch.pos.y <= g) { ch.pos.y = g; ch.velY = 0; ch.onGround = true; }
  else if (ch.pos.y > g + 0.05) ch.onGround = false;

  clampIsland(ch.pos);
  return Math.hypot(ch.pos.x - ox, ch.pos.z - oz) / Math.max(dt, 1e-4);
}

// Skydive + parachute. Returns true on landing.
export function airMove(ch, dt, wishX, wishZ) {
  if (ch.state === 'fall') {
    ch.velY = Math.max(ch.velY - 30 * dt, -32);
    ch.pos.x += wishX * 20 * dt;
    ch.pos.z += wishZ * 20 * dt;
    if (ch.pos.y < MAP.chuteOpenHeight) { ch.state = 'chute'; ch.velY = -9; ch.onChute?.(); }
  } else {
    ch.velY += (-8.5 - ch.velY) * Math.min(1, dt * 3);
    ch.pos.x += wishX * 13 * dt;
    ch.pos.z += wishZ * 13 * dt;
  }
  ch.pos.y += ch.velY * dt;
  if (ch.pos.y < 6) resolveCircle(ch.pos, PLAYER.radius, PLAYER.height);
  clampIsland(ch.pos);
  const g = groundAt(ch.pos.x, ch.pos.z, ch.pos.y, PLAYER.radius);
  if (ch.pos.y <= g) {
    ch.pos.y = g;
    ch.velY = 0;
    ch.state = 'ground';
    ch.onGround = true;
    return true;
  }
  return false;
}

export function clampIsland(p) {
  const R = MAP.islandRadius + 12;
  const d = Math.hypot(p.x, p.z);
  if (d > R) { p.x *= R / d; p.z *= R / d; }
}
