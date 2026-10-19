'use strict';
/*
 * The engine, step 6: + player/camera, + projection and a flat-shaded renderer.
 * New since step 5: createPlayer, rotatePlayer, movePlayer (no collision yet),
 * rgb/shade helpers, createScreen, renderFrame.
 */

function parseMap(rows) {
  const h = rows.length, w = rows[0].length;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      cells[y * w + x] = ch === '.' ? 0 : ch === '#' ? 1 : parseInt(ch, 10);
    }
  }
  return { w, h, cells };
}

function mapCell(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 1;
  return map.cells[y * map.w + x];
}

const MAX_STEPS = 128;

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

  let t = 0, side = 0, cell = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    if (sideDistX < sideDistY) {
      t = sideDistX; sideDistX += deltaDistX; mapX += stepX; side = 0;
    } else {
      t = sideDistY; sideDistY += deltaDistY; mapY += stepY; side = 1;
    }
    cell = mapCell(map, mapX, mapY);
    if (cell !== 0) break;
  }
  return { t, mapX, mapY, side, cell };
}

// ------------------------------------------------------------- player / camera

/** The camera from step 3: position, unit direction d, and plane p = perp(d)·tan(FOV/2). */
function createPlayer(x, y, angle, fovDegrees = 66) {
  const k = Math.tan(fovDegrees * Math.PI / 360);
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  return { x, y, dirX, dirY, planeX: -dirY * k, planeY: dirX * k };
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

const MOVE_SPEED = 3.0;   // cells per second
const TURN_SPEED = 2.2;   // radians per second

/** Keyboard movement. No collision yet: you can walk through walls (fixed in step 8). */
function movePlayer(p, keys, dt) {
  if (keys.has('ArrowLeft'))  rotatePlayer(p, -TURN_SPEED * dt);
  if (keys.has('ArrowRight')) rotatePlayer(p,  TURN_SPEED * dt);
  let f = 0;
  if (keys.has('ArrowUp') || keys.has('KeyW')) f += 1;
  if (keys.has('ArrowDown') || keys.has('KeyS')) f -= 1;
  p.x += p.dirX * f * MOVE_SPEED * dt;
  p.y += p.dirY * f * MOVE_SPEED * dt;
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

const WALL_COLORS = [0, rgb(150, 150, 160), rgb(170, 70, 52), rgb(60, 90, 170)];
const CEILING_COLOR = rgb(56, 56, 56);
const FLOOR_COLOR = rgb(112, 112, 112);

/**
 * Draws one frame. Returns the per-column hits (handy for the minimap).
 *
 * projScale: how many pixels one world unit covers at depth 1. Horizontally the
 * plane's half-width |p| spans W/2 pixels, so 1 unit = (W/2)/|p| pixels; using the
 * same scale vertically keeps pixels square.
 */
function renderFrame(screen, map, p) {
  const { w, h, pixels } = screen;
  const planeLen = Math.hypot(p.planeX, p.planeY);
  const projScale = (w / 2) / planeLen;
  const hits = new Array(w);

  for (let x = 0; x < w; x++) {
    const c = 2 * x / w - 1;
    const rayDirX = p.dirX + p.planeX * c;
    const rayDirY = p.dirY + p.planeY * c;
    const hit = castRay(map, p.x, p.y, rayDirX, rayDirY);

    // The "obvious" distance: Euclidean length from eye to hit point.
    // (Step 7 explains why this is subtly wrong.)
    const dist = hit.t * Math.hypot(rayDirX, rayDirY);

    // Perspective: a wall of height 1 at distance `dist` is projScale / dist pixels tall,
    // centred on the horizon (the eye is at half the wall height).
    const lineHeight = projScale / dist;
    const top = Math.max(0, Math.floor(h / 2 - lineHeight / 2));
    const bottom = Math.min(h, Math.floor(h / 2 + lineHeight / 2));

    let color = WALL_COLORS[hit.cell] || WALL_COLORS[1];
    if (hit.side === 1) color = shade(color);

    for (let y = 0; y < top; y++) pixels[y * w + x] = CEILING_COLOR;
    for (let y = top; y < bottom; y++) pixels[y * w + x] = color;
    for (let y = bottom; y < h; y++) pixels[y * w + x] = FLOOR_COLOR;

    hits[x] = { hitX: p.x + rayDirX * hit.t, hitY: p.y + rayDirY * hit.t, dist, lineHeight };
  }
  screen.present();
  return hits;
}
