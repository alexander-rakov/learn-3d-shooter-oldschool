'use strict';
// Step 12 demo: rooms joined by sliding doors, and one secret push-wall.

const LEVEL = parseMap([
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
]);

const MINIMAP_COLORS = [null, '#7a7f8c', '#8f3b2c', '#334f8f'];
MINIMAP_COLORS[DOOR] = 'rgba(0,0,0,0)';     // doors are drawn as lines, below
const KIND_COLORS = { barrel: '#b07a45', lamp: '#ffd166', pillar: '#d8d2c4', plant: '#5fbf5a', robot: '#ef476f' };

const THINGS = [
  ['lamp', 3.5, 3.5], ['lamp', 11.5, 3.5], ['lamp', 7.5, 9.5], ['lamp', 12.5, 13.5], ['lamp', 2.5, 13.5],
  ['plant', 1.5, 1.5], ['plant', 14.5, 1.5], ['barrel', 8.5, 1.5], ['barrel', 9.5, 1.5],
  ['pillar', 6.5, 8.5], ['pillar', 8.5, 8.5], ['pillar', 6.5, 12.5], ['pillar', 8.5, 12.5],
  ['barrel', 1.5, 7.5], ['barrel', 14.5, 7.5], ['plant', 11.5, 14.5],
  ['plant', 1.5, 14.5], ['plant', 3.5, 14.5],     // in the secret room
].map(([kind, x, y]) => ({ kind, x, y, r: 0.3, block: kind !== 'lamp', image: SPRITES[kind] }));

const ROBOTS = [
  { x: 12.5, y: 2.5, angle: Math.PI, turn: 0.4 },
  { x: 7.5, y: 13.5, angle: -Math.PI / 2, turn: -0.3 },
  { x: 13.5, y: 8.5, angle: Math.PI / 2, turn: 0.5 },
].map((r) => ({ ...r, kind: 'robot', r: 0.3, block: true }));

/** Does the player's collision square overlap cell (x, y)? Doors won't close on it. */
function playerInCell(p, x, y) {
  const r = PLAYER_RADIUS;
  return p.x + r > x && p.x - r < x + 1 && p.y + r > y && p.y - r < y + 1;
}

const DIR_NAMES = { '1,0': 'east', '-1,0': 'west', '0,1': 'south', '0,-1': 'north' };

/** Top-down view: doors as lines across the middle of their cells, the push-wall at its offset. */
function drawMinimap(mm, map, p, hits, things) {
  const { ctx, w, h } = mm;
  const view = makeView(w / map.w, 0, 0);
  clear(ctx, w, h);
  drawMap(ctx, view, map, MINIMAP_COLORS);
  const pw = map.pushwall;
  if (pw) {
    // The two cells the moving block straddles, then the block itself.
    const s = view.scale;
    ctx.fillStyle = C.bg;
    ctx.fillRect(view.sx(pw.x), view.sy(pw.y), s, s);
    ctx.fillRect(view.sx(pw.x + pw.dx), view.sy(pw.y + pw.dy), s, s);
    ctx.fillStyle = MINIMAP_COLORS[pw.texture];
    ctx.fillRect(view.sx(pw.x + pw.dx * pw.offset), view.sy(pw.y + pw.dy * pw.offset), s, s);
  }
  for (const d of map.doors.values()) {
    const a = d.open, color = '#9fb3cc';
    if (d.vertical) line(ctx, view.sx(d.x + 0.5), view.sy(d.y + a), view.sx(d.x + 0.5), view.sy(d.y + 1), color, 3);
    else line(ctx, view.sx(d.x + a), view.sy(d.y + 0.5), view.sx(d.x + 1), view.sy(d.y + 0.5), color, 3);
  }
  for (let x = 0; x < hits.length; x += 8) {
    line(ctx, view.sx(p.x), view.sy(p.y), view.sx(hits[x].hitX), view.sy(hits[x].hitY), 'rgba(76,201,240,0.4)', 1);
  }
  for (const t of things) {
    disc(ctx, view.sx(t.x), view.sy(t.y), t.kind === 'lamp' ? 2 : 3, KIND_COLORS[t.kind]);
  }
  disc(ctx, view.sx(p.x), view.sy(p.y), 4, C.player);
  arrow(ctx, view.sx(p.x), view.sy(p.y), view.sx(p.x + p.dirX), view.sy(p.y + p.dirY), C.dir, 2, 6);
}

/** Describes what the centre ray does, in words and numbers. */
function describeCentreRay(map, p) {
  const hit = castRay(map, p.x, p.y, p.dirX, p.dirY);
  if (hit.door) {
    const d = hit.door, along = hit.wallX + d.open;
    return `centre ray: crosses door (${d.x}, ${d.y}) at ${d.vertical ? 'x' : 'y'} = ` +
      `${(d.vertical ? d.x : d.y) + 0.5}, t = ${hit.t.toFixed(3)}, along = ${along.toFixed(3)}\n` +
      `            panel covers along ${d.open.toFixed(2)}…1 → HIT, texture u = along − open = ${hit.wallX.toFixed(3)}`;
  }
  const what = hit.doorFrame ? 'a door frame (the wall beside a door)' : `wall ${hit.cell}`;
  return `centre ray: hits ${what} in cell (${hit.mapX}, ${hit.mapY}), t = ${hit.t.toFixed(3)}`;
}

(function doorDemo() {
  const viewCanvas = document.getElementById('g-view');
  const screen = createScreen(viewCanvas);
  const mm = setupCanvas(document.getElementById('g-map'));
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-frames', 'g-slow']);
  const readout = document.getElementById('d-readout');
  const player = createPlayer(2.5, 3.5, 0);
  const things = [...THINGS, ...ROBOTS];
  const blockers = things.filter((t) => t.block);
  let useWasDown = false, message = 'Press E facing a door to open it.';

  animate((dt) => {
    movePlayer(LEVEL, player, keys, dt, { objects: blockers });

    // E is a key *press*, not a hold: act only on the frame it goes down.
    const useDown = keys.has('KeyE');
    if (useDown && !useWasDown) {
      const what = useAction(LEVEL, player);
      message = what === 'door' ? 'You used a door.'
        : what === 'pushwall' ? 'A secret! The wall slides away.'
        : 'Nothing to use here (you need to face a door or a secret wall, one cell away).';
    }
    useWasDown = useDown;

    for (const r of ROBOTS) {
      r.angle += r.turn * dt;
      r.image = ROBOT.stand[rotationFrame(r, player)];
    }
    updateDoors(LEVEL, ui['g-slow'] ? dt / 4 : dt, (x, y) => playerInCell(player, x, y));

    const { columns } = renderFrame(screen, LEVEL, player, { sprites: things, doorFrames: ui['g-frames'] });
    drawMinimap(mm, LEVEL, player, columns, things);

    // The door in the cell you'd use, if any.
    const eastWest = Math.abs(player.dirX) > Math.abs(player.dirY);
    const fx = Math.floor(player.x) + (eastWest ? Math.sign(player.dirX) : 0);
    const fy = Math.floor(player.y) + (eastWest ? 0 : Math.sign(player.dirY));
    const door = LEVEL.doors.get(fy * LEVEL.w + fx);
    let text = describeCentreRay(LEVEL, player) + '\n';
    text += door
      ? `door in front, cell (${door.x}, ${door.y}): ${door.state}, ${(door.open * 100).toFixed(0)}% open` +
        (door.state === 'open' ? `, closes in ${Math.max(0, door.timer).toFixed(1)} s` : '')
      : 'no door in front';
    const pw = LEVEL.pushwall;
    if (pw) {
      text += `\npush-wall: cell (${pw.x}, ${pw.y}) moving ${DIR_NAMES[pw.dx + ',' + pw.dy]}, ` +
        `front face ${(pw.offset * 100).toFixed(0)}% into its cell, cell ${pw.moved + 1} of ${PUSH_DISTANCE}`;
    }
    readout.textContent = text + '\n' + message;
  });
})();
