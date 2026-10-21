'use strict';
/*
 * The engine, step 12: doors and push-walls.
 * New since step 11: parseMap reads doors ('|', '-') and secret walls
 * ('a'–'c'); castRay tests a line inside door and push-wall cells
 * (crossInCell) and reports door frames; updateDoors, useAction and the
 * push-wall functions; isBlocked knows about doors. textures.js gained the
 * door and door-frame textures.
 */

const DOOR = 10;        // cell value of a door; the door's state is in map.doors
const PUSHWALL = 11;    // cell value of the cell holding a moving push-wall's front face

/**
 * Map characters: '.' floor, '1'–'9' wall textures, '|' a door running
 * north–south (you walk through it east–west), '-' a door running east–west,
 * 'a'–'c' a secret push-wall that looks like wall 1–3.
 */
function parseMap(rows) {
  const h = rows.length, w = rows[0].length;
  const cells = new Uint8Array(w * h);
  const doors = new Map();      // cell index → door
  const secrets = new Set();    // cell indices of walls that move when pushed
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x], i = y * w + x;
      if (ch === '|' || ch === '-') {
        cells[i] = DOOR;
        doors.set(i, { x, y, vertical: ch === '|', open: 0, state: 'closed', timer: 0 });
      } else if (ch >= 'a' && ch <= 'c') {
        cells[i] = ch.charCodeAt(0) - 96;
        secrets.add(i);
      } else {
        cells[i] = ch === '.' ? 0 : ch === '#' ? 1 : parseInt(ch, 10);
      }
    }
  }
  return { w, h, cells, doors, secrets, pushwall: null };
}

function mapCell(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 1;
  return map.cells[y * map.w + x];
}

const MAX_STEPS = 128;

/**
 * Where does the ray cross the line x = line (vertical) or y = line
 * (horizontal) inside cell (mapX, mapY)? Returns t and `along`, the position
 * on that line within the cell (0 … 1), or null if the ray leaves the cell
 * before reaching the line. As everywhere else, t along d + c·p is depth.
 */
function crossInCell(vertical, line, mapX, mapY, posX, posY, rayDirX, rayDirY) {
  const t = vertical ? (line - posX) / rayDirX : (line - posY) / rayDirY;
  if (!(t > 0)) return null;                    // behind us (or parallel: NaN)
  const along = vertical ? posY + t * rayDirY - mapY : posX + t * rayDirX - mapX;
  return along >= 0 && along < 1 ? { t, along } : null;
}

/**
 * DDA from step 5, plus two kinds of cell that aren't solid blocks:
 *  - a door is a thin wall across the middle of its cell, slid `open` of the
 *    way out of the frame; the ray can pass through the gap;
 *  - a moving push-wall's front face is a line `offset` of the way into its cell.
 * A wall hit straight after leaving a door cell is a door frame (doorFrame).
 * Door and push-wall hits return their own texture coordinate, wallX.
 */
function castRay(map, posX, posY, rayDirX, rayDirY) {
  let mapX = Math.floor(posX);
  let mapY = Math.floor(posY);
  const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
  const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

  let stepX, stepY, sideDistX, sideDistY;
  if (rayDirX < 0) { stepX = -1; sideDistX = (posX - mapX) * deltaDistX; }
  else             { stepX =  1; sideDistX = (mapX + 1 - posX) * deltaDistX; }
  if (rayDirY < 0) { stepY = -1; sideDistY = (posY - mapY) * deltaDistY; }
  else             { stepY =  1; sideDistY = (mapY + 1 - posY) * deltaDistY; }

  let t = 0, side = 0;
  let cell = mapCell(map, mapX, mapY), prev = cell;
  for (let i = 0; i < MAX_STEPS; i++) {
    prev = cell;
    if (sideDistX < sideDistY) {
      t = sideDistX; sideDistX += deltaDistX; mapX += stepX; side = 0;
    } else {
      t = sideDistY; sideDistY += deltaDistY; mapY += stepY; side = 1;
    }
    cell = mapCell(map, mapX, mapY);
    if (cell === 0) continue;

    if (cell === DOOR) {
      const door = map.doors.get(mapY * map.w + mapX);
      const line = door.vertical ? mapX + 0.5 : mapY + 0.5;
      const c = crossInCell(door.vertical, line, mapX, mapY, posX, posY, rayDirX, rayDirY);
      // The door panel covers along = open … 1. Texture moves with the panel.
      if (c && c.along >= door.open) {
        return { t: c.t, mapX, mapY, side: door.vertical ? 0 : 1, cell, door, wallX: c.along - door.open };
      }
      continue;                                 // through the gap, or out the side
    }

    if (cell === PUSHWALL) {
      const pw = map.pushwall;
      const vertical = pw.dx !== 0;
      const line = vertical ? mapX + (pw.dx > 0 ? pw.offset : 1 - pw.offset)
                            : mapY + (pw.dy > 0 ? pw.offset : 1 - pw.offset);
      const c = crossInCell(vertical, line, mapX, mapY, posX, posY, rayDirX, rayDirY);
      if (c) return { t: c.t, mapX, mapY, side: vertical ? 0 : 1, cell: pw.texture, wallX: c.along };
      continue;                                 // still in the empty part of the cell
    }
    break;
  }
  return { t, mapX, mapY, side, cell, doorFrame: prev === DOOR };
}

// ------------------------------------------------------------- doors and push-walls

const DOOR_OPEN_TIME = 1.0;   // seconds to slide fully open (or shut)
const DOOR_STAY_OPEN = 4.3;   // seconds an open door waits before closing (Wolfenstein: 300 tics)
const PUSH_SPEED = 1.0;       // push-wall speed, cells per second
const PUSH_DISTANCE = 2;      // cells a push-wall moves

/** Using a door: closed or closing doors open; open ones start to close. */
function useDoor(door) {
  if (door.state === 'closed' || door.state === 'closing') door.state = 'opening';
  else if (door.state === 'open') door.state = 'closing';
}

/**
 * Advances every door and the push-wall by dt seconds. isOccupied(x, y) says
 * whether something stands in a cell, so a door doesn't close on it.
 */
function updateDoors(map, dt, isOccupied) {
  for (const d of map.doors.values()) {
    if (d.state === 'opening') {
      d.open = Math.min(1, d.open + dt / DOOR_OPEN_TIME);
      if (d.open === 1) { d.state = 'open'; d.timer = DOOR_STAY_OPEN; }
    } else if (d.state === 'open') {
      d.timer -= dt;
      if (d.timer <= 0) d.state = 'closing';
    } else if (d.state === 'closing') {
      if (isOccupied(d.x, d.y)) { d.state = 'opening'; continue; }   // something's in the way
      d.open = Math.max(0, d.open - dt / DOOR_OPEN_TIME);
      if (d.open === 0) d.state = 'closed';
    }
  }
  movePushwall(map, dt);
}

/**
 * Starts pushing the secret wall at (x, y) in direction (dx, dy), if there's
 * room for it. Only one push-wall moves at a time, as in Wolfenstein.
 */
function startPushwall(map, x, y, dx, dy) {
  if (map.pushwall || mapCell(map, x + dx, y + dy) !== 0) return false;
  const i = y * map.w + x;
  map.secrets.delete(i);
  map.pushwall = { x, y, dx, dy, offset: 0, moved: 0, texture: map.cells[i] };
  map.cells[i] = PUSHWALL;
  map.cells[i + dy * map.w + dx] = map.pushwall.texture;  // the block already pokes into the next cell
  return true;
}

function movePushwall(map, dt) {
  const pw = map.pushwall;
  if (!pw) return;
  pw.offset += PUSH_SPEED * dt;
  if (pw.offset < 1) return;

  // A whole cell further: the block now fills (x + dx, y + dy).
  map.cells[pw.y * map.w + pw.x] = 0;
  pw.x += pw.dx;
  pw.y += pw.dy;
  pw.moved++;
  pw.offset -= 1;
  if (pw.moved >= PUSH_DISTANCE || mapCell(map, pw.x + pw.dx, pw.y + pw.dy) !== 0) {
    map.cells[pw.y * map.w + pw.x] = pw.texture;          // stop: an ordinary wall again
    map.pushwall = null;
    return;
  }
  map.cells[pw.y * map.w + pw.x] = PUSHWALL;
  map.cells[(pw.y + pw.dy) * map.w + pw.x + pw.dx] = pw.texture;
}

/**
 * The "use" key. Like Wolfenstein, it looks at the cell right next to the
 * player in the direction they face, rounded to north, east, south or west.
 * Returns what happened: 'door', 'pushwall' or null.
 */
function useAction(map, p) {
  const eastWest = Math.abs(p.dirX) > Math.abs(p.dirY);
  const dx = eastWest ? Math.sign(p.dirX) : 0;
  const dy = eastWest ? 0 : Math.sign(p.dirY);
  const cx = Math.floor(p.x) + dx, cy = Math.floor(p.y) + dy;
  const i = cy * map.w + cx;
  if (mapCell(map, cx, cy) === DOOR) { useDoor(map.doors.get(i)); return 'door'; }
  if (map.secrets.has(i) && startPushwall(map, cx, cy, dx, dy)) return 'pushwall';
  return null;
}

/** Is cell (x, y) solid for movement? Doors are, unless fully open. */
function isSolid(map, x, y) {
  const cell = mapCell(map, x, y);
  if (cell === DOOR) return map.doors.get(y * map.w + x).open < 1;
  return cell !== 0;
}

// ------------------------------------------------------------- player / camera

/** The camera from step 3: position, unit direction d, and plane p = perp(d)·tan(FOV/2). */
function createPlayer(x, y, angle, fovDegrees = 66) {
  const k = Math.tan(fovDegrees * Math.PI / 360);
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  return { x, y, dirX, dirY, planeX: -dirY * k, planeY: dirX * k };
}

/** Changes the field of view: rescales p, keeping its direction. */
function setFov(p, fovDegrees) {
  const k = Math.tan(fovDegrees * Math.PI / 360) / Math.hypot(p.planeX, p.planeY);
  p.planeX *= k;
  p.planeY *= k;
}

/** Rotation matrix from step 2, applied to both camera vectors. */
function rotatePlayer(p, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const dx = p.dirX, px = p.planeX;
  p.dirX = dx * c - p.dirY * s;
  p.dirY = dx * s + p.dirY * c;
  p.planeX = px * c - p.planeY * s;
  p.planeY = px * s + p.planeY * c;
}

const MOVE_SPEED = 3.0;     // cells per second
const RUN_FACTOR = 1.8;     // while Shift is held
const TURN_SPEED = 2.2;     // radians per second
const PLAYER_RADIUS = 0.3;  // half the side of the player's collision box, in cells

/**
 * Does a square of half-size r centred on (x, y) overlap any wall cell, or
 * any of the blocking objects (each a square of half-size o.r around o.x, o.y)?
 */
function isBlocked(map, x, y, r, objects = []) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (isSolid(map, cx, cy)) return true;
    }
  }
  for (const o of objects) {
    if (Math.abs(x - o.x) < r + o.r && Math.abs(y - o.y) < r + o.r) return true;
  }
  return false;
}

/**
 * Moves p by (dx, dy) unless that would put it inside a wall.
 * With slide = true, x and y are tried separately, so when you walk into a
 * wall at an angle the blocked component is dropped and you glide along it.
 */
function tryMove(map, p, dx, dy, r, slide = true, objects = []) {
  if (!slide) {
    if (!isBlocked(map, p.x + dx, p.y + dy, r, objects)) { p.x += dx; p.y += dy; }
    return;
  }
  if (!isBlocked(map, p.x + dx, p.y, r, objects)) p.x += dx;
  if (!isBlocked(map, p.x, p.y + dy, r, objects)) p.y += dy;
}

/**
 * Keyboard controls, all scaled by dt (seconds since the last frame) so speed
 * doesn't depend on the frame rate:
 *   ← →: turn  ·  ↑ ↓ / W S: forward/back  ·  A D: strafe  ·  Shift: run
 * opts.objects: things to bump into besides walls (see isBlocked)
 */
function movePlayer(map, p, keys, dt, opts = {}) {
  const radius = opts.radius ?? PLAYER_RADIUS;
  if (keys.has('ArrowLeft'))  rotatePlayer(p, -TURN_SPEED * dt);
  if (keys.has('ArrowRight')) rotatePlayer(p,  TURN_SPEED * dt);

  let forward = 0, strafe = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) forward += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) forward -= 1;
  if (keys.has('KeyD')) strafe += 1;
  if (keys.has('KeyA')) strafe -= 1;
  if (!forward && !strafe) return;

  // Strafing moves along the plane vector (the camera's "right"), normalised.
  const planeLen = Math.hypot(p.planeX, p.planeY);
  let mx = p.dirX * forward + (p.planeX / planeLen) * strafe;
  let my = p.dirY * forward + (p.planeY / planeLen) * strafe;
  const len = Math.hypot(mx, my);           // diagonal input shouldn't be faster
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_FACTOR : 1;
  const step = MOVE_SPEED * run * dt / len;
  tryMove(map, p, mx * step, my * step, radius, opts.slide ?? true, opts.objects);
}

// ------------------------------------------------------------- pixels

/** Packs a colour into one 32-bit pixel (ImageData is RGBA bytes = ABGR as a little-endian uint32). */
function rgb(r, g, b) {
  return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/** Halves every channel: the "dark side" of a wall. */
function shade(c) {
  return (((c >>> 1) & 0x7F7F7F) | 0xFF000000) >>> 0;
}

/** A software framebuffer: we write pixels into `pixels`, then blit it to the canvas. */
function createScreen(canvas) {
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(canvas.width, canvas.height);
  return {
    w: canvas.width, h: canvas.height, ctx, image,
    pixels: new Uint32Array(image.data.buffer),
    present() { this.ctx.putImageData(this.image, 0, 0); },
  };
}

const CEILING_COLOR = rgb(56, 56, 56);
const FLOOR_COLOR = rgb(112, 112, 112);

const EYE_HEIGHT = 0.5;   // the eye is halfway up a 1-unit wall

/**
 * Floor and ceiling, one screen ROW at a time.
 *
 * A floor row y (below the horizon) sees the floor at one fixed depth:
 *   rowDist = EYE_HEIGHT * projScale / (y + 0.5 - h/2)
 * Within that row, pixel x looks along the ray d + c·p (c = -1 … +1), so the
 * floor point is  pos + rowDist · (d + c·p) = pos + rowDist · M · (c, 1)
 * with M = [p d] the camera matrix from step 3. That's linear in c, so along
 * the row we just add a constant step per pixel.
 * The ceiling row mirrored around the horizon has the same rowDist.
 */
function renderFloorCeiling(screen, p, projScale, flat) {
  const { w, h, pixels } = screen;
  const half = h / 2;
  if (flat) {
    pixels.fill(CEILING_COLOR, 0, half * w);
    pixels.fill(FLOOR_COLOR, half * w, h * w);
    return;
  }
  for (let y = half; y < h; y++) {
    const rowDist = EYE_HEIGHT * projScale / (y + 0.5 - half);

    // World point for the left edge of the row (c = -1 at x = 0, like the wall rays)...
    let fx = p.x + rowDist * (p.dirX - p.planeX);
    let fy = p.y + rowDist * (p.dirY - p.planeY);
    // ...and how far it moves per pixel: dc = 2/w, so rowDist · p · 2/w.
    const stepX = rowDist * 2 * p.planeX / w;
    const stepY = rowDist * 2 * p.planeY / w;

    const floorRow = y * w;
    const ceilRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
      // Texture coordinates = fractional part of the world position × 64.
      // ("& 63" wraps negative values correctly too.)
      const tx = ((fx * TEX) | 0) & (TEX - 1);
      const ty = ((fy * TEX) | 0) & (TEX - 1);
      const i = tx * TEX + ty;
      pixels[floorRow + x] = FLOOR_TEXTURE[i];
      pixels[ceilRow + x] = CEILING_TEXTURE[i];
      fx += stepX;
      fy += stepY;
    }
  }
}

// ------------------------------------------------------------- sprites

/**
 * World point → camera space, with the inverse camera matrix M⁻¹ from step 3:
 * v is the depth in front of the camera, u the sideways offset in units of p.
 */
function toCameraSpace(p, x, y) {
  const rx = x - p.x, ry = y - p.y;
  const invDet = 1 / (p.planeX * p.dirY - p.dirX * p.planeY);
  return {
    u: invDet * (p.dirY * rx - p.dirX * ry),
    v: invDet * (-p.planeY * rx + p.planeX * ry),
  };
}

/**
 * Which of an object's 8 rotation frames to show: the direction from the
 * object to the viewer, relative to the way the object faces (obj.angle), in
 * steps of 45°. 0 = it faces us, 2 = we're on its right, 4 = we see its back.
 */
function rotationFrame(obj, p) {
  const toViewer = Math.atan2(p.y - obj.y, p.x - obj.x);
  const k = Math.round((toViewer - obj.angle) / (Math.PI / 4));
  return ((k % 8) + 8) % 8;
}

const NEAR_PLANE = 0.2;   // sprites nearer than this (or behind us) are not drawn

/**
 * Draws sprites as billboards: flat pictures that always face the camera.
 * Each entry is {x, y, image}: a point on the floor, and the picture to stand
 * there, one cell tall like a wall.
 *
 * zBuffer[x] is the wall depth of column x from the wall pass; a sprite column
 * is skipped where the wall is nearer (opts.depthBuffer, default true). With
 * opts.sort (default true) sprites are drawn far to near, so nearer ones cover
 * farther ones: the painter's algorithm.
 *
 * Returns where each visible sprite landed on screen (for the demos).
 */
function renderSprites(screen, p, projScale, sprites, zBuffer, opts = {}) {
  const { w, h, pixels } = screen;
  const useDepth = opts.depthBuffer ?? true;

  const visible = [];
  for (const s of sprites) {
    const { u, v } = toCameraSpace(p, s.x, s.y);
    if (v >= NEAR_PLANE) visible.push({ s, u, v });
  }
  if (opts.sort ?? true) visible.sort((a, b) => b.v - a.v);   // farthest first

  const drawn = [];
  for (const { s, u, v } of visible) {
    const img = s.image;
    const size = projScale / v;                    // as tall as a wall at depth v
    const screenX = (w / 2) * (1 + u / v);         // c = u / v, from step 3
    const left = screenX - size / 2;
    const top = h / 2 - size / 2;
    const step = TEX / size;                       // texels per screen pixel

    // Only the screen columns that show texture columns img.left … img.right.
    const x0 = Math.max(0, Math.ceil(left + img.left / step - 0.5));
    const x1 = Math.min(w, Math.ceil(left + (img.right + 1) / step - 0.5));
    const y0 = Math.max(0, Math.ceil(top - 0.5));
    const y1 = Math.min(h, Math.ceil(top + size - 0.5));

    let columnsDrawn = 0;
    for (let x = x0; x < x1; x++) {
      if (useDepth && v >= zBuffer[x]) continue;   // a wall is in front of this column
      const texCol = ((x + 0.5 - left) * step | 0) * TEX;
      let texPos = (y0 + 0.5 - top) * step;
      for (let y = y0; y < y1; y++) {
        const color = img.pixels[texCol + (texPos | 0)];
        texPos += step;
        if (color !== 0) pixels[y * w + x] = color; // 0 = transparent: leave what's behind
      }
      columnsDrawn++;
    }
    drawn.push({ sprite: s, u, v, screenX, size, left, top, x0, x1, columnsDrawn });
  }
  return drawn;
}

/**
 * Draws one frame. Returns per-column details (for the minimap and the demo)
 * and where the sprites landed.
 *
 * opts.flatFloor: Wolfenstein-style solid floor and ceiling colours
 * opts.shadeSides (default true): darken faces with side = 1
 * opts.doorFrames (default true): door-frame texture on the walls beside doors
 * opts.sprites: [{x, y, image}], drawn after the walls (see renderSprites)
 * opts.depthBuffer, opts.sort: passed on to renderSprites
 */
function renderFrame(screen, map, p, opts = {}) {
  const { w, h, pixels } = screen;
  const planeLen = Math.hypot(p.planeX, p.planeY);
  const projScale = (w / 2) / planeLen;
  const shadeSides = opts.shadeSides ?? true;
  const doorFrames = opts.doorFrames ?? true;
  const columns = new Array(w);
  const zBuffer = new Float64Array(w);   // wall depth per column, for the sprites

  // Floor and ceiling first; walls are then drawn over them.
  renderFloorCeiling(screen, p, projScale, opts.flatFloor);

  for (let x = 0; x < w; x++) {
    const c = 2 * x / w - 1;
    const rayDirX = p.dirX + p.planeX * c;
    const rayDirY = p.dirY + p.planeY * c;
    const hit = castRay(map, p.x, p.y, rayDirX, rayDirY);
    const dist = hit.t;

    const lineHeight = projScale / dist;
    const wallTop = h / 2 - lineHeight / 2;
    const top = Math.max(0, Math.ceil(wallTop - 0.5));
    const bottom = Math.min(h, Math.ceil(wallTop + lineHeight - 0.5));

    // Doors and push-walls bring their own wallX; for walls it's where the ray hit.
    let wallX = hit.wallX;
    if (wallX === undefined) {
      wallX = hit.side === 0 ? p.y + hit.t * rayDirY : p.x + hit.t * rayDirX;
      wallX -= Math.floor(wallX);
    }
    let texX = Math.min(TEX - 1, Math.floor(wallX * TEX));
    // Flip so textures read left to right from either side. Not for doors:
    // their texture is fixed to the sliding panel.
    if (!hit.door && ((hit.side === 0 && rayDirX < 0) || (hit.side === 1 && rayDirY > 0))) texX = TEX - 1 - texX;

    const tex = hit.door ? DOOR_TEXTURE
      : hit.doorFrame && doorFrames ? DOOR_FRAME_TEXTURE
      : WALL_TEXTURES[hit.cell] || WALL_TEXTURES[1];
    const texCol = texX * TEX;
    const step = TEX / lineHeight;
    let texPos = (top + 0.5 - wallTop) * step;
    const dark = shadeSides && hit.side === 1;

    for (let y = top; y < bottom; y++) {
      const texY = (texPos | 0) & (TEX - 1);
      texPos += step;
      const color = tex[texCol + texY];
      pixels[y * w + x] = dark ? shade(color) : color;
    }

    zBuffer[x] = dist;
    columns[x] = {
      hitX: p.x + rayDirX * hit.t, hitY: p.y + rayDirY * hit.t,
      dist, lineHeight, top, bottom, side: hit.side, cell: hit.cell,
      mapX: hit.mapX, mapY: hit.mapY, wallX, texX, step, door: hit.door, doorFrame: hit.doorFrame,
    };
  }

  // Sprites last, over the walls, but only where they are nearer than the wall.
  const sprites = renderSprites(screen, p, projScale, opts.sprites || [], zBuffer, opts);
  screen.present();
  return { columns, projScale, zBuffer, sprites };
}
