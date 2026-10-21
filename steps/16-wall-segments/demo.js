'use strict';
// Step 16 demos: one wall projected from camera space, with near-plane
// clipping and perspective-correct texturing; then the whole level drawn
// wall by wall with a one-row depth buffer.

/** n points on a circle, going counter-clockwise on screen: the outline of a hole. */
function holeRing(cx, cy, r, n) {
  return Array.from({ length: n }, (_, k) => [cx + r * Math.cos(-k * 2 * Math.PI / n), cy + r * Math.sin(-k * 2 * Math.PI / n)]);
}

const LEVEL = buildMap({
  vertices: [
    [2, 3], [6, 2], [8, 4], [8, 6], [8, 8], [6, 10], [4.5, 10], [3, 10], [2, 10], [1, 6],  // 0–9: hall
    [4.5, 5.7], [3.7, 6.5], [4.5, 7.3], [5.3, 6.5],                                        // 10–13: diamond pillar
    [10, 6], [12, 4], [13.5, 5.5], [11, 8],                                                 // 14–17: corridor
    [12, 2], [13, 1], [16, 1], [17, 2], [17, 5], [16, 6], [14, 6],                          // 18–24: blue room
    ...holeRing(15, 3.5, 0.6, 8),                                                           // 25–32: round pillar
    [6, 12], [6, 13.5], [2, 14], [0.5, 12],                                                 // 33–36: south room
  ],
  sectors: [
    { name: 'hall', wall: 1, loops: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { v: [10, 11, 12, 13], wall: 3 }] },
    { name: 'corridor', wall: 2, loops: [[3, 14, 15, 16, 17, 4]] },
    { name: 'blue room', wall: 3, loops: [[15, 18, 19, 20, 21, 22, 23, 24, 16], { v: [25, 26, 27, 28, 29, 30, 31, 32], wall: 1 }] },
    { name: 'south room', wall: 4, loops: [[7, 6, 33, 34, 35, 36]] },
  ],
});

const SECTOR_FILLS = ['rgba(255,209,102,', 'rgba(239,71,111,', 'rgba(76,201,240,', 'rgba(6,214,160,'];

/** Fills a sector's outline. Holes come out right with the even-odd rule. */
function fillSector(ctx, view, sector, color) {
  ctx.beginPath();
  for (const loop of sector.loops) {
    loop.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, view.sx(v.x), view.sy(v.y)));
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill('evenodd');
}

/**
 * Draws every linedef: one-sided lines solid, two-sided lines dashed (they
 * are openings, not walls), each with a small tick on its front side.
 */
function drawLines(ctx, view, map, ticks = true) {
  for (const l of map.lines) {
    const x1 = view.sx(l.v1.x), y1 = view.sy(l.v1.y), x2 = view.sx(l.v2.x), y2 = view.sy(l.v2.y);
    if (l.back) line(ctx, x1, y1, x2, y2, C.xSide, 1.5, [5, 4]);
    else line(ctx, x1, y1, x2, y2, C.wallEdge, 2);
    if (!ticks) continue;
    // Front side = right of v1 → v2, i.e. along perp(e) = (−e.y, e.x).
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    line(ctx, mx, my, mx - l.dy / l.length * 6, my + l.dx / l.length * 6, C.dim, 1.5);
  }
}

/** A lone one-sided linedef, for the first demo. */
function makeLine(v1, v2, texture) {
  const line = { id: 0, v1, v2, front: { texture }, back: null };
  line.dx = v2.x - v1.x; line.dy = v2.y - v1.y; line.length = Math.hypot(line.dx, line.dy);
  return line;
}

const WALL_COLORS = ['#888', '#9aa0ab', '#c4553e', '#4e74d0', '#c8a46a'];

// ------------------------------------------------------------ demo 1: one wall

(function oneWallDemo() {
  const top = setupCanvas(document.getElementById('w-top'));
  const viewCanvas = document.getElementById('w-view');
  const screen = createScreen(viewCanvas);
  const ui = controls(['w-affine']);
  const readout = document.getElementById('w-readout');
  const view = makeView(55, 320, 280);
  const cam = createPlayer(0, 0, -Math.PI / 2);   // at the origin, looking north (up the canvas)
  const v1 = { x: -3, y: -0.6 }, v2 = { x: 1.2, y: -4 };
  const map = { lines: [null] };
  let hoverX = null;

  enableDrag(top.canvas, view, [v1, v2], () => {});
  viewCanvas.addEventListener('pointermove', (e) => {
    const r = viewCanvas.getBoundingClientRect();
    hoverX = Math.floor((e.clientX - r.left) * screen.w / r.width);
  });
  viewCanvas.addEventListener('pointerleave', () => { hoverX = null; });

  animate(() => {
    const wall = makeLine(v1, v2, 2);
    map.lines[0] = wall;
    const { walls, projScale } = renderFrame(screen, map, cam, { affine: ui['w-affine'] });
    const proj = walls[0].proj;

    // ---- top-down view
    const { ctx, w, h } = top;
    clear(ctx, w, h);
    drawGrid(ctx, view, w, h);
    const ex = view.sx(0), ey = view.sy(0);
    // The view frustum: rays through the left and right edges of the screen, d ± p.
    for (const s of [-1, 1]) {
      const fx = cam.dirX + s * cam.planeX, fy = cam.dirY + s * cam.planeY;
      line(ctx, ex, ey, view.sx(fx * 9), view.sy(fy * 9), C.axis, 1);
    }
    // The screen window at depth 1 (step 3), and the near plane.
    line(ctx, view.sx(cam.dirX - cam.planeX), view.sy(cam.dirY - cam.planeY),
      view.sx(cam.dirX + cam.planeX), view.sy(cam.dirY + cam.planeY), C.plane, 2);
    label(ctx, 'screen (v = 1)', view.sx(cam.dirX + cam.planeX) + 6, view.sy(cam.dirY + cam.planeY), C.plane);
    line(ctx, view.sx(-NEAR_PLANE * 2), view.sy(-NEAR_PLANE), view.sx(NEAR_PLANE * 2), view.sy(-NEAR_PLANE), C.warn, 2);
    label(ctx, 'near plane', view.sx(NEAR_PLANE * 2) + 14, view.sy(-NEAR_PLANE) + 4, C.warn);

    // The wall: the visible part solid, a clipped-off part dashed red.
    const a = toCameraSpace(cam, v1.x, v1.y), b = toCameraSpace(cam, v2.x, v2.y);
    const color = proj.culled === 'back' ? C.dim : WALL_COLORS[2];
    line(ctx, view.sx(v1.x), view.sy(v1.y), view.sx(v2.x), view.sy(v2.y), color, 4);
    if (proj.clipped) {
      const behind = a.v < NEAR_PLANE ? v1 : v2;
      const va = a.v < NEAR_PLANE ? a.v : b.v, vb = a.v < NEAR_PLANE ? b.v : a.v;
      const other = behind === v1 ? v2 : v1;
      const f = (NEAR_PLANE - va) / (vb - va);
      const cx = behind.x + f * (other.x - behind.x), cy = behind.y + f * (other.y - behind.y);
      line(ctx, view.sx(behind.x), view.sy(behind.y), view.sx(cx), view.sy(cy), C.warn, 4, [6, 4]);
      disc(ctx, view.sx(cx), view.sy(cy), 4, C.warn);
    }
    const mx = (v1.x + v2.x) / 2, my = (v1.y + v2.y) / 2;
    arrow(ctx, view.sx(mx), view.sy(my), view.sx(mx - wall.dy / wall.length * 0.4), view.sy(my + wall.dx / wall.length * 0.4), color, 2, 6);

    // Projection lines from the eye through each end, crossing the screen window.
    if (!proj.culled) {
      for (const sx of [proj.x1, proj.x2]) {
        const c = 2 * sx / screen.w - 1;
        const px = cam.dirX + c * cam.planeX, py = cam.dirY + c * cam.planeY;
        const reach = Math.max(1, sx === proj.x1 ? 1 / proj.iz1 : 1 / proj.iz2);
        line(ctx, ex, ey, view.sx(px * reach), view.sy(py * reach), C.ray, 1, [4, 3]);
        if (Math.abs(c) <= 1) disc(ctx, view.sx(px), view.sy(py), 4, C.ray);
      }
    }
    // The hovered column's ray.
    if (hoverX !== null) {
      const c = 2 * hoverX / screen.w - 1;
      line(ctx, ex, ey, view.sx((cam.dirX + c * cam.planeX) * 9), view.sy((cam.dirY + c * cam.planeY) * 9), 'rgba(255,209,102,0.6)', 1);
    }
    disc(ctx, ex, ey, 5, C.player);
    for (const [v, name] of [[v1, 'v1'], [v2, 'v2']]) {
      disc(ctx, view.sx(v.x), view.sy(v.y), 6, C.player);
      label(ctx, name, view.sx(v.x) + 9, view.sy(v.y) - 9, C.player);
    }

    // ---- readout
    let text =
      `camera space:  v1 → (u, v) = (${fmt(a.u)}, ${fmt(a.v)})    v2 → (u, v) = (${fmt(b.u)}, ${fmt(b.v)})\n`;
    if (proj.culled === 'back') text += 'we are behind the wall (or see it edge-on): back-face culled, nothing drawn';
    else if (proj.culled === 'behind') text += `both ends have v < ${NEAR_PLANE}: the wall is behind us`;
    else if (proj.culled === 'outside') text += 'the wall projects entirely off the screen';
    else {
      text +=
        (proj.clipped ? `clipped at the near plane (red point), v = ${NEAR_PLANE}\n` : 'no clipping needed\n') +
        `screen x = 160·(1 + u/v):  x1 = ${proj.x1.toFixed(1)}   x2 = ${proj.x2.toFixed(1)}\n` +
        `at the ends:  1/v = ${proj.iz1.toFixed(3)} … ${proj.iz2.toFixed(3)}   along/v = ${proj.az1.toFixed(3)} … ${proj.az2.toFixed(3)}`;
      const x = hoverX;
      if (x !== null && x >= Math.ceil(proj.x1) && x < Math.ceil(proj.x2)) {
        const f = (x - proj.x1) / (proj.x2 - proj.x1);
        const iz = proj.iz1 + f * (proj.iz2 - proj.iz1), az = proj.az1 + f * (proj.az2 - proj.az1);
        const along1 = proj.az1 / proj.iz1, along2 = proj.az2 / proj.iz2;
        text += `\ncolumn ${x}: f = ${f.toFixed(3)}  1/v = ${iz.toFixed(3)}  depth = ${(1 / iz).toFixed(3)}  ` +
          `along = ${(az / iz).toFixed(3)} (affine would say ${(along1 + f * (along2 - along1)).toFixed(3)})`;
      }
    }
    readout.textContent = text;
  });
})();

// ------------------------------------------------------------ demo 2: the level

(function levelDemo() {
  const screen = createScreen(document.getElementById('g-view'));
  const mm = setupCanvas(document.getElementById('g-map'));
  const mmView = makeView(13.2, 4, 20);
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-depth', 'g-affine']);
  const readout = document.getElementById('g-readout');
  const player = createPlayer(2.6, 8.4, -0.35);
  const STATUS_COLORS = { back: '#3a4150', behind: '#3a4150', outside: '#6e7a96', drawn: C.player };

  animate((dt) => {
    movePlayer(LEVEL, player, keys, dt);
    const t0 = performance.now();
    const { walls, stats } = renderFrame(screen, LEVEL, player, { depthTest: ui['g-depth'], affine: ui['g-affine'] });
    const ms = performance.now() - t0;
    const p = player;

    const { ctx, w, h } = mm;
    clear(ctx, w, h);
    for (const s of LEVEL.sectors) fillSector(ctx, mmView, s, 'rgba(255,255,255,0.05)');
    for (const l of LEVEL.lines) {
      if (l.back) line(ctx, mmView.sx(l.v1.x), mmView.sy(l.v1.y), mmView.sx(l.v2.x), mmView.sy(l.v2.y), C.grid, 1, [3, 3]);
    }
    for (const { line: l, proj } of walls) {
      line(ctx, mmView.sx(l.v1.x), mmView.sy(l.v1.y), mmView.sx(l.v2.x), mmView.sy(l.v2.y),
        STATUS_COLORS[proj.culled || 'drawn'], proj.culled ? 1.5 : 2.5);
    }
    for (const sgn of [-1, 1]) {
      line(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + (p.dirX + sgn * p.planeX) * 30),
        mmView.sy(p.y + (p.dirY + sgn * p.planeY) * 30), 'rgba(76,201,240,0.35)', 1);
    }
    disc(ctx, mmView.sx(p.x), mmView.sy(p.y), 4, C.player);
    arrow(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + p.dirX), mmView.sy(p.y + p.dirY), C.dir, 2, 6);

    const solid = walls.length;
    readout.textContent =
      `${solid} one-sided walls:  ${stats.back} facing away  ·  ${stats.behind} behind you  ·  ` +
      `${stats.outside} off screen  ·  ${stats.drawn} drawn (${stats.clipped} clipped at the near plane)\n` +
      `wall pixels written: ${stats.pixels}, of which ${stats.visible} are still on screen at the end ` +
      `(${(stats.pixels / Math.max(1, stats.visible)).toFixed(2)} × the wall area)   ${ms.toFixed(2)} ms`;
  });
})();
