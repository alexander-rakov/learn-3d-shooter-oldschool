'use strict';
// Step 4 demo: naive fixed-step ray marching on a grid.

function parseMap(rows) {
  const h = rows.length, w = rows[0].length;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      cells[y * w + x] = ch === '.' ? 0 : ch === '#' ? 1 : parseInt(ch, 10);
    }
  }
  return { w, h, cells };
}

const map = parseMap([
  '############',
  '#..........#',
  '#..##...#..#',
  '#...#......#',
  '#.......##.#',
  '#..#.......#',
  '#......#...#',
  '############',
]);

function isWall(map, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cy < 0 || cx >= map.w || cy >= map.h) return true;
  return map.cells[cy * map.w + cx] !== 0;
}

// The function from the article, plus an optional `samples` array for drawing.
function marchRay(map, posX, posY, dirX, dirY, stepSize, samples) {
  const len = Math.hypot(dirX, dirY);
  dirX /= len; dirY /= len;
  for (let t = 0; t < 50; t += stepSize) {
    if (samples) samples.push(t);
    if (isWall(map, posX + t * dirX, posY + t * dirY)) return t;
  }
  return Infinity;
}

(function marchDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('m-canvas'));
  const view = makeView(40, 0, 0);
  const ui = controls(['m-step', 'm-fan']);
  const readout = document.getElementById('m-readout');

  const eye = { x: 1.7, y: 5.4 };
  const aim = { x: 5.2, y: 3.2 };
  enableDrag(canvas, view, [eye, aim]);

  function draw() {
    const stepSize = ui['m-step'];
    clear(ctx, w, h);
    drawMap(ctx, view, map);
    const S = (x, y) => [view.sx(x), view.sy(y)];

    const baseAngle = Math.atan2(aim.y - eye.y, aim.x - eye.x);
    const rays = ui['m-fan'] ? 40 : 1;
    let info = '';
    for (let i = 0; i < rays; i++) {
      const a = rays === 1 ? baseAngle : baseAngle + (i / (rays - 1) - 0.5) * 1.2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const samples = [];
      const tMarch = marchRay(map, eye.x, eye.y, dx, dy, stepSize, samples);
      const tTrue = marchRay(map, eye.x, eye.y, dx, dy, 0.0005);   // fine reference

      const hx = eye.x + dx * tMarch, hy = eye.y + dy * tMarch;
      ctx.fillStyle = 'rgba(255,93,93,0.35)';
      ctx.fillRect(view.sx(Math.floor(hx)), view.sy(Math.floor(hy)), view.scale, view.scale);

      line(ctx, ...S(eye.x, eye.y), ...S(eye.x + dx * tTrue, eye.y + dy * tTrue), 'rgba(76,201,240,0.35)', 1);
      if (rays === 1) {
        for (const t of samples) disc(ctx, ...S(eye.x + dx * t, eye.y + dy * t), 2.5, C.ray);
        disc(ctx, ...S(hx, hy), 4, C.warn);
      } else {
        disc(ctx, ...S(hx, hy), 2.5, Math.abs(tMarch - tTrue) > 0.5 ? C.warn : C.ray);
      }
      ring(ctx, ...S(eye.x + dx * tTrue, eye.y + dy * tTrue), rays === 1 ? 6 : 3, C.hit, 1.2);

      if (rays === 1) {
        info = `samples checked: ${samples.length}\n` +
               `marched distance: ${tMarch.toFixed(3)}   true distance: ${tTrue.toFixed(3)}   ` +
               `error: ${(tMarch - tTrue).toFixed(3)} cells` +
               (tMarch - tTrue > 0.5 ? '   ← skipped past a corner!' : '');
      }
    }
    if (rays > 1) {
      info = `40 rays; red dots are hits off by more than half a cell.\n` +
             `Samples per ray at this step: about ${Math.round(6 / stepSize)} for a wall 6 cells away.`;
    }
    disc(ctx, ...S(eye.x, eye.y), 6, C.player);
    ring(ctx, ...S(aim.x, aim.y), 7, C.ray);
    label(ctx, 'aim', view.sx(aim.x) + 10, view.sy(aim.y), C.ray);
    readout.textContent = info;
  }
  animate(draw);
})();
