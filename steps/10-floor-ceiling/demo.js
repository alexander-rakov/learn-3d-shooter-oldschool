'use strict';
// Step 10 demo: textured floor and ceiling; hover a pixel to see the world point it shows.

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

/** Top-down view of the level, the player, some rays, and the point under the mouse. */
function drawMinimap(mm, map, p, hits, picked) {
  const { ctx, w, h } = mm;
  const view = makeView(w / map.w, 0, 0);
  clear(ctx, w, h);
  drawMap(ctx, view, map, MINIMAP_COLORS);
  for (let x = 0; x < hits.length; x += 8) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(hits[x].hitX), view.sy(hits[x].hitY), 'rgba(76,201,240,0.5)', 1);
  }
  if (picked) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(picked.x), view.sy(picked.y), C.player, 2);
    disc(ctx, view.sx(picked.x), view.sy(picked.y), 4, C.player);
    ring(ctx, view.sx(picked.x), view.sy(picked.y), 8, C.player);
  }
  disc(ctx, view.sx(p.x), view.sy(p.y), 4, C.player);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.dirX), view.sy(p.y + p.dirY), C.dir, 2, 6);
}

(function floorDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-flat', 'g-shade']);
  const readout = document.getElementById('f-readout');
  const player = createPlayer(1.5, 6.5, 0.35);

  let hover = null;
  viewCanvas.addEventListener('pointermove', (e) => {
    const r = viewCanvas.getBoundingClientRect();
    hover = {
      x: Math.floor((e.clientX - r.left) * screen.w / r.width),
      y: Math.floor((e.clientY - r.top) * screen.h / r.height),
    };
  });
  viewCanvas.addEventListener('pointerleave', () => { hover = null; });

  animate((dt) => {
    movePlayer(LEVEL, player, keys, dt);
    const { columns, projScale } = renderFrame(screen, LEVEL, player,
      { flatFloor: ui['g-flat'], shadeSides: ui['g-shade'] });

    const hx = hover ? hover.x : 160, hy = hover ? hover.y : 170;
    const col = columns[Math.max(0, Math.min(screen.w - 1, hx))];
    const p = player;
    const c = 2 * hx / screen.w - 1;
    let picked, text;
    if (hy >= col.top && hy < col.bottom) {
      picked = { x: col.hitX, y: col.hitY };
      text = `pixel (${hx}, ${hy}) is WALL: cell (${col.mapX}, ${col.mapY}), depth ${col.dist.toFixed(3)}\n` +
             `(walls are columns; move the mouse above or below the wall)`;
    } else {
      const isFloor = hy >= screen.h / 2;
      const rowFromHorizon = Math.abs(hy + 0.5 - screen.h / 2);
      const rowDist = EYE_HEIGHT * projScale / rowFromHorizon;
      // world = pos + rowDist · M · (c, 1),  M = [p d]
      const mx = p.planeX * c + p.dirX, my = p.planeY * c + p.dirY;
      picked = { x: p.x + rowDist * mx, y: p.y + rowDist * my };
      const tx = ((picked.x * TEX) | 0) & (TEX - 1), ty = ((picked.y * TEX) | 0) & (TEX - 1);
      text =
        `pixel (${hx}, ${hy}) is ${isFloor ? 'FLOOR' : 'CEILING'}, ${rowFromHorizon.toFixed(1)} rows from the horizon\n` +
        `rowDist = ${EYE_HEIGHT} × ${projScale.toFixed(1)} / ${rowFromHorizon.toFixed(1)} = ${rowDist.toFixed(3)}     c = ${c.toFixed(3)}\n` +
        `M · (c, 1) = [${fmt(p.planeX)} ${fmt(p.dirX)}] · (${fmt(c)}, 1) = (${fmt(mx, 3)}, ${fmt(my, 3)})\n` +
        `             [${fmt(p.planeY)} ${fmt(p.dirY)}]\n` +
        `world = pos + rowDist · M·(c,1) = (${picked.x.toFixed(3)}, ${picked.y.toFixed(3)})  →  ` +
        `cell (${Math.floor(picked.x)}, ${Math.floor(picked.y)}), texel (${tx}, ${ty})`;
    }

    // crosshair on the view
    const g = screen.ctx;
    g.fillStyle = 'rgba(255,209,102,0.95)';
    g.fillRect(hx - 3, hy, 7, 1);
    g.fillRect(hx, hy - 3, 1, 7);

    drawMinimap(mm, LEVEL, player, columns, picked);
    readout.textContent = text;
  });
})();
