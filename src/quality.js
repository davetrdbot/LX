// Graphics presets. ?q=low|med|high overrides the saved choice.
const touch = matchMedia('(pointer: coarse)').matches;
let q = new URLSearchParams(location.search).get('q');
try { q = q || localStorage.getItem('lx-quality'); } catch {}
if (!['low', 'med', 'high'].includes(q)) q = touch ? 'med' : 'high';

export const QUALITY = q;
export const GFX = {
  low: { pixelRatio: 1, shadows: false, shadowMap: 512, grass: 0, antialias: false },
  med: { pixelRatio: 1.25, shadows: true, shadowMap: 1024, grass: 7000, antialias: false },
  high: { pixelRatio: 1.75, shadows: true, shadowMap: 2048, grass: 14000, antialias: true },
}[q];

export function setQuality(v) {
  try { localStorage.setItem('lx-quality', v); } catch {}
  location.reload();
}
