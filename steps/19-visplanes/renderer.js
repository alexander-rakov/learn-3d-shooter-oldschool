'use strict';
/*
 * The engine, step 19: visplanes and lighting.
 * Gone: drawFlatColumn and wallShade. New: drawSeg only marks which rows of
 * each column belong to a floor or ceiling, collected into visplanes
 * (findPlane, checkPlane); after the walk, drawPlanes turns each visplane
 * into horizontal spans (makeSpans) and draws them a row at a time
 * (mapPlane), like step 10. Every pixel is now a palette index lit through
 * the COLORMAP, at a level from the sector's light and the distance
 * (lightLevel), and sky ceilings show the sky (drawSky).
 * Needs level.js, bsp.js, colormap.js and textures.js.
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
 * Doom's lighting, as a COLORMAP row (0 = full bright … 31 = black).
 * A sector's light level (0–255) sets how dark it is far away:
 *   start = (15 − light/16) · 4      0 for light 255 … 60 for light 0
 * and nearer things are brighter, by 20 rows at a depth of 1 unit, fading
 * as 1/depth. Light 255 is bright everywhere. With diminish = false the
 * level comes from the sector's light alone.
 */
function lightLevel(light, depth, diminish = true) {
  const level = diminish ? (15 - (light >> 4)) * 4 - 20 / depth : (255 - light) / 8;
  return Math.max(0, Math.min(LIGHT_LEVELS - 1, Math.round(level)));
}

/**
 * Doom's "fake contrast", step 6's darker walls once more: walls running
 * exactly east–west are one light step (16) darker, exactly north–south one
 * brighter, and slanted walls neither.
 */
function wallLight(seg) {
  const light = seg.front.light + (seg.dy === 0 ? -16 : seg.dx === 0 ? 16 : 0);
  return Math.max(0, Math.min(255, light));
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

/** The colour of texel index t at COLORMAP row `level`: the table lookup, or (for comparison) exact dimming. */
function litColor(r, t, level) {
  return r.opts.trueColor ? dim(PALETTE[t], Math.round(256 * (1 - level / LIGHT_LEVELS))) : PALETTE[COLORMAP[level * 256 + t]];
}

/**
 * One column of wall, rows y0 … y1 − 1. Textures are pinned to the world:
 * texture row = height below z = 0, × 64, so the bricks of a step line up
 * with the bricks of the wall above it. The whole column is at one depth,
 * so it has one light level: a COLORMAP row.
 */
function drawWallColumn(r, x, y0, y1, tex, texCol, scale, level) {
  const { w, pixels } = r.screen;
  const step = TEX / scale;
  let texPos = (1024 - (r.eyeZ + (r.horizon - (y0 + 0.5)) / scale)) * TEX;
  const base = level * 256;
  for (let y = y0; y < y1; y++) {
    const t = tex[texCol + ((texPos | 0) & (TEX - 1))];
    pixels[y * w + x] = r.opts.trueColor ? litColor(r, t, level) : PALETTE[COLORMAP[base + t]];
    texPos += step;
  }
  r.stats.pixels += Math.max(0, y1 - y0);
}

// ------------------------------------------------------------- visplanes

const UNUSED = 0x7FFF;   // a visplane column with no rows in it

/**
 * A visplane: the part of the screen showing one floor or ceiling surface,
 * a height, a texture and a light level, as one span of rows per column:
 * rows top[x] … bottom[x] (inclusive), for minx ≤ x ≤ maxx. The arrays have
 * a spare entry at each end (column x is at index x + 1), always UNUSED.
 */
function newPlane(r, height, tex, light) {
  const w = r.screen.w;
  const pl = { height, tex, light, minx: w, maxx: -1, top: new Int16Array(w + 2).fill(UNUSED), bottom: new Int16Array(w + 2).fill(-1) };
  r.planes.push(pl);
  return pl;
}

/** The visplane for this surface: an existing one if anything else has the same height, texture and light. */
function findPlane(r, height, tex, light) {
  if (tex === SKY) { height = 0; light = 255; }   // all sky is one plane
  for (const pl of r.planes) if (pl.height === height && pl.tex === tex && pl.light === light) return pl;
  return newPlane(r, height, tex, light);
}

/**
 * A seg is about to add rows to columns start … stop − 1 of a visplane. A
 * visplane holds one span of rows per column, so if any of those columns is
 * taken already (the same floor seen again further away, past something
 * nearer), start a new visplane with the same surface.
 */
function checkPlane(r, pl, start, stop) {
  for (let x = Math.max(start, pl.minx); x < Math.min(stop, pl.maxx + 1); x++) {
    if (pl.top[x + 1] !== UNUSED) {
      const fresh = newPlane(r, pl.height, pl.tex, pl.light);
      fresh.minx = start; fresh.maxx = stop - 1;
      return fresh;
    }
  }
  pl.minx = Math.min(pl.minx, start);
  pl.maxx = Math.max(pl.maxx, stop - 1);
  return pl;
}

/** Records rows y0 … y1 − 1 of column x as belonging to a visplane. */
function markPlane(pl, x, y0, y1) {
  if (pl && y0 < y1) { pl.top[x + 1] = y0; pl.bottom[x + 1] = y1 - 1; }
}

/**
 * Draws one span: row y, columns x1 … x2, of a floor or ceiling. This is
 * step 10's row loop with a height: one distance for the whole row, a start
 * point, a constant step, and one light level for the row.
 */
function mapPlane(r, pl, y, x1, x2) {
  const { w, pixels } = r.screen;
  const p = r.p;
  const rowDist = Math.abs(r.eyeZ - pl.height) * r.projScale / Math.abs(y + 0.5 - r.horizon);
  const c = 2 * x1 / w - 1;
  let fx = p.x + rowDist * (p.dirX + c * p.planeX);
  let fy = p.y + rowDist * (p.dirY + c * p.planeY);
  const stepX = rowDist * 2 * p.planeX / w, stepY = rowDist * 2 * p.planeY / w;
  const tex = FLATS[pl.tex];
  const level = lightLevel(pl.light, rowDist, r.opts.diminish);
  const base = level * 256;
  const debug = r.opts.showPlanes ? PLANE_COLORS[r.planes.indexOf(pl) % PLANE_COLORS.length] : 0;
  for (let x = x1; x <= x2; x++) {
    const t = tex[((((fx * TEX) | 0) & (TEX - 1)) * TEX) + (((fy * TEX) | 0) & (TEX - 1))];
    pixels[y * w + x] = debug || (r.opts.trueColor ? litColor(r, t, level) : PALETTE[COLORMAP[base + t]]);
    fx += stepX;
    fy += stepY;
  }
  r.stats.spans++;
  r.stats.pixels += x2 - x1 + 1;
}

/**
 * Turns a visplane's columns into rows. Walk left to right comparing the
 * rows of column x − 1 (t1 … b1) with column x (t2 … b2): rows in the old
 * column but not the new one end a span at x − 1; rows in the new column but
 * not the old one start a span at x. spanStart[y] remembers where row y's
 * current span began. This is Doom's R_MakeSpans.
 */
function makeSpans(r, pl, x, t1, b1, t2, b2) {
  const spanStart = r.spanStart;
  while (t1 < t2 && t1 <= b1) { mapPlane(r, pl, t1, spanStart[t1], x - 1); t1++; }
  while (b1 > b2 && b1 >= t1) { mapPlane(r, pl, b1, spanStart[b1], x - 1); b1--; }
  while (t2 < t1 && t2 <= b2) { spanStart[t2] = x; t2++; }
  while (b2 > b1 && b2 >= t2) { spanStart[b2] = x; b2--; }
}

/**
 * The sky isn't a surface at all: it's a picture that turns with you and
 * never gets nearer. The column depends only on the direction you look (the
 * picture repeats 4 times around), the row only on the screen row, and it's
 * always at full brightness.
 */
function drawSky(r, pl) {
  const { w, h, pixels } = r.screen;
  const p = r.p;
  const view = Math.atan2(p.dirY, p.dirX), planeLen = Math.hypot(p.planeX, p.planeY);
  for (let x = pl.minx; x <= pl.maxx; x++) {
    const top = pl.top[x + 1], bottom = pl.bottom[x + 1];
    if (top > bottom) continue;
    const angle = view + Math.atan((2 * x / w - 1) * planeLen);
    const col = (Math.floor(angle / (2 * Math.PI) * SKY_W * 4) & (SKY_W - 1)) * SKY_H;
    for (let y = top; y <= bottom; y++) {
      const t = SKY_TEXTURE[col + Math.min(SKY_H - 1, (y * (SKY_H - 16) / r.horizon) | 0)];
      pixels[y * w + x] = r.opts.showPlanes ? PLANE_COLORS[r.planes.indexOf(pl) % PLANE_COLORS.length] : PALETTE[t];
    }
  }
}

/** After the walk: every floor and ceiling, one visplane at a time. */
function drawPlanes(r) {
  for (const pl of r.planes) {
    if (pl.minx > pl.maxx) continue;
    if (pl.tex === SKY) { drawSky(r, pl); continue; }
    for (let x = pl.minx; x <= pl.maxx + 1; x++) {
      makeSpans(r, pl, x, pl.top[x], pl.bottom[x], pl.top[x + 1], pl.bottom[x + 1]);
    }
  }
}

// Flat colours for showing the visplanes.
const PLANE_COLORS = [
  rgb(255, 209, 102), rgb(6, 214, 160), rgb(76, 201, 240), rgb(179, 136, 255), rgb(239, 71, 111),
  rgb(248, 150, 30), rgb(138, 201, 38), rgb(255, 153, 200), rgb(155, 246, 255), rgb(253, 255, 182),
];

// ------------------------------------------------------------- segs

/**
 * Draws the columns xl … xr − 1 of a seg, inside the clip arrays, and
 * narrows the clip arrays, as in step 17. Floors and ceilings aren't drawn
 * here any more: their rows are only marked in the current visplanes.
 */
function drawSeg(r, seg, proj, xl, xr) {
  const { top, bottom, horizon, eyeZ, projScale } = r;
  const front = seg.front, back = seg.back;
  const tex = WALL_TEXTURES[seg.side.texture] || WALL_TEXTURES[1];
  const light = wallLight(seg);
  const span = proj.x2 - proj.x1;
  const dIz = (proj.iz2 - proj.iz1) / span, dAz = (proj.az2 - proj.az1) / span;
  if (r.floorPlane) r.floorPlane = checkPlane(r, r.floorPlane, xl, xr);
  if (r.ceilPlane) r.ceilPlane = checkPlane(r, r.ceilPlane, xl, xr);

  for (let x = xl; x < xr; x++) {
    const t = top[x], b = bottom[x];
    if (t >= b) continue;
    const iz = proj.iz1 + (x - proj.x1) * dIz;
    const scale = projScale * iz;
    const along = (proj.az1 + (x - proj.x1) * dAz) / iz;
    const texCol = (((along * TEX) | 0) & (TEX - 1)) * TEX;
    const level = lightLevel(light, 1 / iz, r.opts.diminish);

    const ceilY = Math.min(b, Math.max(t, rowAt(horizon - (front.ceil - eyeZ) * scale)));
    const floorY = Math.max(t, Math.min(b, rowAt(horizon - (front.floor - eyeZ) * scale)));
    markPlane(r.ceilPlane, x, t, ceilY);
    markPlane(r.floorPlane, x, floorY, b);

    if (!back) {
      drawWallColumn(r, x, ceilY, floorY, tex, texCol, scale, level);
      top[x] = r.screen.h;
      bottom[x] = 0;
      continue;
    }
    let openTop = ceilY, openBottom = floorY;
    // Between two sky ceilings there's no wall to see: just more sky.
    if (back.ceil < front.ceil && !(front.ceilTex === SKY && back.ceilTex === SKY)) {
      const y = Math.max(ceilY, Math.min(floorY, rowAt(horizon - (back.ceil - eyeZ) * scale)));
      drawWallColumn(r, x, ceilY, y, tex, texCol, scale, level);
      openTop = y;
    }
    if (back.floor > front.floor) {
      const y = Math.min(floorY, Math.max(openTop, rowAt(horizon - (back.floor - eyeZ) * scale)));
      drawWallColumn(r, x, y, floorY, tex, texCol, scale, level);
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

/**
 * Draws the segs of one subsector, in any order: a subsector is convex.
 * Its floor and ceiling go into visplanes, if we can see them at all: a
 * floor only from above, a ceiling only from below (or if it's sky).
 */
function renderSubsector(r, ss) {
  r.order.push(ss);
  const s = ss.sector;
  r.floorPlane = s.floor < r.eyeZ ? findPlane(r, s.floor, s.floorTex, s.light) : null;
  r.ceilPlane = s.ceil > r.eyeZ || s.ceilTex === SKY ? findPlane(r, s.ceil, s.ceilTex, s.light) : null;
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
 * Draws one frame: walk the BSP tree from the root (walls), then draw the
 * visplanes (floors and ceilings).
 * opts.stopWhenFull (default true): stop the walk once every column is solid
 * opts.bboxCheck (default true): skip branches whose box can't be seen
 * opts.maxSegs: stop after drawing this many segs (to watch the order)
 * opts.diminish (default true): light fades with distance
 * opts.trueColor: dim colours exactly instead of through the COLORMAP
 * opts.showPlanes: fill each visplane with a flat colour
 */
function renderFrame(screen, map, p, opts = {}) {
  const { w, h, pixels } = screen;
  const planeLen = Math.hypot(p.planeX, p.planeY);
  const r = {
    screen, p, projScale: (w / 2) / planeLen, horizon: h / 2, eyeZ: p.z,
    top: new Int16Array(w), bottom: new Int16Array(w).fill(h),
    solid: [{ a: -Infinity, b: 0 }, { a: w, b: Infinity }],
    opts: { stopWhenFull: true, bboxCheck: true, diminish: true, ...opts }, maxSegs: opts.maxSegs ?? Infinity,
    planes: [], floorPlane: null, ceilPlane: null, spanStart: new Int16Array(h),
    order: [], drawnSegs: [], stats: { nodes: 0, culled: 0, segs: 0, pixels: 0, spans: 0 },
  };
  pixels.fill(0xFF000000);   // anything left black was never reached
  renderNode(r, map.root);
  drawPlanes(r);
  screen.present();
  return { order: r.order, drawnSegs: r.drawnSegs, planes: r.planes, stats: r.stats, full: screenFull(r) };
}
