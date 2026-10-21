'use strict';
// Step 11 demo: sprites (objects and robots), with an inspector for the sprite under the mouse.

const LEVEL = parseMap([
  '1111111111111111',
  '1..............1',
  '1..222....3....1',
  '1..2......3....1',
  '1..2...........1',
  '1......1111....1',
  '1..............1',
  '1...3.....2....1',
  '1...3.....2....1',
  '1..........22..1',
  '1..11..........1',
  '1..1.....3333..1',
  '1..............1',
  '1....2.........1',
  '1..............1',
  '1111111111111111',
]);

const MINIMAP_COLORS = [null, '#7a7f8c', '#8f3b2c', '#334f8f'];
const KIND_COLORS = { barrel: '#b07a45', lamp: '#ffd166', pillar: '#d8d2c4', plant: '#5fbf5a', robot: '#ef476f' };

// Static objects. Lamps hang from the ceiling, so you can walk under them; the rest block.
const OBJECTS = [
  ['pillar', 5.5, 4.5], ['pillar', 8.5, 3.5],
  ['barrel', 6.5, 7.5], ['barrel', 7.5, 8.5], ['barrel', 12.5, 7.5],
  ['plant', 1.5, 1.5], ['plant', 14.5, 1.5], ['plant', 8.5, 12.5],
  ['lamp', 4.5, 6.5], ['lamp', 8.5, 6.5], ['lamp', 12.5, 6.5], ['lamp', 6.5, 13.5],
].map(([kind, x, y]) => ({ kind, x, y, r: 0.3, block: kind !== 'lamp', image: SPRITES[kind] }));

// Robots: two turn on the spot, one walks up and down a corridor.
const ROBOTS = [
  { kind: 'robot', x: 9.5, y: 7.5, angle: Math.PI, turn: 0.5 },
  { kind: 'robot', x: 12.5, y: 4.5, angle: Math.PI / 2, turn: -0.35 },
  { kind: 'robot', x: 7.5, y: 10.5, angle: 0, patrol: { x0: 5.5, x1: 13.5, speed: 1.2 }, walked: 0 },
].map((r) => ({ ...r, r: 0.3, block: true, frame: 0 }));

function updateRobots(dt, turning) {
  for (const r of ROBOTS) {
    if (r.patrol) {
      const dir = Math.cos(r.angle) > 0 ? 1 : -1;
      r.x += dir * r.patrol.speed * dt;
      r.walked += r.patrol.speed * dt;
      if (r.x > r.patrol.x1) { r.x = r.patrol.x1; r.angle = Math.PI; }
      if (r.x < r.patrol.x0) { r.x = r.patrol.x0; r.angle = 0; }
    } else if (turning) {
      r.angle += r.turn * dt;
    }
  }
}

/** Picks each robot's picture for this frame: 8 directions, and 4 walking frames for the walker. */
function robotImage(r, p) {
  r.frame = rotationFrame(r, p);
  if (!r.patrol) return ROBOT.stand[r.frame];
  return ROBOT.walk[Math.floor(r.walked / 0.3) % 4][r.frame];
}

/** Top-down view of the level, the player, the sprites, and the picked sprite's camera-space axes. */
function drawMinimap(mm, map, p, hits, things, picked) {
  const { ctx, w, h } = mm;
  const view = makeView(w / map.w, 0, 0);
  clear(ctx, w, h);
  drawMap(ctx, view, map, MINIMAP_COLORS);
  for (let x = 0; x < hits.length; x += 8) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(hits[x].hitX), view.sy(hits[x].hitY), 'rgba(76,201,240,0.35)', 1);
  }
  for (const t of things) {
    disc(ctx, view.sx(t.x), view.sy(t.y), t.kind === 'lamp' ? 2.5 : 4, KIND_COLORS[t.kind]);
    if (t.kind === 'robot') {
      arrow(ctx, view.sx(t.x), view.sy(t.y), view.sx(t.x + Math.cos(t.angle) * 0.7),
        view.sy(t.y + Math.sin(t.angle) * 0.7), KIND_COLORS.robot, 1.5, 5);
    }
  }
  if (picked) {
    // q − pos = v·d + u·p: walk v along d, then u along p, as in step 3.
    const { u, v } = picked;
    const ax = p.x + p.dirX * v, ay = p.y + p.dirY * v;
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(ax), view.sy(ay), C.dir, 2, [4, 3]);
    line(ctx, view.sx(ax), view.sy(ay), view.sx(ax + p.planeX * u), view.sy(ay + p.planeY * u), C.plane, 2, [4, 3]);
    ring(ctx, view.sx(picked.sprite.x), view.sy(picked.sprite.y), 7, C.hit);
  }
  disc(ctx, view.sx(p.x), view.sy(p.y), 4, C.player);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.dirX), view.sy(p.y + p.dirY), C.dir, 2, 6);
}

/** Copies a sprite to a small canvas once, so it can be drawn scaled up (transparent texels stay transparent). */
function spriteCanvas(img) {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const g = c.getContext('2d');
  const data = g.createImageData(TEX, TEX);
  const out = new Uint32Array(data.data.buffer);
  for (let u = 0; u < TEX; u++) for (let v = 0; v < TEX; v++) out[v * TEX + u] = img.pixels[u * TEX + v];
  g.putImageData(data, 0, 0);
  return c;
}

/** The sprite sheet: the four objects, and the robot from its 8 directions. */
function drawSheet(sheet, cache, highlight) {
  const { ctx, w, h } = sheet;
  clear(ctx, w, h);
  ctx.imageSmoothingEnabled = false;
  const cell = 60, gap = 6;
  const drawCell = (img, x, y, text, on) => {
    // A checkerboard behind the sprite shows which texels are transparent.
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      ctx.fillStyle = (i + j) & 1 ? '#1d2027' : '#262a33';
      ctx.fillRect(x + i * cell / 8, y + j * cell / 8, cell / 8, cell / 8);
    }
    if (!cache.has(img)) cache.set(img, spriteCanvas(img));
    ctx.drawImage(cache.get(img), x, y, cell, cell);
    if (on) { ctx.strokeStyle = C.player; ctx.lineWidth = 2; ctx.strokeRect(x - 1, y - 1, cell + 2, cell + 2); }
    label(ctx, text, x + cell / 2, y + cell + 9, on ? C.player : C.dim, 'center', 'middle', 11);
  };
  ['barrel', 'lamp', 'pillar', 'plant'].forEach((k, i) =>
    drawCell(SPRITES[k], 8 + i * (cell + gap), 6, k, highlight && highlight.kind === k));
  label(ctx, 'robot, seen from:', 8 + 4 * (cell + gap) + 4, 36, C.dim, 'left', 'middle', 11);
  for (let k = 0; k < 8; k++) {
    const on = highlight && highlight.kind === 'robot' && highlight.frame === k;
    drawCell(ROBOT.stand[k], 8 + k * (cell + gap), 90, `${k}: ${k * 45}°`, on);
  }
}

(function spriteDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const sheet = setupCanvas(document.getElementById('s-sheet'));
  const sheetCache = new Map();
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-depth', 'g-sort', 'g-boxes', 'g-turn']);
  const readout = document.getElementById('s-readout');
  const player = createPlayer(1.5, 6.5, 0.35);
  const things = [...OBJECTS, ...ROBOTS];
  const blockers = things.filter((t) => t.block);

  let hover = null;
  viewCanvas.addEventListener('pointermove', (e) => {
    const r = viewCanvas.getBoundingClientRect();
    hover = {
      x: Math.floor((e.clientX - r.left) * screen.w / r.width),
      y: Math.floor((e.clientY - r.top) * screen.h / r.height),
    };
  });
  viewCanvas.addEventListener('pointerleave', () => { hover = null; });

  /** The nearest sprite with an opaque texel under screen pixel (x, y), as drawn this frame. */
  function spriteAt(drawn, zBuffer, x, y) {
    let best = null;
    for (const d of drawn) {
      if (x < d.x0 || x >= d.x1 || (ui['g-depth'] && d.v >= zBuffer[x])) continue;
      const step = TEX / d.size;
      const tu = Math.floor((x + 0.5 - d.left) * step), tv = Math.floor((y + 0.5 - d.top) * step);
      if (tv < 0 || tv >= TEX || !d.sprite.image.pixels[tu * TEX + tv]) continue;
      if (!best || d.v < best.v) best = d;
    }
    return best;
  }

  animate((dt) => {
    movePlayer(LEVEL, player, keys, dt, { objects: blockers });
    updateRobots(dt, ui['g-turn']);
    for (const r of ROBOTS) r.image = robotImage(r, player);

    const { columns, zBuffer, projScale, sprites: drawn } = renderFrame(screen, LEVEL, player, {
      sprites: things, depthBuffer: ui['g-depth'], sort: ui['g-sort'],
    });

    const g = screen.ctx;
    if (ui['g-boxes']) {
      for (const d of drawn) {
        g.strokeStyle = KIND_COLORS[d.sprite.kind];
        g.lineWidth = 1;
        g.strokeRect(Math.round(d.left) + 0.5, Math.round(d.top) + 0.5, Math.round(d.size) - 1, Math.round(d.size) - 1);
      }
    }

    const picked = hover ? spriteAt(drawn, zBuffer, hover.x, hover.y) : null;
    if (picked) {
      g.strokeStyle = C.player;
      g.strokeRect(Math.round(picked.left) + 0.5, Math.round(picked.top) + 0.5, Math.round(picked.size) - 1, Math.round(picked.size) - 1);
      const s = picked.sprite;
      let text =
        `${s.kind} at (${s.x.toFixed(2)}, ${s.y.toFixed(2)})\n` +
        `camera space: (u, v) = M⁻¹ · (q − pos) = (${fmt(picked.u, 3)}, ${fmt(picked.v, 3)})\n` +
        `screenX = ${screen.w / 2} × (1 + u/v) = ${picked.screenX.toFixed(1)}     ` +
        `size = projScale / v = ${projScale.toFixed(1)} / ${picked.v.toFixed(3)} = ${picked.size.toFixed(1)} px\n` +
        `columns ${picked.x0}…${picked.x1 - 1}: ${picked.columnsDrawn} drawn, ` +
        `${picked.x1 - picked.x0 - picked.columnsDrawn} hidden behind walls`;
      if (s.kind === 'robot') {
        const rel = Math.atan2(player.y - s.y, player.x - s.x) - s.angle;
        const deg = ((rel * 180 / Math.PI) % 360 + 360) % 360;
        text += `\nangle from its facing to us: ${deg.toFixed(0)}° → rotation frame ${s.frame} ` +
          `(${['front', 'front-right', 'right', 'back-right', 'back', 'back-left', 'left', 'front-left'][s.frame]})`;
      }
      readout.textContent = text;
    } else {
      readout.textContent = `${drawn.length} sprites in front of the camera, ` +
        `${drawn.filter((d) => d.columnsDrawn > 0).length} with columns on screen.\n` +
        'Hover a sprite in the view to inspect it.';
    }

    drawMinimap(mm, LEVEL, player, columns, things, picked);
    drawSheet(sheet, sheetCache, picked && picked.sprite);
  });
})();
