// Tiny synthesized sound kit — no audio files needed.
let ctx = null, master = null, noiseBuf = null;

export function initAudio() {
  if (ctx) { ctx.resume?.(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { ctx = null; }
}

function noise(dur, freq, q, vol, type = 'lowpass') {
  if (!ctx) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(freq, dur, vol, type = 'sine', slide = 0) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

const GUN_SOUNDS = {
  pistol: [0.12, 2200, 0.6], smg: [0.1, 2600, 0.5], ar: [0.16, 1800, 0.7], shotgun: [0.35, 900, 1.0], sniper: [0.6, 1200, 1.1],
};

// distance: meters from listener; 0 = own shot
export function sfxShot(kind, distance = 0) {
  if (!ctx) return;
  const [dur, freq, vol] = GUN_SOUNDS[kind] || GUN_SOUNDS.ar;
  const att = distance ? Math.max(0, 1 - distance / 220) ** 2 : 1;
  if (att < 0.02) return;
  noise(dur, distance > 60 ? freq * 0.5 : freq, 0.8, vol * att);
  tone(distance ? 90 : 140, dur * 0.6, 0.35 * vol * att, 'triangle', -80);
}

export const sfxHit = (head) => tone(head ? 1500 : 900, 0.07, 0.25, 'square');
export const sfxHurt = () => tone(180, 0.15, 0.3, 'sawtooth', -60);
export const sfxPickup = () => { tone(660, 0.06, 0.2); setTimeout(() => tone(990, 0.08, 0.2), 60); };
export const sfxReload = () => { noise(0.05, 3000, 2, 0.3, 'bandpass'); setTimeout(() => noise(0.06, 2000, 2, 0.35, 'bandpass'), 250); };
export const sfxEmpty = () => tone(1200, 0.03, 0.15, 'square');
export const sfxKill = () => { tone(520, 0.1, 0.25, 'triangle'); setTimeout(() => tone(780, 0.18, 0.25, 'triangle'), 90); };
export const sfxZone = () => { tone(440, 0.25, 0.2, 'square'); setTimeout(() => tone(440, 0.25, 0.2, 'square'), 350); };
export const sfxGloo = () => { noise(0.4, 600, 1, 0.5); tone(300, 0.3, 0.2, 'sine', 400); };
export const sfxHeal = () => tone(520, 0.3, 0.15, 'sine', 300);
export const sfxChute = () => noise(0.5, 400, 0.5, 0.4);
export const sfxWin = () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.35, 0.25, 'triangle'), i * 140));
