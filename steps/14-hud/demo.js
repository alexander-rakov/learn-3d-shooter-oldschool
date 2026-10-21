'use strict';
// Step 14 demo: one complete floor. Find the gold key, get through the locked door, flip the exit switch.

const LEVEL = {
  rows: [
    '1111111111111111333331',
    '1111111........3.....3',
    '1111111........3.....3',
    '1.....1........I.....9',
    '1.....1........3.....3',
    '1.....1........3.....3',
    '1.....1........1333331',
    '111a111222-22223.....3',
    '1.....2........2.....3',
    '1.....2........2.....3',
    '1.....|........|.....3',
    '1.....2..2..2..2.....3',
    '1.....2........2.....3',
    '111-112........2333331',
    '1.....2........2.....3',
    '1.....2..2..2..2.....3',
    '1.....|........|.....3',
    '1.....2........2.....3',
    '1.....2........2.....3',
    '1111111222222221333331',
  ],
  start: [2.5, 16.5, 0],
  robots: [
    [2.5, 9.5, 0], [4.5, 11.5, -Math.PI / 2],                             // west room
    [10.5, 9.5, Math.PI / 2], [13.5, 13.5, Math.PI], [8.5, 17.5, 0],   // the hall
    [18.5, 9.5, Math.PI],                                                 // store room
    [18.5, 15.5, Math.PI], [19.5, 17.5, Math.PI],                         // key room
    [8.5, 2.5, 0], [13.5, 5.5, Math.PI],                                  // north room
    [18.5, 3.5, Math.PI],                                                 // exit room
  ],
  things: [
    // start room
    ['lamp', 3.5, 16.5], ['plant', 1.5, 14.5], ['barrel', 5.5, 18.5], ['ammo', 1.5, 18.5],
    // west room, and the secret room behind its north wall
    ['lamp', 3.5, 10.5], ['medkit', 1.5, 12.5], ['barrel', 5.5, 8.5],
    ['gem', 1.5, 3.5], ['gem', 5.5, 3.5], ['coins', 1.5, 6.5], ['coins', 5.5, 6.5],
    // the hall
    ['lamp', 10.5, 13.5], ['lamp', 10.5, 9.5], ['lamp', 10.5, 17.5], ['pillar', 7.5, 13.5],
    ['pillar', 14.5, 13.5], ['barrel', 14.5, 8.5], ['plant', 7.5, 18.5], ['ammo', 13.5, 17.5],
    // store room
    ['lamp', 18.5, 11.5], ['medkit', 20.5, 7.5], ['ammo', 20.5, 12.5], ['barrel', 16.5, 7.5], ['barrel', 17.5, 7.5],
    // key room
    ['lamp', 18.5, 16.5], ['key', 20.5, 16.5], ['barrel', 16.5, 14.5], ['barrel', 16.5, 18.5],
    // north room
    ['lamp', 10.5, 3.5], ['pillar', 9.5, 4.5], ['pillar', 12.5, 2.5], ['coins', 7.5, 1.5],
    ['ammo', 14.5, 1.5], ['medkit', 7.5, 6.5], ['plant', 14.5, 6.5],
    // exit room
    ['lamp', 18.5, 1.5], ['gem', 20.5, 5.5], ['plant', 20.5, 1.5],
  ],
};

const MOUSE_TURN = 0.004;   // radians per pixel of mouse movement

(function gameDemo() {
  const canvas = document.getElementById('g-view');
  const screen = createScreen(canvas);
  const view = subScreen(screen, screen.h - BAR_HEIGHT);   // 3D view on top, status bar below
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-sound', 'g-fog', 'g-mouse']);
  const readout = document.getElementById('h-readout');
  const sfx = createSfx();
  let game, wasDown = new Set(), wallDepth = Infinity, automap = false;
  let mouseTurn = 0, mouseFire = false, frameMs = 0;

  function restart() {
    game = createGame(LEVEL);
    game.onSound = (name, volume) => sfx.play(name, volume);
  }
  restart();

  // Mouse look: with the pointer locked to the view, moving the mouse turns and the button fires.
  const locked = () => document.pointerLockElement === canvas;
  canvas.addEventListener('pointerdown', () => { if (ui['g-mouse'] && !locked()) canvas.requestPointerLock(); });
  canvas.addEventListener('mousedown', () => { if (locked()) mouseFire = true; });
  document.addEventListener('mouseup', () => { mouseFire = false; });
  document.addEventListener('mousemove', (e) => { if (locked()) mouseTurn += e.movementX; });
  document.getElementById('g-mouse').addEventListener('change', () => { if (locked()) document.exitPointerLock(); });

  animate((dt) => {
    const t0 = performance.now();
    const pressed = (code) => keys.has(code) && !wasDown.has(code);
    sfx.enabled = ui['g-sound'];
    if (pressed('KeyR')) restart();
    if (pressed('KeyM')) automap = !automap;

    const p = game.player;
    if (game.state === 'play') {
      if (mouseTurn) rotatePlayer(p, mouseTurn * MOUSE_TURN);
      const x0 = p.x, y0 = p.y;
      movePlayer(game.map, p, keys, dt, { objects: gameBlockers(game) });
      const moved = Math.hypot(p.x - x0, p.y - y0);
      game.bob += moved * 5;                       // the weapon sways with the distance walked
      game.running = moved > 0 && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      if (pressed('KeyE')) playerUses(game);
      if (keys.has('Space') || mouseFire) playerFires(game, wallDepth);
    }
    mouseTurn = 0;
    wasDown = new Set(keys);
    updateGame(game, dt);

    // The frame, back to front: world, weapon, flashes, text, status bar.
    const { zBuffer } = renderFrame(view, game.map, p, { sprites: gameSprites(game), fog: ui['g-fog'] });
    wallDepth = zBuffer[view.w / 2];
    if (automap) drawAutomap(view, game);
    else if (game.state !== 'dead') drawWeapon(view, game);
    if (game.hurtFlash > 0) tint(view, 255, 0, 0, game.hurtFlash * 0.5);
    if (game.pickupFlash > 0) tint(view, 255, 220, 80, game.pickupFlash * 0.4);
    if (game.state === 'play') drawMessage(view, game);
    else drawEndScreen(view, game);
    drawStatusBar(screen, view.h, game);
    screen.present();

    frameMs = frameMs * 0.95 + (performance.now() - t0) * 0.05;
    const last = game.events[game.events.length - 1];
    readout.textContent =
      `time ${formatTime(game.playTime)}   kills ${game.kills}/${game.actors.length}   ` +
      `secrets ${game.secretsFound}/${game.secretsTotal}   treasure ${game.treasureFound}/${game.treasureTotal}   ` +
      `frame ${frameMs.toFixed(1)} ms\n` + (last ? `last: ${last.text}` : 'last: (nothing yet)');
  });
})();
