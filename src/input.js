// Unified keyboard/mouse + touch input. Actions are edge-triggered via take().
export const input = {
  keys: new Set(),
  lookDX: 0,
  lookDY: 0,
  fire: false,
  aim: false,
  sprintToggle: false,
  moveX: 0, // touch stick
  moveY: 0,
  pressed: new Set(),
  touch: false,
  locked: false,
  take(a) { const h = this.pressed.has(a); this.pressed.delete(a); return h; },
  consumeLook() { const d = [this.lookDX, this.lookDY]; this.lookDX = this.lookDY = 0; return d; },
};

const KEYMAP = {
  Space: 'jump', KeyR: 'reload', KeyE: 'pickup', KeyH: 'heal', KeyG: 'gloo', KeyF: 'plane',
  Digit1: 'slot0', Digit2: 'slot1', KeyQ: 'swap', KeyM: 'map',
};

export function initInput(canvas) {
  input.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (input.touch) document.body.classList.add('touch');

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    input.keys.add(e.code);
    if (KEYMAP[e.code] && !e.repeat) input.pressed.add(KEYMAP[e.code]);
    if (e.code === 'Space') e.preventDefault();
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => { input.keys.clear(); input.fire = false; });

  canvas.addEventListener('mousedown', (e) => {
    if (input.touch) return;
    if (!input.locked) { canvas.requestPointerLock?.(); return; }
    if (e.button === 0) input.fire = true;
    if (e.button === 2) input.aim = !input.aim;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) input.fire = false; });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', () => input.pressed.add('swap'));
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === canvas;
    if (!input.locked) input.fire = false;
  });
  addEventListener('mousemove', (e) => {
    if (!input.locked) return;
    input.lookDX += e.movementX;
    input.lookDY += e.movementY;
  });

  if (input.touch) initTouch();
}

function initTouch() {
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  let stickId = null, sx = 0, sy = 0;
  const R = 55;
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    sx = r.left + r.width / 2; sy = r.top + r.height / 2;
    moveStick(t);
    e.preventDefault();
  }, { passive: false });
  const moveStick = (t) => {
    let dx = t.clientX - sx, dy = t.clientY - sy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    input.moveX = dx / R;
    input.moveY = dy / R;
    // push the stick to the rim to auto-sprint
    input.sprintToggle = d > R * 1.25 || input.sprintHeld;
  };
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === stickId) moveStick(t);
  }, { passive: false });
  const endStick = (e) => {
    for (const t of e.changedTouches) if (t.identifier === stickId) {
      stickId = null; input.moveX = input.moveY = 0; input.sprintToggle = !!input.sprintHeld;
      knob.style.transform = '';
    }
  };
  addEventListener('touchend', endStick);
  addEventListener('touchcancel', endStick);

  // look areas: lookpad and the fire buttons (so you can aim while shooting)
  const lookers = new Map();
  const sens = 2.2;
  const addLook = (el, onStart, onEnd) => {
    el.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) lookers.set(t.identifier, { x: t.clientX, y: t.clientY, onEnd });
      onStart?.();
      el.classList.add('held');
      e.preventDefault();
    }, { passive: false });
  };
  addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      const l = lookers.get(t.identifier);
      if (!l) continue;
      input.lookDX += (t.clientX - l.x) * sens;
      input.lookDY += (t.clientY - l.y) * sens;
      l.x = t.clientX; l.y = t.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  const endLook = (e) => {
    for (const t of e.changedTouches) {
      const l = lookers.get(t.identifier);
      if (l) { l.onEnd?.(); lookers.delete(t.identifier); }
    }
  };
  addEventListener('touchend', endLook);
  addEventListener('touchcancel', endLook);

  const lookpad = document.getElementById('lookpad');
  addLook(lookpad);
  for (const id of ['tFire', 'tFire2']) {
    const el = document.getElementById(id);
    addLook(el, () => { input.fire = true; }, () => { input.fire = false; el.classList.remove('held'); });
  }

  const tap = (id, action) => document.getElementById(id).addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation(); input.pressed.add(action);
  }, { passive: false });
  tap('tJump', 'jump'); tap('tReload', 'reload'); tap('tHeal', 'heal'); tap('tGloo', 'gloo'); tap('tSwap', 'swap'); tap('tPick', 'pickup');
  document.getElementById('tScope').addEventListener('touchstart', (e) => { e.preventDefault(); input.aim = !input.aim; }, { passive: false });
  const sprint = document.getElementById('tSprint');
  sprint.addEventListener('touchstart', (e) => {
    e.preventDefault();
    input.sprintHeld = !input.sprintHeld;
    input.sprintToggle = input.sprintHeld;
    sprint.classList.toggle('held', input.sprintHeld);
  }, { passive: false });
}
