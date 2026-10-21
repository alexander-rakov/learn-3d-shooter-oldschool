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

/** Fills a polygon (a list of [x, y] corners) with a fixed brightness k, for flat facets. */
function polygon(s, pts, color, k = 1) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  for (let v = Math.floor(Math.min(...ys)); v <= Math.ceil(Math.max(...ys)); v++) {
    for (let u = Math.floor(Math.min(...xs)); u <= Math.ceil(Math.max(...xs)); u++) {
      // Even-odd rule: a point is inside if a line from it crosses the edges an odd number of times.
      const px = u + 0.5, py = v + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) plot(s, u, v, color, k);
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

// ------------------------------------------------------------- pickups
// Small things on the floor: drawn low in the picture, like the barrel.

/** A box seen from slightly above: the front face, and a lighter top. */
function crate(s, x0, y0, x1, y1, depth, color) {
  polygon(s, [[x0, y0], [x1, y0], [x1 - depth, y0 - depth], [x0 + depth, y0 - depth]], color, 1.25);
  block(s, x0, y0, x1, y1, color);
}

function makeMedkit() {
  const s = createSprite();
  rod(s, 28, 41, 36, 41, 1.2, [60, 60, 66]);                         // handle
  crate(s, 18, 48, 46, 63, 5, [222, 222, 214]);
  block(s, 29, 50, 35, 62, [200, 32, 30]);                          // red cross
  block(s, 23, 53, 41, 59, [200, 32, 30]);
  return finishSprite(s);
}

function makeAmmoBox() {
  const s = createSprite();
  polygon(s, [[20, 51], [44, 51], [41, 46], [23, 46]], [36, 40, 26]);   // the open top, dark inside
  for (let i = 0; i < 4; i++) {                                       // cartridges standing in it
    const x = 25.5 + i * 4.3;
    rod(s, x, 49, x, 40, 1.6, [206, 164, 64]);
    ball(s, x, 39, 1.6, 1.8, [196, 112, 64]);
  }
  block(s, 20, 50, 44, 63, [92, 102, 56]);
  block(s, 27, 54, 37, 59, [180, 170, 120]);                         // a label
  return finishSprite(s);
}

function makeClip() {
  const s = createSprite();
  ball(s, 27, 56, 2.2, 1.6, [206, 164, 64]);                         // a bullet peeking out
  crate(s, 24, 57, 40, 63, 2, [74, 78, 86]);
  return finishSprite(s);
}

function makeCoins() {
  const s = createSprite();
  const gold = [232, 182, 52];
  for (const [cx, n] of [[38, 4], [26, 6]]) {
    for (let i = 0; i < n; i++) {
      const y = 60 - i * 2.6;
      disk(s, cx, y + 1.2, 8, 3, gold, 0.65);                         // the coin's edge
      disk(s, cx, y, 8, 3, gold, 1.1 + (i === n - 1 ? 0.15 : 0));     // its face
    }
  }
  return finishSprite(s);
}

function makeGem() {
  const s = createSprite();
  const c = [70, 206, 228];
  // A cut gem from the side: three crown facets over three pavilion facets.
  polygon(s, [[20, 48], [26, 42], [32, 42], [29, 48]], c, 1.35);
  polygon(s, [[29, 48], [32, 42], [38, 42], [36, 48]], c, 1.05);
  polygon(s, [[36, 48], [38, 42], [44, 48]], c, 0.8);
  polygon(s, [[20, 48], [29, 48], [32, 63]], c, 1.15);
  polygon(s, [[29, 48], [36, 48], [32, 63]], c, 0.85);
  polygon(s, [[36, 48], [44, 48], [32, 63]], c, 0.6);
  disk(s, 27, 44, 1.2, 1.2, [255, 255, 255], 1);                     // a sparkle
  return finishSprite(s);
}

function makeKey() {
  const s = createSprite();
  const gold = [236, 190, 60];
  ball(s, 32, 40, 6.5, 6.5, gold, 0.8);                              // the bow (the ring)…
  for (let v = 36; v <= 44; v++) {
    for (let u = 28; u <= 36; u++) {
      if ((u + 0.5 - 32) ** 2 + (v + 0.5 - 40) ** 2 < 7) s.pixels[u * TEX + v] = 0;   // …with a hole
    }
  }
  rod(s, 32, 47, 32, 62, 1.6, gold, 0.8);                            // the shaft
  block(s, 33, 54, 38, 57, gold);                                    // the teeth
  block(s, 33, 59, 37, 62, gold);
  return finishSprite(s);
}

// ------------------------------------------------------------- the weapon
// Not in the world: drawn straight onto the screen, bottom centre, at a fixed
// scale. We see the gun from behind and above: the top of the slide narrows
// towards the muzzle, which is what makes it read as pointing away.

function makeWeapon(recoil, flash) {
  const s = createSprite();
  const metal = [88, 94, 110];
  const y = (v) => v + recoil;                 // recoil pushes the whole gun down
  if (flash) {
    ball(s, 32, y(22), 14, 11, [255, 168, 56], 0, true);
    ball(s, 32, y(23), 7, 5, [255, 250, 214], 0, true);
  }
  polygon(s, [[20, y(64)], [25, y(30)], [23, y(31)], [14, y(64)]], metal, 0.8);   // left side
  polygon(s, [[44, y(64)], [39, y(30)], [41, y(31)], [50, y(64)]], metal, 0.5);   // right side
  polygon(s, [[25, y(30)], [39, y(30)], [44, y(64)], [20, y(64)]], metal, 1.1);   // top of the slide
  polygon(s, [[31, y(30)], [33, y(30)], [34, y(64)], [30, y(64)]], metal, 1.45);  // a ridge along it
  polygon(s, [[17, y(62)], [22, y(40)], [23.5, y(40)], [19.5, y(62)]], [80, 220, 240], 1.2);  // energy cell
  disk(s, 32, y(30), 5.5, 2.6, [40, 42, 50]);  // the muzzle…
  disk(s, 32, y(30), 2.6, 1.2, [8, 8, 10]);    // …and its bore
  block(s, 31, y(24), 34, y(29), [44, 46, 54]);                                   // front sight
  block(s, 25, y(54), 29, y(60), [40, 42, 50]);                                   // rear sight
  block(s, 35, y(54), 39, y(60), [40, 42, 50]);
  ball(s, 47, 62, 11, 8, [118, 82, 50], 0.2);                                     // a gloved hand,
  rod(s, 17, 64, 21, 53, 3, [128, 90, 56]);                                       // its thumb on the side
  return finishSprite(s);
}

const WEAPON = {
  idle: makeWeapon(0, false),
  fire: [makeWeapon(4, true), makeWeapon(6, false), makeWeapon(3, false)],   // shown one after another
};

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
 * pose.walk: walking phase in radians (legs and arms swing), or undefined
 * pose.aim: gun raised and pointed at the viewer; pose.flash: firing
 * pose.pain: lit up white by a hit; pose.dim: the eye has gone out
 */
function robotParts(pose = {}) {
  const swing = pose.walk === undefined ? 0 : Math.sin(pose.walk);
  const lift = pose.walk === undefined ? 0 : Math.max(0, Math.cos(pose.walk)) * 2;
  const body = pose.pain ? [190, 198, 214] : ROBOT_BODY;
  const eye = pose.pain ? [255, 255, 255] : pose.dim ? [90, 30, 26] : ROBOT_EYE;
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
  addBall(6, 4, -12, 1.6, 1.6, eye, { glow: !pose.dim });
  addBall(0, 33, 0, 13, 12, body, { shine: 0.8 });           // torso
  addDecal(0, 37, 13, 7, 3, ROBOT_ACCENT);                   // a stripe on the chest
  addBall(0, 17, 0, 9, 8, body, { shine: 0.8 });             // head
  addDecal(0, 17, 9, 5, 2.4, eye, !pose.dim);                // the eye visor faces forward

  if (pose.aim) {
    // Both hands forward, the gun pointing straight at the viewer: we see down its barrel.
    addBall(14, 27, 0, 4.5, 4.5, ROBOT_DARK);
    addBall(-14, 27, 0, 4.5, 4.5, ROBOT_DARK);
    addRod([14, 27, 0], [9, 31, 12], 2.6, body);
    addRod([-14, 27, 0], [-4, 33, 12], 2.6, body);
    addBall(-4, 33, 12, 3, 3, ROBOT_DARK);
    addRod([9, 31, 12], [9, 30, 22], 2.4, [40, 40, 46]);
    addBall(9, 30, 22.5, 2.6, 2.6, [40, 40, 46]);
    addBall(9, 30, 23, 1.3, 1.3, [8, 8, 10], { shine: 0 }); // the muzzle
    if (pose.flash) {
      addBall(9, 30, 24, 7, 6, [255, 196, 70], { glow: true });
      addBall(9, 30, 25, 3.5, 3, [255, 252, 220], { glow: true });
    }
    return parts;
  }

  // Arms swing opposite to the legs. The right hand holds a gun pointing forward.
  for (const side of [-1, 1]) {
    const z = -4 * swing * side + 3;
    const hand = [15 * side, 41, z];
    addBall(14 * side, 27, 0, 4.5, 4.5, ROBOT_DARK);
    addRod([14 * side, 27, 0], hand, 2.6, body);
    if (side > 0) addRod(hand, [15, 40, z + 11], 2.2, [40, 40, 46]);
    addBall(hand[0], hand[1], hand[2], 3, 3, ROBOT_DARK);
  }
  return parts;
}

/**
 * Projects the parts for a viewer at angle theta, sorts them far to near, and
 * rasterizes them.
 *
 * For the death frames the projected picture can also be squashed towards
 * the floor (squash = 1 leaves it alone, 0.5 halves its height) and tipped
 * over by `tilt` radians around the feet, with `sparks` bright dots on top.
 */
function drawParts(parts, theta, fx = {}) {
  const c = Math.cos(theta), sn = Math.sin(theta);
  const squash = fx.squash ?? 1, tilt = fx.tilt ?? 0;
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // Screen position of a 3D point: rotate for the viewer, then squash and tip over.
  const project = (P) => {
    const dx = -P[0] * c + P[2] * sn, dy = (P[1] - 62) * squash;
    return [32 + dx * ct - dy * st, 62 + dx * st + dy * ct];
  };
  const depth = (P) => P[0] * sn + P[2] * c;
  const sorted = parts.map((part, i) => {
    const d = part.type === 'rod' ? (depth(part.a) + depth(part.b)) / 2 : depth(part.p);
    return { part, d: d + i * 1e-3 };                     // ties: keep list order
  }).sort((a, b) => a.d - b.d);

  const s = createSprite();
  for (const { part } of sorted) {
    if (part.type === 'ball') {
      const [x, y] = project(part.p);
      ball(s, x, y, part.rx, part.ry * Math.max(squash, 0.6), part.color, part.shine ?? 0.4, part.glow);
    } else if (part.type === 'rod') {
      const [x0, y0] = project(part.a), [x1, y1] = project(part.b);
      rod(s, x0, y0, x1, y1, part.r, part.color);
    } else {
      // A decal is flat and faces the robot's front: it narrows as it turns
      // away (by cos of the angle) and is hidden once it faces backwards.
      const [x, y] = project(part.p);
      if (c > 0.15) disk(s, x, y, part.rx * c, part.ry * squash, part.color, part.glow ? 1.1 : 1);
    }
  }
  const rnd = makeRng(99);
  for (let i = 0; i < (fx.sparks || 0); i++) {
    const x = 32 + (rnd() - 0.5) * 34, y = 62 - (20 + rnd() * 30) * squash;
    ball(s, x, y, 1.6, 1.6, rnd() < 0.5 ? [255, 236, 140] : [255, 150, 60], 0, true);
  }
  return finishSprite(s);
}

/** What's left: a heap of parts on the floor. */
function makeRobotWreck() {
  const s = createSprite();
  rod(s, 10, 60, 22, 57, 3.2, ROBOT_DARK);                   // legs
  rod(s, 40, 61, 53, 59, 3.2, ROBOT_DARK);
  ball(s, 31, 54, 14, 8, ROBOT_BODY, 0.8);                   // the torso, on its back
  disk(s, 31, 51, 6, 2, ROBOT_ACCENT);
  rod(s, 18, 50, 9, 58, 2.6, ROBOT_BODY);                    // an arm
  rod(s, 44, 56, 56, 52, 2.2, [40, 40, 46]);                 // the gun
  ball(s, 49, 54, 8, 7, ROBOT_BODY, 0.8);                    // the head, rolled aside
  disk(s, 52, 54, 2, 4, [90, 30, 26]);                       // its eye, out
  ball(s, 22, 61, 2, 1.5, [150, 150, 160]);                  // loose bolts
  ball(s, 37, 62, 1.5, 1.2, [150, 150, 160]);
  return finishSprite(s);
}

const SPRITES = {
  barrel: makeBarrel(),
  lamp: makeLamp(),
  pillar: makePillar(),
  plant: makePlant(),
  medkit: makeMedkit(),
  ammo: makeAmmoBox(),
  clip: makeClip(),
  coins: makeCoins(),
  gem: makeGem(),
  key: makeKey(),
};

// ROBOT.stand[k] is the robot seen from angle k · 45° (0 = from the front).
// ROBOT.walk[f][k] is walking frame f (of 4) from the same 8 directions.
// The others are seen only from the front: a robot shooting at you, getting
// hit or falling apart always turns to face you, so they need just one picture.
const ROBOT = {
  stand: [], walk: [[], [], [], []],
  aim: drawParts(robotParts({ aim: true }), 0),
  shoot: drawParts(robotParts({ aim: true, flash: true }), 0),
  pain: drawParts(robotParts({ pain: true }), 0, { tilt: -0.1 }),
  die1: drawParts(robotParts({ pain: true }), 0, { tilt: 0.2, sparks: 6 }),
  die2: drawParts(robotParts({ dim: true }), 0, { squash: 0.7, tilt: 0.45, sparks: 4 }),
  die3: drawParts(robotParts({ dim: true }), 0, { squash: 0.45, tilt: 0.7, sparks: 2 }),
  dead: makeRobotWreck(),
};
for (let k = 0; k < 8; k++) {
  const theta = k * Math.PI / 4;
  ROBOT.stand.push(drawParts(robotParts(), theta));
  for (let f = 0; f < 4; f++) ROBOT.walk[f].push(drawParts(robotParts({ walk: f * Math.PI / 2 }), theta));
}
