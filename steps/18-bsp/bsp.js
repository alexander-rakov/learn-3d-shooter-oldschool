'use strict';
/*
 * Binary space partitioning, step 18: the node builder and the tree walk
 * helpers. Doom shipped the node builder as a separate tool that ran after
 * the level editor; we run it once when the level is loaded.
 *
 * buildBSP(map) takes every seg of every sector, picks one, and uses the
 * infinite line through it (the partition) to split the rest into a front
 * set and a back set, cutting any seg that crosses the line in two. Then it
 * does the same to each set, until a set is convex: a subsector. The result:
 *   node:      { v1, dx, dy (the partition), children: [front, back], bbox: [front, back] }
 *   leaf:      { subsector: { id, sector, segs } }
 */

const BSP_EPSILON = 1e-7;

/** Signed side of point (x, y) relative to a partition: > 0 front (right), < 0 back. */
function sideValue(part, x, y) {
  return cross(part.dx, part.dy, x - part.v1.x, y - part.v1.y);
}

/**
 * Where is a seg relative to a partition? 'front', 'back', or 'split'.
 * A seg lying ON the partition line goes front if it faces the same way as
 * the partition, back if it faces the other way.
 */
function classifySeg(part, seg) {
  const len = Math.hypot(part.dx, part.dy);
  const a = sideValue(part, seg.v1.x, seg.v1.y) / len;   // distances from the line
  const b = sideValue(part, seg.v2.x, seg.v2.y) / len;
  if (Math.abs(a) < BSP_EPSILON && Math.abs(b) < BSP_EPSILON) {
    return part.dx * seg.dx + part.dy * seg.dy > 0 ? 'front' : 'back';
  }
  if (a > -BSP_EPSILON && b > -BSP_EPSILON) return 'front';
  if (a < BSP_EPSILON && b < BSP_EPSILON) return 'back';
  return 'split';
}

/**
 * Cuts a seg where it crosses the partition. The new vertex is at fraction
 * t = a / (a − b) of the way along it (a and b: the ends' signed distances).
 * The second piece's texture offset moves on by t · length, so the texture
 * still lines up across the cut. Returns [front piece, back piece].
 */
function splitSeg(part, seg) {
  const a = sideValue(part, seg.v1.x, seg.v1.y), b = sideValue(part, seg.v2.x, seg.v2.y);
  const t = a / (a - b);
  const mid = { id: -1, x: seg.v1.x + t * seg.dx, y: seg.v1.y + t * seg.dy };
  const otherSide = seg.back ? (seg.side === seg.line.front ? seg.line.back : seg.line.front) : null;
  const first = makeSeg(seg.v1, mid, seg.line, seg.side, otherSide, seg.offset);
  const second = makeSeg(mid, seg.v2, seg.line, seg.side, otherSide, seg.offset + t * seg.length);
  return a > 0 ? [first, second] : [second, first];
}

/** Convex: every seg is in front of (or on) every other seg's line. */
function isConvex(segs) {
  for (const a of segs) {
    for (const b of segs) {
      if (a !== b && classifySeg(a, b) !== 'front') return false;
    }
  }
  return true;
}

/**
 * Picks the partition: the seg whose line splits the fewest other segs, and
 * divides them most evenly. Splits cost more than imbalance: every split
 * makes an extra seg to draw. A candidate that has every other seg on one
 * side doesn't divide anything, so it can't be used.
 */
function choosePartition(segs) {
  let best = null, bestScore = Infinity;
  for (const cand of segs) {
    let front = 0, back = 0, splits = 0;
    for (const seg of segs) {
      const c = classifySeg(cand, seg);
      if (c === 'front') front++; else if (c === 'back') back++; else splits++;
    }
    if (back === 0 && splits === 0) continue;   // everything in front: useless
    if (front === 0 && splits === 0) continue;
    const score = splits * 8 + Math.abs(front - back);
    if (score < bestScore) { bestScore = score; best = cand; }
  }
  return best;
}

function segsBBox(segs) {
  const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const s of segs) {
    for (const v of [s.v1, s.v2]) {
      box.x0 = Math.min(box.x0, v.x); box.y0 = Math.min(box.y0, v.y);
      box.x1 = Math.max(box.x1, v.x); box.y1 = Math.max(box.y1, v.y);
    }
  }
  return box;
}

function buildNode(map, segs, depth) {
  const part = isConvex(segs) ? null : choosePartition(segs);
  if (!part) {
    const subsector = { id: map.subsectors.length, sector: segs[0].front, segs, depth };
    map.subsectors.push(subsector);
    return { subsector };
  }
  const front = [], back = [];
  for (const seg of segs) {
    const c = classifySeg(part, seg);
    if (c === 'front') front.push(seg);
    else if (c === 'back') back.push(seg);
    else { const [f, b] = splitSeg(part, seg); front.push(f); back.push(b); map.splits++; }
  }
  const node = {
    id: map.nodes.length, depth, v1: { x: part.v1.x, y: part.v1.y }, dx: part.dx, dy: part.dy,
    bbox: [segsBBox(front), segsBBox(back)], children: null,
  };
  map.nodes.push(node);
  node.children = [buildNode(map, front, depth + 1), buildNode(map, back, depth + 1)];
  return node;
}

/** Builds the tree for a map from buildMap. Adds map.root, map.nodes, map.subsectors. */
function buildBSP(map) {
  const segs = map.sectors.flatMap((s) => s.segs);
  map.nodes = [];
  map.subsectors = [];
  map.splits = 0;
  map.root = buildNode(map, segs, 0);
  return map;
}

/**
 * Which subsector is (x, y) in? Walk down the tree, taking the side of each
 * partition the point is on. No searching: one side test per level.
 */
function subsectorAt(map, x, y) {
  let node = map.root;
  while (!node.subsector) node = node.children[pointOnSide(node, x, y)];
  return node.subsector;
}
