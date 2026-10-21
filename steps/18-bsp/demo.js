'use strict';
// Step 18 demos: building a BSP tree for the level, and drawing it front to
// back with solid segs.

/** n points on a circle, going counter-clockwise on screen: the outline of a hole. */
function holeRing(cx, cy, r, n) {
  return Array.from({ length: n }, (_, k) => [cx + r * Math.cos(-k * 2 * Math.PI / n), cy + r * Math.sin(-k * 2 * Math.PI / n)]);
}

// Step 17's level with the courtyard as one concave sector, plus two pillars:
// none of the courtyard, the start room or the crypt is convex now.
const VERTICES = [
  [1, 2], [7, 2], [7, 2.5], [7, 4], [7, 6.5], [7, 7.5], [7, 8], [5, 8], [3, 8], [1, 8],          // 0–9: start room
  [8, 2.5], [8, 4],                                                                               // 10–11: window
  [8, 6.5], [8, 7.5],                                                                             // 12–13: passage
  [8, 1], [16, 1], [16, 4], [13, 4], [11, 4], [16, 6], [13, 6], [11, 6], [8, 6], [16, 9], [8, 9], // 14–24: courtyard
  [3, 8.6], [5, 8.6], [3, 9.2], [5, 9.2], [3, 9.8], [5, 9.8], [3, 10.4], [5, 10.4],              // 25–32: stairs
  [2, 10.4], [6, 10.4], [7, 11.4], [7, 13], [6, 14], [2, 14], [1, 13], [1, 11.4],                // 33–40: crypt
  [4.6, 5.05], [4.05, 5.6], [4.6, 6.15], [5.15, 5.6],                                            // 41–44: diamond pillar
  ...holeRing(4, 12.2, 0.45, 8),                                                                  // 45–52: crypt pillar
];


const LEVEL = buildBSP(buildMap({
  vertices: VERTICES,
  sectors: [
    { name: 'start room', floor: 0, ceil: 1.5, wall: 1, loops: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], { v: [41, 42, 43, 44], wall: 3 }] },
    { name: 'window', floor: 0.45, ceil: 1.15, wall: 1, loops: [[2, 10, 11, 3]] },
    { name: 'passage', floor: 0, ceil: 1, wall: 1, loops: [[4, 12, 13, 5]] },
    { name: 'courtyard', floor: -0.25, ceil: 2.5, wall: 4, floorTex: 2,
      loops: [[14, 15, 16, 19, 23, 24, 13, 12, 22, 11, 10], [18, 21, 20, 17]] },
    { name: 'platform', floor: 0.1, ceil: 2.5, wall: 3, floorTex: 4, loops: [[18, 17, 20, 21]] },
    { name: 'step 1', floor: -0.125, ceil: 0.975, wall: 2, floorTex: 3, loops: [[8, 7, 26, 25]] },
    { name: 'step 2', floor: -0.25, ceil: 0.85, wall: 2, floorTex: 3, loops: [[25, 26, 28, 27]] },
    { name: 'step 3', floor: -0.375, ceil: 0.725, wall: 2, floorTex: 3, loops: [[27, 28, 30, 29]] },
    { name: 'step 4', floor: -0.5, ceil: 0.6, wall: 2, floorTex: 3, loops: [[29, 30, 32, 31]] },
    { name: 'crypt', floor: -0.5, ceil: 0.6, wall: 2, floorTex: 3, ceilTex: 3,
      loops: [[33, 31, 32, 34, 35, 36, 37, 38, 39, 40], { v: [45, 46, 47, 48, 49, 50, 51, 52], wall: 1 }] },
  ],
}));

const DEPTH_COLORS = ['#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ef476f', '#f8961e', '#8ac926', '#ff99c8', '#9bf6ff', '#fdffb6'];
const REGION_COLORS = ['#ffd166', '#06d6a0', '#4cc9f0', '#b388ff', '#ef476f', '#f8961e', '#8ac926', '#ff99c8'];

/** Keeps the part of a convex polygon on one side of a partition (0: front, 1: back). */
function clipPolygon(poly, part, side) {
  const sgn = side === 0 ? 1 : -1;
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = sgn * sideValue(part, a.x, a.y), db = sgn * sideValue(part, b.x, b.y);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
    }
  }
  return out;
}

/**
 * For the pictures only: the region of the plane each node covers (a convex
 * polygon, cut out by the partitions above it), and the average of its segs'
 * midpoints, a good spot for a label.
 */
function annotateTree(node, region) {
  node.region = region;
  if (node.subsector) {
    node.segs = node.subsector.segs;
    node.subsector.node = node;
  } else {
    annotateTree(node.children[0], clipPolygon(region, node, 0));
    annotateTree(node.children[1], clipPolygon(region, node, 1));
    node.segs = node.children[0].segs.concat(node.children[1].segs);
  }
  node.cx = node.segs.reduce((s, g) => s + g.v1.x + g.v2.x, 0) / (2 * node.segs.length);
  node.cy = node.segs.reduce((s, g) => s + g.v1.y + g.v2.y, 0) / (2 * node.segs.length);
}
annotateTree(LEVEL.root, [{ x: 0, y: 0 }, { x: 17, y: 0 }, { x: 17, y: 15 }, { x: 0, y: 15 }]);

const nodeDepth = (n) => n.subsector ? n.subsector.depth : n.depth;

/** The regions at depth `limit` (or leaves above it), in front-to-back order as seen from (x, y). */
function frontier(node, limit, x, y, out = []) {
  if (node.subsector || node.depth >= limit) { out.push(node); return out; }
  const side = pointOnSide(node, x, y);
  frontier(node.children[side], limit, x, y, out);
  frontier(node.children[side ^ 1], limit, x, y, out);
  return out;
}

function tracePolygon(ctx, view, poly) {
  ctx.beginPath();
  poly.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, view.sx(v.x), view.sy(v.y)));
  ctx.closePath();
}

/** Clips drawing to the inside of the level (nonzero: holes cancel, the platform fills its hole back in). */
function clipToLevel(ctx, view, map) {
  ctx.beginPath();
  for (const s of map.sectors) {
    for (const loop of s.loops) {
      loop.forEach((v, i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, view.sx(v.x), view.sy(v.y)));
      ctx.closePath();
    }
  }
  ctx.clip('nonzero');
}

function drawSegs(ctx, view, segs, color, width) {
  for (const g of segs) {
    if (g.back) continue;
    line(ctx, view.sx(g.v1.x), view.sy(g.v1.y), view.sx(g.v2.x), view.sy(g.v2.y), color, width);
  }
}

// ------------------------------------------------------------ demo 1: the tree

(function treeDemo() {
  const top = setupCanvas(document.getElementById('t-map'));
  const tree = setupCanvas(document.getElementById('t-tree'));
  const ui = controls(['t-depth']);
  const readout = document.getElementById('t-readout');
  const view = makeView(38, -14, -16);
  const eye = { x: 2.2, y: 4.4 };
  let mouse = null;
  const maxDepth = Math.max(...LEVEL.subsectors.map((s) => s.depth));
  const depthInput = document.getElementById('t-depth');
  depthInput.max = maxDepth;
  ui['t-depth'] = maxDepth;

  // Tree layout: leaves left to right (front child first), parents above the middle of their children.
  let nextLeaf = 0;
  (function layout(n) {
    if (n.subsector) { n.tx = nextLeaf++; return; }
    layout(n.children[0]); layout(n.children[1]);
    n.tx = (n.children[0].tx + n.children[1].tx) / 2;
  })(LEVEL.root);
  const leafGap = (tree.w - 40) / Math.max(1, nextLeaf - 1);
  const levelGap = (tree.h - 40) / maxDepth;
  const tpos = (n) => ({ x: 20 + n.tx * leafGap, y: 18 + nodeDepth(n) * levelGap });

  enableDrag(top.canvas, view, [eye], draw);
  top.canvas.addEventListener('pointermove', (e) => { mouse = canvasPoint(top.canvas, e); draw(); });
  top.canvas.addEventListener('pointerleave', () => { mouse = null; draw(); });
  depthInput.addEventListener('input', draw);

  function draw() {
    const limit = ui['t-depth'];
    const regions = frontier(LEVEL.root, limit, eye.x, eye.y);
    let hovered = null;
    if (mouse) {
      const wx = view.wx(mouse.x), wy = view.wy(mouse.y);
      let n = LEVEL.root;
      while (!(n.subsector || n.depth >= limit)) n = n.children[pointOnSide(n, wx, wy)];
      hovered = n;
    }

    // ---- the map
    const { ctx, w, h } = top;
    clear(ctx, w, h);
    ctx.save();
    clipToLevel(ctx, view, LEVEL);
    regions.forEach((n, i) => {
      tracePolygon(ctx, view, n.region);
      ctx.fillStyle = REGION_COLORS[i % REGION_COLORS.length] + (n === hovered ? '80' : '38');
      ctx.fill();
    });
    // Partitions above the limit, each drawn inside the region it splits.
    (function partitions(n) {
      if (n.subsector || n.depth >= limit) return;
      ctx.save();
      tracePolygon(ctx, view, n.region);
      ctx.clip();
      const len = Math.hypot(n.dx, n.dy), ux = n.dx / len, uy = n.dy / len;
      line(ctx, view.sx(n.v1.x - ux * 40), view.sy(n.v1.y - uy * 40), view.sx(n.v1.x + ux * 40), view.sy(n.v1.y + uy * 40),
        DEPTH_COLORS[n.depth % DEPTH_COLORS.length], 2, [7, 4]);
      ctx.restore();
      partitions(n.children[0]); partitions(n.children[1]);
    })(LEVEL.root);
    ctx.restore();

    for (const s of LEVEL.sectors) for (const g of s.segs) {
      line(ctx, view.sx(g.v1.x), view.sy(g.v1.y), view.sx(g.v2.x), view.sy(g.v2.y), g.back ? 'rgba(248,150,30,0.5)' : C.wallEdge, g.back ? 1 : 2);
    }
    if (hovered) drawSegs(ctx, view, hovered.segs, C.player, 3);
    // Split points: vertices the node builder made.
    for (const ss of LEVEL.subsectors) for (const g of ss.segs) {
      if (g.v1.id === -1) ring(ctx, view.sx(g.v1.x), view.sy(g.v1.y), 4, C.warn, 1.5);
    }
    regions.forEach((n, i) => label(ctx, String(i + 1), view.sx(n.cx), view.sy(n.cy), C.text, 'center', 'middle', 13));
    disc(ctx, view.sx(eye.x), view.sy(eye.y), 6, C.player);
    label(ctx, 'eye', view.sx(eye.x) + 9, view.sy(eye.y) - 9, C.player);

    // ---- the tree
    const t = tree.ctx;
    clear(t, tree.w, tree.h);
    (function edges(n) {
      if (n.subsector) return;
      for (const c of n.children) {
        const a = tpos(n), b = tpos(c);
        line(t, a.x, a.y, b.x, b.y, nodeDepth(c) <= limit ? C.axis : C.grid, 1);
        edges(c);
      }
    })(LEVEL.root);
    (function nodes(n) {
      const { x, y } = tpos(n);
      const inFrontier = regions.indexOf(n);
      if (n.subsector) {
        t.fillStyle = inFrontier >= 0 ? REGION_COLORS[inFrontier % REGION_COLORS.length] : C.grid;
        t.fillRect(x - 5, y - 5, 10, 10);
      } else {
        disc(t, x, y, 5, n.depth < limit ? DEPTH_COLORS[n.depth % DEPTH_COLORS.length] : inFrontier >= 0 ? REGION_COLORS[inFrontier % REGION_COLORS.length] : C.grid);
        nodes(n.children[0]); nodes(n.children[1]);
      }
      if (n === hovered) ring(t, x, y, 9, C.text, 2);
      if (inFrontier >= 0) label(t, String(inFrontier + 1), x, y + 15, C.dim, 'center', 'middle', 10);
    })(LEVEL.root);

    // ---- readout
    const total = LEVEL.subsectors.reduce((s, ss) => s + ss.segs.length, 0);
    let text =
      `${LEVEL.lines.length} linedefs → ${total} segs after ${LEVEL.splits} splits (red rings: vertices the builder added)\n` +
      `${LEVEL.nodes.length} nodes, ${LEVEL.subsectors.length} subsectors, deepest leaf at depth ${maxDepth}\n` +
      `showing ${regions.length} regions at depth ${limit}, numbered in front-to-back order from the eye\n`;
    if (hovered) {
      text += hovered.subsector
        ? `subsector ${hovered.subsector.id}: sector "${hovered.subsector.sector.name}", ${hovered.segs.length} segs, convex`
        : `node ${hovered.id} (depth ${hovered.depth}): ${hovered.segs.length} segs below it, not convex yet`;
    }
    readout.textContent = text;
  }
  draw();
})();

// ------------------------------------------------------------ demo 2: drawing in BSP order

(function walkDemo() {
  const screen = createScreen(document.getElementById('g-view'));
  const mm = setupCanvas(document.getElementById('g-map'));
  const mmView = makeView(14.5, -2, 4);
  const keys = keyboard(document.getElementById('g-game'));
  const ui = controls(['g-stop', 'g-bbox', 'g-segs']);
  const readout = document.getElementById('g-readout');
  const segsInput = document.getElementById('g-segs');
  const player = createPlayer(2.2, 4.4, 0.25);
  player.sector = subsectorAt(LEVEL, player.x, player.y).sector;
  let replayStart = null, total = 1;

  document.getElementById('g-replay').addEventListener('click', () => { replayStart = performance.now(); });
  segsInput.addEventListener('input', () => { replayStart = null; });

  animate((dt) => {
    movePlayer(LEVEL, player, keys, dt);
    let maxSegs = ui['g-segs'] >= Number(segsInput.max) ? Infinity : ui['g-segs'];
    if (replayStart !== null) {
      const t = (performance.now() - replayStart) / 3000;
      maxSegs = Math.floor(t * (total + 1));
      if (t >= 1) { replayStart = null; maxSegs = Infinity; }
    }
    const t0 = performance.now();
    const { order, drawnSegs, stats, full } = renderFrame(screen, LEVEL, player,
      { stopWhenFull: ui['g-stop'], bboxCheck: ui['g-bbox'], maxSegs });
    const ms = performance.now() - t0;
    if (maxSegs === Infinity) total = stats.segs;
    const p = player;

    const { ctx, w, h } = mm;
    clear(ctx, w, h);
    ctx.save();
    clipToLevel(ctx, mmView, LEVEL);
    order.forEach((ss, i) => {
      tracePolygon(ctx, mmView, ss.node.region);
      ctx.fillStyle = `rgba(76,201,240,${0.35 - 0.3 * i / Math.max(1, order.length)})`;
      ctx.fill();
    });
    ctx.restore();
    for (const s of LEVEL.sectors) for (const g of s.segs) {
      line(ctx, mmView.sx(g.v1.x), mmView.sy(g.v1.y), mmView.sx(g.v2.x), mmView.sy(g.v2.y), g.back ? 'rgba(248,150,30,0.35)' : C.axis, 1);
    }
    drawnSegs.forEach((g, i) => {
      const k = i / Math.max(1, drawnSegs.length - 1);
      line(ctx, mmView.sx(g.v1.x), mmView.sy(g.v1.y), mmView.sx(g.v2.x), mmView.sy(g.v2.y),
        `hsl(${45 + 220 * k}, 90%, 62%)`, 2.5);
    });
    for (const sgn of [-1, 1]) {
      line(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + (p.dirX + sgn * p.planeX) * 30),
        mmView.sy(p.y + (p.dirY + sgn * p.planeY) * 30), 'rgba(76,201,240,0.35)', 1);
    }
    disc(ctx, mmView.sx(p.x), mmView.sy(p.y), 4, C.player);
    arrow(ctx, mmView.sx(p.x), mmView.sy(p.y), mmView.sx(p.x + p.dirX), mmView.sy(p.y + p.dirY), C.dir, 2, 6);

    readout.textContent =
      `you stand in "${p.sector.name}"\n` +
      `visited ${stats.nodes} of ${LEVEL.nodes.length + LEVEL.subsectors.length} tree nodes, ${order.length} of ` +
      `${LEVEL.subsectors.length} subsectors; ${stats.culled} branches skipped by their bounding box\n` +
      `${stats.segs} segs drawn${maxSegs < Infinity ? ` (stopped at ${maxSegs})` : ''}, ${stats.pixels} pixels, ` +
      `screen ${full ? 'full' + (ui['g-stop'] ? ': the walk stopped there' : '') : 'not full'}   ${ms.toFixed(2)} ms`;
  });
})();
