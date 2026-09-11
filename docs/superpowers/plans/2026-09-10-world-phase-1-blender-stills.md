# World Phase 1: Blender Diorama and Approval Stills

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the living diorama of the Lebanese coast as reproducible Blender scripts and render the Cycles stills Lucien approves before any web code is written.

**Architecture:** Pure-Python geometry modules under `tools/world/lib/` (heightmap, palette, scatter, layout) that import nothing from Blender and are unit-tested with the system interpreter. Thin `bpy` modules under `tools/world/scene/` turn that data into meshes, materials, lights and cameras. Two entry points, `build_world.py` and `stills.py`, run under Blender headless. Outputs in `tools/world/out/` are ignored; the approval stills are committed to `public/world/stills/`.

**Tech Stack:** Blender 5.2.1 LTS (bundled Python 3.13), Cycles on Apple Metal, system Python 3.14 for unit tests, pnpm scripts as the front door.

**Spec:** `docs/superpowers/specs/2026-09-10-immersive-world-design.md`

## Global Constraints

- Blender binary: `/Applications/Blender.app/Contents/MacOS/Blender`, overridable with `BLENDER`. Verified 5.2.1 LTS.
- Colours come only from the `@theme` tokens in `src/styles.css`: paper `#F9F1E5`, ink `#9B0D17`, bark `#3E2F26`, amber `#D89353`, foliage `#809B47`, sea `#C6D6D5`, field `#DFCDB4`, faded `#6B5445`. Derived shades are named mixes of tokens. No new hex values anywhere.
- Ink red is an accent only: the hill venue roof, the post house roof, door and flag, one boat hull, lanterns' glow is amber not ink. Never a filled ground.
- Scripts are the source of truth. Nothing under `tools/world/out/` or `public/world/` is hand-edited (same rule as `tools/monogram/`).
- All randomness is seeded. Two runs produce identical geometry.
- Modules under `tools/world/lib/` must not import `bpy`; they run under system Python.
- Blender API names verified on 5.2.1: Principled sockets `Base Color`, `Roughness`, `Emission Color`, `Emission Strength`, `Alpha`; sky node `ShaderNodeTexSky` with `sky_type = "MULTIPLE_SCATTERING"` and properties `sun_elevation`, `sun_rotation`, `sun_intensity`, `sun_disc`, `altitude`, `air_density`, `ozone_density` (no dust density); `bpy.ops.object.shade_smooth_by_angle(angle=radians)`; `view_layer.material_override`; `scene.view_settings.view_transform = "AgX"`; `mesh.color_attributes.new(name, "BYTE_COLOR", "CORNER")`; `ShaderNodeVertexColor.layer_name`; image format `WEBP` with `quality`.
- Commit messages follow the repo style: imperative prose, conventional prefix, and end with
  `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3`.
- Run `pnpm world:test` before every commit that touches `tools/world/lib/`. Run `pnpm world:preview` and look at the image before every commit that touches `tools/world/scene/`.
- Visual acceptance is judged by reading the rendered PNG with the Read tool, against the acceptance sentence given in the task. A render that runs without error but looks wrong is a failed step.

---

## File map

```
tools/world/
  README.md                 how to run, what is generated, the rules
  blender.sh                resolves the Blender binary
  build_world.py            entry: build scene, save .blend, optional preview render
  stills.py                 entry: render the approval stills
  lib/
    __init__.py
    palette.py              tokens → linear RGB, named derived shades
    noise.py                deterministic value noise + fbm
    heightmap.py            table constants, coastline, terraced height, is_land
    placement.py            seeded scatter and along-polyline sampling
    layout.py               roads, village houses, places registry, exclusion zones
  scene/
    __init__.py
    common.py               bpy helpers: reset, collections, meshes, materials, join, smooth
    terrain.py              terrain grid, skirt, board, table
    sea.py                  the sea plane and its material
    flora.py                five tree archetypes and the scatter pass
    buildings.py            house vocabulary, village, plaza, roads
    places.py               the nine places' geometry
    lighting.py             sun + sky per time of day, emissive strengths
    cameras.py              authored shots, look_at, render config
  tests/
    test_palette.py
    test_noise.py
    test_heightmap.py
    test_placement.py
    test_layout.py
  out/                      ignored: world.blend, preview.png
public/world/stills/        committed: the approval stills (webp)
```

Coordinate system: Blender, z up. The table is 24 by 16 units, x from -12 to 12 (east positive), y from -8 to 8 (inland positive). Sea is toward negative y. One unit is roughly one village house width.

---

### Task 1: Scaffold, palette module, test harness

**Files:**

- Create: `tools/world/blender.sh`
- Create: `tools/world/lib/__init__.py`, `tools/world/scene/__init__.py`, `tools/world/tests/__init__.py`
- Create: `tools/world/lib/palette.py`
- Create: `tools/world/tests/test_palette.py`
- Modify: `package.json` (scripts)
- Modify: `.gitignore`

**Interfaces:**

- Produces: `palette.hex_to_linear(h: str) -> tuple[float, float, float]`, `palette.mix(a, b, t)`, `palette.shade(c, k)`, `palette.rgba(c, alpha=1.0) -> tuple[4 floats]`, and the constants `PAPER, INK, BARK, AMBER, FOLIAGE, SEA, FIELD, FADED, STONE, STONE_DARK, EARTH, SAND, GRASS, GRASS_DRY, ROAD, OLIVE, CYPRESS, PINE, CEDAR, PALM, TRUNK, ROOF, ROOF_INK, SEA_SHALLOW, SEA_DEEP, WINDOW, LANTERN`.

- [ ] **Step 1: Write the failing palette test**

`tools/world/tests/test_palette.py`:

```python
import unittest

from lib import palette


class PaletteTest(unittest.TestCase):
    def test_black_and_white_convert_exactly(self):
        self.assertEqual(palette.hex_to_linear("#000000"), (0.0, 0.0, 0.0))
        self.assertEqual(palette.hex_to_linear("#FFFFFF"), (1.0, 1.0, 1.0))

    def test_srgb_curve_is_applied(self):
        r, g, b = palette.hex_to_linear("#808080")
        self.assertAlmostEqual(r, 0.2158, places=3)
        self.assertEqual(r, g)
        self.assertEqual(g, b)

    def test_tokens_match_styles_css(self):
        self.assertEqual(palette.TOKENS["paper"], "#F9F1E5")
        self.assertEqual(palette.TOKENS["ink"], "#9B0D17")
        self.assertEqual(len(palette.TOKENS), 8)

    def test_mix_endpoints_and_midpoint(self):
        a, b = (0.0, 0.0, 0.0), (1.0, 0.5, 0.0)
        self.assertEqual(palette.mix(a, b, 0.0), a)
        self.assertEqual(palette.mix(a, b, 1.0), b)
        self.assertEqual(palette.mix(a, b, 0.5), (0.5, 0.25, 0.0))

    def test_shade_scales_every_channel(self):
        self.assertEqual(palette.shade((1.0, 0.5, 0.2), 0.5), (0.5, 0.25, 0.1))

    def test_rgba_appends_alpha(self):
        self.assertEqual(palette.rgba((0.1, 0.2, 0.3)), (0.1, 0.2, 0.3, 1.0))
        self.assertEqual(palette.rgba((0.1, 0.2, 0.3), 0.5), (0.1, 0.2, 0.3, 0.5))

    def test_derived_shades_stay_in_range(self):
        for name in ("STONE_DARK", "EARTH", "SAND", "GRASS", "OLIVE", "CYPRESS", "CEDAR", "ROOF", "SEA_DEEP"):
            for channel in getattr(palette, name):
                self.assertGreaterEqual(channel, 0.0, name)
                self.assertLessEqual(channel, 1.0, name)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Create the package markers and run the test to see it fail**

```bash
mkdir -p tools/world/lib tools/world/scene tools/world/tests tools/world/out
touch tools/world/lib/__init__.py tools/world/scene/__init__.py tools/world/tests/__init__.py
python3 -m unittest discover -s tools/world/tests -t tools/world
```

Expected: `ImportError` or `AttributeError` on `lib.palette`.

- [ ] **Step 3: Write the palette module**

`tools/world/lib/palette.py`:

```python
"""The card's colour tokens, as Blender wants them.

Hex values are copied from the @theme block in src/styles.css. Blender materials
take linear RGB, so every token is converted once here. Derived shades are named
mixes of tokens, never new hex values, so the world stays in the card's family.
"""

TOKENS = {
    "paper": "#F9F1E5",
    "ink": "#9B0D17",
    "bark": "#3E2F26",
    "amber": "#D89353",
    "foliage": "#809B47",
    "sea": "#C6D6D5",
    "field": "#DFCDB4",
    "faded": "#6B5445",
}


def _srgb_to_linear(c: float) -> float:
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (_srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b))


def mix(a, b, t: float):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, k: float):
    return tuple(min(1.0, max(0.0, v * k)) for v in c)


def rgba(c, alpha: float = 1.0):
    return (c[0], c[1], c[2], alpha)


PAPER = hex_to_linear(TOKENS["paper"])
INK = hex_to_linear(TOKENS["ink"])
BARK = hex_to_linear(TOKENS["bark"])
AMBER = hex_to_linear(TOKENS["amber"])
FOLIAGE = hex_to_linear(TOKENS["foliage"])
SEA = hex_to_linear(TOKENS["sea"])
FIELD = hex_to_linear(TOKENS["field"])
FADED = hex_to_linear(TOKENS["faded"])

# Ground and stone
STONE = FIELD
STONE_DARK = mix(FIELD, BARK, 0.35)
EARTH = mix(BARK, FIELD, 0.45)
SAND = mix(FIELD, SEA, 0.3)
GRASS = mix(FOLIAGE, FIELD, 0.5)
GRASS_DRY = mix(FOLIAGE, FIELD, 0.72)
ROAD = mix(FIELD, BARK, 0.25)

# Flora
OLIVE = mix(FOLIAGE, SEA, 0.3)
CYPRESS = shade(FOLIAGE, 0.55)
PINE = shade(FOLIAGE, 0.8)
CEDAR = mix(shade(FOLIAGE, 0.6), SEA, 0.2)
PALM = mix(FOLIAGE, AMBER, 0.2)
TRUNK = BARK

# Built
ROOF = mix(AMBER, BARK, 0.45)
ROOF_INK = INK
WINDOW = shade(BARK, 0.5)
LANTERN = AMBER

# Water
SEA_SHALLOW = SEA
SEA_DEEP = shade(SEA, 0.55)
```

- [ ] **Step 4: Run the tests and see them pass**

```bash
python3 -m unittest discover -s tools/world/tests -t tools/world
```

Expected: `OK` with 7 tests.

- [ ] **Step 5: Add the Blender wrapper, pnpm scripts and gitignore**

`tools/world/blender.sh`:

```sh
#!/bin/sh
# Runs Blender headless. Override the binary with BLENDER=/path/to/blender.
exec "${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}" "$@"
```

```bash
chmod +x tools/world/blender.sh
```

Add to `package.json` `scripts` (then run `pnpm format` so oxfmt's `sortPackageJson` settles the order):

```json
"world:build": "tools/world/blender.sh -b --python tools/world/build_world.py -- --out tools/world/out",
"world:preview": "tools/world/blender.sh -b --python tools/world/build_world.py -- --out tools/world/out --preview",
"world:stills": "tools/world/blender.sh -b --python tools/world/stills.py -- --out public/world/stills",
"world:stills:preview": "tools/world/blender.sh -b --python tools/world/stills.py -- --out tools/world/out/stills --preview",
"world:test": "python3 -m unittest discover -s tools/world/tests -t tools/world"
```

Append to `.gitignore`:

```
# Blender world build outputs; regenerate with pnpm world:build
tools/world/out/
```

- [ ] **Step 6: Verify the scripts resolve and commit**

```bash
pnpm format && pnpm world:test && tools/world/blender.sh --version | head -1
git add tools/world package.json .gitignore
git commit -m "feat(world): scaffold the Blender diorama tooling and the card palette

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

Expected: tests `OK`, `Blender 5.2.1 LTS` printed.

---

### Task 2: Noise and heightmap

**Files:**

- Create: `tools/world/lib/noise.py`, `tools/world/lib/heightmap.py`
- Create: `tools/world/tests/test_noise.py`, `tools/world/tests/test_heightmap.py`

**Interfaces:**

- Produces: `noise.value_noise(x, y, seed=0) -> float in [0,1]`, `noise.fbm(x, y, octaves=4, lacunarity=2.0, gain=0.5, seed=0) -> float in [0,1]`.
- Produces: `heightmap.TABLE_W = 24.0`, `TABLE_D = 16.0`, `SEA_LEVEL = 0.0`, `TERRACE_STEP = 0.35`, `TERRACE_BAND = (-1.0, 4.0)`, `VILLAGE = (3.0, 2.5)`, `heightmap.coastline(x) -> y`, `heightmap.height(x, y) -> z`, `heightmap.is_land(x, y) -> bool`, `heightmap.smoothstep(a, b, t)`.

- [ ] **Step 1: Write the failing noise test**

`tools/world/tests/test_noise.py`:

```python
import unittest

from lib import noise


class NoiseTest(unittest.TestCase):
    def test_deterministic(self):
        self.assertEqual(noise.value_noise(1.3, 4.7, seed=9), noise.value_noise(1.3, 4.7, seed=9))
        self.assertEqual(noise.fbm(1.3, 4.7, seed=9), noise.fbm(1.3, 4.7, seed=9))

    def test_seed_changes_output(self):
        self.assertNotEqual(noise.value_noise(1.3, 4.7, seed=1), noise.value_noise(1.3, 4.7, seed=2))

    def test_in_unit_range(self):
        for i in range(200):
            x, y = i * 0.37, i * 0.91
            self.assertTrue(0.0 <= noise.value_noise(x, y) <= 1.0)
            self.assertTrue(0.0 <= noise.fbm(x, y) <= 1.0)

    def test_continuous(self):
        a, b = noise.fbm(2.0, 2.0), noise.fbm(2.001, 2.0)
        self.assertLess(abs(a - b), 0.02)

    def test_not_flat(self):
        values = {round(noise.fbm(i * 0.5, i * 0.25), 3) for i in range(40)}
        self.assertGreater(len(values), 20)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Write the failing heightmap test**

`tools/world/tests/test_heightmap.py`:

```python
import math
import unittest

from lib import heightmap as hm


class HeightmapTest(unittest.TestCase):
    def test_table_constants(self):
        self.assertEqual((hm.TABLE_W, hm.TABLE_D), (24.0, 16.0))
        self.assertEqual(hm.TERRACE_BAND, (-1.0, 4.0))

    def test_coastline_stays_near_shore_line(self):
        for x in range(-12, 13):
            self.assertLess(abs(hm.coastline(x) - hm.SHORE_Y), 1.0)

    def test_sea_is_below_sea_level_and_land_above(self):
        for x in (-10, -4, 0, 4, 10):
            self.assertLess(hm.height(x, -7.0), hm.SEA_LEVEL)
            self.assertGreater(hm.height(x, 2.0), hm.SEA_LEVEL + 0.2)
        self.assertFalse(hm.is_land(0, -6))
        self.assertTrue(hm.is_land(0, 5))

    def test_ridge_is_the_highest_ground(self):
        ridge = max(hm.height(x, 6.5) for x in range(-11, 12))
        foothills = max(hm.height(x, 1.0) for x in range(-11, 12))
        self.assertGreater(ridge, 4.0)
        self.assertGreater(ridge, foothills + 1.5)

    def test_terraces_quantise_inside_the_band(self):
        # Well inside the band the fade weight is 1, so heights sit 0.04 above a step.
        for x in (-8.0, -3.0, 0.5, 6.0, 9.0):
            for y in (-0.5, 0.8, 2.0, 2.9):
                h = hm.height(x, y)
                if h <= 0.05:
                    continue
                remainder = (h - 0.04) / hm.TERRACE_STEP
                self.assertAlmostEqual(remainder, round(remainder), places=5, msg=f"{x},{y}")

    def test_no_quantisation_outside_the_band(self):
        h = hm.height(0.5, 5.5)
        remainder = (h - 0.04) / hm.TERRACE_STEP
        self.assertNotAlmostEqual(remainder, round(remainder), places=3)

    def test_village_knoll_rises_above_its_surroundings(self):
        vx, vy = hm.VILLAGE
        self.assertGreater(hm.height(vx, vy), hm.height(vx - 4.0, vy) + 0.3)

    def test_finite_everywhere(self):
        for i in range(0, 241, 8):
            for j in range(0, 161, 8):
                z = hm.height(-12 + i * 0.1, -8 + j * 0.1)
                self.assertTrue(math.isfinite(z))
                self.assertLess(z, 8.0)
                self.assertGreater(z, -1.0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run to see both fail**

```bash
pnpm world:test
```

Expected: import errors for `lib.noise` and `lib.heightmap`.

- [ ] **Step 4: Write the noise module**

`tools/world/lib/noise.py`:

```python
"""Deterministic value noise. No dependencies, so it runs identically under
system Python and Blender's interpreter, and the same seed always gives the
same world."""

import math

_MASK = 0xFFFFFFFF


def _hash(ix: int, iy: int, seed: int) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & _MASK
    n = ((n ^ (n >> 13)) * 1274126177) & _MASK
    n = (n ^ (n >> 16)) & _MASK
    return n / _MASK


def _smooth(t: float) -> float:
    return t * t * (3.0 - 2.0 * t)


def value_noise(x: float, y: float, seed: int = 0) -> float:
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    a = _hash(ix, iy, seed)
    b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed)
    d = _hash(ix + 1, iy + 1, seed)
    u, v = _smooth(fx), _smooth(fy)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def fbm(x: float, y: float, octaves: int = 4, lacunarity: float = 2.0, gain: float = 0.5, seed: int = 0) -> float:
    amplitude, frequency, total, norm = 1.0, 1.0, 0.0, 0.0
    for i in range(octaves):
        total += amplitude * value_noise(x * frequency, y * frequency, seed + i)
        norm += amplitude
        amplitude *= gain
        frequency *= lacunarity
    return total / norm
```

- [ ] **Step 5: Write the heightmap module**

`tools/world/lib/heightmap.py`:

```python
"""The shape of the table.

Sea toward negative y, a wobbling coastline near SHORE_Y, terraced groves rising
inland, a knoll for the village, and a ridge along the back. Every number that
shapes the land is a named constant here so the look can be tuned in one place.
"""

import math

from . import noise

TABLE_W, TABLE_D = 24.0, 16.0
SEA_LEVEL = 0.0
SHORE_Y = -3.0
TERRACE_STEP = 0.35
TERRACE_BAND = (-1.0, 4.0)
RIDGE_Y, RIDGE_H = 6.5, 3.6
INLAND_RISE, INLAND_REACH = 2.4, 4.5
VILLAGE = (3.0, 2.5)


def smoothstep(a: float, b: float, t: float) -> float:
    if t <= a:
        return 0.0
    if t >= b:
        return 1.0
    u = (t - a) / (b - a)
    return u * u * (3.0 - 2.0 * u)


def coastline(x: float) -> float:
    """y of the water's edge at this x. Wobbles up to 0.9 either side of SHORE_Y."""
    return SHORE_Y + (noise.fbm(x * 0.18 + 7.3, 0.0, octaves=3, seed=11) - 0.5) * 1.8


def base_height(x: float, y: float) -> float:
    d = y - coastline(x)
    if d <= 0:
        return -0.6 * smoothstep(0.0, 2.5, -d)
    # Saturating rise, so the land behind the ridge falls away instead of climbing to the edge.
    ramp = INLAND_RISE * (1.0 - math.exp(-d / INLAND_REACH))
    ridge = RIDGE_H * math.exp(-(((y - RIDGE_Y) / 2.2) ** 2)) * (0.75 + 0.25 * noise.fbm(x * 0.25, 3.1, seed=5))
    vx, vy = VILLAGE
    knoll = 1.1 * math.exp(-(((x - vx) / 2.6) ** 2 + ((y - vy) / 1.9) ** 2))
    rough = 0.35 * (noise.fbm(x * 0.6, y * 0.6, seed=2) - 0.5) * smoothstep(0.0, 1.5, d)
    return ramp + ridge + knoll + rough


def height(x: float, y: float) -> float:
    h = base_height(x, y)
    lo, hi = TERRACE_BAND
    if lo <= y <= hi and h > 0.05:
        weight = 1.0 - smoothstep(hi - 0.8, hi, y)
        stepped = math.floor(h / TERRACE_STEP) * TERRACE_STEP + 0.04
        return h * (1.0 - weight) + stepped * weight
    return h


def is_land(x: float, y: float) -> bool:
    return height(x, y) > SEA_LEVEL + 0.02
```

- [ ] **Step 6: Run the tests and see them pass**

```bash
pnpm world:test
```

Expected: `OK`, 20 tests. If `test_ridge_is_the_highest_ground` fails, raise `RIDGE_H` by 0.4; if `test_finite_everywhere` fails on the upper bound, lower `INLAND_RISE`; if `test_sea_is_below_sea_level_and_land_above` fails at `y=2.0`, lower `SHORE_Y` toward -3.5. Do not loosen the tests.

- [ ] **Step 7: Commit**

```bash
git add tools/world/lib tools/world/tests
git commit -m "feat(world): deterministic noise and the terraced heightmap of the table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 3: Scatter and layout (pure data for flora, roads, village, places)

**Files:**

- Create: `tools/world/lib/placement.py`, `tools/world/lib/layout.py`
- Create: `tools/world/tests/test_placement.py`, `tools/world/tests/test_layout.py`

**Interfaces:**

- Produces: `placement.scatter(bounds, spacing, density, seed, exclude=(), jitter=0.45) -> list[(x, y, scale, yaw)]`; `placement.along(polyline, step, offset, seed) -> list[(x, y, yaw)]`; `placement.resample(polyline, step) -> list[(x, y)]`.
- Produces: `layout.COAST_ROAD`, `layout.HILL_ROAD` (lists of `(x, y)`), `layout.SQUARE_RADIUS`, `layout.village_houses(seed=3) -> list[dict(x, y, w, d, h, yaw)]`, `layout.PLACES: dict[id, dict(label, pos)]` with the nine ids `shore, hill, garden, post, hotel, harbour, cedars, steps, square`, `layout.exclusions() -> list[(x, y, radius)]`.

- [ ] **Step 1: Write the failing placement test**

`tools/world/tests/test_placement.py`:

```python
import unittest

from lib import placement


class ScatterTest(unittest.TestCase):
    bounds = (-2.0, -2.0, 2.0, 2.0)

    def test_deterministic(self):
        a = placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=4)
        b = placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=4)
        self.assertEqual(a, b)

    def test_density_zero_gives_nothing(self):
        self.assertEqual(placement.scatter(self.bounds, 0.5, lambda x, y: 0.0, seed=1), [])

    def test_density_one_fills_the_grid(self):
        pts = placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=1)
        self.assertEqual(len(pts), 64)

    def test_points_stay_in_bounds_and_carry_scale_and_yaw(self):
        for x, y, scale, yaw in placement.scatter(self.bounds, 0.5, lambda x, y: 1.0, seed=2):
            self.assertTrue(-2.3 <= x <= 2.3 and -2.3 <= y <= 2.3)
            self.assertTrue(0.8 <= scale <= 1.2)
            self.assertTrue(0.0 <= yaw <= 6.3)

    def test_exclusion_discs_are_respected(self):
        pts = placement.scatter(self.bounds, 0.25, lambda x, y: 1.0, seed=3, exclude=[(0.0, 0.0, 1.0)])
        self.assertTrue(all(x * x + y * y >= 1.0 for x, y, _, _ in pts))
        self.assertGreater(len(pts), 100)


class AlongTest(unittest.TestCase):
    line = [(0.0, 0.0), (4.0, 0.0), (4.0, 3.0)]

    def test_resample_walks_the_polyline(self):
        pts = placement.resample(self.line, 1.0)
        self.assertEqual(pts[0], (0.0, 0.0))
        self.assertAlmostEqual(pts[-1][0], 4.0, places=5)
        self.assertEqual(len(pts), 8)

    def test_along_alternates_sides(self):
        pts = placement.along(self.line, 1.0, 0.3, seed=1)
        self.assertEqual(len(pts), 8)
        ys = [round(y, 3) for x, y, yaw in pts[:4]]
        self.assertEqual(sorted(set(ys)), [-0.3, 0.3])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Write the failing layout test**

`tools/world/tests/test_layout.py`:

```python
import math
import unittest

from lib import heightmap as hm
from lib import layout


class LayoutTest(unittest.TestCase):
    def test_nine_places_with_the_spec_ids(self):
        self.assertEqual(
            set(layout.PLACES), {"shore", "hill", "garden", "post", "hotel", "harbour", "cedars", "steps", "square"}
        )
        for place in layout.PLACES.values():
            self.assertTrue(place["label"])

    def test_places_sit_on_land_except_the_harbour(self):
        for pid, place in layout.PLACES.items():
            x, y = place["pos"]
            if pid == "harbour":
                self.assertFalse(hm.is_land(x, y), pid)
            else:
                self.assertTrue(hm.is_land(x, y), pid)

    def test_roads_are_on_land(self):
        for x, y in layout.COAST_ROAD + layout.HILL_ROAD:
            self.assertTrue(hm.is_land(x, y), (x, y))

    def test_hill_road_ends_at_the_square(self):
        vx, vy = hm.VILLAGE
        x, y = layout.HILL_ROAD[-1]
        self.assertLess(math.hypot(x - vx, y - vy), layout.SQUARE_RADIUS + 0.2)

    def test_village_houses_are_many_and_do_not_overlap(self):
        houses = layout.village_houses()
        self.assertGreaterEqual(len(houses), 28)
        vx, vy = hm.VILLAGE
        for i, a in enumerate(houses):
            self.assertGreater(math.hypot(a["x"] - vx, a["y"] - vy), layout.SQUARE_RADIUS)
            self.assertTrue(hm.is_land(a["x"], a["y"]))
            for b in houses[i + 1 :]:
                gap = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
                self.assertGreater(gap, (max(a["w"], a["d"]) + max(b["w"], b["d"])) / 2)

    def test_exclusions_cover_every_place_and_house(self):
        zones = layout.exclusions()
        for place in layout.PLACES.values():
            x, y = place["pos"]
            self.assertTrue(any(math.hypot(x - zx, y - zy) <= r for zx, zy, r in zones))
        for h in layout.village_houses():
            self.assertTrue(any(math.hypot(h["x"] - zx, h["y"] - zy) <= r for zx, zy, r in zones))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 3: Run to see both fail**

```bash
pnpm world:test
```

Expected: import errors for `lib.placement` and `lib.layout`.

- [ ] **Step 4: Write the placement module**

`tools/world/lib/placement.py`:

```python
"""Where things go. Seeded, so the groves never move between builds."""

import math
import random


def scatter(bounds, spacing, density, seed, exclude=(), jitter=0.45):
    """Jittered-grid scatter. `density(x, y)` is the keep probability in [0, 1].
    `exclude` is a list of (x, y, radius) discs nothing may land in.
    Returns (x, y, scale, yaw) tuples."""
    rng = random.Random(seed)
    x0, y0, x1, y1 = bounds
    nx, ny = int((x1 - x0) / spacing), int((y1 - y0) / spacing)
    points = []
    for j in range(ny):
        for i in range(nx):
            x = x0 + (i + 0.5) * spacing + rng.uniform(-jitter, jitter) * spacing
            y = y0 + (j + 0.5) * spacing + rng.uniform(-jitter, jitter) * spacing
            keep = rng.random() <= density(x, y)
            scale = rng.uniform(0.8, 1.2)
            yaw = rng.uniform(0.0, math.tau)
            if not keep:
                continue
            if any((x - ex) ** 2 + (y - ey) ** 2 < r * r for ex, ey, r in exclude):
                continue
            points.append((x, y, scale, yaw))
    return points


def resample(polyline, step):
    """Points every `step` along the polyline, starting at its first vertex."""
    out = [tuple(polyline[0])]
    carry = 0.0
    for (ax, ay), (bx, by) in zip(polyline, polyline[1:]):
        seg = math.hypot(bx - ax, by - ay)
        if seg == 0:
            continue
        t = step - carry
        while t <= seg:
            out.append((ax + (bx - ax) * t / seg, ay + (by - ay) * t / seg))
            t += step
        carry = seg - (t - step)
    return out


def along(polyline, step, offset, seed):
    """Points every `step` along the polyline, pushed `offset` to alternating
    sides. Returns (x, y, yaw) with yaw facing along the line."""
    rng = random.Random(seed)
    pts = resample(polyline, step)
    out = []
    for i, (x, y) in enumerate(pts):
        nx_, ny_ = pts[min(i + 1, len(pts) - 1)]
        px, py = pts[max(i - 1, 0)]
        tx, ty = nx_ - px, ny_ - py
        length = math.hypot(tx, ty) or 1.0
        tx, ty = tx / length, ty / length
        side = 1.0 if i % 2 == 0 else -1.0
        out.append((x - ty * offset * side, y + tx * offset * side, math.atan2(ty, tx) + rng.uniform(-0.1, 0.1)))
    return out
```

- [ ] **Step 5: Write the layout module**

`tools/world/lib/layout.py`:

```python
"""Roads, the village, and the nine places from the spec.

Positions are in table units. Anything that must agree with the terrain uses
heightmap.coastline() rather than a hard-coded y, so moving the shore moves the
things that stand on it.
"""

import math
import random

from . import heightmap as hm
from . import placement

COAST_OFFSET = 1.3
SQUARE_RADIUS = 0.9

COAST_ROAD = [(x * 0.5, hm.coastline(x * 0.5) + COAST_OFFSET) for x in range(-24, 25)]

HILL_ROAD = [
    (-0.5, hm.coastline(-0.5) + COAST_OFFSET),
    (0.6, 0.6),
    (1.9, 1.2),
    (1.2, 2.0),
    (2.4, 2.8),
    (3.0, 2.5),
]

PLACES = {
    "shore": {"label": "By the sea", "pos": (-5.0, hm.coastline(-5.0) + 0.55)},
    "hill": {"label": "On the hill", "pos": hm.VILLAGE},
    "garden": {"label": "In the garden", "pos": (-2.5, 3.6)},
    "post": {"label": "The post house", "pos": (0.4, 0.2)},
    "hotel": {"label": "Where to stay", "pos": (6.5, 0.6)},
    "harbour": {"label": "Getting there", "pos": (5.5, hm.coastline(5.5) - 0.9)},
    "cedars": {"label": "Things to do", "pos": (-6.0, 6.4)},
    "steps": {"label": "Registry", "pos": (3.6, 2.9)},
    "square": {"label": "Questions", "pos": (2.6, 2.1)},
}

PLACE_RADIUS = {
    "shore": 1.4,
    "hill": 1.3,
    "garden": 1.9,
    "post": 0.8,
    "hotel": 1.7,
    "harbour": 1.2,
    "cedars": 0.6,
    "steps": 0.5,
    "square": 0.6,
}


def _near_road(x, y, radius=0.32):
    for ax, ay in placement.resample(COAST_ROAD, 0.2) + placement.resample(HILL_ROAD, 0.2):
        if math.hypot(x - ax, y - ay) < radius:
            return True
    return False


def village_houses(seed=3):
    """Houses ring the square and spill downhill. Deterministic for a seed."""
    rng = random.Random(seed)
    vx, vy = hm.VILLAGE
    houses = []
    attempts = 0
    while len(houses) < 34 and attempts < 4000:
        attempts += 1
        r = rng.uniform(SQUARE_RADIUS + 0.55, 3.3)
        a = rng.uniform(0.0, math.tau)
        x, y = vx + math.cos(a) * r, vy + math.sin(a) * r * 0.8
        w, d, h = rng.uniform(0.55, 0.95), rng.uniform(0.5, 0.8), rng.uniform(0.42, 0.78)
        if not hm.is_land(x, y) or hm.height(x, y) < 0.3:
            continue
        if _near_road(x, y, 0.45):
            continue
        if any(math.hypot(x - o["x"], y - o["y"]) <= (max(w, d) + max(o["w"], o["d"])) / 2 + 0.12 for o in houses):
            continue
        yaw = math.atan2(vy - y, vx - x) + rng.uniform(-0.25, 0.25)
        houses.append({"x": x, "y": y, "w": w, "d": d, "h": h, "yaw": yaw})
    return houses


def exclusions():
    """Discs nothing may be scattered into: places, houses, roads, the square."""
    zones = [(p["pos"][0], p["pos"][1], PLACE_RADIUS[pid]) for pid, p in PLACES.items()]
    zones.append((hm.VILLAGE[0], hm.VILLAGE[1], SQUARE_RADIUS + 0.2))
    zones += [(h["x"], h["y"], max(h["w"], h["d"]) * 0.8) for h in village_houses()]
    zones += [(x, y, 0.3) for x, y in placement.resample(COAST_ROAD, 0.3)]
    zones += [(x, y, 0.3) for x, y in placement.resample(HILL_ROAD, 0.3)]
    return zones
```

- [ ] **Step 6: Run the tests and see them pass**

```bash
pnpm world:test
```

Expected: `OK`, 33 tests. If `test_places_sit_on_land_except_the_harbour` fails for `garden` or `cedars`, the terrain there is below sea level or above the table; nudge the `pos` y inland by 0.3 and rerun. If `test_village_houses_are_many_and_do_not_overlap` returns fewer than 28, raise the outer radius `3.3` to `3.6`.

- [ ] **Step 7: Commit**

```bash
git add tools/world/lib tools/world/tests
git commit -m "feat(world): seeded scatter, the roads, the village and the nine places

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 4: Blender helpers, terrain, sea, board, and the first preview render

**Files:**

- Create: `tools/world/scene/common.py`, `tools/world/scene/terrain.py`, `tools/world/scene/sea.py`, `tools/world/scene/cameras.py`
- Create: `tools/world/build_world.py`

**Interfaces:**

- Produces (`common`): `reset_scene()`, `collection(name) -> bpy.types.Collection`, `material(name, color, roughness=0.85, emission=None, emission_strength=0.0, alpha=1.0, vertex_color=False) -> Material` (cached by name), `mesh_object(name, verts, faces, coll, materials=(), smooth_deg=None) -> Object`, `box(name, size, location, coll, mat, yaw=0.0)`, `cylinder(name, radius, depth, location, coll, mat, segments=12)`, `cone(name, radius, depth, location, coll, mat, segments=8)`, `icosphere(name, radius, location, coll, mat, subdivisions=1, scale=(1,1,1))`, `move_to(obj, coll)`, `join(objects) -> Object`, `bake_origin(obj)`, `smooth_by_angle(obj, degrees)`, `instance(name, src, location, coll, scale=1.0, yaw=0.0, scale_xyz=None) -> Object` (shared mesh data), `apply_modifiers(obj)`, `place_on_ground(x, y, lift=0.0) -> (x, y, z)`.
- Produces (`terrain`): `build(coll)`; (`sea`): `build(coll)`; (`cameras`): `SHOTS: dict`, `add_camera(name, shot) -> Object`, `configure_render(scene, width, height, samples)`, `mean_luminance(path) -> float`.
- Produces (`build_world`): `build(preview: bool) -> None` and CLI `--out DIR [--preview] [--time NAME]`.

- [ ] **Step 1: Write the Blender helpers**

`tools/world/scene/common.py`:

```python
"""Thin helpers over bpy so the scene modules read as geometry, not API."""

import math

import bpy
from mathutils import Matrix, Vector

from lib import heightmap as hm
from lib import palette

_materials: dict[str, bpy.types.Material] = {}


def reset_scene():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.lights, bpy.data.cameras, bpy.data.images, bpy.data.worlds):
        for item in list(block):
            if block is bpy.data.images and item.name in ("Render Result", "Viewer Node"):
                continue
            block.remove(item)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    _materials.clear()


def collection(name):
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def move_to(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def material(name, color, roughness=0.85, emission=None, emission_strength=0.0, alpha=1.0, vertex_color=False):
    if name in _materials:
        return _materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = palette.rgba(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Alpha"].default_value = alpha
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = palette.rgba(emission)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if vertex_color:
        attr = nodes.new("ShaderNodeVertexColor")
        attr.layer_name = "Col"
        mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    _materials[name] = mat
    return mat


def mesh_object(name, verts, faces, coll, materials=(), smooth_deg=None):
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.validate()
    mesh.update()
    for mat in materials:
        if mat is not None:
            mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    if smooth_deg is not None:
        smooth_by_angle(obj, smooth_deg)
    return obj


def _select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]


def smooth_by_angle(obj, degrees):
    _select_only([obj])
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(degrees))


def join(objects):
    _select_only(objects)
    bpy.ops.object.join()
    return bpy.context.view_layer.objects.active


def bake_origin(obj):
    """Fold the object's transform into its mesh so the origin sits at the world
    origin. A joined prototype keeps its first part's origin otherwise, and every
    instance of it would be placed by that part rather than by the ground."""
    obj.data.transform(obj.matrix_world)
    obj.matrix_world = Matrix.Identity(4)


def apply_modifiers(obj):
    _select_only([obj])
    bpy.ops.object.convert(target="MESH")


def _primitive(op, name, location, coll, mat, **kwargs):
    op(location=location, **kwargs)
    obj = bpy.context.object
    obj.name = name
    move_to(obj, coll)
    if mat is not None:
        obj.data.materials.append(mat)
    return obj


def box(name, size, location, coll, mat, yaw=0.0):
    w, d, h = size
    x, y, z = location
    hw, hd = w / 2, d / 2
    verts = [(-hw, -hd, 0), (hw, -hd, 0), (hw, hd, 0), (-hw, hd, 0), (-hw, -hd, h), (hw, -hd, h), (hw, hd, h), (-hw, hd, h)]
    faces = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    obj = mesh_object(name, verts, faces, coll, [mat])
    obj.location = (x, y, z)
    obj.rotation_euler = (0, 0, yaw)
    return obj


def cylinder(name, radius, depth, location, coll, mat, segments=12):
    return _primitive(bpy.ops.mesh.primitive_cylinder_add, name, location, coll, mat, radius=radius, depth=depth, vertices=segments)


def cone(name, radius, depth, location, coll, mat, segments=8):
    return _primitive(bpy.ops.mesh.primitive_cone_add, name, location, coll, mat, radius1=radius, radius2=0.0, depth=depth, vertices=segments)


def icosphere(name, radius, location, coll, mat, subdivisions=1, scale=(1, 1, 1)):
    obj = _primitive(bpy.ops.mesh.primitive_ico_sphere_add, name, location, coll, mat, radius=radius, subdivisions=subdivisions)
    obj.scale = scale
    return obj


def instance(name, src, location, coll, scale=1.0, yaw=0.0, scale_xyz=None):
    obj = bpy.data.objects.new(name, src.data)
    coll.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (0, 0, yaw)
    obj.scale = scale_xyz if scale_xyz is not None else (scale, scale, scale)
    return obj


def place_on_ground(x, y, lift=0.0):
    return (x, y, hm.height(x, y) + lift)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
```

- [ ] **Step 2: Write the terrain module**

`tools/world/scene/terrain.py`:

```python
"""The land: a heightmap grid with terrace risers in stone, a paper skirt down to
the board, the board itself, and the card it all sits on."""

import bpy

from lib import heightmap as hm
from lib import noise
from lib import palette

from . import common

RES = 0.1
SKIRT_DEPTH = -0.6
BOARD_MARGIN = 0.35
CARD_SIZE = 200.0


def _grid():
    nx, ny = int(hm.TABLE_W / RES) + 1, int(hm.TABLE_D / RES) + 1
    verts, faces = [], []
    for j in range(ny):
        for i in range(nx):
            x, y = -hm.TABLE_W / 2 + i * RES, -hm.TABLE_D / 2 + j * RES
            verts.append((x, y, hm.height(x, y)))
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            faces.append((a, a + 1, a + nx + 1, a + nx))
    return verts, faces, nx, ny


def _material_index(mesh, verts):
    """0 grass, 1 stone riser, 2 sand below the water."""
    for poly in mesh.polygons:
        cz = sum(verts[v][2] for v in poly.vertices) / len(poly.vertices)
        if cz < hm.SEA_LEVEL:
            poly.material_index = 2
        elif poly.normal.z < 0.55:
            poly.material_index = 1
        else:
            poly.material_index = 0


def _grass_colour(mesh, verts):
    col = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    loops = mesh.loops
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            x, y, _ = verts[loops[li].vertex_index]
            t = noise.fbm(x * 0.9, y * 0.9, octaves=3, seed=21)
            col.data[li].color = palette.rgba(palette.mix(palette.GRASS, palette.GRASS_DRY, t))


def build(coll):
    verts, faces, nx, ny = _grid()
    grass = common.material("grass", palette.GRASS, roughness=0.95, vertex_color=True)
    stone = common.material("stone-dark", palette.STONE_DARK, roughness=0.9)
    sand = common.material("sand", palette.SAND, roughness=0.9)
    land = common.mesh_object("terrain", verts, faces, coll, [grass, stone, sand])
    _material_index(land.data, verts)
    _grass_colour(land.data, verts)
    common.smooth_by_angle(land, 40)

    # Skirt: the cut edge of the diorama, in paper, from the rim down to the board.
    paper = common.material("paper", palette.PAPER, roughness=0.7)
    rim = []
    rim += [j * nx for j in range(ny)]
    rim += [(ny - 1) * nx + i for i in range(1, nx)]
    rim += [j * nx + (nx - 1) for j in range(ny - 2, -1, -1)]
    rim += [i for i in range(nx - 2, 0, -1)]
    sverts, sfaces = [], []
    for k, vi in enumerate(rim):
        x, y, z = verts[vi]
        sverts += [(x, y, z), (x, y, SKIRT_DEPTH)]
    n = len(rim)
    for k in range(n):
        a, b = 2 * k, 2 * ((k + 1) % n)
        sfaces.append((a, b, b + 1, a + 1))
    common.mesh_object("skirt", sverts, sfaces, coll, [paper])

    # Board and card.
    hw, hd = hm.TABLE_W / 2 + BOARD_MARGIN, hm.TABLE_D / 2 + BOARD_MARGIN
    board = common.box("board", (2 * hw, 2 * hd, 0.5), (0, 0, SKIRT_DEPTH - 0.5), coll, paper)
    bevel = board.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 4
    common.mesh_object(
        "card",
        [(-CARD_SIZE, -CARD_SIZE, SKIRT_DEPTH - 0.5), (CARD_SIZE, -CARD_SIZE, SKIRT_DEPTH - 0.5), (CARD_SIZE, CARD_SIZE, SKIRT_DEPTH - 0.5), (-CARD_SIZE, CARD_SIZE, SKIRT_DEPTH - 0.5)],
        [(0, 1, 2, 3)],
        coll,
        [paper],
    )
```

- [ ] **Step 3: Write the sea module**

`tools/world/scene/sea.py`:

```python
"""A single plane at sea level. Shallow tone facing the camera, deep tone at
grazing angles, fine ripples from a noise bump. Alpha lets the sand read
through near the shore."""

import bpy

from lib import heightmap as hm
from lib import palette

from . import common


def build(coll):
    hw, hd = hm.TABLE_W / 2, hm.TABLE_D / 2
    z = hm.SEA_LEVEL
    obj = common.mesh_object("sea", [(-hw, -hd, z), (hw, -hd, z), (hw, hd, z), (-hw, hd, z)], [(0, 1, 2, 3)], coll)
    mat = common.material("sea", palette.SEA_SHALLOW, roughness=0.06, alpha=0.82)
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes["Principled BSDF"]

    facing = nodes.new("ShaderNodeLayerWeight")
    facing.inputs["Blend"].default_value = 0.35
    ramp = nodes.new("ShaderNodeMixRGB")
    ramp.inputs["Color1"].default_value = palette.rgba(palette.SEA_SHALLOW)
    ramp.inputs["Color2"].default_value = palette.rgba(palette.SEA_DEEP)
    links.new(facing.outputs["Facing"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    ripple = nodes.new("ShaderNodeTexNoise")
    ripple.inputs["Scale"].default_value = 38.0
    ripple.inputs["Detail"].default_value = 3.0
    bump = nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.06
    links.new(ripple.outputs["Fac"], bump.inputs["Height"])
    links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])

    obj.data.materials.append(mat)
```

- [ ] **Step 4: Write the cameras module with the overview shot and the render config**

`tools/world/scene/cameras.py`:

```python
"""Authored shots and render settings. Every still in the spec is a named shot
here, so the same framing is reproducible and later reusable in the web camera."""

import bpy
from mathutils import Vector

from . import common

# location, target, focal length mm, f-stop. Portrait shots set sensor_fit VERTICAL.
SHOTS = {
    "overview": {"loc": (-14.0, -17.0, 10.5), "target": (0.5, 1.2, 0.8), "focal": 40, "fstop": 2.0},
    "overview_portrait": {"loc": (-16.0, -19.5, 12.0), "target": (0.5, 1.4, 0.8), "focal": 40, "fstop": 2.0, "portrait": True},
    "shore": {"loc": (-8.5, -6.5, 2.4), "target": (-5.0, -2.5, 0.4), "focal": 50, "fstop": 2.8},
    "hill": {"loc": (6.5, -2.5, 4.2), "target": (3.0, 2.5, 1.4), "focal": 55, "fstop": 2.8},
    "garden": {"loc": (-5.8, 0.2, 3.6), "target": (-2.5, 3.6, 0.5), "focal": 50, "fstop": 2.8},
    "post": {"loc": (2.6, -2.6, 1.9), "target": (0.4, 0.2, 0.35), "focal": 60, "fstop": 2.8},
    "harbour": {"loc": (10.0, -6.5, 3.2), "target": (6.0, -0.8, 0.4), "focal": 45, "fstop": 2.8},
}


def add_camera(name, shot):
    cam_data = bpy.data.cameras.new(name)
    cam = bpy.data.objects.new(name, cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = shot["loc"]
    common.look_at(cam, shot["target"])
    cam_data.lens = shot["focal"]
    cam_data.sensor_fit = "VERTICAL" if shot.get("portrait") else "HORIZONTAL"
    cam_data.dof.use_dof = True
    cam_data.dof.focus_distance = (Vector(shot["loc"]) - Vector(shot["target"])).length
    cam_data.dof.aperture_fstop = shot["fstop"]
    return cam


def configure_render(scene, width, height, samples):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "GPU"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"
    prefs.get_devices()
    for device in prefs.devices:
        device.use = device.type == "METAL"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.render.film_transparent = False


def mean_luminance(path):
    """Rough exposure gauge over a rendered file, sampled every 16th pixel."""
    img = bpy.data.images.load(path)
    px = img.pixels[:]
    total, count = 0.0, 0
    for i in range(0, len(px), 64):
        total += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
        count += 1
    bpy.data.images.remove(img)
    return total / count
```

- [ ] **Step 5: Write the build entry point**

`tools/world/build_world.py`:

```python
"""Build the diorama and save it. Run under Blender:

    pnpm world:build              writes tools/world/out/world.blend
    pnpm world:preview            also renders a quick overview to out/preview.png

Everything here is deterministic. Tune the world by editing the modules, never
the .blend.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

from scene import cameras, common, sea, terrain  # noqa: E402


def build():
    common.reset_scene()
    ground = common.collection("Ground")
    terrain.build(ground)
    sea.build(common.collection("Sea"))
    cameras.add_camera("overview", cameras.SHOTS["overview"])
    bpy.context.scene.camera = bpy.data.objects["overview"]
    # Provisional light and sky until Task 8 replaces them.
    light_data = bpy.data.lights.new("sun", "SUN")
    light_data.energy = 3.0
    light_data.angle = 0.03
    sun = bpy.data.objects.new("sun", light_data)
    bpy.context.scene.collection.objects.link(sun)
    sun.rotation_euler = (0.9, 0.0, 0.6)
    world = bpy.data.worlds.new("world")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.7, 0.85, 1.0)
    bpy.context.scene.world = world


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    started = time.time()
    build()
    print(f"BUILD_S {time.time() - started:.1f}")
    print(f"OBJECTS {len(bpy.data.objects)}")

    blend = os.path.join(args.out, "world.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend)
    print(f"SAVED {blend}")

    if args.preview:
        scene = bpy.context.scene
        cameras.configure_render(scene, 640, 360, 32)
        scene.render.image_settings.file_format = "PNG"
        scene.render.filepath = os.path.join(args.out, "preview.png")
        started = time.time()
        bpy.ops.render.render(write_still=True)
        print(f"RENDER_S {time.time() - started:.1f}")
        print(f"LUMINANCE {cameras.mean_luminance(scene.render.filepath):.3f}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: Run the preview and look at it**

```bash
pnpm world:preview 2>&1 | grep -E "^(BUILD_S|OBJECTS|SAVED|RENDER_S|LUMINANCE)|Error|Traceback"
```

Expected: `OBJECTS 7`, `RENDER_S` under 30, `LUMINANCE` between 0.25 and 0.65, no traceback.

Then Read `tools/world/out/preview.png`. Acceptance: a cream slab seen from the south-west with a landmass rising toward the back, a flat pale-teal sea across the front, visible stair-steps in the middle band (the terraces), a darker knoll to the right of centre, and a ridge along the back. No black faces, no holes, the skirt joins the land without a gap. If the terraces are invisible, the sun is too high; set `sun.rotation_euler = (1.1, 0.0, 0.6)` and re-run. If the sea is opaque white, the sea `alpha` is being ignored: confirm the material is on the sea object and re-run.

- [ ] **Step 7: Commit**

```bash
git add tools/world
git commit -m "feat(world): the table, the land and the sea render under Blender

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 5: Flora archetypes and the scatter pass

**Files:**

- Create: `tools/world/scene/flora.py`
- Modify: `tools/world/build_world.py` (call `flora.build`)

**Interfaces:**

- Consumes: `common.*`, `placement.scatter`, `placement.along`, `layout.exclusions`, `layout.COAST_ROAD`, `layout.HILL_ROAD`, `heightmap.*`.
- Produces: `flora.build(coll) -> dict[str, int]` returning instance counts per archetype; archetype prototypes `flora.PROTOTYPES: dict[str, Object]` for `olive, cypress, pine, cedar, palm`.

- [ ] **Step 1: Write the flora module**

`tools/world/scene/flora.py`:

```python
"""Five trees, built once each, instanced hundreds of times with shared mesh
data. Olives on the terraces, cypress along the roads, pines on the upper
slopes, cedars on the ridge, palms along the shore."""

import math
import random

from lib import heightmap as hm
from lib import layout, palette, placement

from . import common

PROTOTYPES = {}


def _trunk(name, radius, height, coll, lean=0.0):
    t = common.cylinder(f"{name}-trunk", radius, height, (0, 0, height / 2), coll, common.material("trunk", palette.TRUNK, 0.95), segments=7)
    t.rotation_euler = (lean, 0, 0)
    return t


def _olive(coll):
    rng = random.Random(101)
    parts = [_trunk("olive", 0.06, 0.55, coll, lean=0.12)]
    canopy = common.material("olive", palette.OLIVE, 0.9)
    for i in range(4):
        ang = i * math.tau / 4 + 0.4
        r = 0.16
        parts.append(
            common.icosphere(
                f"olive-c{i}", rng.uniform(0.3, 0.42), (math.cos(ang) * r, math.sin(ang) * r, 0.8 + rng.uniform(-0.05, 0.1)), coll, canopy, subdivisions=1, scale=(1, 1, 0.75)
            )
        )
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "olive"
    common.smooth_by_angle(obj, 60)
    return obj


def _cypress(coll):
    parts = [_trunk("cypress", 0.04, 0.3, coll)]
    parts.append(common.icosphere("cypress-body", 0.24, (0, 0, 1.4), coll, common.material("cypress", palette.CYPRESS, 0.9), subdivisions=2, scale=(1, 1, 5.5)))
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "cypress"
    common.smooth_by_angle(obj, 60)
    return obj


def _pine(coll):
    parts = [_trunk("pine", 0.05, 0.9, coll)]
    mat = common.material("pine", palette.PINE, 0.9)
    for i, (r, z) in enumerate(((0.55, 0.85), (0.42, 1.2), (0.28, 1.5))):
        parts.append(common.cone(f"pine-t{i}", r, 0.55, (0, 0, z), coll, mat, segments=7))
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "pine"
    common.smooth_by_angle(obj, 45)
    return obj


def _cedar(coll):
    rng = random.Random(202)
    parts = [_trunk("cedar", 0.08, 1.0, coll)]
    mat = common.material("cedar", palette.CEDAR, 0.9)
    for i, (r, z) in enumerate(((0.95, 0.8), (0.75, 1.12), (0.55, 1.42), (0.32, 1.7))):
        parts.append(common.cylinder(f"cedar-t{i}", r, 0.11, (rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), z), coll, mat, segments=9))
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "cedar"
    common.smooth_by_angle(obj, 45)
    return obj


def _palm(coll):
    parts = []
    trunk = common.material("trunk", palette.TRUNK, 0.95)
    for i in range(5):
        z = i * 0.32
        parts.append(common.cylinder(f"palm-s{i}", 0.05, 0.34, (i * i * 0.012, 0, z + 0.16), coll, trunk, segments=6))
    frond = common.material("palm", palette.PALM, 0.85)
    for i in range(7):
        ang = i * math.tau / 7
        length, width = 0.9, 0.22
        verts = [(0, -width / 2, 0), (length, -width / 2 * 0.3, -0.38), (length, width / 2 * 0.3, -0.38), (0, width / 2, 0)]
        f = common.mesh_object(f"palm-f{i}", verts, [(0, 1, 2, 3)], coll, [frond])
        f.location = (0.2, 0, 1.62)
        f.rotation_euler = (0, 0, ang)
    parts += [o for o in coll.objects if o.name.startswith("palm-f")]
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "palm"
    common.smooth_by_angle(obj, 60)
    return obj


def _prototypes(coll):
    PROTOTYPES.update(olive=_olive(coll), cypress=_cypress(coll), pine=_pine(coll), cedar=_cedar(coll), palm=_palm(coll))
    for proto in PROTOTYPES.values():
        proto.location = (0, 0, -20)  # parked under the table; instances carry the mesh
    return PROTOTYPES


def _terrace_density(x, y):
    lo, hi = hm.TERRACE_BAND
    if not hm.is_land(x, y) or not (lo <= y <= hi) or hm.height(x, y) < 0.12:
        return 0.0
    return 0.85


def _pine_density(x, y):
    return 0.55 if hm.is_land(x, y) and 3.9 <= y <= 6.2 else 0.0


def _cedar_density(x, y):
    return 0.6 if hm.is_land(x, y) and 6.0 <= y <= 7.7 else 0.0


def build(coll):
    protos = _prototypes(coll)
    zones = layout.exclusions()
    counts = {}
    hw, hd = hm.TABLE_W / 2 - 0.4, hm.TABLE_D / 2 - 0.4

    def put(kind, x, y, scale, yaw, lift=0.0):
        n = counts.get(kind, 0)
        common.instance(f"{kind}.{n:03d}", protos[kind], common.place_on_ground(x, y, lift), coll, scale=scale, yaw=yaw)
        counts[kind] = n + 1

    for x, y, s, yaw in placement.scatter((-hw, -1.0, hw, 4.0), 0.55, _terrace_density, seed=31, exclude=zones):
        put("olive", x, y, s * 0.95, yaw)
    for x, y, s, yaw in placement.scatter((-hw, 3.8, hw, 6.3), 0.7, _pine_density, seed=32, exclude=zones):
        put("pine", x, y, s, yaw)
    for x, y, s, yaw in placement.scatter((-hw, 6.0, hw, hd), 1.4, _cedar_density, seed=33, exclude=zones):
        put("cedar", x, y, s * 1.1, yaw)
    for x, y, yaw in placement.along(layout.COAST_ROAD, 0.9, 0.3, seed=34) + placement.along(layout.HILL_ROAD, 0.8, 0.3, seed=35):
        if hm.is_land(x, y):
            put("cypress", x, y, 1.0, yaw)
    rng = random.Random(36)
    for x, y in placement.resample(layout.COAST_ROAD, 1.6):
        sy = hm.coastline(x) + 0.35
        if rng.random() < 0.7 and hm.is_land(x, sy):
            put("palm", x, sy, rng.uniform(0.85, 1.15), rng.uniform(0, math.tau))
    return counts
```

- [ ] **Step 2: Wire it into the build**

In `tools/world/build_world.py`, import `flora` alongside the other scene modules and, after `sea.build(...)`, add:

```python
    counts = flora.build(common.collection("Flora"))
    for kind, n in sorted(counts.items()):
        print(f"FLORA {kind} {n}")
```

- [ ] **Step 3: Run the preview and check counts and look**

```bash
pnpm world:preview 2>&1 | grep -E "^(FLORA|BUILD_S|RENDER_S|LUMINANCE)|Error|Traceback"
```

Expected: `FLORA olive` between 220 and 340, `cypress` between 45 and 80, `pine` between 25 and 60, `cedar` between 8 and 20, `palm` between 8 and 16. `BUILD_S` under 60.

Read `tools/world/out/preview.png`. Acceptance: the terrace band reads as groves of small round silver-green trees in loose rows, a line of dark spindles follows the coast road and climbs toward the knoll, a few flat-tiered dark trees stand along the ridge, and palms lean along the shore. Trees stand on the ground, not floating or buried. If a whole species is buried or floating by a constant amount, `bake_origin` was not called after its `join`.

- [ ] **Step 4: Commit**

```bash
git add tools/world
git commit -m "feat(world): five tree archetypes, instanced across the groves, roads and ridge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 6: Houses, the village, the square and the roads

**Files:**

- Create: `tools/world/scene/buildings.py`
- Modify: `tools/world/build_world.py`

**Interfaces:**

- Consumes: `layout.village_houses`, `layout.COAST_ROAD`, `layout.HILL_ROAD`, `layout.SQUARE_RADIUS`, `heightmap.VILLAGE`, `common.*`.
- Produces: `buildings.house(name, x, y, w, d, h, yaw, coll, roof_mat=None, door_mat=None) -> list[Object]`, `buildings.ribbon(name, polyline, width, coll, mat, lift=0.025)`, `buildings.build(coll) -> int` (house count).

- [ ] **Step 1: Write the buildings module**

`tools/world/scene/buildings.py`:

```python
"""A small vocabulary of stone buildings and the roads between them. Everything
is boxes and prisms with a footing sunk into the slope, so nothing floats."""

import math
import random

from lib import heightmap as hm
from lib import layout, palette, placement

from . import common

FOOTING = 0.35


def _hip_roof(name, w, d, h, coll, mat, eave=0.06, pitch=0.42):
    hw, hd = w / 2 + eave, d / 2 + eave
    ridge = min(w, d) * pitch
    along_x = w >= d
    half = (max(w, d) - min(w, d)) / 2
    r0 = (-half, 0, h + ridge) if along_x else (0, -half, h + ridge)
    r1 = (half, 0, h + ridge) if along_x else (0, half, h + ridge)
    verts = [(-hw, -hd, h), (hw, -hd, h), (hw, hd, h), (-hw, hd, h), r0, r1]
    if along_x:
        faces = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4), (0, 3, 2, 1)]
    else:
        faces = [(0, 1, 4), (1, 2, 5, 4), (2, 3, 5), (3, 0, 4, 5), (0, 3, 2, 1)]
    return common.mesh_object(name, verts, faces, coll, [mat])


def house(name, x, y, w, d, h, yaw, coll, roof_mat=None, door_mat=None, windows=True):
    z = hm.height(x, y)
    stone = common.material("stone", palette.STONE, 0.9)
    roof_mat = roof_mat or common.material("roof", palette.ROOF, 0.8)
    door_mat = door_mat or common.material("door", palette.BARK, 0.7)
    window_mat = common.material("window", palette.WINDOW, 0.4, emission=palette.LANTERN, emission_strength=0.0)
    parts = []
    walls = common.box(f"{name}-walls", (w, d, h + FOOTING), (0, 0, -FOOTING), coll, stone)
    parts.append(walls)
    roof = _hip_roof(f"{name}-roof", w, d, h, coll, roof_mat)
    parts.append(roof)
    door = common.box(f"{name}-door", (0.16, 0.03, 0.26), (0, -d / 2 - 0.01, 0), coll, door_mat)
    parts.append(door)
    if windows:
        n = max(1, int(w / 0.32))
        for i in range(n):
            wx = -w / 2 + (i + 0.5) * (w / n)
            if abs(wx) < 0.12:
                continue
            parts.append(common.box(f"{name}-win{i}", (0.1, 0.03, 0.14), (wx, -d / 2 - 0.01, h * 0.45), coll, window_mat))
    for p in parts:
        p.location = (p.location.x, p.location.y, p.location.z + z)
        p.rotation_euler = (0, 0, yaw)
        # rotate the part's local offset about the house origin
        lx, ly = p.location.x, p.location.y
        p.location = (x + lx * math.cos(yaw) - ly * math.sin(yaw), y + lx * math.sin(yaw) + ly * math.cos(yaw), p.location.z)
    return parts


def ribbon(name, polyline, width, coll, mat, lift=0.025):
    pts = placement.resample(polyline, 0.15)
    verts, faces = [], []
    for i, (x, y) in enumerate(pts):
        nx_, ny_ = pts[min(i + 1, len(pts) - 1)]
        px, py = pts[max(i - 1, 0)]
        tx, ty = nx_ - px, ny_ - py
        length = math.hypot(tx, ty) or 1.0
        ox, oy = -ty / length * width / 2, tx / length * width / 2
        verts.append((x + ox, y + oy, hm.height(x + ox, y + oy) + lift))
        verts.append((x - ox, y - oy, hm.height(x - ox, y - oy) + lift))
    for i in range(len(pts) - 1):
        a = 2 * i
        faces.append((a, a + 2, a + 3, a + 1))
    return common.mesh_object(name, verts, faces, coll, [mat], smooth_deg=50)


def _square(coll):
    vx, vy = hm.VILLAGE
    z = hm.height(vx, vy) + 0.03
    segs = 24
    verts = [(vx, vy, z)] + [(vx + math.cos(i * math.tau / segs) * layout.SQUARE_RADIUS, vy + math.sin(i * math.tau / segs) * layout.SQUARE_RADIUS, z) for i in range(segs)]
    faces = [(0, 1 + i, 1 + (i + 1) % segs) for i in range(segs)]
    common.mesh_object("square", verts, faces, coll, [common.material("road", palette.ROAD, 0.95)])


def build(coll):
    road = common.material("road", palette.ROAD, 0.95)
    ribbon("coast-road", layout.COAST_ROAD, 0.34, coll, road)
    ribbon("hill-road", layout.HILL_ROAD, 0.28, coll, road)
    _square(coll)
    houses = layout.village_houses()
    for i, hse in enumerate(houses):
        house(f"house.{i:02d}", hse["x"], hse["y"], hse["w"], hse["d"], hse["h"], hse["yaw"], coll)
    return len(houses)
```

- [ ] **Step 2: Wire into the build**

In `build_world.py`, import `buildings` and after the flora call add:

```python
    print(f"HOUSES {buildings.build(common.collection('Built'))}")
```

- [ ] **Step 3: Run the preview and look**

```bash
pnpm world:preview 2>&1 | grep -E "^(HOUSES|FLORA|RENDER_S|LUMINANCE)|Error|Traceback"
```

Expected: `HOUSES` 28 or more, no traceback.

Read `tools/world/out/preview.png`. Acceptance: a pale road hugs the coast and a second one switchbacks up to a cluster of cream stone houses with muted terracotta roofs around a flat square on the knoll. Houses sit into the slope (footings hidden, no gap under the downhill wall). Doors face roughly toward the square. Roofs overhang the walls slightly. If a roof is inside out (dark), the face winding in `_hip_roof` is reversed for that orientation; flip the tuple order of the offending face.

- [ ] **Step 4: Commit**

```bash
git add tools/world
git commit -m "feat(world): stone houses, the village square and the two roads

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 7: The nine places

**Files:**

- Create: `tools/world/scene/places.py`
- Modify: `tools/world/build_world.py`

**Interfaces:**

- Consumes: `layout.PLACES`, `buildings.house`, `common.*`, `flora.PROTOTYPES` (for the garden's olive rows), `palette.*`.
- Produces: `places.build(coll)` and the lantern material named `"lantern"` (emission `LANTERN`, strength set by `lighting` in Task 8).

- [ ] **Step 1: Write the places module**

`tools/world/scene/places.py`:

```python
"""The nine places from the spec, as archetypes. Venues are unknown, so the hill
venue is a campanile with no cross, the shore venue is a pergola, the garden a
walled grove. Ink red appears only where the spec allows: the two accent roofs,
the post house door and flag, one boat hull."""

import math

import bpy

from lib import heightmap as hm
from lib import layout, palette

from . import buildings, common, flora

LANTERN_RADIUS = 0.035


def _mat(name, color, rough=0.85):
    return common.material(name, color, rough)


def lantern(name, location, coll):
    return common.icosphere(name, LANTERN_RADIUS, location, coll, common.material("lantern", palette.LANTERN, 0.5, emission=palette.LANTERN, emission_strength=0.0), subdivisions=1)


def _shore(coll):
    x, y = layout.PLACES["shore"]["pos"]
    z = hm.height(x, y)
    stone = _mat("stone-dark", palette.STONE_DARK, 0.9)
    wood = _mat("trunk", palette.TRUNK, 0.95)
    common.box("shore-deck", (2.2, 1.5, 0.12 + buildings.FOOTING), (x, y, z - buildings.FOOTING), coll, _mat("stone", palette.STONE))
    for i, (px, py) in enumerate(((-0.9, -0.55), (0, -0.55), (0.9, -0.55), (-0.9, 0.55), (0, 0.55), (0.9, 0.55))):
        common.cylinder(f"shore-post{i}", 0.035, 0.6, (x + px, y + py, z + 0.12 + 0.3), coll, wood, segments=6)
    for i, py in enumerate((-0.55, 0.55)):
        common.box(f"shore-beam{i}", (2.0, 0.06, 0.05), (x, y + py, z + 0.72), coll, wood)
    for i in range(9):
        common.box(f"shore-slat{i}", (0.04, 1.2, 0.03), (x - 0.9 + i * 0.225, y, z + 0.77), coll, wood)
    common.box("shore-wall", (2.3, 0.08, 0.28), (x, y + 0.8, z + 0.12), coll, stone)
    for i, px in enumerate((-0.6, 0.0, 0.6)):
        lantern(f"shore-lantern{i}", (x + px, y, z + 0.66), coll)


def _hill(coll):
    x, y = layout.PLACES["hill"]["pos"]
    z = hm.height(x, y)
    stone = _mat("stone", palette.STONE)
    roof_ink = _mat("roof-ink", palette.ROOF_INK, 0.75)
    # Nave, apse, tower. Sits on the north edge of the square.
    nx_, ny_ = x, y + layout.SQUARE_RADIUS + 0.55
    buildings.house("hill-nave", nx_, ny_, 1.6, 0.9, 0.7, math.pi, coll, roof_mat=roof_ink, windows=False)
    apse = common.cylinder("hill-apse", 0.42, 0.6 + buildings.FOOTING, (nx_, ny_ + 0.45, z - buildings.FOOTING + (0.6 + buildings.FOOTING) / 2), coll, stone, segments=10)
    common.smooth_by_angle(apse, 40)
    tower = common.box("hill-tower", (0.45, 0.45, 1.7 + buildings.FOOTING), (nx_ - 0.95, ny_ - 0.1, z - buildings.FOOTING), coll, stone)
    common.box("hill-belfry", (0.36, 0.36, 0.3), (nx_ - 0.95, ny_ - 0.1, z + 1.7), coll, _mat("window", palette.WINDOW, 0.4))
    common.cone("hill-tower-roof", 0.32, 0.36, (nx_ - 0.95, ny_ - 0.1, z + 2.0 + 0.18), coll, roof_ink, segments=4)
    for i in range(5):  # the registry place: the steps down to the square
        common.box(f"hill-step{i}", (1.0, 0.16, 0.05 * (5 - i)), (nx_, ny_ - 0.45 - 0.16 * i - 0.08, z), coll, stone)
    for i, px in enumerate((-0.6, 0.6)):
        lantern(f"hill-lantern{i}", (x + px, y, z + 0.5), coll)
        common.cylinder(f"hill-lamp{i}", 0.015, 0.5, (x + px, y, z + 0.25), coll, _mat("trunk", palette.TRUNK), segments=5)


def _garden(coll):
    x, y = layout.PLACES["garden"]["pos"]
    z = hm.height(x, y)
    wall = _mat("stone-dark", palette.STONE_DARK, 0.9)
    w, d = 3.2, 2.4
    for i, (sx, sy, sw, sd) in enumerate(((0, -d / 2, w, 0.08), (0, d / 2, w, 0.08), (-w / 2, 0, 0.08, d), (w / 2, 0, 0.08, d))):
        common.box(f"garden-wall{i}", (sw, sd, 0.2 + buildings.FOOTING), (x + sx, y + sy, hm.height(x + sx, y + sy) - buildings.FOOTING), coll, wall)
    basin = common.cylinder("garden-basin", 0.28, 0.14, (x, y, z + 0.07), coll, _mat("stone", palette.STONE), segments=14)
    common.smooth_by_angle(basin, 40)
    water = common.cylinder("garden-water", 0.24, 0.02, (x, y, z + 0.14), coll, _mat("sea-still", palette.SEA_SHALLOW, 0.05), segments=14)
    common.smooth_by_angle(water, 40)
    for i in range(3):
        for j in range(4):
            gx, gy = x - 1.1 + j * 0.73, y - 0.75 + i * 0.75
            if math.hypot(gx - x, gy - y) < 0.45:
                continue
            common.instance(f"garden-olive{i}{j}", flora.PROTOTYPES["olive"], common.place_on_ground(gx, gy), coll, scale=0.72, yaw=(i * 4 + j) * 0.7)
    for i, (lx, ly) in enumerate(((-1.3, -0.9), (1.3, -0.9), (-1.3, 0.9), (1.3, 0.9))):
        lantern(f"garden-lantern{i}", (x + lx, y + ly, hm.height(x + lx, y + ly) + 0.34), coll)


def _post(coll):
    x, y = layout.PLACES["post"]["pos"]
    z = hm.height(x, y)
    ink = _mat("ink", palette.INK, 0.6)
    buildings.house("post-house", x, y, 0.85, 0.7, 0.55, math.radians(20), coll, roof_mat=_mat("roof-ink", palette.ROOF_INK, 0.75), door_mat=ink)
    pole = common.cylinder("post-pole", 0.012, 0.95, (x + 0.6, y - 0.3, z + 0.475), coll, _mat("trunk", palette.TRUNK), segments=5)
    flag = common.mesh_object("post-flag", [(0, 0, 0), (0.28, 0, -0.02), (0.28, 0, -0.18), (0, 0, -0.17)], [(0, 1, 2, 3)], coll, [ink])
    flag.location = (x + 0.6, y - 0.3, z + 0.95)
    common.box("post-box", (0.1, 0.08, 0.14), (x + 0.6, y - 0.3, z + 0.35), coll, ink)


def _hotel(coll):
    x, y = layout.PLACES["hotel"]["pos"]
    z = hm.height(x, y)
    stone = _mat("stone", palette.STONE)
    buildings.house("hotel", x, y, 2.4, 0.95, 1.15, math.radians(-8), coll, windows=False)
    window = common.material("window", palette.WINDOW, 0.4, emission=palette.LANTERN, emission_strength=0.0)
    yaw = math.radians(-8)
    for row in range(3):
        for i in range(7):
            lx, ly, lz = -1.05 + i * 0.35, -0.95 / 2 - 0.01, 0.2 + row * 0.33
            wx = x + lx * math.cos(yaw) - ly * math.sin(yaw)
            wy = y + lx * math.sin(yaw) + ly * math.cos(yaw)
            common.box(f"hotel-win{row}{i}", (0.1, 0.03, 0.15), (wx, wy, z + lz), coll, window, yaw=yaw)
    # Arcade in front: a slab with five arches cut out.
    slab = common.box("hotel-arcade", (2.2, 0.22, 0.5), (0, 0, 0), coll, stone)
    cutters = []
    for i in range(5):
        c = common.cylinder(f"hotel-arch{i}", 0.14, 0.4, (-0.88 + i * 0.44, 0, 0.32), coll, None, segments=12)
        c.rotation_euler = (math.pi / 2, 0, 0)
        cutters.append(c)
        block = common.box(f"hotel-archblock{i}", (0.28, 0.4, 0.32), (-0.88 + i * 0.44, 0, 0), coll, None)
        cutters.append(block)
    for c in cutters:
        m = slab.modifiers.new(c.name, "BOOLEAN")
        m.operation = "DIFFERENCE"
        m.object = c
    common.apply_modifiers(slab)
    for c in cutters:
        bpy.data.objects.remove(c, do_unlink=True)
    # The slab was built at its offset from the house origin; rotate that offset with the house.
    oy = -0.95 / 2 - 0.2
    slab.rotation_euler = (0, 0, yaw)
    slab.location = (x - oy * math.sin(yaw), y + oy * math.cos(yaw), z)


def _harbour(coll):
    x, y = layout.PLACES["harbour"]["pos"]
    stone = _mat("stone-dark", palette.STONE_DARK, 0.9)
    shore_y = hm.coastline(x) + 0.2
    length = shore_y - (y - 0.4)
    mole = common.box("harbour-mole", (0.34, length, 0.9), (x, (shore_y + y - 0.4) / 2, -0.75), coll, stone)
    common.cylinder("harbour-light", 0.11, 0.7, (x, y - 0.35, 0.15 + 0.35), coll, _mat("paper", palette.PAPER, 0.7), segments=10)
    common.cone("harbour-light-roof", 0.15, 0.18, (x, y - 0.35, 0.15 + 0.7 + 0.09), coll, _mat("roof", palette.ROOF, 0.8), segments=10)
    lantern("harbour-lantern", (x, y - 0.35, 0.15 + 0.72), coll)
    hulls = (("paper", palette.PAPER), ("ink", palette.INK), ("paper", palette.PAPER))
    for i, (name, color) in enumerate(hulls):
        bx, by = x + 0.55 + i * 0.28, y + 0.15 - i * 0.35
        common.box(f"harbour-boat{i}", (0.36, 0.14, 0.08), (bx, by, -0.02), coll, _mat(name, color, 0.6), yaw=0.3 * i)
        common.cylinder(f"harbour-mast{i}", 0.012, 0.42, (bx, by, 0.27), coll, _mat("trunk", palette.TRUNK), segments=5)


def _cedars(coll):
    x, y = layout.PLACES["cedars"]["pos"]
    for i, (dx, dy, s) in enumerate(((0, 0, 1.35), (0.9, 0.3, 1.1), (-0.8, 0.5, 1.2))):
        common.instance(f"cedars-grand{i}", flora.PROTOTYPES["cedar"], common.place_on_ground(x + dx, y + dy), coll, scale=s, yaw=i * 1.1)


def build(coll):
    _shore(coll)
    _hill(coll)
    _garden(coll)
    _post(coll)
    _hotel(coll)
    _harbour(coll)
    _cedars(coll)
```

The `steps` and `square` places are the campanile's steps and the village square already built, so they need no geometry of their own.

- [ ] **Step 2: Wire into the build**

In `build_world.py`, import `places` and after the buildings call add:

```python
    places.build(common.collection("Places"))
```

- [ ] **Step 3: Run the preview and look**

```bash
pnpm world:preview 2>&1 | grep -E "^(HOUSES|RENDER_S|LUMINANCE)|Error|Traceback"
```

Expected: no traceback.

Read `tools/world/out/preview.png`. Acceptance: a pergola on a stone deck at the shore left of centre; the campanile with its red roofs on the north side of the square; a walled grove with a basin left of the village; a small red-roofed house with a red flag near the road junction; a long stone hotel with an arcade to the east; a mole with a small lighthouse and three boats in the sea to the east, one hull red. Nothing floats, nothing is buried past its footing. Then also render the `hill` and `post` shots quickly by temporarily setting `scene.camera` in a Blender expression:

```bash
tools/world/blender.sh -b tools/world/out/world.blend --python-expr "
import bpy,sys; sys.path.insert(0,'tools/world')
from scene import cameras
sc=bpy.context.scene
for name in ('hill','post','shore','garden','harbour'):
    cam=cameras.add_camera(name, cameras.SHOTS[name]); sc.camera=cam
    cameras.configure_render(sc, 640, 360, 32); sc.render.filepath=f'tools/world/out/shot-{name}.png'; bpy.ops.render.render(write_still=True)
" 2>&1 | grep -E "Error|Traceback"
```

Read each `tools/world/out/shot-*.png`. Each place should fill the frame with its subject and nothing should intersect wrongly. Adjust positions in `layout.PLACES` or `cameras.SHOTS`, never both at once, and re-run.

- [ ] **Step 4: Commit**

```bash
git add tools/world
git commit -m "feat(world): the nine places, from the pergola on the shore to the cedars on the ridge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 8: Sun, sky and dusk

**Files:**

- Create: `tools/world/scene/lighting.py`
- Modify: `tools/world/build_world.py` (replace the provisional light and world; accept `--time`)

**Interfaces:**

- Consumes: materials named `"window"` and `"lantern"` from Tasks 6 and 7.
- Produces: `lighting.TIMES: dict[str, dict]` with keys `afternoon` and `dusk`; `lighting.setup(scene) -> None` (creates sun and sky once); `lighting.set_time(scene, name) -> None`.

- [ ] **Step 1: Write the lighting module**

`tools/world/scene/lighting.py`:

```python
"""One sun and a physical sky, driven by a named time of day. Dusk is the
spec's hero light: low amber sun, windows and lanterns coming on."""

import math

import bpy

TIMES = {
    "afternoon": {
        "elevation": 38.0,
        "azimuth": 215.0,
        "sun_energy": 3.2,
        "sun_color": (1.0, 0.95, 0.86),
        "sky_strength": 0.12,
        "air": 1.0,
        "ozone": 1.0,
        "exposure": 0.15,
        "windows": 0.0,
        "lanterns": 0.0,
    },
    "dusk": {
        "elevation": 5.0,
        "azimuth": 248.0,
        "sun_energy": 1.4,
        "sun_color": (1.0, 0.7, 0.42),
        "sky_strength": 0.16,
        "air": 1.7,
        "ozone": 1.5,
        "exposure": 0.7,
        "windows": 7.0,
        "lanterns": 12.0,
    },
}


def setup(scene):
    for name in ("sun", "world"):
        if name in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[name], do_unlink=True)
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.angle = math.radians(1.8)
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("sky")
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    sky = nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = False
    sky.altitude = 0.0
    links.new(sky.outputs["Color"], nodes["Background"].inputs["Color"])
    scene.world = world


def set_time(scene, name):
    t = TIMES[name]
    elev, azim = math.radians(t["elevation"]), math.radians(t["azimuth"])

    sun = bpy.data.objects["sun"]
    sun.rotation_euler = (math.pi / 2 - elev, 0.0, azim + math.pi / 2)
    sun.data.energy = t["sun_energy"]
    sun.data.color = t["sun_color"]

    nodes = scene.world.node_tree.nodes
    sky = next(n for n in nodes if n.bl_idname == "ShaderNodeTexSky")
    sky.sun_elevation = elev
    sky.sun_rotation = azim
    sky.sun_intensity = 1.0
    sky.air_density = t["air"]
    sky.ozone_density = t["ozone"]
    nodes["Background"].inputs["Strength"].default_value = t["sky_strength"]

    scene.view_settings.exposure = t["exposure"]

    for mat_name, key in (("window", "windows"), ("lantern", "lanterns")):
        mat = bpy.data.materials.get(mat_name)
        if mat is not None:
            mat.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = t[key]
```

- [ ] **Step 2: Replace the provisional light in the build and accept `--time`**

In `build_world.py`: delete the provisional `light_data`/`sun`/`world` block, import `lighting`, and in `build()` after the places call add:

```python
    lighting.setup(bpy.context.scene)
```

Change `build()` to `build(time_of_day="afternoon")` and end it with `lighting.set_time(bpy.context.scene, time_of_day)`. Add `parser.add_argument("--time", default="afternoon", choices=sorted(lighting.TIMES))` and call `build(args.time)`.

- [ ] **Step 3: Render both times and check exposure**

```bash
pnpm world:preview 2>&1 | grep -E "^(RENDER_S|LUMINANCE)|Error|Traceback"
tools/world/blender.sh -b --python tools/world/build_world.py -- --out tools/world/out --preview --time dusk 2>&1 | grep -E "^(LUMINANCE)|Error|Traceback"
```

Expected: afternoon `LUMINANCE` between 0.32 and 0.55, dusk between 0.18 and 0.38. Adjust `sky_strength` and `exposure` in `TIMES` until both land in range. Change one value at a time and note what you changed in the commit body.

Read the afternoon `preview.png`. Acceptance: warm directional light from the south-west, terrace risers throw readable shadows, the sky is pale blue-white at the horizon, the sea has a soft highlight. The bright side of the sky and the direction the shadows point away from must agree; if the sky glows on the shadowed side, the sun lamp and the sky node disagree about azimuth. Add `math.pi / 2` to the sun's Z rotation in `set_time`, re-render, and repeat once more if needed, until they agree. Read the dusk render (rename the preview between runs, or the second run overwrites it). Acceptance: the sun is low from the west, long shadows across the groves, the sky graded from amber to blue, and every window and lantern glows amber. If windows do not glow, the `"window"` material name differs from the one created in Task 6; align the names.

- [ ] **Step 4: Commit**

```bash
git add tools/world
git commit -m "feat(world): a physical sky and two times of day, with lanterns at dusk

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 9: The stills entry point and the approval renders

**Files:**

- Create: `tools/world/stills.py`
- Create: `public/world/stills/*.webp` (generated)

**Interfaces:**

- Consumes: `build_world.build(time)`, `cameras.SHOTS`, `cameras.add_camera`, `cameras.configure_render`, `cameras.mean_luminance`, `lighting.set_time`, `common.material("paper", ...)`.
- Produces: the still list `stills.STILLS` and files named `<name>.webp`.

- [ ] **Step 1: Write the stills script**

`tools/world/stills.py`:

```python
"""Render the approval stills from the spec.

    pnpm world:stills            full quality into public/world/stills/
    pnpm world:stills:preview    fast, into tools/world/out/stills/

Each still is (name, shot, time, paper). `paper` renders the unpainted maquette
by overriding every material with the paper material, which is what the gate
will show before the password.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import build_world  # noqa: E402
from lib import palette  # noqa: E402
from scene import cameras, common, lighting  # noqa: E402

STILLS = [
    ("overview-afternoon", "overview", "afternoon", False),
    ("overview-dusk", "overview", "dusk", False),
    ("overview-paper", "overview", "afternoon", True),
    ("overview-portrait", "overview_portrait", "afternoon", False),
    ("shore", "shore", "afternoon", False),
    ("hill", "hill", "dusk", False),
    ("garden", "garden", "afternoon", False),
    ("post-house", "post", "afternoon", False),
    ("harbour", "harbour", "dusk", False),
]

FULL = {"width": 1920, "height": 1080, "samples": 384}
PREVIEW = {"width": 640, "height": 360, "samples": 32}


def render(name, shot_name, time_of_day, paper, out, quality):
    scene = bpy.context.scene
    shot = cameras.SHOTS[shot_name]
    cam = bpy.data.objects.get(shot_name) or cameras.add_camera(shot_name, shot)
    scene.camera = cam
    lighting.set_time(scene, time_of_day)

    w, h = quality["width"], quality["height"]
    if shot.get("portrait"):
        w, h = h, w
    cameras.configure_render(scene, w, h, quality["samples"])
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = 90
    scene.render.filepath = os.path.join(out, f"{name}.webp")

    view_layer = bpy.context.view_layer
    view_layer.material_override = common.material("paper", palette.PAPER, 0.7) if paper else None

    started = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"STILL {name} {time.time() - started:.0f}s LUMINANCE {cameras.mean_luminance(scene.render.filepath):.3f}")
    view_layer.material_override = None


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--only", default=None, help="render a single still by name")
    args = parser.parse_args(argv)
    os.makedirs(args.out, exist_ok=True)

    build_world.build("afternoon")
    quality = PREVIEW if args.preview else FULL
    for name, shot, time_of_day, paper in STILLS:
        if args.only and name != args.only:
            continue
        render(name, shot, time_of_day, paper, args.out, quality)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Render the preview set and look at every frame**

```bash
pnpm world:stills:preview 2>&1 | grep -E "^STILL|Error|Traceback"
```

Expected: nine `STILL` lines, none erroring, each under 30 s.

Read all nine files in `tools/world/out/stills/`. Acceptance per frame:

- `overview-afternoon`: the whole table in frame with a little card visible around it, shallow depth of field softening the far ridge and the near sea so it reads as a miniature.
- `overview-dusk`: same framing, amber light, lanterns and windows lit.
- `overview-paper`: the same world entirely in cream with only shading; reads as a folded paper model. The sea is a flat cream sheet.
- `overview-portrait`: the table fits a phone frame with sky above and card below.
- `shore`: the pergola over the water, palms, the coast road behind.
- `hill`: the campanile at dusk, red roofs catching the last light, lanterns on.
- `garden`: the walled grove and basin, village above.
- `post-house`: the red door and flag, the road junction.
- `harbour`: the mole, lighthouse lit, three boats.

Fix framing in `cameras.SHOTS` only. Re-render a single frame with `--only <name>` while iterating.

- [ ] **Step 3: Render at full quality**

```bash
pnpm world:stills 2>&1 | grep -E "^STILL|Error|Traceback"
```

Expected: nine stills in `public/world/stills/`, each between 2 and 6 minutes, files each under 600 KB. If any exceeds 600 KB, lower `quality` to 85 and re-render that one with `--only`.

Read every full still once more; denoised full renders can reveal seams the previews hid (a gap between skirt and land, a roof face inside out). Fix at the source and re-render the affected frame.

- [ ] **Step 4: Commit the script and the stills**

```bash
git add tools/world/stills.py public/world/stills
git commit -m "feat(world): render the approval stills of the diorama

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

---

### Task 10: README, gates, and the review handoff

**Files:**

- Create: `tools/world/README.md`
- Modify: `docs/awaiting.md` (add the two look questions the stills settle)

- [ ] **Step 1: Write the README**

`tools/world/README.md`:

```markdown
# The world

The diorama the guest site is built around, authored as Blender scripts.

## Rules

- Scripts are the source of truth. Nothing in `out/` or `public/world/` is edited by hand.
- Colours come only from the tokens in `src/styles.css`, via `lib/palette.py`. Derived shades are named mixes; no new hex values.
- Ink red is an accent: the hill venue roof, the post house roof, door and flag, one boat hull. Never a filled ground.
- Everything is seeded. Two builds give the same world.
- `lib/` never imports `bpy`, so `pnpm world:test` runs under plain Python.

## Commands

| Command                     | What it does                                             |
| --------------------------- | -------------------------------------------------------- |
| `pnpm world:test`           | Unit tests for the pure geometry modules                 |
| `pnpm world:build`          | Builds `out/world.blend`                                 |
| `pnpm world:preview`        | Builds and renders a fast overview to `out/preview.png`  |
| `pnpm world:stills:preview` | Fast versions of every approval still into `out/stills/` |
| `pnpm world:stills`         | Full-quality stills into `public/world/stills/`          |

`BLENDER=/path/to/blender` overrides the binary. Verified on Blender 5.2.1 LTS with Cycles on Apple Metal.

## Where things are decided

- The land: `lib/heightmap.py` (coast, terraces, knoll, ridge).
- Where trees and houses go: `lib/placement.py`, `lib/layout.py`.
- What things look like: `scene/*.py`.
- Light: `scene/lighting.py` (`afternoon`, `dusk`).
- Framing: `scene/cameras.py`.

## Reading a render

Open the image. Headless Chromium and shader screenshots are not evidence of how
a scene looks; a rendered still is. Judge it at full size and, for the overview,
also at phone size.
```

- [ ] **Step 2: Record the open look questions in the awaiting register**

Append two rows to the **Open** table in `docs/awaiting.md`, numbered after the last existing row, with today's date in the Asked column:

```markdown
| 17 | **Diorama geography**: a real Lebanese ridge and coast, or invented? | The world's terrain and the overview still | invented ridge, archetypal coast | 2026-09-10 |
| 18 | **Diorama look approval** on the phase-one stills in `public/world/stills/` | Any web code for the immersive site | none, stills rendered | 2026-09-10 |
```

- [ ] **Step 3: Full gate and commit**

```bash
pnpm world:test && pnpm lint:check && pnpm typecheck && pnpm test
git add tools/world/README.md docs/awaiting.md
git commit -m "docs(world): how the diorama is built, and the look questions it opens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3"
```

Expected: every command exits 0. `pnpm lint:check` and `pnpm typecheck` do not touch `tools/world` and must stay green because nothing under `src/` changed.

- [ ] **Step 4: Hand the stills to Lucien**

Push the branch and send the nine stills for review. The review question is the spec's phase-one gate, in three parts: does this read as a wedding invitation, does the paper-to-painted pair land as the arrival moment, and which of the four unresolved spec questions (real geography, abstract or literal coast, sea in the paper state, legend always visible) does seeing it settle. No web code starts until the answer is yes.

---

## Self-review against the spec

- **Concept, palette discipline, ink as accent**: Tasks 1, 6, 7 (palette module, roof materials, flag and boat).
- **Paper maquette state**: Task 9 `overview-paper` via `material_override`.
- **Light cycle afternoon to dusk, lanterns and windows**: Task 8.
- **Nine places with the spec's ids and status**: Task 3 registry, Task 7 geometry; `steps` and `square` reuse the campanile steps and the village square, stated in Task 7.
- **Cypress along roads, terraces, olives, cedars on the ridge, sea, shore**: Tasks 2, 4, 5.
- **Approval stills including portrait for the phone**: Task 9.
- **Scripts as source of truth, seeded, no hand edits**: global constraints, README.
- **Phase-one gate before web code**: Task 10 step 4.
- **Not in this plan, deliberately**: bake, glTF export, gltf-transform, KTX2, and anything under `src/`. Those are phase two and start only after approval.

Type and name consistency checked: `common.material` signature is identical in every caller; material names `"window"`, `"lantern"`, `"paper"`, `"roof-ink"`, `"stone"`, `"stone-dark"`, `"trunk"`, `"road"` are spelled the same in Tasks 4 through 9; `cameras.SHOTS` keys match `stills.STILLS`; `layout.PLACES` ids match `test_layout` and `places.py`.

## Amendments during execution

Recorded here so the plan stays truthful; the tasks above are left as written.

- **Task 2, terraces (2026-09-10).** A hard `floor` on a 0.1 grid aliased into teeth wherever a contour ran diagonally, and into rows of pillars on the knoll flank. `heightmap.py` now cuts terraces from `smooth_height` (no roughness), makes each riser a continuous ramp `RISER_WIDTH = 0.16` wide via `terrace(s, k)`, and fades terracing out with `terrace_weight` where the ground is too steep to hold one. New helpers `gradient`, `riser_fraction`, `slope`. Tests updated to match.
- **Task 4, terrain painting.** Stone on risers is painted into the vertex colour by `slope` with a soft edge (`_paint`) instead of a per-face material index, which scalloped. One material `"ground"` replaces `grass`/`stone-dark`/`sand` on the terrain.
- **Task 1, palette.** `GRASS = mix(FOLIAGE, FIELD, 0.22)` and `GRASS_DRY = mix(FOLIAGE, FIELD, 0.5)`; the original halves read as sand under Cycles.
- **Task 4, camera.** Overview pulled back to `(-17, -21, 12.5)` at 35 mm so the whole table and a margin of card fit; portrait likewise.
- **Task 4, provisional sky** strength 0.15 to land luminance in range. Task 8 replaces it.
- **Task 5, trees.** The plan's archetypes rendered two to three times too large and read as a bushy blanket; the cypress tapered to a point at the base, the pines were stacked cones, the palms flat stars. `flora.py` was rewritten: a `_lathe` helper revolves cypress, pine crown and trunks from (radius, height) profiles; olives are five subdivision-2 clumps on a 0.34 trunk; cedars are flattened irregular spheres; fronds are folded tapered strips on a parabola. Olive spacing 0.5 with jitter 0.3. `OLIVE = mix(FOLIAGE, SEA, 0.2)`.
- **Task 6, houses.** Roof `pitch` 0.42 to 0.28 with `eave` 0.07 (the plan's roofs read as chalets), door offset to `-w * 0.24` with windows kept clear of it (a centred door under two windows read as a face).
- **Task 7, places.** The garden at `(-2.5, 3.6)` sat where the ridge starts to climb; its floor was buried on one side and floating on the other. `heightmap.PLATEAUS` now levels a rectangle of ground for a place, and the garden moved to `(-5.5, 1.6)` where the cut is two terrace steps rather than seven. `_garden` builds walls 0.34 high on the plateau with a gravel floor, a larger basin, six small olives and corner lamps. The village square is a stone platform (`_square`) so it does not float over the knoll's south side. Cypress along roads now skip the place clearings; post clearing 1.6, garden 2.3. All place shots in `cameras.SHOTS` were refit and the garden shot is anchored to the place position.
- **Task 8, light.** The plan's `sky_strength` 0.12 made the physical sky several times brighter than the sun lamp, so the afternoon was flat and exposure had to fall to -2.5 to hit the luminance window. The ratio was the fault, not exposure: `sky_strength` 0.03 / 0.04, `sun_energy` 5.5 / 3.0, `exposure` -0.5 / -0.2. Azimuths moved to 300 (afternoon) and 278 (dusk) so the sun is over the sea and shadows rake across the frame instead of falling away from the south-west camera. The luminance window is a coarse gauge: the paper card fills much of the overview, so afternoon sits near 0.57 and looks right.
