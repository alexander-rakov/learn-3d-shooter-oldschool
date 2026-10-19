'use strict';
// Step 1 demo: two draggable vectors and what you can compute from them.

const add   = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const sub   = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const scale = (a, k) => ({ x: a.x * k,   y: a.y * k });
const dot   = (a, b) => a.x * b.x + a.y * b.y;
const len   = (a)    => Math.hypot(a.x, a.y);
const norm  = (a)    => scale(a, 1 / len(a));
const perp  = (a)    => ({ x: -a.y, y: a.x });

(function vectorDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('v-canvas'));
  const view = makeView(40, w / 2, h / 2);   // world origin in the middle, 40 px per unit
  const ui = controls(['v-sum', 'v-proj', 'v-perp']);
  const readout = document.getElementById('v-readout');

  const a = { x: 3, y: -1 };
  const b = { x: 1, y: -3 };
  enableDrag(canvas, view, [a, b]);

  const vec = (v) => `(${fmt(v.x)}, ${fmt(v.y)})`;

  function draw() {
    clear(ctx, w, h);
    drawGrid(ctx, view, w, h);
    line(ctx, 0, view.sy(0), w, view.sy(0), C.axis, 1.5);
    line(ctx, view.sx(0), 0, view.sx(0), h, C.axis, 1.5);
    label(ctx, '+x', w - 8, view.sy(0) - 10, C.dim, 'right');
    label(ctx, '+y (down)', view.sx(0) + 6, h - 10, C.dim);

    const O = { x: 0, y: 0 };
    const S = (p) => [view.sx(p.x), view.sy(p.y)];

    if (ui['v-sum']) {
      const s = add(a, b);
      line(ctx, ...S(a), ...S(s), C.dim, 1, [4, 4]);
      line(ctx, ...S(b), ...S(s), C.dim, 1, [4, 4]);
      arrow(ctx, ...S(O), ...S(s), C.hit, 1.5);
      label(ctx, 'a+b', view.sx(s.x) + 8, view.sy(s.y), C.hit);
    }
    if (ui['v-proj'] && len(a) > 1e-6) {
      const an = norm(a);
      const foot = scale(an, dot(b, an));          // projection of b onto a's line
      // extend a's line so the foot is visible even when it falls outside a
      const far = 20;
      line(ctx, ...S(scale(an, -far)), ...S(scale(an, far)), 'rgba(239,71,111,0.25)', 1);
      line(ctx, ...S(b), ...S(foot), C.ray, 1, [3, 3]);
      line(ctx, ...S(O), ...S(foot), C.player, 4);
      disc(ctx, ...S(foot), 3.5, C.player);
      label(ctx, 'proj', view.sx(foot.x) + 8, view.sy(foot.y) + 12, C.player);
    }
    if (ui['v-perp']) {
      const p = perp(a);
      arrow(ctx, ...S(O), ...S(p), C.plane, 2);
      label(ctx, 'perp(a)', view.sx(p.x) + 8, view.sy(p.y), C.plane);
    }

    arrow(ctx, ...S(O), ...S(a), C.dir, 2.5);
    arrow(ctx, ...S(O), ...S(b), C.ray, 2.5);
    ring(ctx, ...S(a), 7, C.dir);
    ring(ctx, ...S(b), 7, C.ray);
    label(ctx, 'a', view.sx(a.x) + 10, view.sy(a.y) - 10, C.dir, 'left', 'middle', 14);
    label(ctx, 'b', view.sx(b.x) + 10, view.sy(b.y) - 10, C.ray, 'left', 'middle', 14);

    const la = len(a), lb = len(b), d = dot(a, b);
    const cos = la && lb ? d / (la * lb) : 0;
    const angle = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    readout.textContent =
      `a       = ${vec(a)}    |a| = ${fmt(la)}    norm(a) = ${la ? vec(norm(a)) : '-'}\n` +
      `b       = ${vec(b)}    |b| = ${fmt(lb)}\n` +
      `a + b   = ${vec(add(a, b))}    b - a = ${vec(sub(b, a))}\n` +
      `a · b   = ${fmt(d)}    angle between = ${angle.toFixed(1)}°    ` +
      `(${d > 1e-9 ? 'same side' : d < -1e-9 ? 'pointing away' : 'perpendicular'})\n` +
      `proj of b on a = (a · b) / |a| = ${la ? fmt(d / la) : '-'}\n` +
      `perp(a) = ${vec(perp(a))}    a · perp(a) = ${fmt(dot(a, perp(a)))}`;
  }
  animate(draw);
})();

(function fixedPointDemo() {
  const inA = document.getElementById('fx-a');
  const inB = document.getElementById('fx-b');
  const out = document.getElementById('fx-readout');

  const toFixed = (v) => Math.round(v * 65536) | 0;           // clamp into int32
  const hex = (i) => '0x' + (i >>> 0).toString(16).toUpperCase().padStart(8, '0');

  function update() {
    const a = parseFloat(inA.value) || 0, b = parseFloat(inB.value) || 0;
    const fa = toFixed(a), fb = toFixed(b);
    // BigInt to show the full 64-bit intermediate, like FixedMul does in assembly.
    const wide = BigInt(fa) * BigInt(fb);
    const prod = Number(wide >> 16n);
    // high 16 bits = integer part (rounded down), low 16 bits = count of 1/65536 steps
    const split = (f) => {
      const frac = f & 0xFFFF;
      return `int = ${f >> 16}, frac = 0x${frac.toString(16).toUpperCase().padStart(4, '0')} ` +
             `= ${frac}/65536 = ${(frac / 65536).toFixed(6)}`;
    };
    out.textContent =
      `a  = ${a}  →  ${a} × 65536 = ${fa}  (${hex(fa)})   stored value = ${(fa / 65536).toFixed(6)}\n` +
      `      ${split(fa)}\n` +
      `b  = ${b}  →  ${b} × 65536 = ${fb}  (${hex(fb)})   stored value = ${(fb / 65536).toFixed(6)}\n` +
      `      ${split(fb)}\n` +
      `a_fixed × b_fixed = ${wide}  (needs ${wide === 0n ? 0 : (wide < 0n ? -wide : wide).toString(2).length + 1} bits!)\n` +
      `(a × b) >> 16     = ${prod}  →  ${(prod / 65536).toFixed(6)}   float result: ${(a * b).toFixed(6)}`;
  }
  inA.addEventListener('input', update);
  inB.addEventListener('input', update);
  update();
})();
