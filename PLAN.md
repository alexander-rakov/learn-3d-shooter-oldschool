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

## Part 3: Making it a game (next session)

11. **Sprites** — static objects (barrels, lamps) and enemies as camera-facing
    billboards. Transform each sprite into camera space with `M⁻¹` (step 3), project
    with `u/v`, scale by `1/v`. Keep a per-column depth buffer from the wall pass
    and skip sprite columns that are behind a wall. Sort far-to-near (painter's
    algorithm). Transparent texels.
    *1992:* Wolf3D sprites as column "posts" with transparency runs; 8 rotation
    frames for enemies chosen by viewing angle; `wallheight[]` used as the depth buffer.
12. **Doors and push-walls** — doors as thin walls in the middle of a cell, with
    a sliding offset that shifts `wallX`; door-frame textures on the side walls.
    Push-walls: a wall block that moves one cell over time.
    *1992:* how `AsmRefresh` handled door tiles, door states and timers; secret
    push-walls and the famous bugs around them.
13. **Shooting and enemies** — hitscan is "cast one ray from the screen centre
    and compare against sprite hits"; line of sight between enemy and player via
    DDA; a small state machine (stand → chase → attack → pain → die); damage,
    health, ammo.
    *1992:* Wolf3D's `statetype` tables, random damage rolls, enemies "hearing"
    gunshots through connected areas.
14. **HUD, weapon and pickups** — status bar, weapon sprite with bobbing,
    damage/pickup screen flashes, a small level with a goal.
    *Optional extras:* WebAudio sounds, an automap, mouse look via pointer lock,
    distance fog / light falloff.

## Part 4: How Doom did it differently (later)

15. **From grids to polygons** — vertices, linedefs, sidedefs, sectors; why
    arbitrary angles break the "one cell = one DDA step" trick.
16. **Projecting wall segments** — transform segment endpoints into camera space
    (same `M⁻¹`), near-plane clipping, then draw columns between the projected
    endpoints, interpolating `1/z` (perspective-correct texturing).
17. **Variable heights** — per-sector floor/ceiling heights, upper/lower wall
    parts, portals between sectors, per-column top/bottom clip arrays.
18. **BSP trees** — building one (choosing splitters, splitting lines),
    front-to-back traversal, "solid segs" to stop when every column is filled.
19. **Visplanes and lighting** — floors/ceilings as spans (builds on step 10),
    sector light levels, `COLORMAP` distance fading.
    *Aside:* Ken Silverman (Ken's Labyrinth) went on to write the Build engine
    (Duke Nukem 3D), which uses portals instead of BSP.

## Open questions / ideas

- Blog publishing: GitHub Pages straight from this repo will work as-is (no build).
- Should Part 3 add a tiny "engine API" section so later steps can be shorter?
- Possible extra step between 10 and 11: performance (typed arrays, avoiding
  allocations in the frame loop, measuring frame time), plus a fixed-point
  version of `castRay` as a 1992 experiment.
