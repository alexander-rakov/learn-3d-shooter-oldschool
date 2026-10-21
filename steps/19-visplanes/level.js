'use strict';
/*
 * Levels as polygons, step 19: sectors with their own floor, ceiling and
 * light level (0–255; 192 unless the level says otherwise).
 *
 * buildMap turns sector outlines into Doom's vertices, linedefs, sidedefs and
 * sectors (a level editor's job), and gives every sector its list of segs:
 * its linedefs as seen from inside it. pointOnSide says which side of a line
 * a point is on, and sectorAt finds the sector a point is in.
 * New since step 18: each sector's light.
 */

/**
 * def.vertices: [[x, y], …], in map units (1 unit = one Wolfenstein cell).
 * def.sectors:  [{ loops, floor, ceil, wall, floorTex, ceilTex, light, name }, …]
 *
 * Each loop is a list of vertex indices going CLOCKWISE as drawn on screen
 * (y points down), so the sector is on the RIGHT of every edge. A hole in a
 * sector (a pillar) is a loop going the other way, so the sector is again on
 * its right. A loop can also be { v: [...], wall } to give it its own texture.
 *
 * Every edge becomes a sidedef. When two sectors share an edge (listed once in
 * each direction), the two sidedefs share one two-sided linedef.
 *
 * Seen from one side of a two-sided line, the walls you can see there (the
 * step up to a higher floor, the lintel of a lower ceiling) belong to the
 * sector on the OTHER side. So each of the two sidedefs takes the other
 * sector's wall texture. (Doom lets the mapper choose; this is our default.)
 */
function buildMap(def) {
  const vertices = def.vertices.map(([x, y], id) => ({ id, x, y }));
  const sectors = def.sectors.map((s, id) => ({
    id, name: s.name ?? '', floor: s.floor ?? 0, ceil: s.ceil ?? 1, wall: s.wall ?? 1,
    floorTex: s.floorTex ?? 0, ceilTex: s.ceilTex ?? 1, light: s.light ?? 192, loops: [], segs: [],
  }));
  const sides = [], lines = [];
  const unpaired = new Map();   // "a,b" → the linedef from vertex a to vertex b, still one-sided

  def.sectors.forEach((s, si) => {
    const sector = sectors[si];
    for (const loop of s.loops) {
      const ids = Array.isArray(loop) ? loop : loop.v;
      const texture = loop.wall ?? sector.wall;
      sector.loops.push(ids.map((i) => vertices[i]));
      for (let i = 0; i < ids.length; i++) {
        const a = ids[i], b = ids[(i + 1) % ids.length];
        const side = { id: sides.length, sector, texture };
        sides.push(side);
        const twin = unpaired.get(b + ',' + a);     // the same edge, walked the other way
        if (twin) {
          twin.back = side;
          side.texture = twin.front.sector.wall;
          twin.front.texture = sector.wall;
          unpaired.delete(b + ',' + a);
          continue;
        }
        const v1 = vertices[a], v2 = vertices[b];
        const line = { id: lines.length, v1, v2, front: side, back: null, dx: v2.x - v1.x, dy: v2.y - v1.y };
        line.length = Math.hypot(line.dx, line.dy);
        lines.push(line);
        unpaired.set(a + ',' + b, line);
      }
    }
  });

  // Segs: each linedef as seen from a sector it borders, oriented so that
  // sector is in front (on the right). A two-sided line gives two segs, one
  // for each sector, running in opposite directions.
  for (const line of lines) {
    line.front.sector.segs.push(makeSeg(line.v1, line.v2, line, line.front, line.back));
    if (line.back) line.back.sector.segs.push(makeSeg(line.v2, line.v1, line, line.back, line.front));
  }
  return { vertices, lines, sides, sectors };
}

/**
 * A seg: part of a linedef, seen from one side. `side` is the sidedef we see,
 * `front` the sector we're looking from, `back` the sector beyond (null for a
 * solid wall). `offset` is where the seg starts along its sidedef, in map
 * units, so the texture lines up (always 0 until step 18 cuts segs up).
 */
function makeSeg(v1, v2, line, side, otherSide, offset = 0) {
  const dx = v2.x - v1.x, dy = v2.y - v1.y;
  return {
    v1, v2, dx, dy, length: Math.hypot(dx, dy), line, side, offset,
    front: side.sector, back: otherSide ? otherSide.sector : null,
  };
}

/**
 * 2D cross product: cross(a, b) = perp(a) · b, with perp from step 1.
 * Positive when b points to the RIGHT of a, negative to the left, 0 if parallel.
 */
function cross(ax, ay, bx, by) {
  return ax * by - ay * bx;
}

/** 0 if (x, y) is on the front (right-hand) side of the line (or seg), 1 if on the back. */
function pointOnSide(line, x, y) {
  return cross(line.dx, line.dy, x - line.v1.x, y - line.v1.y) >= 0 ? 0 : 1;
}

/**
 * Which sector is (x, y) in? Look east along the horizontal line through the
 * point and find the nearest linedef crossing it. Nothing lies between us and
 * that line, so we are in the sector on our side of it. Returns null outside
 * the map (or inside a pillar).
 */
function sectorAt(map, x, y) {
  let nearest = Infinity, sector = null;
  for (const line of map.lines) {
    const { v1, v2 } = line;
    if ((v1.y > y) === (v2.y > y)) continue;           // doesn't reach our y
    const crossX = v1.x + (y - v1.y) / line.dy * line.dx;
    if (crossX < x || crossX - x >= nearest) continue; // west of us, or not the nearest
    nearest = crossX - x;
    const side = pointOnSide(line, x, y) === 0 ? line.front : line.back;
    sector = side ? side.sector : null;
  }
  return sector;
}
