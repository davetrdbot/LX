import * as THREE from 'three';

// Procedural canvas textures so the game ships with zero image files.
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, s, n, colors, rmin, rmax) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = rmin + Math.random() * (rmax - rmin);
    g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}

export function grassTexture() {
  return canvasTex(512, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    speckle(g, s, 9000, ['#e8f0e0', '#d6e3cc', '#f4f8ee', '#c9d9bd', '#ffffff'], 1, 3);
    // blade strokes
    g.lineWidth = 1;
    for (let i = 0; i < 2500; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      g.strokeStyle = Math.random() < 0.5 ? 'rgba(190,210,170,.6)' : 'rgba(255,255,255,.6)';
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 3, y - 3 - Math.random() * 5); g.stroke();
    }
  });
}

export function plasterTexture(base) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    speckle(g, s, 3000, ['rgba(0,0,0,.04)', 'rgba(255,255,255,.06)', 'rgba(0,0,0,.07)'], 1, 4);
    // grime at the bottom
    const grd = g.createLinearGradient(0, s * 0.75, 0, s);
    grd.addColorStop(0, 'rgba(60,40,20,0)'); grd.addColorStop(1, 'rgba(60,40,20,.25)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  });
}

export function brickTexture() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#8c8c86'; g.fillRect(0, 0, s, s);
    const bw = 32, bh = 14;
    for (let y = 0, row = 0; y < s; y += bh, row++) {
      for (let x = -(row % 2) * bw / 2; x < s; x += bw) {
        const l = 38 + Math.random() * 14;
        g.fillStyle = `hsl(${10 + Math.random() * 12}, 45%, ${l}%)`;
        g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }
    speckle(g, s, 1500, ['rgba(0,0,0,.08)', 'rgba(255,255,255,.05)'], 1, 3);
  });
}

export function roofTexture(base) {
  return canvasTex(256, (g, s) => {
    g.fillStyle = base; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, y + 13, s, 3);
      for (let x = (y / 16) % 2 ? 0 : 12; x < s; x += 24) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, y, 2, 16); }
    }
    speckle(g, s, 1200, ['rgba(255,255,255,.05)', 'rgba(0,0,0,.08)'], 1, 3);
  });
}

export function woodTexture() {
  return canvasTex(128, (g, s) => {
    g.fillStyle = '#a8743a'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(80,40,10,${Math.random() * 0.15})`; g.fillRect(0, y, s, 1); }
    g.strokeStyle = '#6b4420'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s, s); g.moveTo(s, 0); g.lineTo(0, s); g.lineWidth = 5; g.stroke();
  });
}

export function concreteTexture() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#9a9a96'; g.fillRect(0, 0, s, s);
    speckle(g, s, 5000, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.07)'], 1, 3);
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2;
    for (let i = 0; i <= s; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.moveTo(0, i); g.lineTo(s, i); g.stroke(); }
  });
}

export function rockTexture() {
  return canvasTex(256, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    speckle(g, s, 6000, ['#d9d9d9', '#bdbdbd', '#efefef', '#a8a8a8'], 1, 5);
  });
}

export function barkTexture() {
  return canvasTex(64, (g, s) => {
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 3) { g.fillStyle = `rgba(30,15,5,${Math.random() * 0.4})`; g.fillRect(x, 0, 1 + Math.random() * 2, s); }
  });
}
