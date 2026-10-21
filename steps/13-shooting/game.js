'use strict';
/*
 * The game, step 13: robots that see, hear, chase and shoot, and a player who
 * shoots back. Needs raycaster.js, textures.js and sprites.js.
 *
 * Everything about one game is in one object (see createGame): the map, the
 * player and their health and ammo, the robots, and a log of what happened.
 */

// ------------------------------------------------------------- random numbers

/*
 * Like Wolfenstein (and Doom), "random" numbers come from a fixed table of
 * 256 bytes, read in order. It's fast, and the same inputs always play out
 * the same way.
 */
const RND_TABLE = (() => {
  const r = makeRng(1992);
  return Uint8Array.from({ length: 256 }, () => Math.floor(r() * 256));
})();
let rndIndex = 0;

/** The next number from the table, 0 … 255. */
function rnd() {
  rndIndex = (rndIndex + 1) & 255;
  return RND_TABLE[rndIndex];
}

// ------------------------------------------------------------- setting up

const PLAYER_HEALTH = 100;
const ROBOT_HEALTH = 25;
const FIRE_DELAY = 0.35;    // seconds between the player's shots
const ROBOT_SPEED = 1.3;    // cells per second
const SHOOT_RATE = 3;       // how eagerly a chasing robot with a clear shot opens fire

/**
 * robots: [[x, y, angle], …], standing at cell centres.
 * statics: objects like those in step 11 ({x, y, block, image}).
 */
function createGame(map, player, robots, statics, opts = {}) {
  const blocked = new Set();   // cells robots can't walk into because of an object
  for (const s of statics) if (s.block) blocked.add(Math.floor(s.y) * map.w + Math.floor(s.x));
  return {
    map, player, statics, blocked,
    actors: robots.map(([x, y, angle], i) => createActor(i + 1, x, y, angle)),
    health: PLAYER_HEALTH, ammo: opts.ammo ?? 40, kills: 0,
    time: 0, lastShot: -1, hurtFlash: 0,
    running: false,      // set by the caller: the player holds Shift and moves
    hearing: true,       // robots hear gunshots
    invulnerable: false, // for practice
    events: [],          // a short log of what happened, for the demo
    noise: null,         // where the last gunshot was heard
    shot: null,          // where the last bullet went
  };
}

function createActor(id, x, y, angle) {
  return {
    id, kind: 'robot', x, y, angle, r: 0.3,
    tileX: Math.floor(x), tileY: Math.floor(y),
    target: null,       // the cell it's walking to, {x, y}
    dir: -1,            // index into DIRS of its last step
    hp: ROBOT_HEALTH, state: 'stand', time: 0,
    reaction: 0, heard: false, walked: 0,
  };
}

function logEvent(game, text) {
  game.events.push({ time: game.time, text });
  if (game.events.length > 5) game.events.shift();
}

// ------------------------------------------------------------- the state machine

/*
 * A robot is always in one of these states. Each state says which picture to
 * show, how long it lasts (no time: until think changes it), what to do every
 * frame while in it (think), what to do once on entering it (action), and
 * which state comes next. The robot's whole behaviour is this table plus the
 * functions it names.
 */
const ROBOT_STATES = {
  stand: { frame: 'stand', think: thinkStand },
  chase: { frame: 'walk',  think: thinkChase },
  aim:   { frame: 'aim',   time: 0.35, think: faceThePlayer, next: 'shoot' },
  shoot: { frame: 'shoot', time: 0.15, action: robotShoots, next: 'aim2' },
  aim2:  { frame: 'aim',   time: 0.3,  next: 'chase' },
  pain:  { frame: 'pain',  time: 0.3,  next: 'chase' },
  die1:  { frame: 'die1',  time: 0.12, next: 'die2' },
  die2:  { frame: 'die2',  time: 0.12, next: 'die3' },
  die3:  { frame: 'die3',  time: 0.16, next: 'dead' },
  dead:  { frame: 'dead' },
};

function setState(game, a, name) {
  a.state = name;
  a.time = 0;
  const s = ROBOT_STATES[name];
  if (s.action) s.action(game, a);
}

function updateActors(game, dt) {
  for (const a of game.actors) {
    const s = ROBOT_STATES[a.state];
    a.time += dt;
    if (s.think) s.think(game, a, dt);
    // Unless think already switched states, move on when the time is up.
    if (ROBOT_STATES[a.state] === s && s.next && a.time >= s.time) setState(game, a, s.next);
  }
}

function isAlive(a) {
  return !a.state.startsWith('die') && a.state !== 'dead';
}

/** The picture for a robot right now: walking and standing come in 8 directions (step 11). */
function actorImage(a, p) {
  const frame = ROBOT_STATES[a.state].frame;
  if (frame === 'stand') return ROBOT.stand[rotationFrame(a, p)];
  if (frame === 'walk') return ROBOT.walk[Math.floor(a.walked / 0.3) % 4][rotationFrame(a, p)];
  return ROBOT[frame];
}

/** Distance in whole cells, the larger of the x and y differences (as Wolfenstein measures it). */
function tileDistance(a, p) {
  return Math.max(Math.abs(Math.floor(p.x) - Math.floor(a.x)), Math.abs(Math.floor(p.y) - Math.floor(a.y)));
}

function faceThePlayer(game, a) {
  a.angle = Math.atan2(game.player.y - a.y, game.player.x - a.x);
}

// ------------------------------------------------------------- seeing and hearing

/**
 * Can robot a see the player? A standing robot only looks ahead: the player
 * must be in front of it, a positive dot product with the direction it
 * faces (step 1). Then nothing may block the line between them.
 */
function seesPlayer(game, a) {
  const p = game.player;
  const dx = p.x - a.x, dy = p.y - a.y;
  if (a.state === 'stand' && dx * Math.cos(a.angle) + dy * Math.sin(a.angle) <= 0) return false;
  return canSee(game.map, a.x, a.y, p.x, p.y);
}

function thinkStand(game, a, dt) {
  if (a.reaction > 0) {                 // already noticed the player, about to react
    a.reaction -= dt;
    if (a.reaction <= 0) setState(game, a, 'chase');
    return;
  }
  if (game.health > 0 && (a.heard || seesPlayer(game, a))) {
    // Not instantly: a short random reaction time first.
    a.reaction = 0.15 + rnd() / 256 * 0.5;
    logEvent(game, `robot ${a.id} ${a.heard ? 'heard the shot' : 'sees you'}, reacts in ${a.reaction.toFixed(2)} s`);
  }
}

/**
 * A gunshot is heard wherever sound can travel from the player: across open
 * floor and through doors that aren't fully shut, but not through walls.
 * That's a flood fill over the map, like a paint program's bucket tool.
 */
function makeNoise(game) {
  const { map, player } = game;
  const reached = new Uint8Array(map.w * map.h);
  const start = Math.floor(player.y) * map.w + Math.floor(player.x);
  const stack = [start];
  reached[start] = 1;
  while (stack.length) {
    const i = stack.pop();
    for (const n of [i - 1, i + 1, i - map.w, i + map.w]) {
      if (reached[n]) continue;
      const cell = map.cells[n];
      if (cell === 0 || (cell === DOOR && map.doors.get(n).open > 0)) {
        reached[n] = 1;
        stack.push(n);
      }
    }
  }
  for (const a of game.actors) {
    if (reached[a.tileY * map.w + a.tileX]) a.heard = true;
  }
  game.noise = { time: game.time, reached };
}

// ------------------------------------------------------------- chasing

// 8 directions, 45° apart: east, south-east, south, … (y points down, so index · 45° is the angle).
const DIRS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/** Does the player's collision square overlap cell (x, y)? */
function playerInCell(p, x, y) {
  const r = PLAYER_RADIUS;
  return p.x + r > x && p.x - r < x + 1 && p.y + r > y && p.y - r < y + 1;
}

/** Floor (and doors, which robots can open), but not walls or cells with a blocking object. */
function walkable(game, x, y, allowDoor = true) {
  const cell = mapCell(game.map, x, y);
  if (cell === DOOR) return allowDoor;
  return cell === 0 && !game.blocked.has(y * game.map.w + x);
}

/** Can robot a step in direction i? The cell must be free: no wall, robot or player in it. */
function canStep(game, a, i) {
  const [dx, dy] = DIRS[i];
  const x = a.tileX + dx, y = a.tileY + dy;
  if (!walkable(game, x, y)) return false;
  if (dx && dy) {
    // Diagonal: don't cut a corner, and don't go diagonally through a doorway.
    if (!walkable(game, a.tileX + dx, a.tileY, false) || !walkable(game, a.tileX, a.tileY + dy, false)) return false;
    if (mapCell(game.map, x, y) === DOOR || mapCell(game.map, a.tileX, a.tileY) === DOOR) return false;
  }
  for (const b of game.actors) {
    if (b === a || !isAlive(b)) continue;
    if ((b.tileX === x && b.tileY === y) || (b.target && b.target.x === x && b.target.y === y)) return false;
  }
  return !playerInCell(game.player, x, y);
}

/**
 * Picks the next step towards the player: try the 8 directions in order of
 * how directly they point at the player (the dot product again), and take the
 * first one that's free. Going straight back is the last resort, so a robot
 * doesn't dither between two cells.
 */
function chooseDirection(game, a) {
  const p = game.player;
  const tx = p.x - a.x, ty = p.y - a.y;
  const order = DIRS.map((d, i) => ({ i, score: (d[0] * tx + d[1] * ty) / Math.hypot(d[0], d[1]) }))
    .sort((u, v) => v.score - u.score);
  const back = a.dir < 0 ? -1 : (a.dir + 4) % 8;
  for (const { i } of order) {
    if (i !== back && canStep(game, a, i)) return i;
  }
  return back >= 0 && canStep(game, a, back) ? back : -1;
}

/**
 * Chasing: robots walk from cell centre to cell centre, choosing a new
 * direction at each one. While they can see the player, every frame there's a
 * chance (bigger when closer) that they stop and shoot.
 */
function thinkChase(game, a, dt) {
  const p = game.player;
  if (game.health <= 0) return;
  const dist = tileDistance(a, p);
  const clear = canSee(game.map, a.x, a.y, p.x, p.y);
  if (clear && rnd() / 256 < dt * SHOOT_RATE / Math.max(1, dist)) {
    setState(game, a, 'aim');
    return;
  }

  if (!a.target) {
    if (dist <= 1 && clear) return;                 // right next to the player: stand and fight
    const i = chooseDirection(game, a);
    if (i < 0) return;                              // boxed in: wait
    a.dir = i;
    a.target = { x: a.tileX + DIRS[i][0], y: a.tileY + DIRS[i][1] };
  }
  a.angle = a.dir * Math.PI / 4;

  // A door in the way? Open it, and wait until it's fully open.
  const door = game.map.doors.get(a.target.y * game.map.w + a.target.x);
  if (door && door.open < 1) {
    if (door.state !== 'opening') door.state = 'opening';
    return;
  }

  // Walk towards the target cell's centre, but not into the player.
  const tx = a.target.x + 0.5, ty = a.target.y + 0.5;
  const dx = tx - a.x, dy = ty - a.y, len = Math.hypot(dx, dy);
  const step = Math.min(len, ROBOT_SPEED * dt);
  const nx = a.x + dx / len * step, ny = a.y + dy / len * step;
  if (Math.abs(nx - p.x) < a.r + PLAYER_RADIUS && Math.abs(ny - p.y) < a.r + PLAYER_RADIUS) return;
  a.x = nx;
  a.y = ny;
  a.walked += step;
  if (step === len) {                               // arrived
    a.tileX = a.target.x;
    a.tileY = a.target.y;
    a.target = null;
  }
}

/** Is a cell taken by the player or a living robot (standing there or walking into it)? Doors won't close on them. */
function cellOccupied(game, x, y) {
  if (playerInCell(game.player, x, y)) return true;
  return game.actors.some((a) => isAlive(a) &&
    ((a.tileX === x && a.tileY === y) || (a.target && a.target.x === x && a.target.y === y)));
}

// ------------------------------------------------------------- shooting

/**
 * Hitscan: a bullet is the ray through the centre of the screen, and it hits
 * instantly. Of the robots nearer than the wall that ray hits, take the
 * nearest one whose picture is solid right under the crosshair.
 */
function hitscan(game, wallDepth) {
  const p = game.player;
  const planeLen = Math.hypot(p.planeX, p.planeY);
  let best = null;
  for (const a of game.actors) {
    if (!isAlive(a)) continue;
    const { u, v } = toCameraSpace(p, a.x, a.y);
    if (v < NEAR_PLANE || v >= wallDepth) continue;
    // The centre ray passes the sprite u·|p| cells to the side of its middle,
    // and the sprite is 1 cell wide: that gives the texture column. The
    // screen's centre row is always texture row 32 (the eye is half a cell up).
    const texX = Math.floor(TEX * (0.5 - u * planeLen));
    if (texX < 0 || texX >= TEX) continue;
    if (!actorImage(a, p).pixels[texX * TEX + TEX / 2]) continue;   // between the legs, past the arm…
    if (!best || v < best.v) best = { actor: a, v, texX };
  }
  return best;
}

/**
 * The player pulls the trigger. wallDepth is the depth of the wall in the
 * centre column (the renderer's zBuffer has it). Returns true if a shot was fired.
 */
function playerFires(game, wallDepth) {
  if (game.health <= 0 || game.time - game.lastShot < FIRE_DELAY) return false;
  game.lastShot = game.time;
  if (game.ammo <= 0) {
    logEvent(game, 'click. Out of ammo.');
    return false;
  }
  game.ammo--;
  if (game.hearing) makeNoise(game);

  const p = game.player;
  const hit = hitscan(game, wallDepth);
  const depth = hit ? hit.v : wallDepth;
  game.shot = { time: game.time, hit, x: p.x + p.dirX * depth, y: p.y + p.dirY * depth };
  if (!hit) {
    logEvent(game, 'you fire: nothing under the crosshair');
    return true;
  }

  // Damage like Wolfenstein's GunAttack: close up hurts more, far away can miss.
  const a = hit.actor, dist = tileDistance(a, p);
  let damage, how;
  if (dist < 2) {
    const r = rnd();
    damage = r >> 2;
    how = `close: damage = rnd/4 = ${r}/4 = ${damage}`;
  } else if (dist < 4) {
    const r = rnd();
    damage = Math.floor(r / 6);
    how = `mid range: damage = rnd/6 = ${r}/6 = ${damage}`;
  } else {
    const m = rnd();
    if (m / 12 < dist) {
      logEvent(game, `you fire: robot ${a.id} is ${dist} cells away, rnd/12 = ${m}/12 < ${dist}: missed`);
      return true;
    }
    const r = rnd();
    damage = Math.floor(r / 6);
    how = `far, rnd/12 = ${m}/12 ≥ ${dist} so a hit: damage = rnd/6 = ${r}/6 = ${damage}`;
  }
  const before = a.hp;
  hurtActor(game, a, damage);
  logEvent(game, `you hit robot ${a.id}, ${dist} cells away, ${how}. hp ${before} → ${Math.max(0, a.hp)}` +
    (a.hp <= 0 ? ', destroyed' : ''));
  return true;
}

function hurtActor(game, a, damage) {
  a.hp -= damage;
  a.heard = true;
  if (a.hp <= 0) {
    a.target = null;
    setState(game, a, 'die1');
    game.kills++;
  } else {
    setState(game, a, 'pain');                      // and then it comes for you
  }
}

/**
 * The robot's attack, run once as it enters the 'shoot' state. Like
 * Wolfenstein's T_Shoot: a hit chance out of 256 that drops with distance,
 * faster if you're running, then a damage roll that's bigger up close.
 */
function robotShoots(game, a) {
  const p = game.player;
  faceThePlayer(game, a);
  if (game.health <= 0 || !canSee(game.map, a.x, a.y, p.x, p.y)) return;   // you ducked out of sight
  const dist = tileDistance(a, p);
  const chance = 160 - dist * (game.running ? 16 : 8);
  const roll = rnd();
  if (roll >= chance) {
    logEvent(game, `robot ${a.id} fires from ${dist} cells: rnd = ${roll} ≥ ${chance}, missed`);
    return;
  }
  const r = rnd();
  const damage = dist < 2 ? r >> 3 : dist < 4 ? r >> 4 : r >> 5;
  logEvent(game, `robot ${a.id} fires from ${dist} cells: rnd = ${roll} < ${chance}, hit for ${damage}`);
  hurtPlayer(game, damage);
}

function hurtPlayer(game, damage) {
  game.hurtFlash = Math.min(1, game.hurtFlash + 0.25 + damage / 40);
  if (game.invulnerable) return;
  game.health = Math.max(0, game.health - damage);
  if (game.health === 0) logEvent(game, 'You were destroyed. Press R to restart.');
}

// ------------------------------------------------------------- the frame

/** Everything that moves by itself: robots, doors, the push-wall. */
function updateGame(game, dt) {
  game.time += dt;
  game.hurtFlash = Math.max(0, game.hurtFlash - dt * 1.5);
  updateActors(game, dt);
  updateDoors(game.map, dt, (x, y) => cellOccupied(game, x, y));
}

/** All sprites to draw this frame: the objects, and each robot with its current picture. */
function gameSprites(game) {
  for (const a of game.actors) a.image = actorImage(a, game.player);
  return [...game.statics, ...game.actors];
}

/** What the player bumps into: blocking objects and living robots. */
function gameBlockers(game) {
  return [...game.statics.filter((s) => s.block), ...game.actors.filter(isAlive)];
}
