# The world

The diorama the guest site is built around, authored as Blender scripts.

## Rules

- Scripts are the source of truth. Nothing in `out/` or `public/world/` is edited by hand.
- Colours come only from the tokens in `src/styles.css`, via `lib/palette.py`. Derived shades are named mixes; no new hex values.
- Ink red is an accent: the hill venue roof, the post house roof, door and flag, one boat hull. Never a filled ground.
- Everything is seeded. Two builds give the same world.
- `lib/` never imports `bpy`, so `pnpm world:test` runs under plain Python.

## Commands

| Command | What it does |
|---|---|
| `pnpm world:test` | Unit tests for the pure geometry modules |
| `pnpm world:build` | Builds `out/world.blend` |
| `pnpm world:preview` | Builds and renders a fast overview to `out/preview.png` (`--time dusk` after `--` for the other light) |
| `pnpm world:stills:preview` | Fast versions of every approval still into `out/stills/` |
| `pnpm world:stills` | Full-quality stills into `public/world/stills/` |

`BLENDER=/path/to/blender` overrides the binary. Verified on Blender 5.2.1 LTS with Cycles on Apple Metal.

## Where things are decided

- The land: `lib/heightmap.py` (coast, terraces, knoll, ridge, and the plateaus levelled for places).
- Where trees and houses go: `lib/placement.py`, `lib/layout.py` (roads, village, the nine places and their clearings).
- What things look like: `scene/*.py`. Trees in `flora.py`, houses and roads in `buildings.py`, the nine places in `places.py`.
- Light: `scene/lighting.py` (`afternoon`, `dusk`). The sky is a physical model and is kept to a few percent so the sun draws the shadows.
- Framing: `scene/cameras.py`. Place shots are anchored to the coastline or the place position, so moving the land moves the camera with it.

## Things learned the hard way

- A quantised height field sampled on a grid aliases into teeth wherever a contour runs diagonally. Terraces are cut from the smooth field with a continuous riser of fixed ground width, and fade out where the slope is too steep to hold one.
- A place that needs a flat floor needs a plateau in the heightmap, not a footing. The garden sits on one.
- Author cameras after the geometry exists, from renders, never from guesses.
- The sun should come from over the sea. With sun and camera on the same side every shadow falls away behind what casts it and the scene goes flat.

## Reading a render

Open the image. A run with no traceback and a luminance in range is not acceptance; the image is. Judge it at full size and, for the overview, also at phone size.
