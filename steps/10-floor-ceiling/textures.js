'use strict';
/*
 * Procedural textures. No image files: every texel is computed at startup.
 *
 * Textures are TEX × TEX pixels and stored COLUMN-MAJOR (texel (u, v) lives at
 * index u * TEX + v), because the renderer reads them one vertical column at a
 * time. Needs rgb() from raycaster.js.
 */

const TEX = 64;

/** Tiny deterministic random generator, so textures look the same on every load. */
function makeRng(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Light/dark bevel for a pixel at (ix, iy) inside a rectangle of size (iw, ih).
 * Light comes from the top-left, so the top and left edges are raised (bright)
 * and the bottom and right edges are in shadow. Returns a brightness factor.
 */
function bevel(ix, iy, iw, ih, size, light, dark) {
  const dTop = iy, dLeft = ix, dBottom = ih - 1 - iy, dRight = iw - 1 - ix;
  const m = Math.min(dTop, dLeft, dBottom, dRight);
  if (m >= size) return 1;
  // Whichever edge is nearest decides; ties go to the lit edges (mitred corners).
  return (dTop === m || dLeft === m) ? light : dark;
}

/**
 * Bricks: 4 rows of 16-texel-tall bricks, 2 bricks per row, every other row
 * shifted by half a brick. Each brick gets a random tint, an embossed 2-texel
 * border and a little per-texel noise. The mortar between them is `mortar`.
 */
function makeBrickTexture(base, mortar, seed) {
  const rnd = makeRng(seed);
  const pixels = new Uint32Array(TEX * TEX);
  const BW = 32, BH = 16, M = 2;            // brick width, height, mortar thickness
  const tint = [];
  for (let i = 0; i < 16; i++) tint.push(0.82 + rnd() * 0.3);

  for (let v = 0; v < TEX; v++) {
    const row = (v / BH) | 0;
    const shift = (row & 1) ? BW / 2 : 0;
    for (let u = 0; u < TEX; u++) {
      const su = (u + shift) % TEX;         // wrap so the texture tiles seamlessly
      const bx = su % BW, by = v % BH;      // position inside this brick's cell
      const brick = row * 2 + ((su / BW) | 0);
      let r, g, b;
      if (bx < M || by < M) {
        const n = 0.85 + rnd() * 0.3;       // mortar, slightly noisy
        r = mortar[0] * n; g = mortar[1] * n; b = mortar[2] * n;
      } else {
        const k = tint[brick] * bevel(bx - M, by - M, BW - M, BH - M, 2, 1.45, 0.55) * (0.9 + rnd() * 0.2);
        r = base[0] * k; g = base[1] * k; b = base[2] * k;
      }
      pixels[u * TEX + v] = rgb(clampByte(r), clampByte(g), clampByte(b));
    }
  }
  return pixels;
}

/**
 * Floor/ceiling tile: one tile per map cell, with a dark grout border and the
 * same embossed edge as the bricks, so the grid of cells is visible on the floor.
 */
function makeTileTexture(base, grout, seed) {
  const rnd = makeRng(seed);
  const pixels = new Uint32Array(TEX * TEX);
  const G = 2;                                // grout on each side: 4 texels between tiles
  for (let v = 0; v < TEX; v++) {
    for (let u = 0; u < TEX; u++) {
      let r, g, b;
      if (u < G || v < G || u >= TEX - G || v >= TEX - G) {
        const n = 0.85 + rnd() * 0.3;
        r = grout[0] * n; g = grout[1] * n; b = grout[2] * n;
      } else {
        const k = bevel(u - G, v - G, TEX - 2 * G, TEX - 2 * G, 3, 1.3, 0.65) * (0.92 + rnd() * 0.16);
        r = base[0] * k; g = base[1] * k; b = base[2] * k;
      }
      pixels[u * TEX + v] = rgb(clampByte(r), clampByte(g), clampByte(b));
    }
  }
  return pixels;
}

const FLOOR_TEXTURE = makeTileTexture([104, 98, 88], [44, 42, 38], 10);
const CEILING_TEXTURE = makeTileTexture([72, 72, 80], [34, 34, 40], 11);

// Index = map cell value. 1: grey stone, 2: red brick, 3: blue stone (a Wolf3D classic).
const WALL_TEXTURES = [
  null,
  makeBrickTexture([128, 128, 136], [58, 58, 62], 1),
  makeBrickTexture([156, 64, 46], [96, 90, 82], 2),
  makeBrickTexture([56, 84, 160], [28, 36, 66], 3),
];
