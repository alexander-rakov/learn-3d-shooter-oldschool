'use strict';
/*
 * The engine, step 15: the step 10 renderer on a polygon map.
 * Gone: the grid, parseMap, DDA. New: castRay tests the ray against every
 * one-sided linedef, walls are textured by the distance along the line and
 * shaded by its angle, and collision pushes a circle out of linedefs.
 * Needs level.js (the map) and textures.js.
 */

// ------------------------------------------------------------- ray vs. lines

/**
 * The nearest wall along pos + t·r. With no grid there's no DDA: every
 * linedef is a candidate, so we test them all and keep the smallest t.
 *
 * The ray meets the line through v1 with direction e = v2 − v1 where
 * pos + t·r = v1 + s·e. Crossing both sides with e, then with r, gives
 *   t = cross(v1 − pos, e) / cross(r, e)    s = cross(v1 − pos, r) / cross(r, e)
 * The hit is on the segment if 0 ≤ s ≤ 1, and in front of us if t > 0.
 * As in step 7, t along r = d + c·p is depth.
 */
function castRay(map, posX, posY, rayDirX, rayDirY) {
  let hit = null, nearest = Infinity;
  for (const line of map.lines) {
    if (line.back) continue;   // two-sided: open, since every sector has the same floor and ceiling
    const denom = cross(rayDirX, rayDirY, line.dx, line.dy);
    if (denom === 0) continue; // parallel
    const qx = line.v1.x - posX, qy = line.v1.y - posY;
    const t = cross(qx, qy, line.dx, line.dy) / denom;
    if (t <= 0 || t >= nearest) continue;
    const s = cross(qx, qy, rayDirX, rayDirY) / denom;
    if (s < 0 || s > 1) continue;
    nearest = t;
    hit = { t, s, line };
  }
  return hit;
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

const MOVE_SPEED = 3.0;      // units per second
const RUN_FACTOR = 1.8;      // while Shift is held
const TURN_SPEED = 2.2;      // radians per second
const PLAYER_RADIUS = 0.25;  // the player is a circle now, not a box

/** Can the player pass through this line? Only two-sided lines are open (step 17 adds heights). */
function blocksMove(line) {
  return !line.back;
}

/**
 * Pushes a circle of radius r at p out of every blocking line it overlaps.
 * The closest point of a segment to p is step 1's projection, clamped to the
 * segment's ends: s = (p − v1)·e / |e|², then v1 + s·e.
 */
function pushOut(map, p, r) {
  for (const line of map.lines) {
    if (!blocksMove(line)) continue;
    let s = ((p.x - line.v1.x) * line.dx + (p.y - line.v1.y) * line.dy) / (line.length * line.length);
    s = Math.max(0, Math.min(1, s));
    const ox = p.x - (line.v1.x + s * line.dx), oy = p.y - (line.v1.y + s * line.dy);
    const d = Math.hypot(ox, oy);
    if (d < r && d > 1e-9) {
      p.x += ox / d * (r - d);   // move out along the line from the closest point
      p.y += oy / d * (r - d);
    }
  }
}

/**
 * Moves p by (dx, dy), in small steps so a fast move can't jump over a
 * line. Pushing out along the wall's normal drops the part of the move that
 * goes into the wall and keeps the part along it: sliding comes for free.
 */
function tryMove(map, p, dx, dy, r) {
  const n = Math.ceil(Math.hypot(dx, dy) / (r / 2));
  for (let i = 0; i < n; i++) {
    p.x += dx / n;
    p.y += dy / n;
    pushOut(map, p, r);
    pushOut(map, p, r);   // twice: being pushed out of one wall can push us into another
  }
}

/**
 * Keyboard controls, all scaled by dt:
 *   ← →: turn  ·  ↑ ↓ / W S: forward/back  ·  A D: strafe  ·  Shift: run
 */
function movePlayer(map, p, keys, dt) {
  if (keys.has('ArrowLeft'))  rotatePlayer(p, -TURN_SPEED * dt);
  if (keys.has('ArrowRight')) rotatePlayer(p,  TURN_SPEED * dt);

  let forward = 0, strafe = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) forward += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) forward -= 1;
  if (keys.has('KeyD')) strafe += 1;
  if (keys.has('KeyA')) strafe -= 1;
  if (!forward && !strafe) return;

  const planeLen = Math.hypot(p.planeX, p.planeY);
  const mx = p.dirX * forward + (p.planeX / planeLen) * strafe;
  const my = p.dirY * forward + (p.planeY / planeLen) * strafe;
  const len = Math.hypot(mx, my);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') ? RUN_FACTOR : 1;
  const step = MOVE_SPEED * run * dt / len;
  tryMove(map, p, mx * step, my * step, PLAYER_RADIUS);
}

// ------------------------------------------------------------- pixels

/** Packs a colour into one 32-bit pixel (ImageData is RGBA bytes = ABGR as a little-endian uint32). */
function rgb(r, g, b) {
  return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/** Scales a colour by k/256 (k = 0 … 256). */
function dim(c, k) {
  const r = ((c & 0xFF) * k) >> 8, g = (((c >>> 8) & 0xFF) * k) >> 8, b = (((c >>> 16) & 0xFF) * k) >> 8;
  return (0xFF000000 | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * Brightness of a wall (0 … 256) from its angle. Step 6 darkened walls
 * running east–west; with walls at any angle, the brightness slides from 55%
 * (east–west) to 100% (north–south).
 */
function wallShade(line) {
  return Math.round(256 * (0.55 + 0.45 * Math.abs(line.dy) / line.length));
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

const EYE_HEIGHT = 0.5;   // every floor is at 0 and every ceiling at 1, for now

/** Floor and ceiling, one row at a time: step 10, unchanged. */
function renderFloorCeiling(screen, p, projScale) {
  const { w, h, pixels } = screen;
  const half = h / 2;
  for (let y = half; y < h; y++) {
    const rowDist = EYE_HEIGHT * projScale / (y + 0.5 - half);
    let fx = p.x + rowDist * (p.dirX - p.planeX);
    let fy = p.y + rowDist * (p.dirY - p.planeY);
    const stepX = rowDist * 2 * p.planeX / w;
    const stepY = rowDist * 2 * p.planeY / w;
    const floorRow = y * w;
    const ceilRow = (h - 1 - y) * w;
    for (let x = 0; x < w; x++) {
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

/**
 * Draws one frame. Returns per-column details (for the minimap and the demo)
 * and how many ray/line tests it took.
 */
function renderFrame(screen, map, p) {
  const { w, h, pixels } = screen;
  const planeLen = Math.hypot(p.planeX, p.planeY);
  const projScale = (w / 2) / planeLen;
  const columns = new Array(w);

  renderFloorCeiling(screen, p, projScale);

  for (let x = 0; x < w; x++) {
    const c = 2 * x / w - 1;
    const rayDirX = p.dirX + p.planeX * c;
    const rayDirY = p.dirY + p.planeY * c;
    const hit = castRay(map, p.x, p.y, rayDirX, rayDirY);
    if (!hit) { columns[x] = null; continue; }   // a hole in the map: nothing to draw
    const dist = hit.t;

    const lineHeight = projScale / dist;
    const wallTop = h / 2 - lineHeight / 2;
    const top = Math.max(0, Math.ceil(wallTop - 0.5));
    const bottom = Math.min(h, Math.ceil(wallTop + lineHeight - 0.5));

    // u: distance from v1 along the line, in map units. One texture per unit, repeating.
    const line = hit.line;
    const wallU = hit.s * line.length;
    const texX = ((wallU * TEX) | 0) & (TEX - 1);

    const tex = WALL_TEXTURES[line.front.texture] || WALL_TEXTURES[1];
    const texCol = texX * TEX;
    const step = TEX / lineHeight;
    let texPos = (top + 0.5 - wallTop) * step;
    const k = wallShade(line);

    for (let y = top; y < bottom; y++) {
      const texY = (texPos | 0) & (TEX - 1);
      texPos += step;
      pixels[y * w + x] = dim(tex[texCol + texY], k);
    }

    columns[x] = {
      hitX: p.x + rayDirX * dist, hitY: p.y + rayDirY * dist,
      dist, top, bottom, line, s: hit.s, wallU, texX,
    };
  }
  screen.present();
  return { columns, projScale, tests: w * map.lines.length };
}
