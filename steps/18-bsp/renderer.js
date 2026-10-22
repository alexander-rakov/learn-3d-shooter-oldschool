'use strict';
/*
 * The engine, step 18: drawing in BSP order.
 * Gone: portal rendering (renderSector). New: renderNode walks the BSP tree
 * front to back, solid segs (a list of column ranges that are finished)
 * clip every seg and end the walk when the screen is full, bboxVisible skips
 * whole branches out of view, and the player's sector comes from the tree.
 * Sectors no longer need to be convex. Needs level.js, bsp.js and textures.js.
 */

// ------------------------------------------------------------- player / camera

/** The camera from step 3: position, unit direction d, and plane p = perp(d)·tan(FOV/2). */
function createPlayer(x, y, angle, fovDegrees = 66) {
  const k = Math.tan(fovDegrees * Math.PI / 360);
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  return { x, y, z: EYE_HEIGHT, dirX, dirY, planeX: -dirY * k, planeY: dirX * k, sector: null };
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
const MAX_STEP = 0.375;      // the highest step you can walk up
const PLAYER_HEIGHT = 0.7;   // the lowest gap you can fit through
const EYE_HEIGHT = 0.5;      // the eye is this far above the floor you stand on

/**
 * Can the player, standing on a floor at height `floor`, pass this line?
 * One-sided: never. Two-sided: the opening is between the higher of the two
 * floors and the lower of the two ceilings. It has to be tall enough, and its
 * bottom not too far above our feet.
 */
function blocksMove(line, floor) {
  if (!line.back) return true;
  const a = line.front.sector, b = line.back.sector;
  const openTop = Math.min(a.ceil, b.ceil), openBottom = Math.max(a.floor, b.floor);
  return openTop - openBottom < PLAYER_HEIGHT || openBottom - floor > MAX_STEP;
}

/**
 * Pushes a circle of radius r at p out of every blocking line it overlaps.
 * The closest point of a segment to p is step 1's projection, clamped to the
 * segment's ends: s = (p − v1)·e / |e|², then v1 + s·e.
 */
function pushOut(map, p, r) {
  const floor = p.sector ? p.sector.floor : 0;
  for (const line of map.lines) {
    if (!blocksMove(line, floor)) continue;
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
 * After each step, p.sector is the sector we're now standing in, found by
 * walking down the BSP tree.
 */
function tryMove(map, p, dx, dy, r) {
  const n = Math.ceil(Math.hypot(dx, dy) / (r / 2));
  for (let i = 0; i < n; i++) {
    p.x += dx / n;
    p.y += dy / n;
    pushOut(map, p, r);
    pushOut(map, p, r);   // twice: being pushed out of one wall can push us into another
    p.sector = subsectorAt(map, p.x, p.y).sector;
  }
}

/**
 * The eye follows the floor: up a step, or down off a ledge. It eases
 * towards its new height instead of jumping, which makes stairs feel smooth.
 */
function updateViewHeight(map, p, dt) {
  p.sector = subsectorAt(map, p.x, p.y).sector;
  const target = (p.sector ? p.sector.floor : 0) + EYE_HEIGHT;
  p.z += (target - p.z) * Math.min(1, 12 * dt);
}

/**
 * Keyboard controls, all scaled by dt:
 *   ← →: turn  ·  ↑ ↓ / W S: forward/back  ·  A D: strafe  ·  Shift: run
 */
function movePlayer(map, p, keys, dt) {
  updateViewHeight(map, p, dt);
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

/** Distance from (x, y) to a seg (step 15's clamped projection). */
function distToSeg(seg, x, y) {
  let s = ((x - seg.v1.x) * seg.dx + (y - seg.v1.y) * seg.dy) / (seg.length * seg.length);
  s = Math.max(0, Math.min(1, s));
  return Math.hypot(x - (seg.v1.x + s * seg.dx), y - (seg.v1.y + s * seg.dy));
}

/**
 * Where does a seg land on screen? Step 16's projectWall, for segs: returns
 * { culled } if we can't see it, otherwise the screen x of both ends and,
 * at each end, 1/v and along/v.
 */
function projectSeg(p, seg, w) {
  // Standing in a doorway: the opening is too near to project, but it covers
  // the whole view. Look straight through it (there's nothing to draw).
  if (seg.back && distToSeg(seg, p.x, p.y) < NEAR_PLANE) return { x1: -Infinity, x2: Infinity, through: true };
  if (pointOnSide(seg, p.x, p.y) === 1) return { culled: 'back' };

  const a = toCameraSpace(p, seg.v1.x, seg.v1.y);
  const b = toCameraSpace(p, seg.v2.x, seg.v2.y);
  let u1 = a.u, v1 = a.v, along1 = seg.offset;
  let u2 = b.u, v2 = b.v, along2 = seg.offset + seg.length;
  if (v1 < NEAR_PLANE && v2 < NEAR_PLANE) return { culled: 'behind' };
  if (v1 < NEAR_PLANE) {
    const f = (NEAR_PLANE - v1) / (v2 - v1);
    u1 += f * (u2 - u1); along1 += f * (along2 - along1); v1 = NEAR_PLANE;
  } else if (v2 < NEAR_PLANE) {
    const f = (NEAR_PLANE - v2) / (v1 - v2);
    u2 += f * (u1 - u2); along2 += f * (along1 - along2); v2 = NEAR_PLANE;
  }
  const x1 = (w / 2) * (1 + u1 / v1);
  const x2 = (w / 2) * (1 + u2 / v2);
  if (x1 >= x2) return { culled: 'back' };
  if (x2 <= 0 || x1 >= w) return { culled: 'outside' };
  return { x1, x2, iz1: 1 / v1, iz2: 1 / v2, az1: along1 / v1, az2: along2 / v2 };
}

/** The first pixel row at or below screen height y (row r covers y from r to r + 1; we test its centre). */
function rowAt(y) {
  return Math.ceil(y - 0.5);
}

/**
 * One column of wall, rows y0 … y1 − 1. Textures are pinned to the world:
 * texture row = height below z = 0, × 64, so the bricks of a step line up
 * with the bricks of the wall above it. scale = projScale / depth is how
 * many pixels one map unit covers at this depth.
 */
function drawWallColumn(r, x, y0, y1, tex, texCol, scale, k) {
  const { w, pixels } = r.screen;
  const step = TEX / scale;
  // World height at the centre of row y0, turned into a texture row. The big
  // constant keeps it positive, so `| 0` rounds down.
  let texPos = (1024 - (r.eyeZ + (r.horizon - (y0 + 0.5)) / scale)) * TEX;
  for (let y = y0; y < y1; y++) {
    pixels[y * w + x] = dim(tex[texCol + ((texPos | 0) & (TEX - 1))], k);
    texPos += step;
  }
  r.stats.pixels += Math.max(0, y1 - y0);
}

/**
 * One column of a floor (or ceiling) at height z, rows y0 … y1 − 1. Each
 * row of a horizontal surface has one depth (step 10), now from the height
 * difference between the eye and the surface:
 *   rowDist = |eyeZ − z| · projScale / (distance from the horizon)
 * Then the world point is pos + rowDist · (d + c·p), as in step 10, but one
 * pixel at a time, with a division per pixel. Step 19 does better.
 */
function drawFlatColumn(r, x, y0, y1, z, tex) {
  const { w, pixels } = r.screen;
  const p = r.p;
  const height = r.eyeZ - z;   // positive for a floor, negative for a ceiling
  const c = 2 * x / w - 1;
  const rayX = p.dirX + c * p.planeX, rayY = p.dirY + c * p.planeY;
  for (let y = y0; y < y1; y++) {
    const rowDist = height * r.projScale / (y + 0.5 - r.horizon);
    if (!(rowDist > 0)) continue;   // a sliver on the wrong side of the horizon
    const tx = (((p.x + rowDist * rayX) * TEX) | 0) & (TEX - 1);
    const ty = (((p.y + rowDist * rayY) * TEX) | 0) & (TEX - 1);
    pixels[y * w + x] = tex[tx * TEX + ty];
  }
  r.stats.pixels += Math.max(0, y1 - y0);
}

/**
 * Draws the columns xl … xr − 1 of a seg, inside the clip arrays, and
 * narrows the clip arrays.
 *
 * top[x] … bottom[x] − 1 are the rows of column x still open. In each column:
 *   - the front sector's ceiling fills the rows from top[x] down to where the
 *     ceiling meets this wall, and its floor from the wall's foot to bottom[x];
 *   - a one-sided seg fills everything in between with wall, and closes the
 *     column (top = bottom);
 *   - a two-sided seg draws the upper wall if the sector behind has a lower
 *     ceiling, the lower wall if it has a higher floor, and leaves the gap
 *     in between open: top and bottom close in to it. Whatever is drawn
 *     later in this column, through this opening, must fit in that gap.
 */
function drawSeg(r, seg, proj, xl, xr) {
  const { top, bottom, horizon, eyeZ, projScale } = r;
  const front = seg.front, back = seg.back;
  const tex = WALL_TEXTURES[seg.side.texture] || WALL_TEXTURES[1];
  const ceilTex = FLATS[front.ceilTex], floorTex = FLATS[front.floorTex];
  const k = wallShade(seg);
  const span = proj.x2 - proj.x1;
  const dIz = (proj.iz2 - proj.iz1) / span, dAz = (proj.az2 - proj.az1) / span;

  for (let x = xl; x < xr; x++) {
    const t = top[x], b = bottom[x];
    if (t >= b) continue;                          // this column is already full
    const iz = proj.iz1 + (x - proj.x1) * dIz;
    const scale = projScale * iz;                  // pixels per map unit at this depth
    const along = (proj.az1 + (x - proj.x1) * dAz) / iz;
    const texCol = (((along * TEX) | 0) & (TEX - 1)) * TEX;

    // Where the front sector's ceiling and floor meet this wall.
    const ceilY = Math.min(b, Math.max(t, rowAt(horizon - (front.ceil - eyeZ) * scale)));
    const floorY = Math.max(t, Math.min(b, rowAt(horizon - (front.floor - eyeZ) * scale)));
    drawFlatColumn(r, x, t, ceilY, front.ceil, ceilTex);
    drawFlatColumn(r, x, floorY, b, front.floor, floorTex);

    if (!back) {
      drawWallColumn(r, x, ceilY, floorY, tex, texCol, scale, k);
      top[x] = r.screen.h;
      bottom[x] = 0;
      continue;
    }
    let openTop = ceilY, openBottom = floorY;
    if (back.ceil < front.ceil) {                  // upper wall, down to the back ceiling
      const y = Math.max(ceilY, Math.min(floorY, rowAt(horizon - (back.ceil - eyeZ) * scale)));
      drawWallColumn(r, x, ceilY, y, tex, texCol, scale, k);
      openTop = y;
    }
    if (back.floor > front.floor) {                // lower wall, up from the back floor
      const y = Math.min(floorY, Math.max(openTop, rowAt(horizon - (back.floor - eyeZ) * scale)));
      drawWallColumn(r, x, y, floorY, tex, texCol, scale, k);
      openBottom = y;
    }
    top[x] = openTop;
    bottom[x] = openBottom;
  }
}

// ------------------------------------------------------------- the BSP walk

/**
 * Solid segs: the column ranges [a, b) that are finished, closed by a solid
 * wall, sorted and never overlapping. Two sentinels cover everything left of
 * the screen and right of it, so when the list is down to one range, the
 * whole screen is done.
 *
 * clipSeg calls draw(c, d) for every part of [a, b) that isn't covered yet.
 * If the seg is solid (a one-sided wall), [a, b) is then merged into the list.
 */
function clipSeg(r, a, b, solid, draw) {
  const list = r.solid;
  let x = a;
  for (let i = 0; i < list.length && x < b; i++) {
    const s = list[i];
    if (s.b <= x) continue;
    if (s.a > x) draw(x, Math.min(b, s.a));
    x = Math.max(x, s.b);
  }
  if (!solid) return;
  let i = 0;
  while (list[i].b < a) i++;                      // the first range touching [a, b) or after it
  let j = i, na = a, nb = b;
  while (j < list.length && list[j].a <= b) {     // every range touching [a, b) merges into one
    na = Math.min(na, list[j].a);
    nb = Math.max(nb, list[j].b);
    j++;
  }
  list.splice(i, j - i, { a: na, b: nb });
}

function screenFull(r) {
  return r.solid.length === 1;
}

/** Is a seg solid: nothing can be seen past it? One-sided, or a closed door (no gap at all). */
function isSolidSeg(seg) {
  const b = seg.back;
  return !b || b.ceil <= seg.front.floor || b.floor >= seg.front.ceil || b.ceil <= b.floor;
}

/**
 * Could anything in this bounding box be visible? Clip the box (as a
 * rectangle seen from above) to the near plane, project its corners, and
 * see whether the columns they span are all finished already. This lets the
 * walk skip a whole branch of the tree without looking at its segs.
 */
function bboxVisible(r, box) {
  const p = r.p;
  if (p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1) return true;   // we're inside it
  const corners = [[box.x0, box.y0], [box.x1, box.y0], [box.x1, box.y1], [box.x0, box.y1]]
    .map(([x, y]) => toCameraSpace(p, x, y));
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = corners[(i + 1) % 4];
    if (a.v >= NEAR_PLANE) {
      const x = (r.screen.w / 2) * (1 + a.u / a.v);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
    if ((a.v >= NEAR_PLANE) !== (b.v >= NEAR_PLANE)) {   // this edge crosses the near plane
      const f = (NEAR_PLANE - a.v) / (b.v - a.v);
      const x = (r.screen.w / 2) * (1 + (a.u + f * (b.u - a.u)) / NEAR_PLANE);
      lo = Math.min(lo, x); hi = Math.max(hi, x);
    }
  }
  if (lo > hi) return false;                       // entirely behind us
  const a = Math.max(0, Math.floor(lo)), b = Math.min(r.screen.w, Math.ceil(hi));
  if (a >= b) return false;                        // off to the side
  for (const s of r.solid) if (s.a <= a && s.b >= b) return false;   // already finished there
  return true;
}

/** Draws the segs of one subsector, in any order: a subsector is convex. */
function renderSubsector(r, ss) {
  r.order.push(ss);
  for (const seg of ss.segs) {
    if (r.stats.segs >= r.maxSegs) return;
    const proj = projectSeg(r.p, seg, r.screen.w);
    if (proj.culled || proj.through) continue;
    const a = Math.max(0, Math.ceil(proj.x1)), b = Math.min(r.screen.w, Math.ceil(proj.x2));
    if (a >= b) continue;
    let drawn = false;
    clipSeg(r, a, b, isSolidSeg(seg), (c, d) => { drawSeg(r, seg, proj, c, d); drawn = true; });
    if (drawn) { r.stats.segs++; r.drawnSegs.push(seg); }
  }
}

/**
 * The front-to-back walk. At each node, the side of the partition we're
 * standing on can hide things on the other side, but never the reverse. So:
 * draw our side first, then the far side, if its box can still be seen.
 */
function renderNode(r, node) {
  if (screenFull(r) && r.opts.stopWhenFull) return;
  r.stats.nodes++;
  if (node.subsector) { renderSubsector(r, node.subsector); return; }
  const side = pointOnSide(node, r.p.x, r.p.y);
  renderNode(r, node.children[side]);
  if (!r.opts.bboxCheck || bboxVisible(r, node.bbox[side ^ 1])) renderNode(r, node.children[side ^ 1]);
  else r.stats.culled++;
}

/**
 * Draws one frame by walking the BSP tree from the root.
 * opts.stopWhenFull (default true): stop the walk once every column is solid
 * opts.bboxCheck (default true): skip branches whose box can't be seen
 * opts.maxSegs: stop after drawing this many segs (to watch the order)
 */
function renderFrame(screen, map, p, opts = {}) {
  const { w, h, pixels } = screen;
  const planeLen = Math.hypot(p.planeX, p.planeY);
  const r = {
    screen, p, projScale: (w / 2) / planeLen, horizon: h / 2, eyeZ: p.z,
    top: new Int16Array(w), bottom: new Int16Array(w).fill(h),
    solid: [{ a: -Infinity, b: 0 }, { a: w, b: Infinity }],
    opts: { stopWhenFull: true, bboxCheck: true, ...opts }, maxSegs: opts.maxSegs ?? Infinity,
    order: [], drawnSegs: [], stats: { nodes: 0, culled: 0, segs: 0, pixels: 0 },
  };
  pixels.fill(0xFF000000);   // anything left black was never reached
  renderNode(r, map.root);
  screen.present();
  return { order: r.order, drawnSegs: r.drawnSegs, stats: r.stats, full: screenFull(r) };
}
