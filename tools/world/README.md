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
| `pnpm world:terrain` | Fetches real elevation tiles for the frame (network, once) and writes `data/heightmap.json` |
| `pnpm world:build` | Builds `out/world.blend` |
| `pnpm world:preview` | Builds and renders a fast overview to `out/preview.png` (`--time dusk` after `--` for the other light) |
| `pnpm world:stills:preview` | Fast versions of every approval still into `out/stills/` |
| `pnpm world:stills` | Full-quality stills into `public/world/stills/` |

`BLENDER=/path/to/blender` overrides the binary. Verified on Blender 5.2.1 LTS with Cycles on Apple Metal.

## The land is real

The table is a window onto Lebanon: centre `(33.9362, 35.6797)`, x axis bearing 20 degrees along the coast, 2.2 km per unit, Ashrafieh at the south-west to the foot of the Warde slopes at the north-east. `lib/frame.py` maps latitude and longitude to table units. `data/heightmap.json` is committed and is what builds read; raw tiles under `data/tiles/` are ignored, and a build never touches the network. Vertical exaggeration is 3.0. Town, road and landmark positions come from real coordinates at souvenir scale: real shapes and places, oversized buildings, trees as texture. The wedding venue is at Warde; the other places are placeholders until the venues are known.

## Where things are decided

- The land: `lib/frame.py` (where the table is), `fetch_terrain.py` and `data/heightmap.json` (what it reads), `lib/heightmap.py` (exaggeration, terraces by elevation band, seabed, plateaus levelled for places).
- Where trees and houses go: `lib/placement.py`, `lib/layout.py` (highways, eleven towns, Beirut's towers, the ski runs, the nine places and their clearings).
- What things look like: `scene/*.py`. Trees in `flora.py`, houses and roads in `buildings.py`, the nine places in `places.py`.
- Light: `scene/lighting.py` (`afternoon`, `dusk`). The sky lights the scene at a few percent so the sun draws the shadows, and is shown to the camera at its own strength. Haze comes from the Mist pass composited over the Environment pass.
- Framing: `scene/cameras.py`. Place shots are anchored to the coastline or the place position, so moving the land moves the camera with it.

## Things learned the hard way

- A quantised height field sampled on a grid aliases into teeth wherever a contour runs diagonally. Terraces are cut from the smooth field with a continuous riser of fixed ground width, and fade out where the slope is too steep to hold one.
- A place that needs a flat floor needs a plateau in the heightmap, not a footing. The garden sits on one.
- Author cameras after the geometry exists, from renders, never from guesses.
- The sun should come from over the sea. With sun and camera on the same side every shadow falls away behind what casts it and the scene goes flat.

## Reading a render

Open the image. A run with no traceback and a luminance in range is not acceptance; the image is. Judge it at full size and, for the overview, also at phone size.
