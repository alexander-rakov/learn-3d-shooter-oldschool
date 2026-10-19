# Learn old-school 3D shooters

An interactive, step-by-step series that rebuilds a Wolfenstein 3D–style raycaster
from the maths up, in plain JavaScript that runs directly in the browser.

**Start here:** open [`index.html`](index.html) in a browser. No server or build step
needed. If you prefer a local server: `python3 -m http.server` and visit
<http://localhost:8000>.

## Layout

```
index.html            table of contents
PLAN.md               the full plan (Parts 1–4) and conventions
common/style.css      page styling
common/diagram.js     scaffolding for demos: canvas, drawing, mouse, keyboard
steps/NN-name/        one page per step
  index.html          the article with embedded demos
  demo.js             wires the demos on that page
  raycaster.js        the engine as of this step (from step 5 on)
  textures.js         procedural textures (from step 9 on)
```

To see what a step adds to the engine:

```sh
diff steps/08-movement/raycaster.js steps/09-wall-textures/raycaster.js
```

## Status

- Part 1 (maths: vectors, rotation, camera, ray marching, DDA): done
- Part 2 (projection, fisheye, movement, wall textures, floor/ceiling): done
- Part 3 (sprites, doors, shooting, HUD): planned, see [PLAN.md](PLAN.md)
- Part 4 (how Doom differs): planned
