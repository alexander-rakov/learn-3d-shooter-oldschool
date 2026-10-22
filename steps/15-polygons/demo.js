'use strict';
// Step 15 demos: a map as vertices, linedefs, sidedefs and sectors; then the
// step 10 renderer on it, casting each ray against every linedef.

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

/** Distance in pixels from point (px, py) to a line's segment on screen. */
function screenDistToLine(view, line, px, py) {
  const x1 = view.sx(line.v1.x), y1 = view.sy(line.v1.y);
  const ex = view.sx(line.v2.x) - x1, ey = view.sy(line.v2.y) - y1;
  const s = Math.max(0, Math.min(1, ((px - x1) * ex + (py - y1) * ey) / (ex * ex + ey * ey)));
  return Math.hypot(px - (x1 + s * ex), py - (y1 + s * ey));
}

function describeSide(side) {
  if (!side) return 'none';
  return `sidedef ${side.id}: sector ${side.sector.id} "${side.sector.name}", texture ${side.texture}`;
}

// ------------------------------------------------------------ demo 1: the map

(function mapDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('m-map'));
  const view = makeView(36, 10, -8);
  const readout = document.getElementById('m-readout');
  let mouse = { x: 3 * 36 + 10, y: 8 * 36 - 8 };

  canvas.addEventListener('pointermove', (e) => { mouse = canvasPoint(canvas, e); draw(); });

  function draw() {
    clear(ctx, w, h);
    drawGrid(ctx, view, w, h);
    const wx = view.wx(mouse.x), wy = view.wy(mouse.y);

    // The hovered linedef, if the pointer is within 8 pixels of one…
    let picked = null, best = 8;
    for (const l of LEVEL.lines) {
      const d = screenDistToLine(view, l, mouse.x, mouse.y);
      if (d < best) { best = d; picked = l; }
    }
    // …otherwise the sector under the pointer.
    const sector = picked ? null : sectorAt(LEVEL, wx, wy);

    for (const s of LEVEL.sectors) fillSector(ctx, view, s, SECTOR_FILLS[s.id] + (s === sector ? '0.32)' : '0.1)'));
    if (picked) {
      if (picked.front) fillSector(ctx, view, picked.front.sector, SECTOR_FILLS[picked.front.sector.id] + '0.28)');
      if (picked.back) fillSector(ctx, view, picked.back.sector, SECTOR_FILLS[picked.back.sector.id] + '0.28)');
    }
    drawLines(ctx, view, LEVEL);
    for (const v of LEVEL.vertices) disc(ctx, view.sx(v.x), view.sy(v.y), 2.5, C.text);

    let text;
    if (picked) {
      const { v1, v2 } = picked;
      arrow(ctx, view.sx(v1.x), view.sy(v1.y), view.sx(v2.x), view.sy(v2.y), C.player, 3, 11);
      label(ctx, 'v' + v1.id, view.sx(v1.x) + 6, view.sy(v1.y) - 9, C.player);
      label(ctx, 'v' + v2.id, view.sx(v2.x) + 6, view.sy(v2.y) - 9, C.player);
      text =
        `linedef ${picked.id}: v${v1.id} (${v1.x.toFixed(2)}, ${v1.y.toFixed(2)}) → v${v2.id} (${v2.x.toFixed(2)}, ${v2.y.toFixed(2)})` +
        `, length ${picked.length.toFixed(2)}, ${picked.back ? 'TWO-SIDED (an opening)' : 'one-sided (a solid wall)'}\n` +
        `  front (right of v${v1.id} → v${v2.id}): ${describeSide(picked.front)}\n` +
        `  back  (left):                ${describeSide(picked.back)}`;
    } else if (sector) {
      const own = LEVEL.lines.filter((l) => l.front.sector === sector || (l.back && l.back.sector === sector));
      const open = own.filter((l) => l.back).length;
      text =
        `sector ${sector.id} "${sector.name}": floor ${sector.floor}, ceiling ${sector.ceil}, ` +
        `${own.length} linedefs (${own.length - open} one-sided, ${open} two-sided)\n` +
        `sectorAt(${wx.toFixed(2)}, ${wy.toFixed(2)}): the nearest linedef east of the pointer has this sector on our side\n` +
        `(hover a line to see its sidedefs)`;
    } else {
      text = `(${wx.toFixed(2)}, ${wy.toFixed(2)}) is outside every sector: the void, or inside a pillar\n` +
        `sectorAt: the nearest linedef to the east has no sidedef on this side\n `;
    }

    // Show sectorAt's search: the horizontal ray east to the nearest crossing.
    if (!picked) {
      let nearest = Infinity;
      for (const l of LEVEL.lines) {
        if ((l.v1.y > wy) === (l.v2.y > wy)) continue;
        const cx = l.v1.x + (wy - l.v1.y) / l.dy * l.dx;
        if (cx >= wx && cx - wx < nearest) nearest = cx - wx;
      }
      if (isFinite(nearest)) {
        line(ctx, mouse.x, mouse.y, view.sx(wx + nearest), mouse.y, C.ray, 1.5, [3, 3]);
        disc(ctx, view.sx(wx + nearest), mouse.y, 4, C.ray);
      }
      disc(ctx, mouse.x, mouse.y, 4, C.player);
    }
    readout.textContent = text;
  }
  draw();
})();

// ------------------------------------------------------------ the cross product, one line and one point

(function crossDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('x-canvas'));
  const view = makeView(40, w / 2, h / 2);   // 40 px per unit, origin in the middle, y down
  const readout = document.getElementById('x-readout');
  const v1 = { x: -3.5, y: 1.5 }, v2 = { x: 3, y: -1.5 }, q = { x: 0.5, y: 2 };
  enableDrag(canvas, view, [v1, v2, q]);

  function draw() {
    clear(ctx, w, h);
    drawGrid(ctx, view, w, h);
    const ex = v2.x - v1.x, ey = v2.y - v1.y, len = Math.hypot(ex, ey) || 1e-9;
    const ux = ex / len, uy = ey / len;            // along the line
    const nx = -uy, ny = ux;                       // perp(e) / |e|: towards the front
    const qx = q.x - v1.x, qy = q.y - v1.y;
    const c = cross(ex, ey, qx, qy);
    const dist = c / len;                          // signed distance from the line

    // The front half-plane: a big quad on the perp(e) side of the line.
    const far = 40;
    ctx.beginPath();
    [[-far, 0], [far, 0], [far, far], [-far, far]].forEach(([a, b], i) => {
      const x = view.sx(v1.x + ux * a + nx * b), y = view.sy(v1.y + uy * a + ny * b);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(6,214,160,0.10)';
    ctx.fill();
    line(ctx, view.sx(v1.x - ux * far), view.sy(v1.y - uy * far), view.sx(v1.x + ux * far), view.sy(v1.y + uy * far), C.axis, 1, [4, 4]);

    // The linedef, its perp(e), and q − v1.
    arrow(ctx, view.sx(v1.x), view.sy(v1.y), view.sx(v2.x), view.sy(v2.y), C.player, 3);
    const mx = (v1.x + v2.x) / 2, my = (v1.y + v2.y) / 2;
    arrow(ctx, view.sx(mx), view.sy(my), view.sx(mx + nx * 1.5), view.sy(my + ny * 1.5), C.plane, 2);
    label(ctx, 'perp(e)', view.sx(mx + nx * 1.5) + 6, view.sy(my + ny * 1.5), C.plane);
    arrow(ctx, view.sx(v1.x), view.sy(v1.y), view.sx(q.x), view.sy(q.y), C.ray, 2);
    // q's distance from the line, straight along perp(e).
    line(ctx, view.sx(q.x), view.sy(q.y), view.sx(q.x - nx * dist), view.sy(q.y - ny * dist), C.dim, 1.5, [3, 3]);

    disc(ctx, view.sx(v1.x), view.sy(v1.y), 5, C.player);
    disc(ctx, view.sx(v2.x), view.sy(v2.y), 5, C.player);
    label(ctx, 'v1', view.sx(v1.x) + 8, view.sy(v1.y) + 12, C.player);
    label(ctx, 'v2', view.sx(v2.x) + 8, view.sy(v2.y) - 10, C.player);
    disc(ctx, view.sx(q.x), view.sy(q.y), 5, C.ray);
    label(ctx, 'q', view.sx(q.x) + 8, view.sy(q.y) - 10, C.ray);
    label(ctx, 'front', view.sx(mx + nx * 3), view.sy(my + ny * 3), C.plane, 'center');
    label(ctx, 'back', view.sx(mx - nx * 3), view.sy(my - ny * 3), C.dim, 'center');

    const side = Math.abs(c) < 1e-9 ? 'ON the line (counts as front)' : c > 0 ? 'FRONT (pointOnSide = 0)' : 'BACK (pointOnSide = 1)';
    readout.textContent =
      `e      = v2 − v1 = (${fmt(ex)}, ${fmt(ey)})      perp(e) = (${fmt(-ey)}, ${fmt(ex)})\n` +
      `q − v1 = (${fmt(qx)}, ${fmt(qy)})\n` +
      `cross(e, q − v1) = (${fmt(ex)})·(${fmt(qy)}) − (${fmt(ey)})·(${fmt(qx)}) = ${fmt(c)}   = perp(e) · (q − v1)\n` +
      `                 = |e| × distance = ${fmt(len)} × ${fmt(dist)}     →  q is ${side}`;
  }
  animate(draw);
})();

// ------------------------------------------------------------ demo 2: rendering it

(function renderDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const mmView = makeView(13.2, 4, 20);
  const keys = keyboard(document.getElementById('g-game'));
  const readout = document.getElementById('g-readout');
  const player = createPlayer(2.6, 8.4, -0.35);

  let hoverX = null;
  viewCanvas.addEventListener('pointermove', (e) => {
    const r = viewCanvas.getBoundingClientRect();
    hoverX = Math.floor((e.clientX - r.left) * screen.w / r.width);
  });
  viewCanvas.addEventListener('pointerleave', () => { hoverX = null; });

  animate((dt) => {
    movePlayer(LEVEL, player, keys, dt);
    const t0 = performance.now();
    const { columns, tests } = renderFrame(screen, LEVEL, player);
    const ms = performance.now() - t0;

    const x = hoverX ?? screen.w / 2;
    const col = columns[x];
    const p = player;
    const c = 2 * x / screen.w - 1;
    const rx = p.dirX + p.planeX * c, ry = p.dirY + p.planeY * c;

    // Every one-sided linedef this ray crosses in front of us: only the nearest is drawn.
    const crossings = [];
    for (const l of LEVEL.lines) {
      if (l.back) continue;
      const denom = cross(rx, ry, l.dx, l.dy);
      if (denom === 0) continue;
      const qx = l.v1.x - p.x, qy = l.v1.y - p.y;
      const t = cross(qx, qy, l.dx, l.dy) / denom, s = cross(qx, qy, rx, ry) / denom;
      if (t > 0 && s >= 0 && s <= 1) crossings.push({ t, l });
    }
    crossings.sort((a, b) => a.t - b.t);

    // Mark the column on the view.
    const g = screen.ctx;
    g.fillStyle = 'rgba(255,209,102,0.5)';
    g.fillRect(x, 0, 1, 4);
    g.fillRect(x, screen.h - 4, 1, 4);

    // Minimap: the lines, a fan of rays, and the hovered ray with all its crossings.
    const { ctx, w, h } = mm;
    clear(ctx, w, h);
    for (const s of LEVEL.sectors) fillSector(ctx, mmView, s, 'rgba(255,255,255,0.05)');
    drawLines(ctx, mmView, LEVEL, false);
    for (let i = 0; i < columns.length; i += 10) {
      if (!columns[i]) continue;
      line(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(columns[i].hitX), mmView.sy(columns[i].hitY), 'rgba(76,201,240,0.35)', 1);
    }
    const far = crossings.length ? crossings[crossings.length - 1].t + 1 : 4;
    line(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + rx * far), mmView.sy(p.y + ry * far), 'rgba(255,209,102,0.4)', 1, [3, 3]);
    crossings.forEach((k, i) => {
      const px = mmView.sx(p.x + rx * k.t), py = mmView.sy(p.y + ry * k.t);
      if (i === 0) { line(ctx, mmView.sx(p.x), mmView.sy(p.y), px, py, C.player, 2); disc(ctx, px, py, 4, C.player); }
      else ring(ctx, px, py, 3.5, C.warn, 1.5);
    });
    disc(ctx, mmView.sx(p.x), mmView.sy(p.y), 4, C.player);
    arrow(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + p.dirX), mmView.sy(p.y + p.dirY), C.dir, 2, 6);

    const sector = sectorAt(LEVEL, p.x, p.y);
    let text =
      `you are in sector ${sector ? sector.id + ' "' + sector.name + '"' : '?'}, at (${p.x.toFixed(2)}, ${p.y.toFixed(2)})\n` +
      `this frame: ${screen.w} rays × ${LEVEL.lines.length} linedefs = ${tests} intersection tests, ${ms.toFixed(2)} ms\n`;
    if (col) {
      text +=
        `column ${x}: the ray crosses ${crossings.length} one-sided linedefs ahead; nearest is linedef ${col.line.id} ` +
        `(texture ${col.line.front.texture})\n` +
        `  t = ${col.dist.toFixed(3)} (depth)   s = ${col.s.toFixed(3)} along it   ` +
        `u = s × length = ${col.wallU.toFixed(3)}  →  texture column ${col.texX}`;
    }
    readout.textContent = text;
  });
})();
