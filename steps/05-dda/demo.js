'use strict';
// Step 5 demo: stepping through castRay() one iteration at a time.

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

(function ddaDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('d-canvas'));
  const view = makeView(40, 0, 0);
  const ui = controls(['d-iter']);
  const slider = document.getElementById('d-iter');
  const playBtn = document.getElementById('d-play');
  const readout = document.getElementById('d-readout');

  const eye = { x: 1.6, y: 5.6 };
  const aim = { x: 4.6, y: 4.1 };
  let followEnd = true;          // when true, the slider sticks to the last iteration
  let playing = false, playClock = 0;

  enableDrag(canvas, view, [eye, aim], () => { followEnd = true; playing = false; });
  slider.addEventListener('input', () => { followEnd = false; playing = false; });
  playBtn.addEventListener('click', () => { playing = true; playClock = 0; followEnd = false; ui['d-iter'] = 0; });

  function draw(dt) {
    let dx = aim.x - eye.x, dy = aim.y - eye.y;
    const l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;

    const trace = [];
    const hit = castRay(map, eye.x, eye.y, dx, dy, trace);
    const last = trace.length - 1;
    slider.max = last;
    if (followEnd) ui['d-iter'] = last;
    if (playing) {
      playClock += dt;
      if (playClock > 0.7) {
        playClock = 0;
        if (ui['d-iter'] < last) ui['d-iter'] = ui['d-iter'] + 1;
        else playing = false;
      }
    }
    const k = Math.min(ui['d-iter'], last);
    const cur = trace[k];

    clear(ctx, w, h);
    drawMap(ctx, view, map);
    const S = (x, y) => [view.sx(x), view.sy(y)];
    const P = (t) => S(eye.x + dx * t, eye.y + dy * t);

    // visited cells, numbered in order
    for (let i = 0; i <= k; i++) {
      const s = trace[i];
      const isHit = s.cell !== 0;
      ctx.fillStyle = isHit ? 'rgba(255,93,93,0.45)' : i === k ? 'rgba(255,209,102,0.30)' : 'rgba(255,209,102,0.12)';
      ctx.fillRect(view.sx(s.mapX), view.sy(s.mapY), view.scale, view.scale);
      label(ctx, String(i), view.sx(s.mapX) + 4, view.sy(s.mapY) + 9, C.dim, 'left', 'middle', 10);
    }

    // the ray: solid up to the current step, faint beyond
    line(ctx, ...S(eye.x, eye.y), ...P(hit.t), 'rgba(76,201,240,0.25)', 1);
    line(ctx, ...S(eye.x, eye.y), ...P(cur.t), C.ray, 2);

    for (let i = 1; i <= k; i++) {
      disc(ctx, ...P(trace[i].t), 4, trace[i].side === 0 ? C.xSide : C.ySide);
    }
    if (cur.cell === 0) {
      // next candidates
      ring(ctx, ...P(cur.sideDistX), 6, C.xSide, 2);
      ring(ctx, ...P(cur.sideDistY), 6, C.ySide, 2);
      const [ax, ay] = P(cur.sideDistX), [bx, by] = P(cur.sideDistY);
      label(ctx, 'sideDistX', ax + 9, ay - 9, C.xSide);
      label(ctx, 'sideDistY', bx + 9, by + 11, C.ySide);
    } else {
      ring(ctx, ...P(cur.t), 8, C.hit, 2);
    }

    disc(ctx, ...S(eye.x, eye.y), 6, C.player);
    ring(ctx, ...S(aim.x, aim.y), 7, C.ray);

    const n = (v) => v > 1e29 ? '   ∞  ' : fmt(v, 3);
    const head = `rayDir = (${fmt(dx, 3)}, ${fmt(dy, 3)})   deltaDistX = ${n(cur.deltaDistX)}   deltaDistY = ${n(cur.deltaDistY)}\n`;
    let body;
    if (k === 0) {
      body = `step 0: start in cell (${cur.mapX}, ${cur.mapY})\n` +
             `first crossings: sideDistX = ${n(cur.sideDistX)}, sideDistY = ${n(cur.sideDistY)}  →  ` +
             `next is ${cur.sideDistX < cur.sideDistY ? 'X (vertical line)' : 'Y (horizontal line)'}`;
    } else {
      body = `step ${k}: crossed a ${cur.side === 0 ? 'vertical' : 'horizontal'} line at t = ${cur.t.toFixed(3)} ` +
             `(side = ${cur.side})  →  cell (${cur.mapX}, ${cur.mapY}) = ${cur.cell}\n` +
             (cur.cell !== 0
               ? `HIT. distance t = ${cur.t.toFixed(3)}, ${k} cells checked (ray marching at 0.01 would need ~${Math.round(cur.t / 0.01)})`
               : `next: sideDistX = ${n(cur.sideDistX)}, sideDistY = ${n(cur.sideDistY)}  →  ` +
                 `${cur.sideDistX < cur.sideDistY ? 'X wins' : 'Y wins'}`);
    }
    readout.textContent = head + body;
  }
  animate(draw);
})();
