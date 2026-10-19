'use strict';
// Step 6 demos: side-view projection diagram and the first rendered frames.

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

(function sideViewDemo() {
  const { ctx, w, h } = setupCanvas(document.getElementById('s-canvas'));
  const ui = controls(['s-z']);
  const U = 100;                   // pixels per world unit
  const eyeX = 30, eyeY = 130;     // the eye, at height 0.5 above the floor
  const floorY = eyeY + 0.5 * U, ceilY = eyeY - 0.5 * U;
  const planeX = eyeX + U;
  const SCREEN_H = 200, projScale = 246;   // matches W = 320, FOV 66°

  function draw() {
    const z = ui['s-z'];
    const wallX = eyeX + z * U;
    clear(ctx, w, h);

    line(ctx, 0, floorY, 440, floorY, C.axis, 1.5);
    label(ctx, 'floor', 6, floorY + 10, C.dim);
    line(ctx, eyeX, eyeY, 440, eyeY, C.grid, 1, [4, 4]);
    label(ctx, 'horizon', 360, eyeY - 8, C.dim);

    // wall
    ctx.fillStyle = '#56607a';
    ctx.fillRect(wallX, ceilY, 8, U);
    label(ctx, 'wall h=1', wallX + 12, ceilY + 10, C.text);

    // sight lines from the eye to wall top & bottom, crossing the plane at ±0.5/z
    line(ctx, eyeX, eyeY, wallX, ceilY, C.ray, 1.5);
    line(ctx, eyeX, eyeY, wallX, floorY, C.ray, 1.5);
    const half = 0.5 / z * U;      // half height on the plane, in pixels
    line(ctx, planeX, 10, planeX, h - 10, 'rgba(6,214,160,0.35)', 1);
    line(ctx, planeX, eyeY - half, planeX, eyeY + half, C.plane, 4);
    label(ctx, `1/z = ${(1 / z).toFixed(2)}`, planeX + 6, eyeY - half - 10, C.plane);
    label(ctx, 'plane (1 unit)', planeX - 2, h - 12, C.plane, 'center');

    // distance markers
    line(ctx, eyeX, floorY + 22, planeX, floorY + 22, C.dim, 1);
    label(ctx, '1', (eyeX + planeX) / 2, floorY + 32, C.dim, 'center');
    line(ctx, eyeX, floorY + 46, wallX, floorY + 46, C.dim, 1);
    label(ctx, `z = ${z.toFixed(2)}`, (eyeX + wallX) / 2, floorY + 56, C.dim, 'center');

    disc(ctx, eyeX, eyeY, 5, C.player);
    label(ctx, 'eye', eyeX - 4, eyeY - 14, C.player);

    // the resulting screen column
    const sx = 490, sTop = (h - SCREEN_H) / 2;
    ctx.fillStyle = '#383838';
    ctx.fillRect(sx, sTop, 40, SCREEN_H / 2);
    ctx.fillStyle = '#707070';
    ctx.fillRect(sx, sTop + SCREEN_H / 2, 40, SCREEN_H / 2);
    const lh = projScale / z;
    const t = Math.max(0, SCREEN_H / 2 - lh / 2), b = Math.min(SCREEN_H, SCREEN_H / 2 + lh / 2);
    ctx.fillStyle = '#969aa6';
    ctx.fillRect(sx, sTop + t, 40, b - t);
    label(ctx, 'screen', sx + 20, sTop - 10, C.dim, 'center');
    label(ctx, `${Math.round(lh)} px`, sx + 20, sTop + SCREEN_H + 12, C.text, 'center');
  }
  animate(draw);
})();

(function gameDemo() {
  const screen = createScreen(document.getElementById('g-view'));
  const mm = setupCanvas(document.getElementById('g-map'));
  const keys = keyboard(document.getElementById('g-game'));
  const player = createPlayer(1.5, 6.5, 0);

  animate((dt) => {
    movePlayer(player, keys, dt);
    const hits = renderFrame(screen, LEVEL, player);
    drawMinimap(mm, LEVEL, player, hits);
  });
})();
