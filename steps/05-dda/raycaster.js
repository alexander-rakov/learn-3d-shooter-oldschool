'use strict';
/*
 * The engine, step 5: map + DDA ray casting.
 * From here on this file grows step by step; diff it against the previous
 * step's copy to see exactly what was added.
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

/** Cell value at integer coordinates; outside the map counts as solid wall. */
function mapCell(map, x, y) {
  if (x < 0 || y < 0 || x >= map.w || y >= map.h) return 1;
  return map.cells[y * map.w + x];
}

const MAX_STEPS = 128;   // safety net: no ray visits more cells than this

/**
 * Casts a ray from (posX, posY) along (rayDirX, rayDirY) through the grid.
 *
 * Returns:
 *   t     - ray parameter at the hit: the hit point is pos + t * rayDir
 *   mapX, mapY - the wall cell that was hit
 *   side  - 0 if we crossed a vertical grid line (x = integer) to get there,
 *           1 if a horizontal one (y = integer)
 *   cell  - the map value of the hit cell (wall type)
 *
 * If `trace` is an array, every step is recorded in it (for the diagrams).
 */
function castRay(map, posX, posY, rayDirX, rayDirY, trace) {
  // The cell we start in.
  let mapX = Math.floor(posX);
  let mapY = Math.floor(posY);

  // How much t grows between two consecutive vertical (resp. horizontal) grid lines.
  // A zero component means the ray never crosses those lines: use a huge number.
  const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
  const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);

  // Which way we step through the grid, and the t of the FIRST crossing on each axis.
  let stepX, stepY, sideDistX, sideDistY;
  if (rayDirX < 0) { stepX = -1; sideDistX = (posX - mapX) * deltaDistX; }
  else             { stepX =  1; sideDistX = (mapX + 1 - posX) * deltaDistX; }
  if (rayDirY < 0) { stepY = -1; sideDistY = (posY - mapY) * deltaDistY; }
  else             { stepY =  1; sideDistY = (mapY + 1 - posY) * deltaDistY; }

  if (trace) trace.push({ t: 0, side: -1, mapX, mapY, sideDistX, sideDistY, deltaDistX, deltaDistY, cell: 0 });

  let t = 0, side = 0, cell = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    // Whichever grid line comes first along the ray is the next one we cross.
    if (sideDistX < sideDistY) {
      t = sideDistX;            // we are now exactly on a vertical grid line
      sideDistX += deltaDistX;  // the next vertical line is one deltaDistX further
      mapX += stepX;
      side = 0;
    } else {
      t = sideDistY;
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    cell = mapCell(map, mapX, mapY);
    if (trace) trace.push({ t, side, mapX, mapY, sideDistX, sideDistY, deltaDistX, deltaDistY, cell });
    if (cell !== 0) break;
  }
  return { t, mapX, mapY, side, cell };
}
