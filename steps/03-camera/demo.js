'use strict';
// Step 3 demo: direction + plane vectors, rays per column, camera-space transform.

(function cameraDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('c-canvas'));
  const MAP_H = 330;                     // top area: world; bottom strip: the "screen"
  const view = makeView(60, 0, 0);
  const ui = controls(['c-fov', 'c-rays']);
  const readout = document.getElementById('c-readout');
  const SCREEN_W = 320;                  // pretend screen width in pixels

  const eye = { x: 2.2, y: 3.6 };
  const tip = { x: 3.1, y: 3.15 };       // handle that sets the direction
  const target = { x: 5.6, y: 1.6 };
  enableDrag(canvas, view, [eye, tip, target]);

  function draw() {
    // Camera vectors from the handles.
    let dx = tip.x - eye.x, dy = tip.y - eye.y;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const k = Math.tan(ui['c-fov'] * Math.PI / 360);  // |p| = tan(FOV/2)
    const px = -dy * k, py = dx * k;                  // p = perp(d) · tan(FOV/2)

    // Keep the direction handle exactly one unit ahead of the eye.
    tip.x = eye.x + dx; tip.y = eye.y + dy;

    clear(ctx, w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, MAP_H); ctx.clip();
    drawGrid(ctx, view, w, MAP_H);

    const S = (x, y) => [view.sx(x), view.sy(y)];
    const n = ui['c-rays'];
    for (let i = 0; i < n; i++) {
      // sample the centre of each of n equal-width column bands
      const c = 2 * (i + 0.5) / n - 1;
      const rx = dx + px * c, ry = dy + py * c;
      line(ctx, ...S(eye.x, eye.y), ...S(eye.x + rx * 20, eye.y + ry * 20), 'rgba(76,201,240,0.45)', 1);
      disc(ctx, ...S(eye.x + rx, eye.y + ry), 2.5, C.ray);
    }
    // FOV edges (c = ±1)
    for (const c of [-1, 1]) {
      line(ctx, ...S(eye.x, eye.y), ...S(eye.x + (dx + px * c) * 20, eye.y + (dy + py * c) * 20), C.dim, 1, [5, 4]);
    }
    // the camera plane (screen window)
    line(ctx, ...S(eye.x + dx - px, eye.y + dy - py), ...S(eye.x + dx + px, eye.y + dy + py), C.plane, 3);
    arrow(ctx, ...S(eye.x + dx, eye.y + dy), ...S(eye.x + dx + px, eye.y + dy + py), C.plane, 2);
    label(ctx, 'p', view.sx(eye.x + dx + px * 1.1) + 4, view.sy(eye.y + dy + py * 1.1), C.plane, 'left', 'middle', 14);
    label(ctx, 'c=-1', view.sx(eye.x + dx - px) - 4, view.sy(eye.y + dy - py) - 10, C.dim, 'center');
    label(ctx, 'c=+1', view.sx(eye.x + dx + px) - 4, view.sy(eye.y + dy + py) + 12, C.dim, 'center');
    arrow(ctx, ...S(eye.x, eye.y), ...S(tip.x, tip.y), C.dir, 3);
    label(ctx, 'd', view.sx(eye.x + dx * 0.5) - 10, view.sy(eye.y + dy * 0.5) - 8, C.dir, 'left', 'middle', 14);

    // Camera-space coordinates of the target: (u, v) = M⁻¹ · (q − pos)
    const rx = target.x - eye.x, ry = target.y - eye.y;
    const det = px * dy - dx * py;
    const invDet = 1 / det;
    const u = invDet * (dy * rx - dx * ry);
    const v = invDet * (-py * rx + px * ry);

    // decomposition: eye → eye + v·d → eye + v·d + u·p (= target)
    const mx = eye.x + dx * v, my = eye.y + dy * v;
    line(ctx, ...S(eye.x, eye.y), ...S(mx, my), C.dir, 1.5, [5, 4]);
    line(ctx, ...S(mx, my), ...S(target.x, target.y), C.plane, 1.5, [5, 4]);
    label(ctx, 'v·d', view.sx((eye.x + mx) / 2) + 6, view.sy((eye.y + my) / 2) + 10, C.dir);
    label(ctx, 'u·p', view.sx((mx + target.x) / 2) + 6, view.sy((my + target.y) / 2) - 10, C.plane);

    disc(ctx, ...S(eye.x, eye.y), 6, C.player);
    ring(ctx, ...S(tip.x, tip.y), 7, C.dir);
    disc(ctx, ...S(target.x, target.y), 5, C.hit);
    ring(ctx, ...S(target.x, target.y), 8, C.hit);
    label(ctx, 'target', view.sx(target.x) + 11, view.sy(target.y), C.hit);
    ctx.restore();

    // ---- the screen strip
    const sx0 = 40, sx1 = w - 40, sy = MAP_H + 34;
    line(ctx, 0, MAP_H, w, MAP_H, C.axis, 1);
    label(ctx, `screen: ${SCREEN_W} columns, left → right`, sx0, MAP_H + 13, C.dim);
    ctx.fillStyle = '#1d2027';
    ctx.fillRect(sx0, sy - 12, sx1 - sx0, 24);
    for (let i = 0; i < n; i++) {
      const x = sx0 + (sx1 - sx0) * (i + 0.5) / n;
      line(ctx, x, sy - 12, x, sy + 12, C.ray, 1);
    }
    const cT = u / v;
    let where;
    if (v <= 0) {
      where = 'behind the camera (v ≤ 0): not drawn';
    } else if (Math.abs(cT) > 1) {
      where = `outside the FOV (|u/v| = ${Math.abs(cT).toFixed(2)} > 1)`;
    } else {
      const col = SCREEN_W / 2 * (1 + cT);
      where = `screenX = ${SCREEN_W}/2 · (1 + u/v) = ${col.toFixed(1)}`;
      const x = sx0 + (sx1 - sx0) * (1 + cT) / 2;
      disc(ctx, x, sy, 6, C.hit);
    }
    label(ctx, where, sx0, sy + 26, v > 0 && Math.abs(cT) <= 1 ? C.text : C.warn);

    readout.textContent =
      `d = (${fmt(dx)}, ${fmt(dy)})   p = (${fmt(px)}, ${fmt(py)})   |p| = tan(FOV/2) = ${fmt(k)}\n` +
      `M = [ ${fmt(px)}  ${fmt(dx)} ]   det = ${fmt(det, 3)}\n` +
      `    [ ${fmt(py)}  ${fmt(dy)} ]\n` +
      `target − pos = (${fmt(rx)}, ${fmt(ry)})  →  u = ${fmt(u)}, v = ${fmt(v)}   u/v = ${v ? fmt(u / v) : '-'}`;
  }
  animate(draw);
})();
