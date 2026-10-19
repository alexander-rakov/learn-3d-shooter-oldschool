'use strict';
// Step 7 demos: why Euclidean distance bends straight walls, and the renderer with toggles.

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

/** Top-down view of the level, the player, and some of this frame's rays. */
function drawMinimap(mm, map, p, hits) {
  const { ctx, w, h } = mm;
  const view = makeView(w / map.w, 0, 0);
  clear(ctx, w, h);
  drawMap(ctx, view, map, MINIMAP_COLORS);
  for (let x = 0; x < hits.length; x += 8) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(hits[x].hitX), view.sy(hits[x].hitY), 'rgba(76,201,240,0.5)', 1);
  }
  disc(ctx, view.sx(p.x), view.sy(p.y), 4, C.player);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.dirX), view.sy(p.y + p.dirY), C.dir, 2, 6);
}

(function fisheyeDiagram() {
  const top = setupCanvas(document.getElementById('f-top'));
  const chart = setupCanvas(document.getElementById('f-chart'));
  const ui = controls(['f-fov']);
  const view = makeView(50, top.w / 2, 30);   // the wall is the line y = 0
  const eye = { x: 0, y: 3.4 };
  const tip = { x: 0.6, y: 2.6 };
  enableDrag(top.canvas, view, [eye, tip]);

  // Where does the ray eye + t·r hit the wall line y = 0? (t < 0 means: never)
  const hitWall = (rx, ry) => (ry < 0 ? -eye.y / ry : -1);

  function draw() {
    eye.y = Math.max(0.4, eye.y);
    let dx = tip.x - eye.x, dy = tip.y - eye.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    tip.x = eye.x + dx; tip.y = eye.y + dy;
    const k = Math.tan(ui['f-fov'] * Math.PI / 360);
    const px = -dy * k, py = dx * k;

    // ---- top-down view
    const { ctx, w, h } = top;
    const S = (x, y) => [view.sx(x), view.sy(y)];
    clear(ctx, w, h);
    drawGrid(ctx, view, w, h);
    ctx.fillStyle = '#56607a';
    ctx.fillRect(0, view.sy(0) - 6, w, 6);
    label(ctx, 'a long straight wall', 8, view.sy(0) - 14, C.dim);

    const N = 15;
    for (let i = 0; i < N; i++) {
      const c = 2 * (i + 0.5) / N - 1;
      const rx = dx + px * c, ry = dy + py * c;
      const t = hitWall(rx, ry);
      if (t > 0) line(ctx, ...S(eye.x, eye.y), ...S(eye.x + rx * t, eye.y + ry * t), 'rgba(76,201,240,0.4)', 1);
    }
    // One example ray near the left edge: Euclidean length vs. depth along d.
    const cE = -0.85, rx = dx + px * cE, ry = dy + py * cE, tE = hitWall(rx, ry);
    if (tE > 0) {
      const hx = eye.x + rx * tE, hy = eye.y + ry * tE;
      line(ctx, ...S(eye.x, eye.y), ...S(hx, hy), C.xSide, 3);
      // foot of the perpendicular from the hit point onto the view line: depth = tE (rayDir·d = 1)
      const fx = eye.x + dx * tE, fy = eye.y + dy * tE;
      line(ctx, ...S(eye.x, eye.y), ...S(fx, fy), C.ray, 3);
      line(ctx, ...S(hx, hy), ...S(fx, fy), C.dim, 1, [4, 4]);
      label(ctx, 'euclidean', view.sx((eye.x + hx) / 2) - 8, view.sy((eye.y + hy) / 2), C.xSide, 'right');
      label(ctx, 'perpendicular', view.sx((eye.x + fx) / 2) + 8, view.sy((eye.y + fy) / 2), C.ray);
    }
    line(ctx, ...S(eye.x + dx - px, eye.y + dy - py), ...S(eye.x + dx + px, eye.y + dy + py), C.plane, 2);
    arrow(ctx, ...S(eye.x, eye.y), ...S(tip.x, tip.y), C.dir, 2.5);
    disc(ctx, ...S(eye.x, eye.y), 6, C.player);
    ring(ctx, ...S(tip.x, tip.y), 7, C.dir);

    // ---- what each distance measure would draw, column by column
    const g = chart.ctx, cw = chart.w, ch = chart.h;
    clear(g, cw, ch);
    const H = ch - 20, mid = 10 + H / 2;
    const projScale = (cw / 2) / k;
    const curve = (euclid, color) => {
      for (const sign of [-1, 1]) {
        g.save();
        g.strokeStyle = color; g.lineWidth = 2;
        g.beginPath();
        let started = false;
        for (let x = 0; x <= cw; x += 2) {
          const c = 2 * x / cw - 1;
          const rx = dx + px * c, ry = dy + py * c;
          const t = hitWall(rx, ry);
          if (t <= 0) { started = false; continue; }
          const dist = euclid ? t * Math.hypot(rx, ry) : t;
          const half = Math.min(H / 2, projScale / dist / 2);
          const y = mid + sign * half;
          if (started) g.lineTo(x, y); else { g.moveTo(x, y); started = true; }
        }
        g.stroke();
        g.restore();
      }
    };
    line(g, 0, mid, cw, mid, C.grid, 1, [4, 4]);
    curve(true, C.xSide);
    curve(false, C.ray);
    label(g, 'wall top/bottom on screen:  euclidean', 8, 10, C.xSide);
    label(g, 'perpendicular', 290, 10, C.ray);
  }
  animate(draw);
})();

(function gameDemo() {
  const screen = createScreen(document.getElementById('g-view'));
  const mm = setupCanvas(document.getElementById('g-map'));
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-dist', 'g-rays', 'g-fov']);
  const player = createPlayer(1.5, 6.5, 0);

  animate((dt) => {
    setFov(player, ui['g-fov']);
    movePlayer(player, keys, dt);
    const hits = renderFrame(screen, LEVEL, player, { distance: ui['g-dist'], rays: ui['g-rays'] });
    drawMinimap(mm, LEVEL, player, hits);
  });
})();
