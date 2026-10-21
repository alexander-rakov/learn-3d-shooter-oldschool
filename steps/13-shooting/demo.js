'use strict';
// Step 13 demo: the rooms from step 12, now with robots that fight back.

const LEVEL_ROWS = [
  '1111111111111111',
  '1......1.......1',
  '1......1.......1',
  '1......|.......1',
  '1......1.......1',
  '1......1...2...1',
  '111-11111-111111',
  '3...3.....3....3',
  '3...3.....3....3',
  '3...|.....|....3',
  '3...3.....3....3',
  '33c33.....33-333',
  '3...3.....3....3',
  '3...3.....3....3',
  '3...3.....3....3',
  '3333333333333333',
];

const MINIMAP_COLORS = [null, '#7a7f8c', '#8f3b2c', '#334f8f'];
MINIMAP_COLORS[DOOR] = 'rgba(0,0,0,0)';
const STATE_COLORS = { stand: '#e8a0b4', chase: '#ef476f', aim: '#ff9f1c', shoot: '#ffd166', aim2: '#ff9f1c', pain: '#ffffff' };

const STATICS = [
  ['lamp', 3.5, 3.5], ['lamp', 11.5, 3.5], ['lamp', 7.5, 9.5], ['lamp', 12.5, 13.5], ['lamp', 2.5, 13.5],
  ['plant', 1.5, 1.5], ['plant', 14.5, 1.5], ['barrel', 8.5, 1.5], ['barrel', 9.5, 1.5],
  ['pillar', 6.5, 8.5], ['pillar', 8.5, 8.5], ['pillar', 6.5, 12.5], ['pillar', 8.5, 12.5],
  ['barrel', 1.5, 7.5], ['barrel', 14.5, 7.5], ['plant', 11.5, 14.5],
  ['plant', 1.5, 14.5], ['plant', 3.5, 14.5],
];

// [x, y, angle]: where each robot stands and which way it looks.
const ROBOTS = [
  [12.5, 2.5, Math.PI], [13.5, 4.5, -Math.PI / 2],
  [7.5, 13.5, -Math.PI / 2], [5.5, 10.5, 0],
  [13.5, 8.5, Math.PI], [12.5, 13.5, -Math.PI / 2],
];

function newGame() {
  const statics = STATICS.map(([kind, x, y]) => ({ kind, x, y, r: 0.3, block: kind !== 'lamp', image: SPRITES[kind] }));
  return createGame(parseMap(LEVEL_ROWS), createPlayer(2.5, 3.5, 0), ROBOTS, statics, { ammo: 40 });
}

function drawMinimap(mm, game, hits, showSight) {
  const { ctx, w, h } = mm;
  const { map, player: p } = game;
  const view = makeView(w / map.w, 0, 0);
  clear(ctx, w, h);

  // Where the last gunshot was heard, fading out.
  if (showSight && game.noise && game.time - game.noise.time < 1.2) {
    ctx.fillStyle = `rgba(76,201,240,${0.35 * (1 - (game.time - game.noise.time) / 1.2)})`;
    for (let i = 0; i < game.noise.reached.length; i++) {
      if (game.noise.reached[i]) ctx.fillRect(view.sx(i % map.w), view.sy(Math.floor(i / map.w)), view.scale, view.scale);
    }
  }
  drawMap(ctx, view, map, MINIMAP_COLORS);
  for (const d of map.doors.values()) {
    const a = d.open, color = '#9fb3cc';
    if (d.vertical) line(ctx, view.sx(d.x + 0.5), view.sy(d.y + a), view.sx(d.x + 0.5), view.sy(d.y + 1), color, 3);
    else line(ctx, view.sx(d.x + a), view.sy(d.y + 0.5), view.sx(d.x + 1), view.sy(d.y + 0.5), color, 3);
  }
  for (let x = 0; x < hits.length; x += 10) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(hits[x].hitX), view.sy(hits[x].hitY), 'rgba(76,201,240,0.25)', 1);
  }
  if (game.shot && game.time - game.shot.time < 0.25) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(game.shot.x), view.sy(game.shot.y), C.player, 2);
  }
  for (const s of game.statics) {
    if (s.block) disc(ctx, view.sx(s.x), view.sy(s.y), 2.5, '#8a7a66');
  }
  for (const a of game.actors) {
    if (!isAlive(a)) { disc(ctx, view.sx(a.x), view.sy(a.y), 3, '#555b66'); continue; }
    if (showSight && a.state !== 'stand' && canSee(map, a.x, a.y, p.x, p.y)) {
      line(ctx, view.sx(a.x), view.sy(a.y), view.sx(p.x), view.sy(p.y), 'rgba(239,71,111,0.6)', 1, [3, 3]);
    }
    const color = STATE_COLORS[a.state];
    disc(ctx, view.sx(a.x), view.sy(a.y), 4.5, color);
    arrow(ctx, view.sx(a.x), view.sy(a.y), view.sx(a.x + Math.cos(a.angle) * 0.8),
      view.sy(a.y + Math.sin(a.angle) * 0.8), color, 1.5, 5);
    label(ctx, String(a.id), view.sx(a.x) + 7, view.sy(a.y) - 7, C.text, 'left', 'middle', 10);
  }
  disc(ctx, view.sx(p.x), view.sy(p.y), 4, C.player);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.dirX), view.sy(p.y + p.dirY), C.dir, 2, 6);
}

/** Crosshair, muzzle flash, damage tint and status, drawn over the rendered frame. */
function drawOverlay(screen, game) {
  const g = screen.ctx, w = screen.w, h = screen.h;
  if (game.time - game.lastShot < 0.07 && game.shot && game.shot.time === game.lastShot) {
    g.fillStyle = 'rgba(255,230,150,0.9)';
    g.beginPath();
    g.arc(w / 2, h, 26, Math.PI, 0);
    g.fill();
  }
  if (game.hurtFlash > 0 || game.health === 0) {
    g.fillStyle = `rgba(200,0,0,${game.health === 0 ? 0.45 : 0.45 * game.hurtFlash})`;
    g.fillRect(0, 0, w, h);
  }
  g.fillStyle = 'rgba(255,209,102,0.95)';
  g.fillRect(w / 2 - 4, h / 2, 3, 1);
  g.fillRect(w / 2 + 2, h / 2, 3, 1);
  g.fillRect(w / 2, h / 2 - 4, 1, 3);
  g.fillRect(w / 2, h / 2 + 2, 1, 3);
  label(g, `HEALTH ${game.health}   AMMO ${game.ammo}   ROBOTS ${game.kills}/${game.actors.length}`, 6, 10, '#ffffff', 'left', 'middle', 10);
  if (game.health === 0) label(g, 'DESTROYED. Press R to restart.', w / 2, h / 2 - 20, '#ffffff', 'center', 'middle', 13);
  else if (game.kills === game.actors.length) label(g, 'All robots destroyed!', w / 2, h / 2 - 20, '#ffffff', 'center', 'middle', 13);
}

(function combatDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-hear', 'g-god', 'g-sight']);
  const readout = document.getElementById('c-readout');
  let game = newGame();
  let wasDown = new Set();
  let wallDepth = Infinity;

  animate((dt) => {
    const pressed = (code) => keys.has(code) && !wasDown.has(code);
    if (pressed('KeyR')) game = newGame();
    game.hearing = ui['g-hear'];
    game.invulnerable = ui['g-god'];

    if (game.health > 0) {
      const before = { x: game.player.x, y: game.player.y };
      movePlayer(game.map, game.player, keys, dt, { objects: gameBlockers(game) });
      const moved = before.x !== game.player.x || before.y !== game.player.y;
      game.running = moved && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      if (pressed('KeyE')) useAction(game.map, game.player);
      if (keys.has('Space')) playerFires(game, wallDepth);
    }
    wasDown = new Set(keys);
    updateGame(game, dt);

    const { columns, zBuffer } = renderFrame(screen, game.map, game.player, { sprites: gameSprites(game) });
    wallDepth = zBuffer[screen.w / 2];
    drawOverlay(screen, game);
    drawMinimap(mm, game, columns, ui['g-sight']);

    readout.textContent =
      `health ${game.health}   ammo ${game.ammo}   destroyed ${game.kills} of ${game.actors.length}\n` +
      `robots: ${game.actors.map((a) => `${a.id} ${a.state}${isAlive(a) ? ' ' + a.hp : ''}`).join(' · ')}   (state, hp)\n\n` +
      (game.events.length ? game.events.map((e) => `${e.time.toFixed(1).padStart(6)} s  ${e.text}`).join('\n')
        : 'Nothing has happened yet. Open the door ahead (E), and be ready to fire (Space).');
  });
})();
