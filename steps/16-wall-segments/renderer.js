'use strict';
/*
 * The engine, step 16: walls are projected, not ray cast.
 * Gone: castRay. New: toCameraSpace (from step 11), projectWall (back-face
 * test, near-plane clipping, projection), drawWall (columns between the
 * projected ends, interpolating 1/z and along/z), and a one-row depth buffer
 * to decide which wall wins a column. Needs level.js and textures.js.
 */

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

// ------------------------------------------------------------- walls

/**
 * World point → camera space, with the inverse camera matrix M⁻¹ from step 3:
 * v is the depth, u the sideways offset in units of p (so u / v = c).
 */
function toCameraSpace(p, x, y) {
  const rx = x - p.x, ry = y - p.y;
  const invDet = 1 / (p.planeX * p.dirY - p.dirX * p.planeY);
  return {
    u: invDet * (p.dirY * rx - p.dirX * ry),
    v: invDet * (-p.planeY * rx + p.planeX * ry),
  };
}

const NEAR_PLANE = 0.05;   // walls are cut off where they come nearer than this

/**
 * Where does a one-sided wall land on screen? Returns null if we can't see
 * it: from behind, behind us, or outside the screen. Otherwise the screen x
 * of both ends and, at each end, 1/v and along/v, where `along` is the
 * distance from v1 along the wall (for the texture).
 */
function projectWall(p, line, w) {
  // Back-face test: a solid wall can only be seen from its front.
  if (pointOnSide(line, p.x, p.y) === 1) return { culled: 'back' };

  const a = toCameraSpace(p, line.v1.x, line.v1.y);
  const b = toCameraSpace(p, line.v2.x, line.v2.y);
  let u1 = a.u, v1 = a.v, along1 = 0;
  let u2 = b.u, v2 = b.v, along2 = line.length;
  if (v1 < NEAR_PLANE && v2 < NEAR_PLANE) return { culled: 'behind' };

  // Near-plane clipping: move an end that's too near (or behind us) along the
  // wall to where it crosses v = NEAR_PLANE. Everything along the wall is
  // linear in camera space, so one fraction f serves u, v and along.
  let clipped = false;
  if (v1 < NEAR_PLANE) {
    const f = (NEAR_PLANE - v1) / (v2 - v1);
    u1 += f * (u2 - u1); along1 += f * (along2 - along1); v1 = NEAR_PLANE;
    clipped = true;
  } else if (v2 < NEAR_PLANE) {
    const f = (NEAR_PLANE - v2) / (v1 - v2);
    u2 += f * (u1 - u2); along2 += f * (along1 - along2); v2 = NEAR_PLANE;
    clipped = true;
  }

  // Projection: screen x = (W/2) · (1 + u/v), i.e. c = u / v.
  const x1 = (w / 2) * (1 + u1 / v1);
  const x2 = (w / 2) * (1 + u2 / v2);
  if (x1 >= x2) return { culled: 'back' };            // seen edge-on (or from behind, after clipping)
  if (x2 <= 0 || x1 >= w) return { culled: 'outside' };
  return { x1, x2, iz1: 1 / v1, iz2: 1 / v2, az1: along1 / v1, az2: along2 / v2, clipped };
}

/**
 * Draws the columns a projected wall covers. Depth isn't linear across the
 * screen, but 1/depth is, and so is along/depth: step both with a constant
 * increment per column, and divide to get depth and along back.
 *
 * opts.affine: interpolate `along` itself linearly (wrong, for comparison)
 * opts.depthTest (default true): only draw where this wall is nearer than
 * what the column already holds (zBuffer)
 */
function drawWall(screen, line, proj, projScale, zBuffer, heights, opts) {
  const { w, h, pixels } = screen;
  const { x1, x2, iz1, iz2, az1, az2 } = proj;
  const xStart = Math.max(0, Math.ceil(x1)), xEnd = Math.min(w, Math.ceil(x2));
  const span = x2 - x1;
  const dIz = (iz2 - iz1) / span, dAz = (az2 - az1) / span;
  let iz = iz1 + (xStart - x1) * dIz;          // 1/depth at column xStart
  let az = az1 + (xStart - x1) * dAz;          // along/depth at column xStart
  const along1 = az1 / iz1, along2 = az2 / iz2;
  const tex = WALL_TEXTURES[line.front.texture] || WALL_TEXTURES[1];
  const k = wallShade(line);
  let written = 0;

  for (let x = xStart; x < xEnd; x++, iz += dIz, az += dAz) {
    const z = 1 / iz;
    if (opts.depthTest && z >= zBuffer[x]) continue;
    zBuffer[x] = z;

    const along = opts.affine ? along1 + (x - x1) / span * (along2 - along1) : az * z;
    const texCol = (((along * TEX) | 0) & (TEX - 1)) * TEX;
    const lineHeight = projScale * iz;
    const wallTop = h / 2 - lineHeight / 2;
    const top = Math.max(0, Math.ceil(wallTop - 0.5));
    const bottom = Math.min(h, Math.ceil(wallTop + lineHeight - 0.5));
    const step = TEX / lineHeight;
    let texPos = (top + 0.5 - wallTop) * step;
    for (let y = top; y < bottom; y++) {
      pixels[y * w + x] = dim(tex[texCol + ((texPos | 0) & (TEX - 1))], k);
      texPos += step;
    }
    written += bottom - top;
    heights[x] = bottom - top;
  }
  return written;
}

/**
 * Draws one frame: floor and ceiling, then every wall we can see, in map
 * order. The depth buffer sorts out which wall wins each column.
 * Returns what happened to every wall, and counters for the demo.
 */
function renderFrame(screen, map, p, opts = {}) {
  const w = screen.w;
  const planeLen = Math.hypot(p.planeX, p.planeY);
  const projScale = (w / 2) / planeLen;
  const zBuffer = new Float64Array(w).fill(Infinity);
  const heights = new Int32Array(w);   // wall pixels in each column once the frame is done
  const walls = [];
  const stats = { back: 0, behind: 0, outside: 0, drawn: 0, clipped: 0, pixels: 0, visible: 0 };
  opts = { depthTest: true, affine: false, ...opts };

  renderFloorCeiling(screen, p, projScale);

  for (const line of map.lines) {
    if (line.back) continue;   // two-sided: open, since every sector has the same floor and ceiling
    const proj = projectWall(p, line, w);
    walls.push({ line, proj });
    if (proj.culled) { stats[proj.culled]++; continue; }
    stats.drawn++;
    if (proj.clipped) stats.clipped++;
    stats.pixels += drawWall(screen, line, proj, projScale, zBuffer, heights, opts);
  }
  for (let x = 0; x < w; x++) stats.visible += heights[x];
  screen.present();
  return { walls, stats, zBuffer, projScale };
}
