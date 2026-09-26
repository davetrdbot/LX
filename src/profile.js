import { RANKS } from './config.js';

// Account progression saved in localStorage: level/XP and ranked points.
const KEY = 'lx-profile';
const DEFAULT = { xp: 0, level: 1, rp: 0, matches: 0, wins: 0, kills: 0, hero: 'kai' };

export function loadProfile() {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT }; }
}
export function saveProfile(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {} }

export const xpForLevel = (lvl) => 300 + lvl * 150;
export function rankOf(rp) {
  let r = RANKS[0];
  for (const k of RANKS) if (rp >= k.rp) r = k;
  return r;
}

// Applies a finished match. Returns a summary for the end screen.
export function recordMatch(p, { placement, kills, survived, won, total }) {
  const rank = rankOf(p.rp);
  const xp = Math.round(60 + kills * 45 + (total + 1 - placement) * 8 + survived / 3 + (won ? 250 : 0));
  const placePts = placement === 1 ? 60 : placement <= 3 ? 40 : placement <= 5 ? 28 : placement <= 10 ? 16 : placement <= 20 ? 6 : 0;
  const rpGain = placePts + Math.min(kills, 10) * 6 - rank.fee;
  p.matches++; p.kills += kills; if (won) p.wins++;
  p.rp = Math.max(0, p.rp + rpGain);
  p.xp += xp;
  let leveled = false;
  while (p.xp >= xpForLevel(p.level)) { p.xp -= xpForLevel(p.level); p.level++; leveled = true; }
  saveProfile(p);
  return { xp, rpGain, leveled, rank: rankOf(p.rp), prevRank: rank };
}
