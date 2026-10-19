'use strict';
// Step 9 demo: textured walls, with a texture inspector for the column under the mouse.

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

/** Top-down view of the level, the player, some rays, and the inspected column's ray. */
function drawMinimap(mm, map, p, hits, picked) {
  const { ctx, w, h } = mm;
  const view = makeView(w / map.w, 0, 0);
  clear(ctx, w, h);
  drawMap(ctx, view, map, MINIMAP_COLORS);
  for (let x = 0; x < hits.length; x += 8) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(hits[x].hitX), view.sy(hits[x].hitY), 'rgba(76,201,240,0.5)', 1);
  }
  if (picked) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(picked.hitX), view.sy(picked.hitY), C.player, 2);
    disc(ctx, view.sx(picked.hitX), view.sy(picked.hitY), 3, C.player);
  }
  disc(ctx, view.sx(p.x), view.sy(p.y), 4, C.player);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.dirX), view.sy(p.y + p.dirY), C.dir, 2, 6);
}

(function textureDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const texCanvas = setupCanvas(document.getElementById('t-tex'));
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-shade', 'g-uv']);
  const readout = document.getElementById('t-readout');
  const player = createPlayer(1.5, 6.5, 0.35);

  // Put each texture on a small offscreen canvas once, so it can be drawn scaled up.
  const texImages = WALL_TEXTURES.map((tex) => {
    if (!tex) return null;
    const c = document.createElement('canvas');
    c.width = c.height = TEX;
    const g = c.getContext('2d');
    const img = g.createImageData(TEX, TEX);
    const out = new Uint32Array(img.data.buffer);
    for (let u = 0; u < TEX; u++) for (let v = 0; v < TEX; v++) out[v * TEX + u] = tex[u * TEX + v];
    g.putImageData(img, 0, 0);
    return c;
  });

  let hoverX = -1;
  viewCanvas.addEventListener('pointermove', (e) => {
    const r = viewCanvas.getBoundingClientRect();
    hoverX = Math.floor((e.clientX - r.left) * screen.w / r.width);
  });
  viewCanvas.addEventListener('pointerleave', () => { hoverX = -1; });

  animate((dt) => {
    movePlayer(LEVEL, player, keys, dt);
    const cols = renderFrame(screen, LEVEL, player, { shadeSides: ui['g-shade'], debugUV: ui['g-uv'] });
    const x = hoverX >= 0 ? hoverX : screen.w >> 1;
    const col = cols[x];

    // marker on the 3D view: which column we're inspecting
    const g = screen.ctx;
    g.fillStyle = 'rgba(255,209,102,0.9)';
    g.fillRect(x, 0, 1, 3);
    g.fillRect(x, screen.h - 3, 1, 3);

    drawMinimap(mm, LEVEL, player, cols, col);

    // texture inspector
    const { ctx, w, h } = texCanvas;
    clear(ctx, w, h);
    const size = 224, ox = 8, oy = 8;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(texImages[col.cell] || texImages[1], ox, oy, size, size);
    const k = size / TEX;
    ctx.strokeStyle = C.player;
    ctx.lineWidth = 2;
    ctx.strokeRect(ox + col.texX * k, oy, k, size);
    label(ctx, `texX = ${col.texX}`, ox + col.texX * k + (col.texX < 40 ? k + 4 : -4), oy + size + 12,
          C.player, col.texX < 40 ? 'left' : 'right');

    // the sampled column, stretched to its on-screen height (clipped to the screen)
    const sx = ox + size + 24, colW = 20;
    label(ctx, 'on screen', sx + colW / 2, oy + 2, C.dim, 'center', 'top', 10);
    const scaleY = size / screen.h;
    const tex = WALL_TEXTURES[col.cell] || WALL_TEXTURES[1];
    for (let y = col.top; y < col.bottom; y++) {
      const wallTop = screen.h / 2 - col.lineHeight / 2;
      const texY = (((y + 0.5 - wallTop) * col.step) | 0) & (TEX - 1);
      let c = tex[col.texX * TEX + texY];
      ctx.fillStyle = `rgb(${c & 255},${(c >> 8) & 255},${(c >> 16) & 255})`;
      ctx.fillRect(sx, oy + 14 + y * scaleY, colW, Math.ceil(scaleY));
    }
    ctx.strokeStyle = C.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(sx, oy + 14, colW, screen.h * scaleY);

    readout.textContent =
      `column x = ${x}   hit cell (${col.mapX}, ${col.mapY}) type ${col.cell}   side = ${col.side}\n` +
      `depth t = ${col.dist.toFixed(3)}   lineHeight = ${col.lineHeight.toFixed(1)} px   rows ${col.top}…${col.bottom - 1} visible\n` +
      `wallX = ${col.wallX.toFixed(3)}  →  texX = floor(wallX × 64) = ${col.texX}\n` +
      `step = 64 / lineHeight = ${col.step.toFixed(3)} texels per pixel` +
      (col.step < 1 ? '  (magnified: texels repeat)' : '  (minified: texels skipped)');
  });
})();
