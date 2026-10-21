'use strict';
/*
 * 256 colours and a COLORMAP, step 19.
 *
 * Doom draws in VGA mode 13h: every pixel is one byte, an index into a
 * palette of 256 colours. Textures are stored as indices too. Lighting is a
 * table, the COLORMAP: 32 rows, from full brightness (0) to black (31), each
 * mapping every palette index to the index of the palette colour that best
 * matches that colour, darkened. Lighting a texel is one lookup:
 *   pixel = COLORMAP[level * 256 + texel]
 *
 * Doom's palette (PLAYPAL) was drawn by hand. Ours is computed from the
 * textures by median cut, with darkened copies of every texel thrown in so
 * there are dark shades for the COLORMAP to land on. Needs rgb() from
 * renderer.js.
 */

const LIGHT_LEVELS = 32;

/**
 * Median cut: start with every sample colour in one box; repeatedly take the
 * box with the widest spread in red, green or blue, sort it along that
 * channel and cut it in half at the median. Each final box's average colour
 * is a palette entry. Entry 0 is kept for pure black.
 */
function buildPalette(textures, size = 256) {
  const samples = [];
  for (const tex of textures) {
    for (let i = 0; i < tex.length; i += 3) {
      const c = tex[i], r = c & 0xFF, g = (c >>> 8) & 0xFF, b = (c >>> 16) & 0xFF;
      for (const k of [1, 0.62, 0.36, 0.18, 0.08]) samples.push([r * k, g * k, b * k]);
    }
  }
  const makeBox = (items) => {
    let widest = -1, channel = 0;
    for (let ch = 0; ch < 3; ch++) {
      let lo = Infinity, hi = -Infinity;
      for (const s of items) { if (s[ch] < lo) lo = s[ch]; if (s[ch] > hi) hi = s[ch]; }
      if (hi - lo > widest) { widest = hi - lo; channel = ch; }
    }
    return { items, widest, channel };
  };
  const boxes = [makeBox(samples)];
  while (boxes.length < size - 1) {
    let bi = 0;
    for (let i = 1; i < boxes.length; i++) if (boxes[i].widest > boxes[bi].widest) bi = i;
    const box = boxes[bi];
    if (box.widest <= 0 || box.items.length < 2) break;
    box.items.sort((a, b) => a[box.channel] - b[box.channel]);
    const mid = box.items.length >> 1;
    boxes.splice(bi, 1, makeBox(box.items.slice(0, mid)), makeBox(box.items.slice(mid)));
  }
  const palette = new Uint32Array(size).fill(rgb(0, 0, 0));
  boxes.forEach((box, i) => {
    let r = 0, g = 0, b = 0;
    for (const s of box.items) { r += s[0]; g += s[1]; b += s[2]; }
    const n = box.items.length;
    palette[i + 1] = rgb(Math.round(r / n), Math.round(g / n), Math.round(b / n));
  });
  return palette;
}

/** The index of the palette colour closest to (r, g, b). */
function nearestColor(palette, r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const dr = (c & 0xFF) - r, dg = ((c >>> 8) & 0xFF) - g, db = ((c >>> 16) & 0xFF) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/** A true-colour texture (Uint32Array) → palette indices (Uint8Array). */
function toIndexed(tex, palette) {
  const out = new Uint8Array(tex.length);
  const cache = new Map();
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i];
    let idx = cache.get(c);
    if (idx === undefined) {
      idx = nearestColor(palette, c & 0xFF, (c >>> 8) & 0xFF, (c >>> 16) & 0xFF);
      cache.set(c, idx);
    }
    out[i] = idx;
  }
  return out;
}

/**
 * The COLORMAP: row L darkens every palette colour by (1 − L/32) and finds
 * the nearest palette entry. Row 0 is the palette itself; row 31 is nearly
 * black. Dark rows run out of distinct shades, so colours merge and shift a
 * little: the "muddy" look of Doom's dark rooms.
 */
function buildColormap(palette) {
  const map = new Uint8Array(LIGHT_LEVELS * 256);
  for (let level = 0; level < LIGHT_LEVELS; level++) {
    const k = 1 - level / LIGHT_LEVELS;
    for (let i = 0; i < 256; i++) {
      const c = palette[i];
      map[level * 256 + i] = nearestColor(palette, (c & 0xFF) * k, ((c >>> 8) & 0xFF) * k, ((c >>> 16) & 0xFF) * k);
    }
  }
  return map;
}
