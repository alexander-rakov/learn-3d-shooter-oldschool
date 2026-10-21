'use strict';
/*
 * Procedural sprites, the same idea as textures.js: no image files, every
 * texel is computed at startup.
 *
 * A sprite is a TEX × TEX picture stored COLUMN-MAJOR like the wall textures,
 * and the value 0 means "transparent". rgb() always sets the alpha byte, so no
 * opaque colour is ever 0. Each sprite also records its first and last
 * non-empty column (left, right), so the renderer can skip the empty margins.
 *
 * Objects are built from a few shaded shapes (balls, rods, cylinders, boxes)
 * lit from the top-left, like the bevels on the bricks. The robot is put
 * together from parts placed around a vertical axis, so it can be drawn from
 * any direction: that's how we get its 8 rotation frames.
 *
 * Needs rgb() from raycaster.js and TEX, makeRng(), clampByte(), bevel() from textures.js.
 */

// Light from the top-left and a little in front: x right, y down, z towards the viewer.
const LIGHT = normalize3(-0.5, -0.6, 0.62);
const HALFWAY = normalize3(LIGHT[0], LIGHT[1], LIGHT[2] + 1);   // for highlights (viewer at +z)

function normalize3(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

function createSprite() {
  return { pixels: new Uint32Array(TEX * TEX), left: 0, right: -1 };
}

/** Brightness for a unit surface normal: ambient + diffuse + an optional highlight. */
function lit(nx, ny, nz, shine = 0) {
  const d = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
  const hl = nx * HALFWAY[0] + ny * HALFWAY[1] + nz * HALFWAY[2];
  return 0.38 + 0.8 * Math.max(0, d) + shine * Math.pow(Math.max(0, hl), 30);
}

function plot(s, u, v, color, k = 1) {
  if (u < 0 || v < 0 || u >= TEX || v >= TEX) return;
  s.pixels[u * TEX + v] = rgb(clampByte(color[0] * k), clampByte(color[1] * k), clampByte(color[2] * k));
}

/** A ball (ellipsoid) seen from the front. With glow, it's a light source: no shading. */
function ball(s, cx, cy, rx, ry, color, shine = 0.5, glow = false) {
  for (let v = Math.floor(cy - ry); v <= Math.ceil(cy + ry); v++) {
    for (let u = Math.floor(cx - rx); u <= Math.ceil(cx + rx); u++) {
      const nx = (u + 0.5 - cx) / rx, ny = (v + 0.5 - cy) / ry;
      const q = nx * nx + ny * ny;
      if (q > 1) continue;
      plot(s, u, v, color, glow ? 1.1 - 0.25 * q : lit(nx, ny, Math.sqrt(1 - q), shine));
    }
  }
}

/** A flat ellipse with a fixed brightness (lids, decals, light spots). */
function disk(s, cx, cy, rx, ry, color, k = 1) {
  for (let v = Math.floor(cy - ry); v <= Math.ceil(cy + ry); v++) {
    for (let u = Math.floor(cx - rx); u <= Math.ceil(cx + rx); u++) {
      const nx = (u + 0.5 - cx) / rx, ny = (v + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) plot(s, u, v, color, k);
    }
  }
}

/**
 * A rod of radius r from (x0, y0) to (x1, y1) with round ends. The normal is
 * the direction from the axis to the pixel, so the body is shaded like a
 * cylinder and the ends like balls.
 */
function rod(s, x0, y0, x1, y1, r, color, shine = 0.3) {
  const dx = x1 - x0, dy = y1 - y0, len2 = dx * dx + dy * dy;
  for (let v = Math.floor(Math.min(y0, y1) - r); v <= Math.ceil(Math.max(y0, y1) + r); v++) {
    for (let u = Math.floor(Math.min(x0, x1) - r); u <= Math.ceil(Math.max(x0, x1) + r); u++) {
      const px = u + 0.5 - x0, py = v + 0.5 - y0;
      const t = len2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / len2)) : 0;
      const ex = (px - t * dx) / r, ey = (py - t * dy) / r;
      const q = ex * ex + ey * ey;
      if (q > 1) continue;
      plot(s, u, v, color, lit(ex, ey, Math.sqrt(1 - q), shine));
    }
  }
}

/**
 * An upright cylinder from row y0 to y1. radius(t) and paint(nx, t) may vary
 * with the height t (0 at the top, 1 at the bottom) and with nx, the position
 * across the cylinder (-1 … +1). paint returns a colour.
 */
function cylinder(s, cx, y0, y1, radius, paint, shine = 0.3) {
  for (let v = y0; v < y1; v++) {
    const t = (v + 0.5 - y0) / (y1 - y0);
    const r = radius(t);
    for (let u = Math.floor(cx - r); u <= Math.ceil(cx + r); u++) {
      const nx = (u + 0.5 - cx) / r;
      if (nx * nx > 1) continue;
      plot(s, u, v, paint(nx, t), lit(nx, 0, Math.sqrt(1 - nx * nx), shine));
    }
  }
}

/** A box with bevelled edges, like the bricks. */
function block(s, x0, y0, x1, y1, color, edge = 1) {
  for (let v = y0; v < y1; v++) {
    for (let u = x0; u < x1; u++) plot(s, u, v, color, bevel(u - x0, v - y0, x1 - x0, y1 - y0, edge, 1.3, 0.6));
  }
}

/**
 * A leaf: a pointed ellipse from (x0, y0) along `angle`, with a darker vein.
 * Points along the leaf are at distance a from the base, b to the side.
 */
function leaf(s, x0, y0, angle, len, width, color) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let v = Math.floor(y0 - len - 1); v <= Math.ceil(y0 + len + 1); v++) {
    for (let u = Math.floor(x0 - len - 1); u <= Math.ceil(x0 + len + 1); u++) {
      const px = u + 0.5 - x0, py = v + 0.5 - y0;
      const a = px * ca + py * sa, b = -px * sa + py * ca;
      if (a < 0 || a > len) continue;
      const half = width * Math.sin(Math.PI * a / len);
      if (Math.abs(b) > half) continue;
      const k = Math.abs(b) < 0.6 ? 0.7 : (b < 0 ? 1.15 : 0.85) * (0.85 + 0.3 * a / len);
      plot(s, u, v, color, k);
    }
  }
}

/** Draws a dark 1-texel outline around the shape, then records left/right. */
function finishSprite(s, outlineColor = [18, 18, 22]) {
  const px = s.pixels, out = rgb(...outlineColor);
  const edge = [];
  for (let u = 0; u < TEX; u++) {
    for (let v = 0; v < TEX; v++) {
      if (px[u * TEX + v]) continue;
      if ((u > 0 && px[(u - 1) * TEX + v] && px[(u - 1) * TEX + v] !== out) ||
          (u < TEX - 1 && px[(u + 1) * TEX + v] && px[(u + 1) * TEX + v] !== out) ||
          (v > 0 && px[u * TEX + v - 1] && px[u * TEX + v - 1] !== out) ||
          (v < TEX - 1 && px[u * TEX + v + 1] && px[u * TEX + v + 1] !== out)) edge.push(u * TEX + v);
    }
  }
  for (const i of edge) px[i] = out;
  s.left = TEX; s.right = -1;
  for (let u = 0; u < TEX; u++) {
    for (let v = 0; v < TEX; v++) {
      if (px[u * TEX + v]) { s.left = Math.min(s.left, u); s.right = u; break; }
    }
  }
  return s;
}

// ------------------------------------------------------------- static objects
// Every sprite is drawn as if it stood on the floor of a 64 × 64 cell, seen
// from the front: row 63 is the floor, row 0 the ceiling.

function makeBarrel() {
  const s = createSprite();
  const wood = [148, 94, 50], hoop = [72, 74, 82];
  const radius = (t) => 13 + 2.5 * Math.sin(t * Math.PI);          // barrels bulge
  cylinder(s, 32, 30, 63, radius, (nx, t) => {
    if (Math.abs(t - 0.18) < 0.05 || Math.abs(t - 0.82) < 0.05) return hoop;
    const stave = (Math.asin(nx) / (Math.PI / 7)) % 1;                // 7 staves across the front
    return Math.abs(stave) < 0.12 ? [110, 68, 36] : wood;
  }, 0.15);
  disk(s, 32, 31, 13, 3.5, [92, 58, 32]);                            // the lid, seen slightly from above
  disk(s, 32, 31, 11, 2.5, [122, 78, 42]);
  return finishSprite(s);
}

function makeLamp() {
  const s = createSprite();
  rod(s, 32, 0, 32, 8, 1, [80, 80, 86]);                             // hangs from the ceiling
  cylinder(s, 32, 7, 17, (t) => 4 + 10 * t, () => [44, 112, 72], 0.6);  // a cone-shaped shade
  disk(s, 32, 17, 14, 2.5, [255, 214, 130]);                         // the lit inside of the shade
  ball(s, 32, 19, 4.5, 3.5, [255, 244, 190], 0, true);               // the bulb
  return finishSprite(s);
}

function makePillar() {
  const s = createSprite();
  const stone = [152, 146, 132];
  block(s, 18, 0, 46, 7, stone, 2);                                  // capital
  cylinder(s, 32, 7, 56, () => 10, (nx) => {
    const flute = Math.cos(Math.asin(nx) * 8);                       // vertical grooves
    return flute > 0.6 ? [120, 115, 104] : stone;
  }, 0.2);
  block(s, 16, 56, 48, 64, stone, 2);                                // base
  return finishSprite(s);
}

function makePlant() {
  const s = createSprite();
  const rnd = makeRng(7);
  // Leaves first (back ones darker), then the pot in front of their stems.
  for (let i = 0; i < 11; i++) {
    const a = -Math.PI / 2 + (rnd() - 0.5) * 2.2;
    const g = 0.65 + 0.45 * (i / 10);
    leaf(s, 32 + (rnd() - 0.5) * 4, 46, a, 14 + rnd() * 9, 2.5 + rnd() * 1.5, [60 * g, 140 * g, 58 * g]);
  }
  cylinder(s, 32, 47, 63, (t) => 9 - 2 * t, () => [172, 92, 56], 0.2);
  cylinder(s, 32, 44, 48, () => 10.5, () => [186, 104, 64], 0.3);   // the rim
  return finishSprite(s);
}

// ------------------------------------------------------------- the robot
/*
 * The robot is a list of parts in its own 3D coordinates: X to its right,
 * Z to its front, Y = sprite row (down). Seen by a viewer at angle θ from its
 * front (θ = 90° means the viewer is on the robot's right), a part lands at
 *
 *   column = 32 − X·cos θ + Z·sin θ      depth (towards the viewer) = X·sin θ + Z·cos θ
 *
 * which is the rotation matrix from step 2 again. Parts are drawn far to near,
 * so nearer parts cover farther ones: the same painter's algorithm the
 * renderer uses for whole sprites.
 */

const ROBOT_BODY = [98, 114, 132];
const ROBOT_DARK = [54, 58, 68];
const ROBOT_ACCENT = [222, 164, 40];
const ROBOT_EYE = [255, 64, 40];

/**
 * pose.walk: walking phase in radians (legs and arms swing), or undefined to
 * stand still.
 */
function robotParts(pose = {}) {
  const swing = pose.walk === undefined ? 0 : Math.sin(pose.walk);
  const lift = pose.walk === undefined ? 0 : Math.max(0, Math.cos(pose.walk)) * 2;
  const parts = [];
  const addBall = (X, Y, Z, rx, ry, color, extra = {}) => parts.push({ type: 'ball', p: [X, Y, Z], rx, ry, color, ...extra });
  const addRod = (a, b, r, color) => parts.push({ type: 'rod', a, b, r, color });
  const addDecal = (X, Y, Z, rx, ry, color, glow) => parts.push({ type: 'decal', p: [X, Y, Z], rx, ry, color, glow });

  // Legs: each from the hip to the foot, swinging forward and back.
  for (const side of [-1, 1]) {
    const z = 4 * swing * side;
    const footY = 60 - (side > 0 ? lift : 2 - lift);
    addRod([7 * side, 46, 0], [7 * side, footY - 2, z], 3.2, ROBOT_DARK);
    addBall(7 * side, footY, z + 2, 4.5, 2.6, ROBOT_DARK);
  }
  addBall(0, 45, 0, 8, 4, ROBOT_DARK);                       // hips
  addBall(0, 31, -11, 8, 9, ROBOT_DARK);                     // backpack: shows from behind
  addRod([4, 18, -10], [6, 4, -12], 0.8, [150, 150, 160]);   // antenna on the backpack
  addBall(6, 4, -12, 1.6, 1.6, ROBOT_EYE, { glow: true });
  addBall(0, 33, 0, 13, 12, ROBOT_BODY, { shine: 0.8 });     // torso
  addDecal(0, 37, 13, 7, 3, ROBOT_ACCENT);                   // a stripe on the chest
  addBall(0, 17, 0, 9, 8, ROBOT_BODY, { shine: 0.8 });       // head
  addDecal(0, 17, 9, 5, 2.4, ROBOT_EYE, true);               // the eye visor faces forward

  // Arms swing opposite to the legs. The right hand holds a gun pointing forward.
  for (const side of [-1, 1]) {
    const z = -4 * swing * side + 3;
    const hand = [15 * side, 41, z];
    addBall(14 * side, 27, 0, 4.5, 4.5, ROBOT_DARK);
    addRod([14 * side, 27, 0], hand, 2.6, ROBOT_BODY);
    if (side > 0) addRod(hand, [15, 40, z + 11], 2.2, [40, 40, 46]);
    addBall(hand[0], hand[1], hand[2], 3, 3, ROBOT_DARK);
  }
  return parts;
}

/** Projects the parts for a viewer at angle theta, sorts them far to near, and rasterizes them. */
function drawParts(parts, theta) {
  const c = Math.cos(theta), sn = Math.sin(theta);
  const col = (P) => 32 - P[0] * c + P[2] * sn;
  const depth = (P) => P[0] * sn + P[2] * c;
  const sorted = parts.map((part, i) => {
    const d = part.type === 'rod' ? (depth(part.a) + depth(part.b)) / 2 : depth(part.p);
    return { part, d: d + i * 1e-3 };                     // ties: keep list order
  }).sort((a, b) => a.d - b.d);

  const s = createSprite();
  for (const { part } of sorted) {
    if (part.type === 'ball') {
      ball(s, col(part.p), part.p[1], part.rx, part.ry, part.color, part.shine ?? 0.4, part.glow);
    } else if (part.type === 'rod') {
      rod(s, col(part.a), part.a[1], col(part.b), part.b[1], part.r, part.color);
    } else {
      // A decal is flat and faces the robot's front: it narrows as it turns
      // away (by cos of the angle) and is hidden once it faces backwards.
      const facing = c;
      if (facing > 0.15) disk(s, col(part.p), part.p[1], part.rx * facing, part.ry, part.color, part.glow ? 1.1 : 1);
    }
  }
  return finishSprite(s);
}

const SPRITES = {
  barrel: makeBarrel(),
  lamp: makeLamp(),
  pillar: makePillar(),
  plant: makePlant(),
};

// ROBOT.stand[k] is the robot seen from angle k · 45° (0 = from the front).
// ROBOT.walk[f][k] is walking frame f (of 4) from the same 8 directions.
const ROBOT = { stand: [], walk: [[], [], [], []] };
for (let k = 0; k < 8; k++) {
  const theta = k * Math.PI / 4;
  ROBOT.stand.push(drawParts(robotParts(), theta));
  for (let f = 0; f < 4; f++) ROBOT.walk[f].push(drawParts(robotParts({ walk: f * Math.PI / 2 }), theta));
}
