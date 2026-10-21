'use strict';
/*
 * Shared helpers for the interactive diagrams on every page.
 *
 * This file is scaffolding only: canvas setup, drawing primitives, mouse and
 * keyboard handling, UI controls. Nothing here is about raycasting; the
 * interesting code lives in each step's own folder.
 *
 * Plain (non-module) scripts are used on purpose, so every page also works
 * when opened straight from disk (file://), with no web server.
 */

// Diagram palette. Canvases are always dark, independent of the page theme.
const C = {
  bg: '#14161b',
  grid: '#232730',
  axis: '#3a4150',
  wall: '#4b546a',
  wallEdge: '#6e7a96',
  text: '#d8dce4',
  dim: '#8a92a3',
  player: '#ffd166',
  dir: '#ef476f',
  plane: '#06d6a0',
  ray: '#4cc9f0',
  xSide: '#f8961e',
  ySide: '#b388ff',
  hit: '#ffffff',
  warn: '#ff5d5d',
};

/**
 * Prepares a canvas for crisp drawing on high-DPI screens.
 * The width/height attributes in the HTML are the *logical* size we draw in.
 */
function setupCanvas(canvas) {
  const w = canvas.width, h = canvas.height;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.maxWidth = w + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas.logicalWidth = w;
  canvas.logicalHeight = h;
  return { canvas, ctx, w, h };
}

/** Pointer position in the canvas' logical coordinates (works when CSS-scaled). */
function canvasPoint(canvas, e) {
  const r = canvas.getBoundingClientRect();
  const w = canvas.logicalWidth || canvas.width;
  const h = canvas.logicalHeight || canvas.height;
  return { x: (e.clientX - r.left) * w / r.width, y: (e.clientY - r.top) * h / r.height };
}

/**
 * Maps world units (map cells) to canvas pixels: px = origin + world * scale.
 * Both world and canvas have y pointing DOWN, so no flip is needed.
 */
function makeView(scale, ox = 0, oy = 0) {
  return {
    scale, ox, oy,
    sx(x) { return this.ox + x * this.scale; },
    sy(y) { return this.oy + y * this.scale; },
    wx(px) { return (px - this.ox) / this.scale; },
    wy(py) { return (py - this.oy) / this.scale; },
  };
}

// ---------------------------------------------------------------- drawing

function clear(ctx, w, h, color = C.bg) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
}

function line(ctx, x1, y1, x2, y2, color, width = 1, dash = null) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function arrow(ctx, x1, y1, x2, y2, color, width = 2, head = 9) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.5) return;
  const ux = dx / len, uy = dy / len;
  const hl = Math.min(head, len * 0.6);
  const bx = x2 - ux * hl, by = y2 - uy * hl;
  line(ctx, x1, y1, bx, by, color, width);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(bx - uy * hl * 0.45, by + ux * hl * 0.45);
  ctx.lineTo(bx + uy * hl * 0.45, by - ux * hl * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function disc(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function ring(ctx, x, y, r, color, width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function label(ctx, text, x, y, color = C.text, align = 'left', baseline = 'middle', size = 12) {
  ctx.save();
  ctx.font = `${size}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  // A dark halo keeps labels readable on top of lines.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(20,22,27,0.85)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** Grid lines for every integer world coordinate visible in the canvas. */
function drawGrid(ctx, view, w, h, color = C.grid) {
  const x0 = Math.ceil(view.wx(0)), x1 = Math.floor(view.wx(w));
  const y0 = Math.ceil(view.wy(0)), y1 = Math.floor(view.wy(h));
  for (let x = x0; x <= x1; x++) line(ctx, view.sx(x), 0, view.sx(x), h, color);
  for (let y = y0; y <= y1; y++) line(ctx, 0, view.sy(y), w, view.sy(y), color);
}

/**
 * Draws a tile map as seen from above. `map` is {w, h, cells} with cells[y*w+x].
 * `colors` optionally maps a cell value to a fill color.
 */
function drawMap(ctx, view, map, colors = null) {
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const v = map.cells[y * map.w + x];
      if (!v) continue;
      ctx.fillStyle = (colors && colors[v]) || C.wall;
      ctx.fillRect(view.sx(x), view.sy(y), view.scale, view.scale);
    }
  }
  ctx.save();
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (let x = 0; x <= map.w; x++) line(ctx, view.sx(x), view.sy(0), view.sx(x), view.sy(map.h), C.grid);
  for (let y = 0; y <= map.h; y++) line(ctx, view.sx(0), view.sy(y), view.sx(map.w), view.sy(y), C.grid);
  ctx.restore();
}

// ---------------------------------------------------------------- input

/**
 * Makes handles draggable. Each handle is an object {x, y} in world units and
 * is mutated in place. Optional per-handle `constrain(h)` can adjust the position.
 */
function enableDrag(canvas, view, handles, onChange = null) {
  let active = null;
  const pick = (p) => {
    let best = null, bestD = 14; // pick radius in pixels
    for (const h of handles) {
      const d = Math.hypot(view.sx(h.x) - p.x, view.sy(h.y) - p.y);
      if (d < bestD) { best = h; bestD = d; }
    }
    return best;
  };
  canvas.addEventListener('pointerdown', (e) => {
    active = pick(canvasPoint(canvas, e));
    if (active) { canvas.setPointerCapture(e.pointerId); e.preventDefault(); }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = canvasPoint(canvas, e);
    if (!active) { canvas.style.cursor = pick(p) ? 'grab' : 'default'; return; }
    canvas.style.cursor = 'grabbing';
    active.x = view.wx(p.x);
    active.y = view.wy(p.y);
    if (active.constrain) active.constrain(active);
    if (onChange) onChange(active);
  });
  const end = () => { active = null; canvas.style.cursor = 'default'; };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

const GAME_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyM', 'ShiftLeft', 'ShiftRight',
]);

/** Tracks which keys are held while `el` has focus. Returns a Set of key codes. */
function keyboard(el) {
  const down = new Set();
  if (!el.hasAttribute('tabindex')) el.tabIndex = 0;
  el.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) { e.preventDefault(); down.add(e.code); }
  });
  el.addEventListener('keyup', (e) => down.delete(e.code));
  el.addEventListener('blur', () => down.clear());
  el.addEventListener('pointerdown', () => el.focus());
  return down;
}

/** Calls frame(dt, time) every animation frame; dt in seconds, clamped. */
function animate(frame) {
  let last = performance.now();
  function tick(now) {
    // Clamped both ways: the first timestamp can be slightly earlier than `last`.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    frame(dt, now / 1000);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * Wraps form inputs by id. Returns an object whose properties read the live
 * values (number for range, boolean for checkbox, string for select).
 * An <output for="id"> next to an input is kept in sync automatically.
 */
function controls(ids) {
  const ui = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) throw new Error('missing control #' + id);
    const out = document.querySelector(`output[for="${id}"]`);
    const read = () => el.type === 'checkbox' ? el.checked
      : el.tagName === 'SELECT' ? el.value : parseFloat(el.value);
    const show = () => { if (out) out.textContent = el.value + (el.dataset.unit || ''); };
    el.addEventListener('input', show);
    el.addEventListener('change', show);
    show();
    Object.defineProperty(ui, id, {
      get: read,
      set: (v) => { if (el.type === 'checkbox') el.checked = v; else el.value = v; show(); },
    });
  }
  return ui;
}

/** Number formatting for readouts: fixed decimals, aligned sign. */
function fmt(n, d = 2) {
  if (!isFinite(n)) return n > 0 ? ' ∞' : '-∞';
  const s = n.toFixed(d);
  return s.startsWith('-') ? s : ' ' + s;
}
