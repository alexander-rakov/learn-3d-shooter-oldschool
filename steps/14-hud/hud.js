'use strict';
/*
 * Everything drawn flat onto the screen instead of into the world: text, the
 * status bar, the weapon, colour flashes, the automap and the end screens.
 * All of it is plain pixel writes into the framebuffer, like the 3D view.
 * Needs raycaster.js, textures.js and sprites.js (and a game from game.js).
 */

// ------------------------------------------------------------- a 5 × 7 pixel font
/*
 * Each glyph is 7 rows of 5 pixels. A row is a 5-bit number, bit 4 (0x10)
 * being the leftmost pixel, and the 7 rows are written as 7 pairs of hex
 * digits. For example '0' is 0e 11 13 15 19 11 0e:
 *
 *   0e .###.   11 #...#   13 #..##   15 #.#.#   19 ##..#   11 #...#   0e .###.
 */
const FONT = {
  '0': '0e11131519110e', '1': '040c040404040e', '2': '0e11010204081f', '3': '1f02040201110e',
  '4': '02060a121f0202', '5': '1f101e0101110e', '6': '0608101e11110e', '7': '1f010204080808',
  '8': '0e11110e11110e', '9': '0e11110f01020c',
  'A': '0e11111f111111', 'B': '1e11111e11111e', 'C': '0e11101010110e', 'D': '1c12111111121c',
  'E': '1f10101e10101f', 'F': '1f10101e101010', 'G': '0e11101711110f', 'H': '1111111f111111',
  'I': '0e04040404040e', 'J': '0702020202120c', 'K': '11121418141211', 'L': '1010101010101f',
  'M': '111b1515111111', 'N': '11111915131111', 'O': '0e11111111110e', 'P': '1e11111e101010',
  'Q': '0e11111115120d', 'R': '1e11111e141211', 'S': '0f10100e01011e', 'T': '1f040404040404',
  'U': '1111111111110e', 'V': '11111111110a04', 'W': '1111111515150a', 'X': '11110a040a1111',
  'Y': '1111110a040404', 'Z': '1f01020408101f',
  ' ': '00000000000000', '%': '18190204081303', '/': '00010204081000', ':': '000c0c000c0c00',
  '.': '00000000000c0c', '!': '04040404040004', '-': '0000001f000000', ',': '000000000c0408',
  '?': '0e110102040004', "'": '0c040800000000',
};

/** Writes one solid rectangle into a screen, clipped to its edges. */
function fillRect(screen, x, y, w, h, color) {
  const x0 = Math.max(0, Math.round(x)), x1 = Math.min(screen.w, Math.round(x + w));
  const y0 = Math.max(0, Math.round(y)), y1 = Math.min(screen.h, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) screen.pixels.fill(color, yy * screen.w + x0, yy * screen.w + x1);
}

function textWidth(text, scale = 1) {
  return text.length * 6 * scale - scale;
}

/** Draws text with the pixel font: each set bit becomes a scale × scale block, with a dark drop shadow. */
function drawText(screen, text, x, y, color, scale = 1, shadow = true) {
  if (shadow) drawText(screen, text, x + scale, y + scale, rgb(0, 0, 0), scale, false);
  for (const ch of text.toUpperCase()) {
    const hex = FONT[ch] || FONT['?'];
    for (let row = 0; row < 7; row++) {
      const bits = parseInt(hex.substr(row * 2, 2), 16);
      for (let col = 0; col < 5; col++) {
        if (bits & (0x10 >> col)) fillRect(screen, x + col * scale, y + row * scale, scale, scale, color);
      }
    }
    x += 6 * scale;
  }
}

function drawTextCentered(screen, text, cx, y, color, scale = 1) {
  drawText(screen, text, Math.round(cx - textWidth(text, scale) / 2), y, color, scale);
}

// ------------------------------------------------------------- sprites on the screen

/**
 * Draws a sprite flat onto the screen at (x0, y0), `size` pixels square, by
 * stepping through its texels exactly like a sprite column in the world, but
 * with no camera transform and no depth test. Rows at or below maxY are left alone.
 */
function blitSprite(screen, img, x0, y0, size, maxY = screen.h) {
  const step = TEX / size;
  const xa = Math.max(0, Math.ceil(x0 - 0.5)), xb = Math.min(screen.w, Math.ceil(x0 + size - 0.5));
  const ya = Math.max(0, Math.ceil(y0 - 0.5)), yb = Math.min(maxY, Math.ceil(y0 + size - 0.5));
  for (let x = xa; x < xb; x++) {
    const col = ((x + 0.5 - x0) * step | 0) * TEX;
    for (let y = ya; y < yb; y++) {
      const c = img.pixels[col + ((y + 0.5 - y0) * step | 0)];
      if (c !== 0) screen.pixels[y * screen.w + x] = c;
    }
  }
}

const WEAPON_SIZE = 112;   // the 64 × 64 weapon picture, scaled to this many pixels

/** Which weapon picture to show: a few frames of muzzle flash and recoil after each shot. */
function weaponFrame(game) {
  const t = game.time - game.lastFired;
  return t < 0.06 ? WEAPON.fire[0] : t < 0.14 ? WEAPON.fire[1] : t < 0.22 ? WEAPON.fire[2] : WEAPON.idle;
}

/**
 * The weapon, bottom centre of the view. As you walk it sways: sideways with
 * cos of the bob phase and up with |sin|, so it swings along a small arc.
 */
function drawWeapon(view, game) {
  const bobX = Math.cos(game.bob) * 7;
  const bobY = Math.abs(Math.sin(game.bob)) * 6;
  blitSprite(view, weaponFrame(game), view.w / 2 - WEAPON_SIZE / 2 + bobX, view.h - WEAPON_SIZE + 6 + bobY, WEAPON_SIZE, view.h);
}

// ------------------------------------------------------------- flashes

/**
 * Blends every pixel towards colour (r, g, b) by a (0 … 1): per channel,
 * c + (target − c) · a. Getting hurt flashes red, picking things up gold.
 */
function tint(view, r, g, b, a) {
  const k = Math.round(Math.min(1, a) * 256), px = view.pixels;
  if (k <= 0) return;
  for (let i = 0; i < px.length; i++) {
    const c = px[i];
    const cr = c & 0xFF, cg = (c >>> 8) & 0xFF, cb = (c >>> 16) & 0xFF;
    px[i] = (0xFF000000 | ((cb + (((b - cb) * k) >> 8)) << 16) |
      ((cg + (((g - cg) * k) >> 8)) << 8) | (cr + (((r - cr) * k) >> 8))) >>> 0;
  }
}

// ------------------------------------------------------------- the status bar

const BAR_HEIGHT = 40;
const BAR = {
  bg: rgb(30, 36, 50), panel: rgb(20, 24, 34), light: rgb(86, 98, 128), dark: rgb(10, 12, 18),
  label: rgb(150, 162, 188), value: rgb(255, 204, 72), low: rgb(255, 80, 64),
};

/** A sunken panel: dark top and left edges, light bottom and right ones. */
function panel(screen, x, y, w, h) {
  fillRect(screen, x, y, w, h, BAR.panel);
  fillRect(screen, x, y, w, 1, BAR.dark);
  fillRect(screen, x, y, 1, h, BAR.dark);
  fillRect(screen, x, y + h - 1, w, 1, BAR.light);
  fillRect(screen, x + w - 1, y, 1, h, BAR.light);
}

/** The status bar along the bottom of the screen, from row `top` down. */
function drawStatusBar(screen, top, game) {
  fillRect(screen, 0, top, screen.w, BAR_HEIGHT, BAR.bg);
  fillRect(screen, 0, top, screen.w, 1, BAR.light);
  const lowHealth = game.health <= 25 && Math.floor(game.time * 4) % 2 === 0;
  const fields = [
    ['FLOOR', '1', 36],
    ['SCORE', String(game.score).padStart(6, '0'), 80],
    ['KILLS', `${game.kills}/${game.actors.length}`, 64],
    ['HEALTH', `${game.health}%`, 60, lowHealth ? BAR.low : BAR.value],
    ['AMMO', String(game.ammo), 44, game.ammo === 0 ? BAR.low : BAR.value],
    ['KEY', null, 36],
  ];
  let x = 0;
  for (const [name, value, w, color = BAR.value] of fields) {
    panel(screen, x + 2, top + 3, w - 4, BAR_HEIGHT - 6);
    drawTextCentered(screen, name, x + w / 2, top + 6, BAR.label);
    if (value !== null) drawTextCentered(screen, value, x + w / 2, top + 18, color, 2);
    else if (game.hasKey) blitSprite(screen, SPRITES.key, x + w / 2 - 24, top - 9, 48, top + BAR_HEIGHT - 4);
    x += w;
  }
}

// ------------------------------------------------------------- the automap

const AUTOMAP_COLORS = {
  floor: rgb(46, 50, 60), door: rgb(150, 170, 196), locked: rgb(220, 176, 60),
  walls: [null, rgb(130, 132, 140), rgb(160, 70, 52), rgb(64, 96, 176)], exit: rgb(230, 190, 40),
};

/**
 * The automap: every cell a ray has passed through (map.seen, which castRay
 * fills in as the frames are drawn) seen from above, centred in the view.
 * What you haven't seen stays black.
 */
function drawAutomap(view, game) {
  const { map, player: p } = game;
  const s = Math.floor(Math.min((view.w - 8) / map.w, (view.h - 16) / map.h));
  const ox = Math.floor((view.w - map.w * s) / 2), oy = Math.floor((view.h - map.h * s) / 2) + 4;
  view.pixels.fill(rgb(12, 14, 20));
  for (let y = 0; y < map.h; y++) {
    for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x;
      if (!map.seen[i]) continue;
      const cell = map.cells[i];
      const color = cell === 0 ? AUTOMAP_COLORS.floor
        : cell === DOOR ? (map.doors.get(i).locked ? AUTOMAP_COLORS.locked : AUTOMAP_COLORS.door)
        : cell === EXIT ? AUTOMAP_COLORS.exit
        : AUTOMAP_COLORS.walls[cell === PUSHWALL ? map.pushwall.texture : cell] || AUTOMAP_COLORS.walls[1];
      fillRect(view, ox + x * s, oy + y * s, s - (cell === 0 ? 0 : 1), s - (cell === 0 ? 0 : 1), color);
    }
  }
  // You: a dot, and a short line of dots in the direction you face.
  const px = ox + p.x * s, py = oy + p.y * s;
  for (let t = 0; t <= 2.2 * s; t += 1) fillRect(view, px + p.dirX * t, py + p.dirY * t, 1, 1, rgb(255, 120, 120));
  fillRect(view, px - 1.5, py - 1.5, 3, 3, rgb(255, 209, 102));
  drawText(view, 'MAP', 4, 3, rgb(255, 255, 255));
}

// ------------------------------------------------------------- messages and end screens

function drawMessage(view, game) {
  if (game.message && game.time - game.message.time < 2.5) drawText(view, game.message.text, 4, 4, rgb(255, 255, 255));
}

function formatTime(seconds) {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function percent(n, total) {
  return total ? Math.round(100 * n / total) : 100;
}

/** "Floor completed" with Wolfenstein-style ratios, or "destroyed". */
function drawEndScreen(view, game) {
  tint(view, 0, 0, 0, 0.65);
  const white = rgb(255, 255, 255), gold = rgb(255, 204, 72);
  if (game.state === 'dead') {
    drawTextCentered(view, 'YOU WERE DESTROYED', view.w / 2, 56, rgb(255, 90, 70), 2);
    drawTextCentered(view, 'PRESS R TO TRY AGAIN', view.w / 2, 90, white);
    return;
  }
  drawTextCentered(view, 'FLOOR COMPLETED', view.w / 2, 18, gold, 2);
  const rows = [
    ['KILLS', `${percent(game.kills, game.actors.length)}%`],
    ['SECRETS', `${percent(game.secretsFound, game.secretsTotal)}%`],
    ['TREASURE', `${percent(game.treasureFound, game.treasureTotal)}%`],
    ['TIME', formatTime(game.playTime)],
    ['SCORE', String(game.score)],
  ];
  rows.forEach(([name, value], i) => {
    drawText(view, name, 92, 48 + i * 16, white, 1);
    drawText(view, value, 228 - textWidth(value, 1), 48 + i * 16, gold, 1);
  });
  drawTextCentered(view, 'PRESS R TO PLAY AGAIN', view.w / 2, 140, white);
}
