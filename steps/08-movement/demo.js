'use strict';
// Step 8 demo: movement with collision, and a zoomed minimap showing the collision box.

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

/** A zoomed top-down view centred on the player, showing the collision box. */
function drawCollisionMap(mm, map, p, hits, radius, blocked) {
  const { ctx, w, h } = mm;
  const scale = 30;
  const view = makeView(scale, w / 2 - p.x * scale, h / 2 - p.y * scale);
  clear(ctx, w, h);
  drawMap(ctx, view, map, MINIMAP_COLORS);
  for (let x = 0; x < hits.length; x += 16) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(hits[x].hitX), view.sy(hits[x].hitY), 'rgba(76,201,240,0.35)', 1);
  }
  // the cells isBlocked() looks at for the current position
  for (let cy = Math.floor(p.y - radius); cy <= Math.floor(p.y + radius); cy++) {
    for (let cx = Math.floor(p.x - radius); cx <= Math.floor(p.x + radius); cx++) {
      ctx.strokeStyle = 'rgba(255,209,102,0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(view.sx(cx) + 1, view.sy(cy) + 1, scale - 2, scale - 2);
    }
  }
  ctx.strokeStyle = blocked ? C.warn : C.player;
  ctx.lineWidth = 2;
  ctx.strokeRect(view.sx(p.x - radius), view.sy(p.y - radius), radius * 2 * scale, radius * 2 * scale);
  disc(ctx, view.sx(p.x), view.sy(p.y), 3, C.player);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.dirX), view.sy(p.y + p.dirY), C.dir, 2, 7);
  const pl = Math.hypot(p.planeX, p.planeY);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.planeX / pl * 0.7), view.sy(p.y + p.planeY / pl * 0.7), C.plane, 1.5, 6);
}

(function gameDemo() {
  const screen = createScreen(document.getElementById('g-view'));
  const mm = setupCanvas(document.getElementById('g-map'));
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-slide', 'g-radius']);
  const readout = document.getElementById('g-readout');
  const player = createPlayer(1.5, 6.5, 0);

  animate((dt) => {
    const radius = ui['g-radius'];
    const before = { x: player.x, y: player.y };
    movePlayer(LEVEL, player, keys, dt, { slide: ui['g-slide'], radius });
    const hits = renderFrame(screen, LEVEL, player);
    // "blocked" = we wanted to move but didn't get the full distance
    const moving = ['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].some((k) => keys.has(k));
    const moved = Math.hypot(player.x - before.x, player.y - before.y);
    const blocked = moving && moved < MOVE_SPEED * dt * 0.99;
    drawCollisionMap(mm, LEVEL, player, hits, radius, blocked);
    readout.textContent =
      `pos = (${fmt(player.x)}, ${fmt(player.y)})   dir = (${fmt(player.dirX)}, ${fmt(player.dirY)})   ` +
      `frame dt = ${(dt * 1000).toFixed(1)} ms   moved ${(moved).toFixed(3)} cells this frame` +
      (blocked ? '   (blocked)' : '');
  });
})();
