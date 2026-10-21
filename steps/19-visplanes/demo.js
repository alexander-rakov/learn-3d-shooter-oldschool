'use strict';
// Step 19 demos: the palette and COLORMAP, and the level drawn with
// visplanes, light levels and a sky.

/** n points on a circle, going counter-clockwise on screen: the outline of a hole. */
function holeRing(cx, cy, r, n) {
  return Array.from({ length: n }, (_, k) => [cx + r * Math.cos(-k * 2 * Math.PI / n), cy + r * Math.sin(-k * 2 * Math.PI / n)]);
}

// Step 18's level, now with light levels, an open sky over the courtyard,
// and a crypt whose light glows up and down.
const VERTICES = [
  [1, 2], [7, 2], [7, 2.5], [7, 4], [7, 6.5], [7, 7.5], [7, 8], [5, 8], [3, 8], [1, 8],          // 0–9: start room
  [8, 2.5], [8, 4],                                                                               // 10–11: window
  [8, 6.5], [8, 7.5],                                                                             // 12–13: passage
  [8, 1], [16, 1], [16, 4], [13, 4], [11, 4], [16, 6], [13, 6], [11, 6], [8, 6], [16, 9], [8, 9], // 14–24: courtyard
  [3, 8.6], [5, 8.6], [3, 9.2], [5, 9.2], [3, 9.8], [5, 9.8], [3, 10.4], [5, 10.4],              // 25–32: stairs
  [2, 10.4], [6, 10.4], [7, 11.4], [7, 13], [6, 14], [2, 14], [1, 13], [1, 11.4],                // 33–40: crypt
  [4.6, 5.05], [4.05, 5.6], [4.6, 6.15], [5.15, 5.6],                                            // 41–44: diamond pillar
  ...holeRing(4, 12.2, 0.45, 8),                                                                  // 45–52: crypt pillar
];

const LEVEL = buildBSP(buildMap({
  vertices: VERTICES,
  sectors: [
    { name: 'start room', floor: 0, ceil: 1.5, wall: 1, light: 176, loops: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { v: [41, 42, 43, 44], wall: 3 }] },
    { name: 'window', floor: 0.45, ceil: 1.15, wall: 1, light: 176, loops: [[2, 10, 11, 3]] },
    { name: 'passage', floor: 0, ceil: 1, wall: 1, light: 144, loops: [[4, 12, 13, 5]] },
    { name: 'courtyard', floor: -0.25, ceil: 2.5, wall: 4, floorTex: 2, ceilTex: SKY, light: 255,
      loops: [[14, 15, 16, 19, 23, 24, 13, 12, 22, 11, 10], [18, 21, 20, 17]] },
    { name: 'platform', floor: 0.1, ceil: 2.5, wall: 3, floorTex: 4, ceilTex: SKY, light: 255, loops: [[18, 17, 20, 21]] },
    { name: 'step 1', floor: -0.125, ceil: 0.975, wall: 2, floorTex: 3, light: 176, loops: [[8, 7, 26, 25]] },
    { name: 'step 2', floor: -0.25, ceil: 0.85, wall: 2, floorTex: 3, light: 160, loops: [[25, 26, 28, 27]] },
    { name: 'step 3', floor: -0.375, ceil: 0.725, wall: 2, floorTex: 3, light: 144, loops: [[27, 28, 30, 29]] },
    { name: 'step 4', floor: -0.5, ceil: 0.6, wall: 2, floorTex: 3, light: 128, loops: [[29, 30, 32, 31]] },
    { name: 'crypt', floor: -0.5, ceil: 0.6, wall: 2, floorTex: 3, ceilTex: 3, light: 136,
      loops: [[33, 31, 32, 34, 35, 36, 37, 38, 39, 40], { v: [45, 46, 47, 48, 49, 50, 51, 52], wall: 1 }] },
  ],
}));


const CRYPT = LEVEL.sectors.find((s) => s.name === 'crypt');

function fillSector(ctx, view, sector, color) {
  ctx.beginPath();
  for (const loop of sector.loops) {
    loop.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, view.sx(v.x), view.sy(v.y)));
    ctx.closePath();
  }
  ctx.fillStyle = color;
  ctx.fill('evenodd');
}

/** '#rrggbb' for a packed pixel, for the canvas. */
function css(c) {
  return '#' + [c & 0xFF, (c >>> 8) & 0xFF, (c >>> 16) & 0xFF].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------ demo 1: palette and COLORMAP

(function colormapDemo() {
  const { canvas, ctx, w, h } = setupCanvas(document.getElementById('c-map'));
  const readout = document.getElementById('c-readout');
  const CELL_W = 2.5, CELL_H = 4, TOP = 40;           // 256 × 32 cells under a strip showing the palette
  let hover = null;

  // Sort the columns by brightness so the table is easier to read. (The
  // palette itself isn't sorted; the order of its entries doesn't matter.)
  const order = Array.from({ length: 256 }, (_, i) => i);
  const lum = (c) => 0.3 * (c & 0xFF) + 0.59 * ((c >>> 8) & 0xFF) + 0.11 * ((c >>> 16) & 0xFF);
  order.sort((a, b) => lum(PALETTE[b]) - lum(PALETTE[a]));

  canvas.addEventListener('pointermove', (e) => {
    const pt = canvasPoint(canvas, e);
    const col = Math.floor((pt.x - 0) / CELL_W), row = Math.floor((pt.y - TOP) / CELL_H);
    hover = col >= 0 && col < 256 && row >= 0 && row < LIGHT_LEVELS ? { col, row } : null;
    draw();
  });
  canvas.addEventListener('pointerleave', () => { hover = null; draw(); });

  function draw() {
    clear(ctx, w, h);
    for (let i = 0; i < 256; i++) {
      ctx.fillStyle = css(PALETTE[order[i]]);
      ctx.fillRect(i * CELL_W, 6, CELL_W + 0.5, 26);
    }
    for (let level = 0; level < LIGHT_LEVELS; level++) {
      for (let i = 0; i < 256; i++) {
        ctx.fillStyle = css(PALETTE[COLORMAP[level * 256 + order[i]]]);
        ctx.fillRect(i * CELL_W, TOP + level * CELL_H, CELL_W + 0.5, CELL_H);
      }
    }
    let text = 'top strip: the 256-colour palette (sorted by brightness for display)\n' +
      'rows below: the COLORMAP, level 0 (full bright) at the top to 31 at the bottom\n';
    if (hover) {
      const idx = order[hover.col], out = COLORMAP[hover.row * 256 + idx];
      const k = 1 - hover.row / LIGHT_LEVELS, c = PALETTE[idx], o = PALETTE[out];
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(hover.col * CELL_W - 1, TOP + hover.row * CELL_H - 1, CELL_W + 2, CELL_H + 2);
      text += `level ${hover.row}: palette index ${idx} ${css(c)} × ${k.toFixed(3)} = ` +
        `rgb(${Math.round((c & 0xFF) * k)}, ${Math.round(((c >>> 8) & 0xFF) * k)}, ${Math.round(((c >>> 16) & 0xFF) * k)})` +
        `  →  nearest palette entry: index ${out} ${css(o)}`;
    } else {
      text += 'hover a cell';
    }
    readout.textContent = text;
  }
  draw();
})();

// ------------------------------------------------------------ demo 2: the level

(function levelDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const mmView = makeView(14.5, -2, 4);
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-planes', 'g-diminish', 'g-true', 'g-light']);
  const readout = document.getElementById('g-readout');
  const player = createPlayer(2.2, 4.4, 0.25);
  player.sector = subsectorAt(LEVEL, player.x, player.y).sector;
  const START = LEVEL.sectors.find((s) => s.name === 'start room');

  let hover = null;
  viewCanvas.addEventListener('pointermove', (e) => {
    const r = viewCanvas.getBoundingClientRect();
    hover = { x: Math.floor((e.clientX - r.left) * screen.w / r.width), y: Math.floor((e.clientY - r.top) * screen.h / r.height) };
  });
  viewCanvas.addEventListener('pointerleave', () => { hover = null; });

  animate((dt, time) => {
    // A glowing light, like Doom's light specials: the crypt's level swings between 96 and 176.
    CRYPT.light = Math.round(136 + 40 * Math.sin(time * 2.5));
    START.light = ui['g-light'];
    movePlayer(LEVEL, player, keys, dt);
    const t0 = performance.now();
    const { planes, stats } = renderFrame(screen, LEVEL, player,
      { showPlanes: ui['g-planes'], diminish: ui['g-diminish'], trueColor: ui['g-true'] });
    const ms = performance.now() - t0;
    const p = player;

    // Which visplane is under the pointer?
    let picked = null;
    if (hover) {
      picked = planes.find((pl) => hover.x >= pl.minx && hover.x <= pl.maxx &&
        hover.y >= pl.top[hover.x + 1] && hover.y <= pl.bottom[hover.x + 1]);
    }

    const { ctx, w, h } = mm;
    clear(ctx, w, h);
    for (const s of LEVEL.sectors) {
      const k = s.light / 255;
      fillSector(ctx, mmView, s, `rgba(255,220,150,${(0.05 + 0.3 * k * k).toFixed(3)})`);
    }
    for (const s of LEVEL.sectors) for (const g of s.segs) {
      line(ctx, mmView.sx(g.v1.x), mmView.sy(g.v1.y), mmView.sx(g.v2.x), mmView.sy(g.v2.y), g.back ? 'rgba(248,150,30,0.35)' : C.wallEdge, 1);
    }
    for (const sgn of [-1, 1]) {
      line(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + (p.dirX + sgn * p.planeX) * 30),
        mmView.sy(p.y + (p.dirY + sgn * p.planeY) * 30), 'rgba(76,201,240,0.35)', 1);
    }
    disc(ctx, mmView.sx(p.x), mmView.sy(p.y), 4, C.player);
    arrow(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + p.dirX), mmView.sy(p.y + p.dirY), C.dir, 2, 6);

    const used = planes.filter((pl) => pl.minx <= pl.maxx);
    let text =
      `you stand in "${p.sector.name}", light ${p.sector.light}\n` +
      `${stats.segs} segs, ${used.length} visplanes, ${stats.spans} spans, ${stats.pixels} pixels, ${ms.toFixed(2)} ms\n`;
    if (picked) {
      const what = picked.tex === SKY ? 'the sky' : `${picked.height < p.z ? 'a floor' : 'a ceiling'} at height ${picked.height}, flat ${picked.tex}, light ${picked.light}`;
      text += `pixel (${hover.x}, ${hover.y}) is in visplane ${planes.indexOf(picked)}: ${what}, columns ${picked.minx}–${picked.maxx}`;
      if (picked.tex !== SKY) {
        const rowDist = Math.abs(p.z - picked.height) * (screen.w / 2) / Math.hypot(p.planeX, p.planeY) / Math.abs(hover.y + 0.5 - screen.h / 2);
        text += `\n  this row: distance ${rowDist.toFixed(2)}, COLORMAP level ${lightLevel(picked.light, rowDist, ui['g-diminish'])}`;
      }
    } else if (hover) {
      text += `pixel (${hover.x}, ${hover.y}) is a wall`;
    }
    readout.textContent = text;
  });
})();
