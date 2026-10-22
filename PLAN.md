# Plan

A step-by-step, interactive series that rebuilds a Wolfenstein-3D-style raycaster in
plain JavaScript, then looks at how Doom's engine differed. Each step is one page
(`steps/NN-name/index.html`) with the explanation, interactive demos, and a
complete runnable copy of the code at that point.

Each step also has a "How it was done in 1992" box comparing our code with the
original games.

## Conventions

- Plain JS + `<canvas>`, no libraries, no build step. Classic `<script>` tags (not
  ES modules) so pages work when opened from `file://`.
- The 3D view is a 320×200 software framebuffer (`ImageData` + `Uint32Array`),
  scaled up with `image-rendering: pixelated`.
- World: x right, **y down**, 1 unit = 1 map cell. Positive angles turn clockwise.
- Camera = `pos`, unit direction `d`, plane `p = perp(d) · tan(FOV/2)`; ray for
  column x is `d + c·p` with `c = 2x/W − 1`.
- `common/` holds only scaffolding (styles, drawing, input). Engine code lives in
  each step's `raycaster.js` (from step 5), copied forward and extended, so
  `diff steps/08-*/raycaster.js steps/09-*/raycaster.js` shows exactly what a step adds.

## Part 1: The maths ✅

| # | Step | Key ideas | 1992 box |
|---|------|-----------|----------|
| 1 | Vectors and coordinates | points vs vectors, dot product, projection, perp | 16.16 fixed point, FixedMul |
| 2 | Angles and rotation | (cos θ, sin θ), atan2, rotation matrix | sine tables, Doom's binary angles |
| 3 | The camera | dir + plane, rays per column, camera matrix M = [p d] and M⁻¹ | `pixelangle[]`, shrinkable view |
| 4 | Ray marching | grid map, naive marching, accuracy vs. cost | cycle budget of a 386 |
| 5 | DDA | deltaDist/sideDist, exact grid traversal | `AsmRefresh`, Amanatides & Woo |

## Part 2: From 2D to "3D" ✅

| # | Step | Key ideas | 1992 box |
|---|------|-----------|----------|
| 6 | Perspective projection | similar triangles, `projScale / z`, flat-shaded frame | VGA mode 13h / Mode X, compiled scalers |
| 7 | The fisheye problem | distance vs. depth, `t` is already depth, angle- vs plane-spaced rays | `CalcHeight` |
| 8 | Movement and collision | dt, strafing, box collision, sliding | 70 Hz tics, `ClipMove` |
| 9 | Textured walls | procedural embossed bricks, u from wallX (+ flip), v by stepping | VSWAP, light/dark texture pairs, palette flashes |
| 10 | Floor and ceiling | rowDist, camera matrix forwards, per-row stepping | Wolf3D flat colours, Doom's spans |

## Part 3: Making it a game ✅

| # | Step | Key ideas | 1992 box |
|---|------|-----------|----------|
| 11 | Sprites | billboards, camera space with `M⁻¹`, one-row depth buffer, painter's algorithm, transparent texels, 8 rotation frames, procedural sprites built from shaded parts | posts, `spotvis`, `wallheight[]`, `CalcRotate` |
| 12 | Doors and push-walls | a thin wall across the middle of a cell (`crossInCell`), sliding panel and gap, door frames, door state machine, push-walls | door tiles, half-steps in `AsmRefresh`, `OPENTICS`, `pwallpos` |
| 13 | Shooting and enemies | hitscan with a texel test, line of sight as `castRay(b − a)`, hearing as a flood fill through open doors, tile-to-tile chasing, the state machine as a table, a fixed random table | `statetype`, `US_RndT`, `GunAttack` / `T_Shoot`, areas and `madenoise`, `SelectChaseDir` |
| 14 | HUD, weapon and pickups | `subScreen`, a 5×7 bitmap font, status bar, weapon bob, flashes, pickups table, gold key and locked doors, exit and end-of-floor ratios; extras: Web Audio sound effects, automap from seen cells, mouse look, light falloff | the status bar face, palette flashes, `GetBonus`, kill/secret/treasure ratios, AdLib and Sound Blaster |

New files: `sprites.js` (from step 11), `game.js` (from step 13: robots, shooting,
pickups, kept apart from the engine in `raycaster.js`), `hud.js` and `audio.js` (step 14).

## Part 4: How Doom did it differently ✅

| # | Step | Key ideas | 1993 box |
|---|------|-----------|----------|
| 15 | From grids to polygons | vertices, linedefs, sidedefs, sectors built from sector outlines, front = right of v1 → v2, `sectorAt`, the 2D cross product, ray vs. every linedef, textures along a line, circle vs. segment collision | WAD lumps, `BLOCKMAP` |
| 16 | Projecting wall segments | endpoints into camera space (`M⁻¹`), back-face culling, near-plane clipping, 1/z and along/z linear in screen x (perspective-correct vs. affine), one-row depth buffer | `R_AddLine` angles, `rw_scalestep`, why Doom never divides per pixel |
| 17 | Variable heights | per-sector floor/ceiling, segs, upper/lower walls, clip arrays (`top`/`bottom`), floors per column, portal rendering (needs convex sectors), step height and headroom | `ceilingclip`/`floorclip`, pegging, the Build engine's portals |
| 18 | BSP trees | partitions, node builder (choose, split with texture offsets, convex subsectors), front-to-back walk, solid segs, bounding boxes, `subsectorAt` | `NODES`/`SSECTORS`/`SEGS`, `R_RenderBSPNode`, why the map can't move sideways |
| 19 | Visplanes and lighting | visplanes (`findPlane`, `checkPlane`), columns to spans (`makeSpans`), spans as step 10 rows, median-cut palette, COLORMAP, Doom's light formula, fake contrast, the sky | `MAXVISPLANES`, `COLORMAP`/`PLAYPAL`, light specials |

Part 4 has its own engine: `level.js` (the map), `renderer.js` (copied forward like
`raycaster.js`), `bsp.js` (step 18) and `colormap.js` (step 19). Textures are shared in
spirit with Part 2 (`textures.js`), plus flats and a sky. Each step's 1993 box is titled
“How Doom did it in 1993” (`aside.retro.doom`).

The Ken Silverman / Build aside went into step 17, next to our own portal renderer, rather
than step 19.

## Part 5: Quake-style true 3D (draft, not started)

Doom kept walls vertical and floors flat, so every column (or row) had one depth. Quake
(1996) dropped that: polygons at any angle, rooms above rooms, looking up and down. Most of
Part 4's ideas carry over one dimension up; what's new is the machinery around them.
Rough size: 2–3× Part 4's engine, plus a level compiler. 1996 boxes would be titled
“How Quake did it in 1996” (`aside.retro.quake`).

| # | Step | Key ideas | 1996 box |
|---|------|-----------|----------|
| 20 | A 3D camera | yaw/pitch (roll optional), 3×3 camera matrix and its inverse (transpose: it's a rotation), 3D points and projection `x = W/2·(1 + u/v)`, `y = H/2·(1 − w/v)`, a wireframe of a few boxes | Quake's `vright`/`vup`/`vpn` vectors, `R_TransformVector` |
| 21 | Clipping polygons | the view frustum as 4 planes + near plane, signed distance to a plane, Sutherland–Hodgman clipping (step 16's near-plane cut, applied plane by plane), back-face culling with the polygon normal | `R_ClipEdge`, clipping against the frustum before projection |
| 22 | Filling and texturing polygons | scanline rasterising a convex polygon, texture axes (s, t) per surface, 1/z, s/z, t/z linear in x **and** y (step 16's algebra in 2D), affine vs. per-pixel divide vs. divide every 16 pixels | `D_DrawSpans16`, overlapping the FPU divide with integer work on the Pentium |
| 23 | Hiding what's behind: a z-buffer | one depth (1/z) per pixel, why Doom didn't need it, cost vs. simplicity, front-to-back order still saves fill | Quake used a z-buffer only for models (`d_pzbuffer`), the world never reads it |
| 24 | A 3D BSP from brushes | levels as convex brushes (axis-aligned boxes first), faces from brushes, removing hidden faces (simple CSG), building the BSP with planes instead of lines, front-to-back walk, leaves and `pointInLeaf` | `qbsp`, `.map` brush format, `dnode_t`/`dleaf_t` |
| 25 | Lightmaps | light baked per surface on a coarse grid (16 texels per luxel), point lights with distance falloff and line-of-sight shadows through the BSP, bilinear blend, surface cache (texture × lightmap, built once, reused) | `light` tool, `D_CacheSurface`, the surface cache's memory budget |
| 26 | Potentially visible sets | which leaves can ever see which, stored per leaf as a bit vector, skip everything else before drawing; a simple (slow) way to compute it by sampling, the real portal-flow idea described | `vis` and its long compile times, run-length compressed PVS |
| 27 | Edge-sorted spans (optional) | the active edge table, sorting surfaces per scanline by 1/z, each pixel drawn once with no z-buffer | Michael Abrash's write-ups of Quake's span sorting |

Decisions to make before starting:

- **Level authoring.** Brushes are much harder to type than sector outlines. Options: a tiny
  JS brush format (boxes + a few wedges), levels generated by code, or a small importer for
  a subset of Quake's `.map` text format. Probably start with boxes only and add sloped
  brushes in step 24.
- **Hidden surfaces.** Use the z-buffer (step 23) for the main engine and make edge sorting
  the optional last step, rather than the other way round. Simpler to follow, honest about
  the trade-off.
- **New files.** `math3d.js` (vectors, matrices, planes), `raster.js` (clipping and polygon
  filling), `brushes.js` + `bsp3d.js` (the compiler), `lightmap.js`, `renderer3d.js`. Keep
  `colormap.js` from step 19: Quake is also 256 colours with a colormap (64 light levels).
- **Collision.** Player as an axis-aligned box against brush planes (Quake's hull clipping
  idea), or a sphere against polygons. Keep it minimal; it isn't the point of Part 5.
- **Out of scope:** alias models (animated meshes), particles, water warping, networking.
  Mention them in the final step's wrap-up.

## Open questions / ideas

- Blog publishing: GitHub Pages straight from this repo will work as-is (no build).
- Part 3 kept the engine (`raycaster.js`) and the game (`game.js`) apart rather than adding
  an "engine API". Part 4 replaced the grid with its own renderer (`renderer.js`).
- Possible Part 4 extras: sprites in the Doom renderer (vissprites clipped by drawsegs),
  moving floors and ceilings (doors, lifts), transparent middle textures.
- Possible extra step between 10 and 11: performance (typed arrays, avoiding
  allocations in the frame loop, measuring frame time), plus a fixed-point
  version of `castRay` as a 1992 experiment.
