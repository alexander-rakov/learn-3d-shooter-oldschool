'use strict';
// Step 17 demo: sectors with their own floor and ceiling heights, drawn by
// recursing through portals, with clip arrays per column.

// Vertices shared by both versions of the level.
const VERTICES = [
  [1, 2], [7, 2], [7, 2.5], [7, 4], [7, 6.5], [7, 7.5], [7, 8], [5, 8], [3, 8], [1, 8],          // 0–9: start room
  [8, 2.5], [8, 4],                                                                               // 10–11: window
  [8, 6.5], [8, 7.5],                                                                             // 12–13: passage
  [8, 1], [16, 1], [16, 4], [13, 4], [11, 4], [16, 6], [13, 6], [11, 6], [8, 6], [16, 9], [8, 9], // 14–24: courtyard
  [3, 8.6], [5, 8.6], [3, 9.2], [5, 9.2], [3, 9.8], [5, 9.8], [3, 10.4], [5, 10.4],              // 25–32: stairs
  [2, 10.4], [6, 10.4], [7, 11.4], [7, 13], [6, 14], [2, 14], [1, 13], [1, 11.4],                // 33–40: crypt
];

// Sectors both versions share. Heights in map units: the start room's floor is 0.
const SHARED_SECTORS = [
  { name: 'start room', floor: 0, ceil: 1.5, wall: 1, loops: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]] },
  { name: 'window', floor: 0.45, ceil: 1.15, wall: 1, loops: [[2, 10, 11, 3]] },
  { name: 'passage', floor: 0, ceil: 1, wall: 1, loops: [[4, 12, 13, 5]] },
  { name: 'platform', floor: 0.1, ceil: 2.5, wall: 3, floorTex: 4, loops: [[18, 17, 20, 21]] },
  { name: 'step 1', floor: -0.125, ceil: 0.975, wall: 2, floorTex: 3, loops: [[8, 7, 26, 25]] },
  { name: 'step 2', floor: -0.25, ceil: 0.85, wall: 2, floorTex: 3, loops: [[25, 26, 28, 27]] },
  { name: 'step 3', floor: -0.375, ceil: 0.725, wall: 2, floorTex: 3, loops: [[27, 28, 30, 29]] },
  { name: 'step 4', floor: -0.5, ceil: 0.6, wall: 2, floorTex: 3, loops: [[29, 30, 32, 31]] },
  { name: 'crypt', floor: -0.5, ceil: 0.6, wall: 2, floorTex: 3, ceilTex: 3, loops: [[33, 31, 32, 34, 35, 36, 37, 38, 39, 40]] },
];

const COURTYARD = { floor: -0.25, ceil: 2.5, wall: 4, floorTex: 2 };

// The courtyard around the platform, as four convex sectors…
const LEVEL = buildMap({
  vertices: VERTICES,
  sectors: [...SHARED_SECTORS,
    { ...COURTYARD, name: 'courtyard N', loops: [[14, 15, 16, 17, 18, 11, 10]] },
    { ...COURTYARD, name: 'courtyard W', loops: [[11, 18, 21, 22]] },
    { ...COURTYARD, name: 'courtyard E', loops: [[17, 16, 19, 20]] },
    { ...COURTYARD, name: 'courtyard S', loops: [[22, 21, 20, 19, 23, 24, 13, 12]] },
  ],
});

// …or as one sector with a hole in it, which is not convex. (The platform is
// listed after it here, so the courtyard's outer walls come first in its list
// of segs, before the edges of the hole.)
const LEVEL_CONCAVE = buildMap({
  vertices: VERTICES,
  sectors: [...SHARED_SECTORS.filter((s) => s.name !== 'platform'),
    { ...COURTYARD, name: 'courtyard', loops: [[14, 15, 16, 19, 23, 24, 13, 12, 22, 11, 10], [18, 21, 20, 17]] },
    SHARED_SECTORS.find((s) => s.name === 'platform'),
  ],
});

const DEPTH_COLORS = ['#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ef476f', '#f8961e'];

function fillSector(ctx, view, sector, color) {
  ctx.beginPath();
  for (const loop of sector.loops) {
    loop.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, view.sx(v.x), view.sy(v.y)));
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill('evenodd');
}

/** The portal tree as indented text: sector, columns, and what's behind it. */
function treeText(node, prefix = '', last = true, root = true) {
  const branch = root ? '' : prefix + (last ? '└ ' : '├ ');
  let s = `${branch}${node.sector.name.padEnd(12)} columns ${node.xl}–${node.xr - 1}\n`;
  const childPrefix = root ? '' : prefix + (last ? '  ' : '│ ');
  node.children.forEach((c, i) => { s += treeText(c, childPrefix, i === node.children.length - 1, false); });
  return s;
}

// ------------------------------------------------------------ demo 1: one column, side view

(function sideViewDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('c-side'));
  const readout = document.getElementById('c-readout');
  // Side view: x = distance in front of the eye, world y = −z (so up is up).
  const view = makeView(58, 20, 215);
  const LINE = 4, FAR = 8.2;                 // the two-sided line, and the far wall behind it
  const FRONT = { floor: 0, ceil: 1.5 };
  const eye = { x: 0.3, y: -0.5, constrain: (hd) => { hd.x = 0.3; hd.y = Math.max(-1.3, Math.min(-0.15, hd.y)); } };
  const backCeil = { x: 6, y: -1.0, constrain: (hd) => { hd.x = 6; hd.y = Math.max(-2.6, Math.min(backFloor.y - 0.1, hd.y)); } };
  const backFloor = { x: 6, y: -0.35, constrain: (hd) => { hd.x = 6; hd.y = Math.max(backCeil.y + 0.1, Math.min(0.4, hd.y)); } };
  const H = 200, HORIZON = 100, PROJ = 160 / Math.tan(33 * Math.PI / 180);
  const STRIP_X = 540, STRIP_W = 40, STRIP_Y = 14;   // the screen column, drawn on the right
  const PARTS = {
    ceiling: ['#5b5f6b', 'front ceiling'], upper: ['#c4553e', 'upper wall'], backCeiling: ['#3f4f6b', 'back ceiling'],
    far: ['#c8a46a', 'far wall'], backFloor: ['#6b5a3f', 'back floor'], lower: ['#9aa0ab', 'lower wall'], floor: ['#7d7462', 'front floor'],
  };

  enableDrag(canvas, view, [eye, backCeil, backFloor], draw);

  function draw() {
    clear(ctx, w, h);
    const eyeZ = -eye.y, bc = -backCeil.y, bf = -backFloor.y;
    const Z = (z) => view.sy(-z);
    // The two sectors in cross-section.
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(view.sx(0), Z(FRONT.ceil), view.sx(LINE) - view.sx(0), Z(FRONT.floor) - Z(FRONT.ceil));
    ctx.fillRect(view.sx(LINE), Z(bc), view.sx(FAR) - view.sx(LINE), Z(bf) - Z(bc));
    line(ctx, view.sx(0), Z(FRONT.ceil), view.sx(LINE), Z(FRONT.ceil), C.wallEdge, 2);
    line(ctx, view.sx(0), Z(FRONT.floor), view.sx(LINE), Z(FRONT.floor), C.wallEdge, 2);
    line(ctx, view.sx(LINE), Z(bc), view.sx(FAR), Z(bc), C.wallEdge, 2);
    line(ctx, view.sx(LINE), Z(bf), view.sx(FAR), Z(bf), C.wallEdge, 2);
    if (bc < FRONT.ceil) line(ctx, view.sx(LINE), Z(FRONT.ceil), view.sx(LINE), Z(bc), PARTS.upper[0], 4);
    if (bf > FRONT.floor) line(ctx, view.sx(LINE), Z(bf), view.sx(LINE), Z(FRONT.floor), PARTS.lower[0], 4);
    line(ctx, view.sx(FAR), Z(bc), view.sx(FAR), Z(bf), PARTS.far[0], 4);
    line(ctx, view.sx(LINE), Z(-0.6), view.sx(LINE), Z(2.7), 'rgba(248,150,30,0.6)', 1, [4, 4]);
    label(ctx, 'two-sided line', view.sx(LINE) + 4, Z(2.6), C.xSide);
    label(ctx, 'front sector', view.sx(1.2), Z(FRONT.floor) + 12, C.dim);
    label(ctx, 'back sector', view.sx(LINE + 0.2), Z(Math.min(bf, 0.2)) + 12, C.dim);

    // Rays from the eye to the corners that decide the rows.
    const rowOf = (z, d) => Math.max(0, Math.min(H, Math.ceil(HORIZON - (z - eyeZ) * PROJ / d - 0.5)));
    const corners = [[LINE, FRONT.ceil], [LINE, bc], [LINE, bf], [LINE, FRONT.floor], [FAR, bc], [FAR, bf]];
    for (const [d, z] of corners) line(ctx, view.sx(0.3), Z(eyeZ), view.sx(d), Z(z), 'rgba(76,201,240,0.45)', 1);
    line(ctx, view.sx(0.3), Z(eyeZ), view.sx(FAR), Z(eyeZ), 'rgba(255,255,255,0.15)', 1, [2, 4]);

    // The column, top to bottom, the way drawSeg fills it: front sector first, then the back.
    let top = 0, bottom = H;
    const parts = [];
    const add = (kind, y0, y1) => { if (y1 > y0) parts.push([kind, y0, y1]); };
    const ceilY = Math.max(top, Math.min(bottom, rowOf(FRONT.ceil, LINE)));
    const floorY = Math.max(top, Math.min(bottom, rowOf(FRONT.floor, LINE)));
    add('ceiling', top, ceilY);
    add('floor', floorY, bottom);
    top = ceilY; bottom = floorY;
    if (bc < FRONT.ceil) { const y = Math.max(top, Math.min(bottom, rowOf(bc, LINE))); add('upper', top, y); top = y; }
    if (bf > FRONT.floor) { const y = Math.min(bottom, Math.max(top, rowOf(bf, LINE))); add('lower', y, bottom); bottom = y; }
    const openTop = top, openBottom = bottom;
    // Then the back sector, through the opening: its ceiling, floor and far wall.
    const bcY = Math.max(top, Math.min(bottom, rowOf(bc, FAR))), bfY = Math.max(top, Math.min(bottom, rowOf(bf, FAR)));
    add('backCeiling', top, bcY);
    add('backFloor', bfY, bottom);
    add('far', bcY, bfY);
    parts.sort((a, b) => a[1] - b[1]);

    const sy = (row) => STRIP_Y + row * 1.1;
    for (const [kind, y0, y1] of parts) {
      ctx.fillStyle = PARTS[kind][0];
      ctx.fillRect(STRIP_X, sy(y0), STRIP_W, sy(y1) - sy(y0));
    }
    ctx.strokeStyle = C.text;
    ctx.strokeRect(STRIP_X - 0.5, sy(0) - 0.5, STRIP_W + 1, sy(H) - sy(0) + 1);
    line(ctx, STRIP_X - 6, sy(openTop), STRIP_X + STRIP_W + 6, sy(openTop), C.player, 2);
    line(ctx, STRIP_X - 6, sy(openBottom), STRIP_X + STRIP_W + 6, sy(openBottom), C.player, 2);
    label(ctx, 'one screen column', STRIP_X + STRIP_W, sy(H) + 10, C.dim, 'right');
    label(ctx, 'top', STRIP_X + STRIP_W + 9, sy(openTop), C.player);
    label(ctx, 'bottom', STRIP_X + STRIP_W + 9, sy(openBottom), C.player);

    for (const [hd, name] of [[eye, 'eye'], [backCeil, 'back ceiling'], [backFloor, 'back floor']]) {
      disc(ctx, view.sx(hd.x), view.sy(hd.y), 6, C.player);
      label(ctx, name, view.sx(hd.x) + 10, view.sy(hd.y), C.player);
    }

    readout.textContent =
      `eye z = ${eyeZ.toFixed(2)}   front sector: floor 0, ceiling 1.5   back sector: floor ${bf.toFixed(2)}, ceiling ${bc.toFixed(2)}\n` +
      parts.map(([kind, y0, y1]) => `${PARTS[kind][1].padEnd(13)} rows ${String(y0).padStart(3)}–${String(y1 - 1).padStart(3)}`).join('\n') +
      `\nafter the front sector: top = ${openTop}, bottom = ${openBottom}: the back sector must fit in between`;
  }
  draw();
})();

// ------------------------------------------------------------ demo 2: the level

(function heightsDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const mmView = makeView(14.5, -2, 4);
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-concave']);
  const readout = document.getElementById('g-readout');
  const player = createPlayer(2.2, 4.4, 0.25);

  let hoverX = null;
  viewCanvas.addEventListener('pointermove', (e) => {
    const r = viewCanvas.getBoundingClientRect();
    hoverX = Math.floor((e.clientX - r.left) * screen.w / r.width);
  });
  viewCanvas.addEventListener('pointerleave', () => { hoverX = null; });

  let level = null;
  animate((dt) => {
    const want = ui['g-concave'] ? LEVEL_CONCAVE : LEVEL;
    if (want !== level) { level = want; player.sector = sectorAt(level, player.x, player.y); }
    movePlayer(level, player, keys, dt);
    const t0 = performance.now();
    const { tree, visits, stats } = renderFrame(screen, level, player);
    const ms = performance.now() - t0;
    const p = player;

    // Mark the hovered column, and find the portals it was seen through.
    const x = hoverX;
    let chain = [];
    if (x !== null) {
      const g = screen.ctx;
      g.fillStyle = 'rgba(255,209,102,0.5)';
      g.fillRect(x, 0, 1, 4);
      g.fillRect(x, screen.h - 4, 1, 4);
      chain = visits.filter((v) => x >= v.xl && x < v.xr);
    }

    // Minimap: sectors coloured by how many portals deep they were drawn.
    const { ctx, w, h } = mm;
    clear(ctx, w, h);
    for (const s of level.sectors) fillSector(ctx, mmView, s, 'rgba(255,255,255,0.04)');
    for (const v of visits) fillSector(ctx, mmView, v.sector, DEPTH_COLORS[Math.min(v.depth, 5)] + '30');
    for (const v of chain) fillSector(ctx, mmView, v.sector, DEPTH_COLORS[Math.min(v.depth, 5)] + '70');
    for (const l of level.lines) {
      const x1 = mmView.sx(l.v1.x), y1 = mmView.sy(l.v1.y), x2 = mmView.sx(l.v2.x), y2 = mmView.sy(l.v2.y);
      if (l.back) line(ctx, x1, y1, x2, y2, C.xSide, 1, [3, 3]);
      else line(ctx, x1, y1, x2, y2, C.wallEdge, 1.5);
    }
    for (const sgn of [-1, 1]) {
      line(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + (p.dirX + sgn * p.planeX) * 30),
        mmView.sy(p.y + (p.dirY + sgn * p.planeY) * 30), 'rgba(76,201,240,0.35)', 1);
    }
    if (x !== null) {
      const c = 2 * x / screen.w - 1;
      line(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + (p.dirX + c * p.planeX) * 30),
        mmView.sy(p.y + (p.dirY + c * p.planeY) * 30), 'rgba(255,209,102,0.7)', 1);
    }
    disc(ctx, mmView.sx(p.x), mmView.sy(p.y), 4, C.player);
    arrow(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + p.dirX), mmView.sy(p.y + p.dirY), C.dir, 2, 6);

    const here = p.sector;
    let text =
      `you stand in "${here ? here.name : '?'}": floor ${here ? here.floor : '?'}, ceiling ${here ? here.ceil : '?'}, ` +
      `eye at z = ${p.z.toFixed(3)}\n` +
      `${stats.sectors} sector visits, ${stats.segs} segs drawn, ${stats.pixels} pixels, ${ms.toFixed(2)} ms\n`;
    if (x !== null) text += `column ${x} was drawn through: ${chain.map((v) => v.sector.name).join(' → ')}\n`;
    text += '\n' + (tree ? treeText(tree) : '');
    readout.textContent = text;
  });
})();
