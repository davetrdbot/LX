// Core tuning for LX. All distances are meters, times are seconds.

export const MAP = {
  islandRadius: 330,
  planeHeight: 190,
  chuteOpenHeight: 60,
  botCount: 29,
};

export const PLAYER = {
  maxHp: 200,
  radius: 0.4,
  height: 1.8,
  walkSpeed: 6,
  sprintSpeed: 9,
  jumpVel: 7,
  gravity: 22,
};

// ammo: which ammo type the gun eats. pellets > 1 => shotgun.
export const WEAPONS = {
  G18:   { name: 'G18',   kind: 'pistol',  ammo: 'smg', dmg: 18, rate: 0.14, mag: 15, reload: 1.2, spread: 0.02,  range: 60,  pellets: 1, color: 0x333333, len: 0.35, rarity: 0 },
  MP40:  { name: 'MP40',  kind: 'smg',     ammo: 'smg', dmg: 17, rate: 0.075, mag: 25, reload: 1.8, spread: 0.035, range: 70,  pellets: 1, color: 0x4a4a4a, len: 0.6, rarity: 1 },
  M1887: { name: 'M1887', kind: 'shotgun', ammo: 'sg',  dmg: 22, rate: 0.9, mag: 2,  reload: 2.0, spread: 0.09,  range: 28,  pellets: 8, color: 0x6b3f1f, len: 0.8, rarity: 1 },
  M4A1:  { name: 'M4A1',  kind: 'ar',      ammo: 'ar',  dmg: 28, rate: 0.11, mag: 30, reload: 2.1, spread: 0.018, range: 160, pellets: 1, color: 0x2c2c2c, len: 0.9, rarity: 2 },
  AK:    { name: 'AK',    kind: 'ar',      ammo: 'ar',  dmg: 36, rate: 0.14, mag: 30, reload: 2.3, spread: 0.028, range: 150, pellets: 1, color: 0x7a4a22, len: 0.9, rarity: 2 },
  AWM:   { name: 'AWM',   kind: 'sniper',  ammo: 'sn',  dmg: 115, rate: 1.6, mag: 5,  reload: 3.0, spread: 0.0,  range: 450, pellets: 1, color: 0x2f4f2f, len: 1.2, rarity: 3, scope: true },
};

export const AMMO_PICKUP = { smg: 40, ar: 45, sg: 10, sn: 8 };
export const AMMO_NAMES = { smg: 'SMG AMMO', ar: 'AR AMMO', sg: 'SHELLS', sn: 'SNIPER AMMO' };

export const ARMOR_REDUCTION = [0, 0.25, 0.4, 0.55];
export const HEADSHOT_MULT = 1.9;

export const MEDKIT = { heal: 75, time: 2.5 };
export const GLOO = { hp: 300, width: 4, height: 3, thickness: 0.6 };

// shrink phases: wait before shrink, shrink duration, radius fraction of current, damage/sec outside
export const ZONE_PHASES = [
  { wait: 45, shrink: 35, frac: 0.6, dps: 2 },
  { wait: 40, shrink: 30, frac: 0.55, dps: 4 },
  { wait: 35, shrink: 25, frac: 0.5, dps: 7 },
  { wait: 30, shrink: 20, frac: 0.45, dps: 11 },
  { wait: 25, shrink: 20, frac: 0.35, dps: 16 },
  { wait: 20, shrink: 20, frac: 0.0, dps: 25 },
];

export const BOT_NAMES = [
  'Viper', 'Kage', 'Nova', 'Blaze', 'Rook', 'Ghost', 'Ace', 'Jinx', 'Talon', 'Onyx', 'Zed', 'Mako', 'Ryu', 'Sable',
  'Kilo', 'Hex', 'Drift', 'Echo', 'Frost', 'Havoc', 'Indigo', 'Jolt', 'Karma', 'Lynx', 'Monk', 'Nyx', 'Orbit',
  'Pyro', 'Quill', 'Raze', 'Storm', 'Titan', 'Umbra', 'Volt', 'Wolf', 'Xeno', 'Yeti', 'Zion',
];

export const EP = { max: 200, mushroom: 50, rate: 4 }; // EP converts into HP at `rate` per second

export const FRAG = { fuse: 2.4, radius: 8, dmg: 150, throwSpeed: 19 };

// Playable characters, each with one active skill (original designs).
export const HEROES = {
  kai:  { name: 'KAI',  skill: 'dash',   title: 'DASH',          cd: 22, dur: 3,  desc: '+60% move speed for 3s', color: 0x2e86ab },
  nia:  { name: 'NIA',  skill: 'aura',   title: 'HEALING PULSE', cd: 45, dur: 8,  desc: 'Heal 6 HP/s and +15% speed for 8s', color: 0x3ee07a },
  rex:  { name: 'REX',  skill: 'shield', title: 'BARRIER DOME',  cd: 50, dur: 4,  desc: 'Bullet-proof dome (600 HP) for 4s', color: 0xffb400 },
};

export const RANKS = [
  { name: 'BRONZE', rp: 0, fee: 0 }, { name: 'SILVER', rp: 1000, fee: 10 }, { name: 'GOLD', rp: 1800, fee: 20 },
  { name: 'PLATINUM', rp: 2600, fee: 30 }, { name: 'DIAMOND', rp: 3400, fee: 40 }, { name: 'HEROIC', rp: 4200, fee: 50 },
  { name: 'GRANDMASTER', rp: 5000, fee: 60 },
];
