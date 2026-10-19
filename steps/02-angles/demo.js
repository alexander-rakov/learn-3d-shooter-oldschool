'use strict';
// Step 2 demo: unit circle, cos/sin, and the rotation matrix.

function rotate(v, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: v.x * c - v.y * s,
           y: v.x * s + v.y * c };
}

(function angleDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('a-canvas'));
  const R = 120;                                   // pixels per unit: the unit circle is 120 px
  const view = makeView(R, w / 2 - 20, h / 2);
  const ui = controls(['a-theta', 'a-quant']);
  const readout = document.getElementById('a-readout');

  // Snap an angle (radians) to an N-entry table, like a lookup table would.
  function quantize(theta, n) {
    if (!n) return theta;
    const step = Math.PI * 2 / n;
    return Math.round(theta / step) * step;
  }

  const tip = {                                    // handle on the unit circle
    x: 1, y: 0,
    constrain(p) {                                 // keep it on the circle; drive the slider
      let deg = Math.atan2(p.y, p.x) * 180 / Math.PI;
      if (deg < 0) deg += 360;
      ui['a-theta'] = deg.toFixed(1);
    },
  };
  const v = { x: 0.9, y: 0.35 };
  enableDrag(canvas, view, [tip, v]);

  function draw() {
    const n = parseInt(ui['a-quant'], 10);
    const theta = quantize(ui['a-theta'] * Math.PI / 180, n);
    const c = Math.cos(theta), s = Math.sin(theta);
    tip.x = c; tip.y = s;

    clear(ctx, w, h);
    drawGrid(ctx, makeView(R / 4, view.ox, view.oy), w, h);
    line(ctx, 0, view.sy(0), w, view.sy(0), C.axis, 1.5);
    line(ctx, view.sx(0), 0, view.sx(0), h, C.axis, 1.5);
    ring(ctx, view.sx(0), view.sy(0), R, C.axis, 1.5);
    label(ctx, 'θ=0 (east)', view.sx(1) + 6, view.sy(0) - 10, C.dim);
    label(ctx, 'θ=90° (south)', view.sx(0) + 6, view.sy(1) + 14, C.dim);

    if (n) {                                       // table entries as ticks
      for (let i = 0; i < Math.min(n, 360); i++) {
        const a = i * Math.PI * 2 / n;
        line(ctx, view.sx(Math.cos(a) * 0.96), view.sy(Math.sin(a) * 0.96),
                  view.sx(Math.cos(a) * 1.04), view.sy(Math.sin(a) * 1.04), C.dim, 1);
      }
    }

    // angle arc (canvas angles are also clockwise because canvas y points down)
    ctx.save();
    ctx.strokeStyle = C.player;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(view.sx(0), view.sy(0), 28, 0, theta);
    ctx.stroke();
    ctx.restore();
    label(ctx, 'θ', view.sx(Math.cos(theta / 2) * 0.33), view.sy(Math.sin(theta / 2) * 0.33), C.player);

    // cos and sin as projections onto the axes
    line(ctx, view.sx(0), view.sy(0), view.sx(c), view.sy(0), C.xSide, 4);
    line(ctx, view.sx(c), view.sy(0), view.sx(c), view.sy(s), C.ySide, 4);
    label(ctx, 'cos θ', view.sx(c / 2), view.sy(0) + (s >= 0 ? -12 : 12), C.xSide, 'center');
    label(ctx, 'sin θ', view.sx(c) + (c >= 0 ? 8 : -8), view.sy(s / 2), C.ySide, c >= 0 ? 'left' : 'right');

    arrow(ctx, view.sx(0), view.sy(0), view.sx(c), view.sy(s), C.dir, 3);
    ring(ctx, view.sx(c), view.sy(s), 7, C.dir);

    const rv = rotate(v, theta);
    arrow(ctx, view.sx(0), view.sy(0), view.sx(v.x), view.sy(v.y), C.ray, 2);
    arrow(ctx, view.sx(0), view.sy(0), view.sx(rv.x), view.sy(rv.y), C.plane, 2);
    ring(ctx, view.sx(v.x), view.sy(v.y), 7, C.ray);
    label(ctx, 'v', view.sx(v.x) + 9, view.sy(v.y) - 9, C.ray, 'left', 'middle', 14);
    label(ctx, 'R·v', view.sx(rv.x) + 9, view.sy(rv.y) - 9, C.plane, 'left', 'middle', 14);

    const deg = theta * 180 / Math.PI;
    readout.textContent =
      `θ = ${deg.toFixed(2)}° = ${theta.toFixed(4)} rad      dir = (cos θ, sin θ) = (${fmt(c, 4)}, ${fmt(s, 4)})\n` +
      `atan2(sin θ, cos θ) = ${(Math.atan2(s, c) * 180 / Math.PI).toFixed(2)}°\n\n` +
      `R(θ) = [ ${fmt(c, 3)}  ${fmt(-s, 3)} ]      v   = (${fmt(v.x)}, ${fmt(v.y)})   |v|   = ${fmt(Math.hypot(v.x, v.y))}\n` +
      `       [ ${fmt(s, 3)}  ${fmt(c, 3)} ]      R·v = (${fmt(rv.x)}, ${fmt(rv.y)})   |R·v| = ${fmt(Math.hypot(rv.x, rv.y))}`;
  }
  animate(draw);
})();
