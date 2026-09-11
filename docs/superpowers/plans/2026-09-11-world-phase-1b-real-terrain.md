# World Phase 1b: Real Terrain, Real Places, Surface and Atmosphere

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the diorama's land from real elevation data for the stretch from Beirut's Ashrafieh to the foot of the Warde slopes above Faraya, put towns, roads and the nine places where they really are, and give the render the surface and atmosphere the phase-one stills lacked.

**Architecture:** A new pure module `lib/frame.py` maps latitude and longitude to table coordinates (rotated so the coast runs along x and the sea lies toward negative y). A fetch script pulls public elevation tiles once and writes a committed `data/heightmap.json`; `lib/heightmap.py` samples it with vertical exaggeration and keeps the phase-one terrace, plateau and riser logic. `lib/layout.py` derives roads, towns and places from real coordinates. Scene modules gain elevation-driven flora, a city vocabulary for Beirut, landmarks, a camera-ray sky, mist haze, paper grain, a glossy paper sea, and a miniature depth of field.

**Tech Stack:** Blender 5.2.1 LTS headless (bundled Python 3.13), Cycles on Apple Metal, system Python 3.14 for tests and the fetch script, Mapzen Terrarium elevation tiles on AWS (public, no key).

**Spec:** `docs/superpowers/specs/2026-09-10-immersive-world-design.md` (see "Resolved on 2026-09-11")

**Previous plan:** `docs/superpowers/plans/2026-09-10-world-phase-1-blender-stills.md`, all ten tasks done. Everything below modifies that codebase.

## Global Constraints

- Everything in the phase-one plan's Global Constraints still holds: palette tokens only, ink as accent only, scripts as source of truth, seeded, `lib/` never imports `bpy`, verified Blender API names, commit trailers, visual acceptance by reading the render.
- The table frame is fixed: centre `(33.9362, 35.6797)`, x axis bearing `20.0` degrees, `2.2` km per unit, table 24 by 16 units. Sea toward negative y. Do not change these constants; every position in the plan was computed from them.
- Elevation source: `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` at zoom 11, decoded as `R * 256 + G + B / 256 - 32768` metres. Raw tiles are cached under `tools/world/data/tiles/` and ignored by git; the resampled `tools/world/data/heightmap.json` is committed and is what every build reads. A build never touches the network.
- Vertical exaggeration `EXAGGERATION = 3.0`. Metres to table units: `m / 2200 * EXAGGERATION`. Sannine at 2613 m becomes 3.56 units; Warde at 1931 m becomes 2.63.
- Buildings keep souvenir scale (a village house about 0.6 wide). Cities use a smaller vocabulary (Beirut blocks about 0.25) so density reads without covering the headland.
- The wedding venue is at Warde, the foot of the slopes (Lucien, 2026-09-11): the hill place is the venue, its name and address still open. The shore, garden and other places remain placeholders until `docs/awaiting.md` rows 3 and 4 are answered; say so in code comments.
- No em-dashes anywhere.

---

## File map (changes only)

```
tools/world/
  fetch_terrain.py          NEW  system Python: tiles -> data/heightmap.json
  data/
    heightmap.json          NEW, committed (about 200 KB)
    tiles/                  NEW, ignored
  lib/
    frame.py                NEW  lat/lon <-> table, landmarks
    heightmap.py            REWRITE  samples the JSON; keeps terrace/plateau/riser logic
    layout.py               REWRITE  roads, towns, places from real coordinates
    placement.py            unchanged
    palette.py              + ROCK, SNOWFIELD, GLASS
  scene/
    terrain.py              paint by elevation as well as slope
    flora.py                densities by elevation band
    buildings.py            towns from layout, towers, pistes, lift
    places.py               re-homed places, Harissa, Pigeon Rocks, ski base
    lighting.py             camera-ray sky, mist
    cameras.py              overview shows sky; miniature f-stop; place shots anchored
    common.py               + paper_mode(), lathe helper moved here from flora
  stills.py                 paper mode by material swap; adds the `beirut` still
  tests/
    test_frame.py           NEW
    test_heightmap.py       REWRITE
    test_layout.py          REWRITE
```

---

### Task 1: The frame

**Files:**
- Create: `tools/world/lib/frame.py`
- Create: `tools/world/tests/test_frame.py`

**Interfaces:**
- Produces: `frame.CENTRE`, `frame.BEARING`, `frame.KM_PER_UNIT`, `frame.to_table(lat, lon) -> (x, y)`, `frame.to_latlon(x, y) -> (lat, lon)`, `frame.metres_to_units(m) -> float` (no exaggeration; heightmap applies that), `frame.LANDMARKS: dict[id, (lat, lon, label)]`, `frame.landmark_xy(id) -> (x, y)`.

- [ ] **Step 1: Write the failing test**

`tools/world/tests/test_frame.py`:
```python
import unittest

from lib import frame


class FrameTest(unittest.TestCase):
    def test_constants(self):
        self.assertEqual(frame.CENTRE, (33.9362, 35.6797))
        self.assertEqual(frame.BEARING, 20.0)
        self.assertEqual(frame.KM_PER_UNIT, 2.2)

    def test_round_trip(self):
        for lat, lon in ((33.887, 35.517), (34.005, 35.86), (33.821, 35.488)):
            x, y = frame.to_table(lat, lon)
            back = frame.to_latlon(x, y)
            self.assertAlmostEqual(back[0], lat, places=6)
            self.assertAlmostEqual(back[1], lon, places=6)

    def test_centre_is_origin(self):
        self.assertAlmostEqual(frame.to_table(*frame.CENTRE)[0], 0.0, places=9)
        self.assertAlmostEqual(frame.to_table(*frame.CENTRE)[1], 0.0, places=9)

    def test_sea_is_toward_negative_y(self):
        ax, ay = frame.landmark_xy("ashrafieh")
        px, py = frame.landmark_xy("pigeon_rocks")
        wx, wy = frame.landmark_xy("warde")
        self.assertLess(py, ay)
        self.assertGreater(wy, ay + 8.0)

    def test_every_landmark_is_on_the_table(self):
        for pid in frame.LANDMARKS:
            x, y = frame.landmark_xy(pid)
            self.assertTrue(-12.0 <= x <= 12.0 and -8.0 <= y <= 8.0, pid)

    def test_known_positions(self):
        x, y = frame.landmark_xy("ashrafieh")
        self.assertAlmostEqual(x, -4.68, places=1)
        self.assertAlmostEqual(y, -5.57, places=1)
        x, y = frame.landmark_xy("byblos")
        self.assertAlmostEqual(x, 8.33, places=1)

    def test_metres_to_units(self):
        self.assertAlmostEqual(frame.metres_to_units(2200.0), 1.0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run it to see it fail**

```bash
pnpm world:test
```
Expected: `ModuleNotFoundError: lib.frame`.

- [ ] **Step 3: Write the frame module**

`tools/world/lib/frame.py`:
```python
"""Where the table is on the Earth.

The table is a rotated, scaled window onto real coordinates: x runs along the
coast toward the north-north-east, y runs inland toward the east-south-east so
the sea lies toward negative y as the rest of the code expects. Chosen with
Lucien on 2026-09-11: Ashrafieh at the south-west, the foot of the Warde ski
slopes at the north-east.
"""

import math

CENTRE = (33.9362, 35.6797)
BEARING = 20.0
KM_PER_UNIT = 2.2

_KM_LAT = 111.32
_KM_LON = _KM_LAT * math.cos(math.radians(CENTRE[0]))


def to_table(lat: float, lon: float) -> tuple[float, float]:
    east = (lon - CENTRE[1]) * _KM_LON
    north = (lat - CENTRE[0]) * _KM_LAT
    b = math.radians(BEARING)
    x = east * math.sin(b) + north * math.cos(b)
    y = east * math.cos(b) - north * math.sin(b)
    return x / KM_PER_UNIT, y / KM_PER_UNIT


def to_latlon(x: float, y: float) -> tuple[float, float]:
    b = math.radians(BEARING)
    xk, yk = x * KM_PER_UNIT, y * KM_PER_UNIT
    east = xk * math.sin(b) + yk * math.cos(b)
    north = xk * math.cos(b) - yk * math.sin(b)
    return CENTRE[0] + north / _KM_LAT, CENTRE[1] + east / _KM_LON


def metres_to_units(m: float) -> float:
    return m / (KM_PER_UNIT * 1000.0)


# id -> (lat, lon, label). Approximate to a few hundred metres, which is under
# a fifth of a table unit; good enough to place a model, not a survey.
LANDMARKS = {
    "airport": (33.821, 35.488, "Beirut airport"),
    "pigeon_rocks": (33.890, 35.470, "Pigeon Rocks"),
    "ashrafieh": (33.887, 35.517, "Ashrafieh"),
    "dbayeh": (33.945, 35.585, "Dbayeh"),
    "zouk": (33.968, 35.610, "Zouk"),
    "jounieh": (33.981, 35.630, "Jounieh"),
    "harissa": (33.982, 35.652, "Harissa"),
    "jeita": (33.944, 35.641, "Jeita"),
    "tabarja": (34.020, 35.640, "Tabarja"),
    "byblos": (34.121, 35.648, "Byblos"),
    "broummana": (33.883, 35.632, "Broummana"),
    "bikfaya": (33.922, 35.680, "Bikfaya"),
    "ajaltoun": (33.980, 35.690, "Ajaltoun"),
    "faytroun": (34.000, 35.750, "Faytroun"),
    "faraya": (34.011, 35.822, "Faraya"),
    "warde": (34.005, 35.860, "Warde, foot of the slopes"),
    "sannine": (33.958, 35.855, "Mount Sannine"),
}


def landmark_xy(pid: str) -> tuple[float, float]:
    lat, lon, _ = LANDMARKS[pid]
    return to_table(lat, lon)
```

- [ ] **Step 4: Run the tests and commit**

```bash
pnpm world:test
git add tools/world/lib/frame.py tools/world/tests/test_frame.py
git commit -F - <<'EOF'
feat(world): the table's frame on the Earth, from Ashrafieh to the Warde slopes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3
EOF
```
Expected: `OK`, 7 new tests (some phase-one heightmap and layout tests will start failing in Task 3 and are rewritten there; they must still pass here).

---

### Task 2: Fetch the real elevation

**Files:**
- Create: `tools/world/fetch_terrain.py`
- Create: `tools/world/data/heightmap.json` (generated)
- Modify: `.gitignore` (add `tools/world/data/tiles/`)
- Modify: `package.json` (add `"world:terrain": "python3 tools/world/fetch_terrain.py"`)

**Interfaces:**
- Produces: `data/heightmap.json` with keys `frame` (centre, bearing, km_per_unit), `res` (0.1), `w` (241), `h` (161), `x0` (-12.0), `y0` (-8.0), `elev` (list of `h` rows of `w` integers, metres, row 0 at `y0`). Cell `(i, j)` is at `x = x0 + i * res`, `y = y0 + j * res`.

- [ ] **Step 1: Write the fetch script**

`tools/world/fetch_terrain.py`:
```python
"""Fetch real elevation for the table frame and resample it onto the grid the
world is built from.

    pnpm world:terrain

Reads Mapzen Terrarium tiles (public, on AWS, no key) at zoom 11, caches them
under data/tiles/ (ignored), and writes data/heightmap.json (committed). Builds
never touch the network; they read the JSON. Re-run only if the frame changes.
Standard library only, so it runs under plain python3.
"""

import json
import math
import os
import struct
import sys
import urllib.request
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib import frame  # noqa: E402

ZOOM = 11
RES = 0.1
X0, Y0 = -12.0, -8.0
W, H = 241, 161
HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.join(HERE, "data", "tiles")
OUT = os.path.join(HERE, "data", "heightmap.json")


def _png_decode(data: bytes):
    pos, idat = 8, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            w, h, _, colour = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat += body
    raw = zlib.decompress(idat)
    channels = {2: 3, 6: 4}[colour]
    stride = w * channels
    out, prev, p = bytearray(), bytearray(stride), 0
    for _ in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if f == 1:
                line[i] = (line[i] + a) & 255
            elif f == 2:
                line[i] = (line[i] + b) & 255
            elif f == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        out += line
        prev = line
    return w, h, channels, bytes(out)


_tiles = {}


def _tile(tx: int, ty: int):
    if (tx, ty) not in _tiles:
        path = os.path.join(TILES, f"{ZOOM}-{tx}-{ty}.png")
        if not os.path.exists(path):
            url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{tx}/{ty}.png"
            os.makedirs(TILES, exist_ok=True)
            with urllib.request.urlopen(url, timeout=30) as response:
                open(path, "wb").write(response.read())
            print(f"FETCH {url}")
        _tiles[(tx, ty)] = _png_decode(open(path, "rb").read())
    return _tiles[(tx, ty)]


def elevation(lat: float, lon: float) -> float:
    n = 2**ZOOM
    xf = (lon + 180.0) / 360.0 * n
    yf = (1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n
    tx, ty = int(xf), int(yf)
    w, h, channels, px = _tile(tx, ty)
    i = min(w - 1, int((xf - tx) * w))
    j = min(h - 1, int((yf - ty) * h))
    o = (j * w + i) * channels
    return px[o] * 256 + px[o + 1] + px[o + 2] / 256.0 - 32768.0


def main():
    rows = []
    for j in range(H):
        row = []
        for i in range(W):
            lat, lon = frame.to_latlon(X0 + i * RES, Y0 + j * RES)
            row.append(round(elevation(lat, lon)))
        rows.append(row)
    flat = [v for row in rows for v in row]
    print(f"GRID {W}x{H} min {min(flat)} max {max(flat)} sea_cells {sum(1 for v in flat if v <= 0)} tiles {len(_tiles)}")
    json.dump(
        {
            "frame": {"centre": list(frame.CENTRE), "bearing": frame.BEARING, "km_per_unit": frame.KM_PER_UNIT},
            "res": RES,
            "w": W,
            "h": H,
            "x0": X0,
            "y0": Y0,
            "elev": rows,
        },
        open(OUT, "w"),
        separators=(",", ":"),
    )
    print(f"WROTE {OUT} {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Wire the script and ignore the tiles**

Append to `.gitignore`:
```
tools/world/data/tiles/
```
Add to `package.json` scripts, then `pnpm format`:
```json
"world:terrain": "python3 tools/world/fetch_terrain.py",
```

- [ ] **Step 3: Run it**

```bash
pnpm world:terrain 2>&1 | grep -E "^(GRID|WROTE)|Traceback"
```
Expected: `GRID 241x161 min` between -30 and 0, `max` between 2550 and 2650, `sea_cells` between 9000 and 14000, `tiles 14`; `WROTE` under 300000 bytes.

- [ ] **Step 4: Commit**

```bash
pnpm format:check
git add tools/world/fetch_terrain.py tools/world/data/heightmap.json .gitignore package.json
git commit -F - <<'EOF'
feat(world): fetch real elevation for the frame and commit the resampled grid

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3
EOF
```

---

### Task 3: The heightmap reads the Earth

**Files:**
- Rewrite: `tools/world/lib/heightmap.py`
- Rewrite: `tools/world/tests/test_heightmap.py`
- Modify: `tools/world/lib/palette.py` (three shades)

**Interfaces:**
- Produces (`heightmap`): `TABLE_W, TABLE_D, SEA_LEVEL, EXAGGERATION, TERRACE_STEP, RISER_WIDTH, TERRACE_ELEV = (150.0, 1100.0)`, `PLATEAUS: dict[str, ((x, y), hw, hd)]`, `PLATEAU_APRON`, `elevation_m(x, y) -> float` (real metres, bilinear), `coast_distance(x, y) -> float` (units, 0 on land), `smooth_height(x, y)`, `gradient(x, y)`, `terrace(s, k)`, `riser_fraction(x, y)`, `terrace_weight(x, y)`, `plateau_mask(x, y)`, `plateau_level(name)`, `height(x, y)`, `slope(x, y)`, `is_land(x, y)`, `smoothstep(a, b, t)`.
- Removed: `coastline`, `VILLAGE`, `RIDGE_*`, `INLAND_*`, `base_height`, `roughness`, `TERRACE_BAND`. Anything importing them is rewritten in Tasks 4 to 6.
- Produces (`palette`): `ROCK = mix(STONE_DARK, FADED, 0.35)`, `SNOWFIELD = mix(PAPER, SEA, 0.25)` (the pale summer scree of the high slopes, not snow), `GLASS = shade(SEA, 0.8)`.

- [ ] **Step 1: Write the failing tests**

`tools/world/tests/test_heightmap.py`:
```python
import math
import unittest

from lib import frame
from lib import heightmap as hm


class HeightmapTest(unittest.TestCase):
    def test_table_constants(self):
        self.assertEqual((hm.TABLE_W, hm.TABLE_D), (24.0, 16.0))
        self.assertEqual(hm.EXAGGERATION, 3.0)

    def test_real_elevation_at_landmarks(self):
        self.assertLess(abs(hm.elevation_m(*frame.landmark_xy("ashrafieh")) - 107), 60)
        self.assertLess(abs(hm.elevation_m(*frame.landmark_xy("warde")) - 1931), 120)
        self.assertLess(abs(hm.elevation_m(*frame.landmark_xy("harissa")) - 587), 80)
        self.assertLess(hm.elevation_m(*frame.landmark_xy("jounieh")), 60)

    def test_sea_is_below_zero_and_falls_away(self):
        x, y = frame.landmark_xy("pigeon_rocks")
        self.assertFalse(hm.is_land(x - 0.6, y - 0.6))
        near = hm.height(x - 0.6, y - 0.6)
        far = hm.height(x - 0.6, y - 2.5) if y - 2.5 >= -8.0 else hm.height(-3.0, -7.9)
        self.assertLess(near, hm.SEA_LEVEL)
        self.assertLessEqual(far, near + 1e-6)

    def test_land_at_landmarks(self):
        for pid in ("ashrafieh", "jounieh", "harissa", "bikfaya", "faraya", "warde", "byblos"):
            self.assertTrue(hm.is_land(*frame.landmark_xy(pid)), pid)

    def test_sannine_is_the_highest_ground_and_exaggerated(self):
        sx, sy = frame.landmark_xy("sannine")
        peak = max(hm.height(sx + dx, sy + dy) for dx in (-0.3, 0, 0.3) for dy in (-0.3, 0, 0.3))
        self.assertGreater(peak, frame.metres_to_units(2200) * hm.EXAGGERATION)
        self.assertGreater(peak, hm.height(*frame.landmark_xy("ashrafieh")) + 2.5)

    def test_terraces_only_in_their_elevation_band(self):
        self.assertEqual(hm.terrace_weight(*frame.landmark_xy("warde")), 0.0)
        self.assertEqual(hm.terrace_weight(*frame.landmark_xy("jounieh")), 0.0)
        bx, by = frame.landmark_xy("bikfaya")
        band = max(hm.terrace_weight(bx + dx, by + dy) for dx in (-0.5, 0, 0.5) for dy in (-0.5, 0, 0.5))
        self.assertGreater(band, 0.3)

    def test_terrace_function_is_continuous_and_monotonic(self):
        previous = hm.terrace(0.0, 0.3)
        for i in range(1, 400):
            current = hm.terrace(i * 0.005, 0.3)
            self.assertGreaterEqual(current + 1e-9, previous)
            self.assertLess(current - previous, 0.05)
            previous = current

    def test_plateaus_are_level(self):
        for name, ((cx, cy), hw, hd) in hm.PLATEAUS.items():
            level = hm.height(cx, cy)
            for dx in (-hw, 0.0, hw):
                for dy in (-hd, 0.0, hd):
                    self.assertAlmostEqual(hm.height(cx + dx, cy + dy), level, places=6, msg=name)

    def test_finite_everywhere(self):
        for i in range(0, 241, 8):
            for j in range(0, 161, 8):
                z = hm.height(-12 + i * 0.1, -8 + j * 0.1)
                self.assertTrue(math.isfinite(z))
                self.assertLess(z, 4.5)
                self.assertGreater(z, -1.0)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Add the palette shades**

Append to `tools/world/lib/palette.py` under `# Ground and stone`:
```python
ROCK = mix(STONE_DARK, FADED, 0.35)
SNOWFIELD = mix(PAPER, SEA, 0.25)
```
and under `# Water`:
```python
GLASS = shade(SEA, 0.8)
```

- [ ] **Step 3: Rewrite the heightmap**

`tools/world/lib/heightmap.py`:
```python
"""The shape of the table, read from real elevation.

data/heightmap.json holds metres on a 0.1 grid, written by fetch_terrain.py.
This module samples it, exaggerates it so a diorama reads, drops the seabed
away from the coast, cuts terraces into the slopes where Lebanese hillsides are
terraced, and levels plateaus for places that need a flat floor.
"""

import json
import math
import os
from collections import deque

from . import frame

TABLE_W, TABLE_D = 24.0, 16.0
SEA_LEVEL = 0.0
EXAGGERATION = 3.0
TERRACE_STEP = 0.35
RISER_WIDTH = 0.16
# Metres. Terraces begin above the coastal towns and end where the slopes turn
# to pine and rock.
TERRACE_ELEV = (150.0, 1100.0)
SEABED_DEPTH = 0.45
SEABED_REACH = 1.6

_DATA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "heightmap.json")

# Places that need a flat floor: name -> ((x, y), half width, half depth).
# Positions come from the frame so they move with it.
PLATEAUS = {
    "garden": (tuple(round(v, 3) for v in frame.to_table(33.918, 35.690)), 1.75, 1.35),
    "hill": (tuple(round(v, 3) for v in frame.landmark_xy("warde")), 1.6, 1.3),
    "hotel": (tuple(round(v, 3) for v in frame.to_table(33.976, 35.640)), 1.5, 0.9),
}
PLATEAU_APRON = 0.5


def smoothstep(a: float, b: float, t: float) -> float:
    if t <= a:
        return 0.0
    if t >= b:
        return 1.0
    u = (t - a) / (b - a)
    return u * u * (3.0 - 2.0 * u)


class _Grid:
    def __init__(self):
        raw = json.load(open(_DATA))
        self.res, self.w, self.h = raw["res"], raw["w"], raw["h"]
        self.x0, self.y0 = raw["x0"], raw["y0"]
        self.elev = raw["elev"]
        self.coast = self._coast_distance()

    def _coast_distance(self):
        """Cells of sea distance to the nearest land cell, by breadth-first search."""
        dist = [[0 if self.elev[j][i] > 0 else -1 for i in range(self.w)] for j in range(self.h)]
        queue = deque((i, j) for j in range(self.h) for i in range(self.w) if dist[j][i] == 0)
        while queue:
            i, j = queue.popleft()
            for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ni, nj = i + di, j + dj
                if 0 <= ni < self.w and 0 <= nj < self.h and dist[nj][ni] == -1:
                    dist[nj][ni] = dist[j][i] + 1
                    queue.append((ni, nj))
        return dist

    def _cell(self, x: float, y: float):
        fx = min(max((x - self.x0) / self.res, 0.0), self.w - 1.001)
        fy = min(max((y - self.y0) / self.res, 0.0), self.h - 1.001)
        i, j = int(fx), int(fy)
        return i, j, fx - i, fy - j

    def sample(self, table, x: float, y: float) -> float:
        i, j, u, v = self._cell(x, y)
        a, b = table[j][i], table[j][i + 1]
        c, d = table[j + 1][i], table[j + 1][i + 1]
        return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


_grid = None


def _g() -> _Grid:
    global _grid
    if _grid is None:
        _grid = _Grid()
    return _grid


def elevation_m(x: float, y: float) -> float:
    return _g().sample(_g().elev, x, y)


def coast_distance(x: float, y: float) -> float:
    return _g().sample(_g().coast, x, y) * _g().res


def smooth_height(x: float, y: float) -> float:
    m = elevation_m(x, y)
    if m <= 0.0:
        return -SEABED_DEPTH * smoothstep(0.0, SEABED_REACH, coast_distance(x, y))
    return frame.metres_to_units(m) * EXAGGERATION


def gradient(x: float, y: float) -> float:
    eps = 0.05
    gx = (smooth_height(x + eps, y) - smooth_height(x - eps, y)) / (2 * eps)
    gy = (smooth_height(x, y + eps) - smooth_height(x, y - eps)) / (2 * eps)
    return math.hypot(gx, gy)


def terrace(s: float, k: float) -> float:
    """Step function with a continuous riser occupying the top fraction `k` of
    each terrace. Flat tops sit 0.04 above a multiple of TERRACE_STEP."""
    n = math.floor(s / TERRACE_STEP)
    f = s / TERRACE_STEP - n
    return (n + smoothstep(1.0 - k, 1.0, f)) * TERRACE_STEP + 0.04


def riser_fraction(x: float, y: float) -> float:
    return max(0.05, RISER_WIDTH * gradient(x, y) / TERRACE_STEP)


def terrace_weight(x: float, y: float) -> float:
    """1 where hillsides are terraced, fading with elevation at both ends and on
    ground too steep for a terrace to be wider than its riser."""
    m = elevation_m(x, y)
    lo, hi = TERRACE_ELEV
    band = smoothstep(lo, lo + 100.0, m) * (1.0 - smoothstep(hi - 150.0, hi, m))
    if band <= 0.0:
        return 0.0
    steep = 1.0 - smoothstep(0.35, 0.6, riser_fraction(x, y))
    return band * steep


def _height_unlevelled(x: float, y: float) -> float:
    smooth = smooth_height(x, y)
    if smooth > 0.05:
        weight = terrace_weight(x, y)
        if weight > 0.0:
            stepped = terrace(smooth, min(0.6, riser_fraction(x, y)))
            return smooth * (1.0 - weight) + stepped * weight
    return smooth


def plateau_mask(x: float, y: float) -> float:
    mask = 0.0
    for (cx, cy), hw, hd in PLATEAUS.values():
        dx, dy = max(0.0, abs(x - cx) - hw), max(0.0, abs(y - cy) - hd)
        mask = max(mask, 1.0 - smoothstep(0.0, PLATEAU_APRON, math.hypot(dx, dy)))
    return mask


_levels: dict[str, float] = {}


def plateau_level(name: str) -> float:
    if name not in _levels:
        (cx, cy), _, _ = PLATEAUS[name]
        _levels[name] = _height_unlevelled(cx, cy)
    return _levels[name]


def height(x: float, y: float) -> float:
    h = _height_unlevelled(x, y)
    for name, ((cx, cy), hw, hd) in PLATEAUS.items():
        dx, dy = max(0.0, abs(x - cx) - hw), max(0.0, abs(y - cy) - hd)
        m = 1.0 - smoothstep(0.0, PLATEAU_APRON, math.hypot(dx, dy))
        if m > 0.0:
            h = h * (1.0 - m) + plateau_level(name) * m
    return h


def slope(x: float, y: float) -> float:
    eps = 0.04
    gx = (height(x + eps, y) - height(x - eps, y)) / (2 * eps)
    gy = (height(x, y + eps) - height(x, y - eps)) / (2 * eps)
    return math.hypot(gx, gy)


def is_land(x: float, y: float) -> bool:
    return elevation_m(x, y) > 0.0
```

- [ ] **Step 4: Run the heightmap tests alone**

```bash
python3 -m unittest tests.test_heightmap -v 2>&1 | tail -15
```
(run from `tools/world`, or `cd tools/world && python3 -m unittest tests.test_heightmap`). Expected: all pass. `test_layout` and `test_placement` are still the phase-one versions and `test_layout` will now fail on `hm.coastline`; that is expected until Task 4. Do not run `pnpm world:test` as the gate for this task.

If `test_land_at_landmarks` fails for `jounieh` or `byblos`, the landmark sits within a cell of the sea; move that landmark 0.002 degrees inland in `frame.LANDMARKS` and rerun the fetch is not needed (the grid is unchanged; only the sample point moves).

- [ ] **Step 5: Commit**

```bash
git add tools/world/lib/heightmap.py tools/world/lib/palette.py tools/world/tests/test_heightmap.py
git commit -F - <<'EOF'
feat(world): the heightmap reads real elevation, exaggerated for a diorama

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3
EOF
```

---

### Task 4: Roads, towns and places from real coordinates

**Files:**
- Rewrite: `tools/world/lib/layout.py`
- Rewrite: `tools/world/tests/test_layout.py`

**Interfaces:**
- Produces: `layout.ROADS: dict[id, list[(x, y)]]` with ids `coast`, `faraya`, `metn`; `layout.TOWNS: dict[id, dict(pos, radius, kind, count, scale, label)]` with kinds `city`, `town`, `village`, `resort`; `layout.town_houses(seed=3) -> list[dict(x, y, w, d, h, yaw, town)]`; `layout.TOWERS: list[dict(x, y, w, d, h, label)]`; `layout.PLACES` (same nine ids as before, `pos` from real coordinates, plus `note`); `layout.PLACE_RADIUS`; `layout.SQUARE: dict(pos, radius)` (Faraya's square); `layout.exclusions()`; `layout.ski: dict(base, top, pistes: list[list[(x, y)]])`.
- Removed: `COAST_ROAD`, `HILL_ROAD`, `village_houses`, `SQUARE_RADIUS`, `COAST_OFFSET`. Tasks 5 and 6 rewrite the callers.

- [ ] **Step 1: Write the failing tests**

`tools/world/tests/test_layout.py`:
```python
import math
import unittest

from lib import frame
from lib import heightmap as hm
from lib import layout


class LayoutTest(unittest.TestCase):
    def test_roads_follow_real_waypoints_and_stay_on_land(self):
        self.assertEqual(set(layout.ROADS), {"coast", "faraya", "metn"})
        for rid, road in layout.ROADS.items():
            self.assertGreaterEqual(len(road), 4, rid)
            off_land = sum(1 for x, y in road if not hm.is_land(x, y))
            self.assertLessEqual(off_land, 1, rid)
        jx, jy = frame.landmark_xy("jounieh")
        self.assertTrue(any(math.hypot(x - jx, y - jy) < 0.6 for x, y in layout.ROADS["coast"]))
        wx, wy = frame.landmark_xy("warde")
        self.assertLess(math.hypot(layout.ROADS["faraya"][-1][0] - wx, layout.ROADS["faraya"][-1][1] - wy), 0.3)

    def test_towns_are_where_they_are(self):
        for tid in ("beirut", "jounieh", "byblos", "broummana", "bikfaya", "faraya", "warde"):
            self.assertIn(tid, layout.TOWNS)
        bx, by = frame.landmark_xy("ashrafieh")
        tx, ty = layout.TOWNS["beirut"]["pos"]
        self.assertLess(math.hypot(bx - tx, by - ty), 1.2)
        self.assertEqual(layout.TOWNS["beirut"]["kind"], "city")
        self.assertEqual(layout.TOWNS["warde"]["kind"], "resort")

    def test_houses_land_on_land_and_do_not_overlap(self):
        houses = layout.town_houses()
        self.assertGreaterEqual(len(houses), 180)
        beirut = [h for h in houses if h["town"] == "beirut"]
        self.assertGreaterEqual(len(beirut), 80)
        self.assertLess(max(h["w"] for h in beirut), 0.4)
        for h in houses:
            self.assertTrue(hm.is_land(h["x"], h["y"]), h["town"])
        by_town = {}
        for h in houses:
            by_town.setdefault(h["town"], []).append(h)
        for tid, group in by_town.items():
            for i, a in enumerate(group):
                for b in group[i + 1 :]:
                    gap = math.hypot(a["x"] - b["x"], a["y"] - b["y"])
                    self.assertGreater(gap, (max(a["w"], a["d"]) + max(b["w"], b["d"])) / 2, tid)

    def test_towers_include_ashrafieh(self):
        self.assertTrue(any(t["label"] == "Ashrafieh Tower" for t in layout.TOWERS))
        for t in layout.TOWERS:
            self.assertTrue(hm.is_land(t["x"], t["y"]))
            self.assertGreater(t["h"], 0.8)

    def test_places_keep_their_ids_and_sit_on_land_except_the_harbour(self):
        self.assertEqual(
            set(layout.PLACES), {"shore", "hill", "garden", "post", "hotel", "harbour", "cedars", "steps", "square"}
        )
        for pid, place in layout.PLACES.items():
            x, y = place["pos"]
            self.assertTrue(-12 <= x <= 12 and -8 <= y <= 8, pid)
            if pid == "harbour":
                self.assertFalse(hm.is_land(x, y), pid)
            else:
                self.assertTrue(hm.is_land(x, y), pid)
        wx, wy = frame.landmark_xy("warde")
        hx, hy = layout.PLACES["hill"]["pos"]
        self.assertLess(math.hypot(wx - hx, wy - hy), 0.1)

    def test_plateaus_match_places(self):
        for name in ("garden", "hill", "hotel"):
            (cx, cy), _, _ = hm.PLATEAUS[name]
            px, py = layout.PLACES[name]["pos"]
            self.assertLess(math.hypot(cx - px, cy - py), 0.05, name)

    def test_ski_runs_climb_from_the_base(self):
        base, top = layout.SKI["base"], layout.SKI["top"]
        self.assertGreater(hm.elevation_m(*top), hm.elevation_m(*base) + 150)
        self.assertGreaterEqual(len(layout.SKI["pistes"]), 3)

    def test_exclusions_cover_every_place_house_and_tower(self):
        zones = layout.exclusions()
        for place in layout.PLACES.values():
            x, y = place["pos"]
            self.assertTrue(any(math.hypot(x - zx, y - zy) <= r for zx, zy, r in zones))
        for h in layout.town_houses()[::7]:
            self.assertTrue(any(math.hypot(h["x"] - zx, h["y"] - zy) <= r for zx, zy, r in zones))
        for t in layout.TOWERS:
            self.assertTrue(any(math.hypot(t["x"] - zx, t["y"] - zy) <= r for zx, zy, r in zones))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Rewrite the layout**

`tools/world/lib/layout.py`:
```python
"""Roads, towns, landmarks and the nine places, from real coordinates.

Everything here is placed with frame.to_table so the diorama is literal
geography at souvenir scale: real shapes and positions, oversized buildings.
The venues are still unknown (docs/awaiting.md rows 2 to 4); the hill place
sits at the foot of the Warde slopes because Lucien named that spot, and the
others are placeholders near towns a guest would recognise.
"""

import math
import random

from . import frame
from . import heightmap as hm
from . import placement


def _pts(*ids_or_coords):
    out = []
    for item in ids_or_coords:
        if isinstance(item, str):
            out.append(frame.landmark_xy(item))
        else:
            out.append(frame.to_table(*item))
    return out


# Waypoints along the real highways, densified later by the ribbon builder.
ROADS = {
    "coast": _pts("airport", (33.870, 35.500), "ashrafieh", (33.905, 35.545), "dbayeh", "zouk", "jounieh", "tabarja", (34.070, 35.640), "byblos"),
    "faraya": _pts("jounieh", (33.985, 35.660), "ajaltoun", (33.990, 35.720), "faytroun", (34.006, 35.790), "faraya", "warde"),
    "metn": _pts("ashrafieh", (33.880, 35.580), "broummana", (33.900, 35.660), "bikfaya"),
}

# kind decides the vocabulary: city blocks small and dense, villages loose.
TOWNS = {
    "beirut": {"pos": frame.to_table(33.885, 35.510), "radius": 2.2, "kind": "city", "count": 110, "scale": 0.27, "label": "Beirut"},
    "dbayeh": {"pos": frame.landmark_xy("dbayeh"), "radius": 0.7, "kind": "town", "count": 14, "scale": 0.4, "label": "Dbayeh"},
    "zouk": {"pos": frame.landmark_xy("zouk"), "radius": 0.6, "kind": "town", "count": 12, "scale": 0.4, "label": "Zouk"},
    "jounieh": {"pos": frame.landmark_xy("jounieh"), "radius": 1.0, "kind": "town", "count": 26, "scale": 0.42, "label": "Jounieh"},
    "byblos": {"pos": frame.landmark_xy("byblos"), "radius": 0.8, "kind": "town", "count": 18, "scale": 0.45, "label": "Byblos"},
    "broummana": {"pos": frame.landmark_xy("broummana"), "radius": 0.7, "kind": "village", "count": 14, "scale": 0.55, "label": "Broummana"},
    "bikfaya": {"pos": frame.landmark_xy("bikfaya"), "radius": 0.7, "kind": "village", "count": 14, "scale": 0.55, "label": "Bikfaya"},
    "ajaltoun": {"pos": frame.landmark_xy("ajaltoun"), "radius": 0.6, "kind": "village", "count": 10, "scale": 0.55, "label": "Ajaltoun"},
    "faytroun": {"pos": frame.landmark_xy("faytroun"), "radius": 0.5, "kind": "village", "count": 8, "scale": 0.55, "label": "Faytroun"},
    "faraya": {"pos": frame.landmark_xy("faraya"), "radius": 0.9, "kind": "village", "count": 22, "scale": 0.6, "label": "Faraya"},
    "warde": {"pos": frame.landmark_xy("warde"), "radius": 0.9, "kind": "resort", "count": 6, "scale": 0.6, "label": "Warde"},
}

TOWERS = [
    {**dict(zip(("x", "y"), frame.landmark_xy("ashrafieh"))), "w": 0.22, "d": 0.22, "h": 1.35, "label": "Ashrafieh Tower"},
    {**dict(zip(("x", "y"), frame.to_table(33.896, 35.500))), "w": 0.2, "d": 0.2, "h": 0.95, "label": "downtown"},
    {**dict(zip(("x", "y"), frame.to_table(33.892, 35.488))), "w": 0.18, "d": 0.18, "h": 0.85, "label": "Raouche"},
    {**dict(zip(("x", "y"), frame.to_table(33.900, 35.520))), "w": 0.2, "d": 0.2, "h": 1.05, "label": "Mar Mikhael"},
]

SQUARE = {"pos": frame.landmark_xy("faraya"), "radius": 0.55}

SKI = {
    "base": frame.landmark_xy("warde"),
    "top": frame.to_table(34.000, 35.885),
    "pistes": [
        _pts("warde", (34.003, 35.872), (34.000, 35.885)),
        _pts("warde", (34.008, 35.874), (34.006, 35.888)),
        _pts("warde", (33.999, 35.870), (33.995, 35.882)),
    ],
}

PLACES = {
    "shore": {"label": "By the sea", "pos": frame.to_table(33.978, 35.626), "note": "Jounieh bay corniche, placeholder"},
    "hill": {"label": "On the hill", "pos": frame.landmark_xy("warde"), "note": "Foot of the Warde slopes, named by Lucien"},
    "garden": {"label": "In the garden", "pos": frame.to_table(33.918, 35.690), "note": "Above Bikfaya, placeholder"},
    "post": {"label": "The post house", "pos": frame.to_table(34.013, 35.826), "note": "Faraya village"},
    "hotel": {"label": "Where to stay", "pos": frame.to_table(33.976, 35.640), "note": "Jounieh hillside below Harissa"},
    "harbour": {"label": "Getting there", "pos": frame.to_table(34.122, 35.642), "note": "Byblos harbour"},
    "cedars": {"label": "Things to do", "pos": frame.to_table(34.018, 35.850), "note": "High slopes above Faraya"},
    "steps": {"label": "Registry", "pos": frame.landmark_xy("harissa"), "note": "Harissa, the statue and its steps"},
    "square": {"label": "Questions", "pos": frame.landmark_xy("faraya"), "note": "Faraya square"},
}

PLACE_RADIUS = {"shore": 1.2, "hill": 1.7, "garden": 2.3, "post": 0.9, "hotel": 1.6, "harbour": 1.0, "cedars": 0.8, "steps": 0.7, "square": 0.7}


def _near_road(x, y, radius):
    for road in ROADS.values():
        for ax, ay in placement.resample(road, 0.2):
            if math.hypot(x - ax, y - ay) < radius:
                return True
    return False


def town_houses(seed=3):
    """Every town's houses. Cities pack a jittered grid; villages ring loosely."""
    rng = random.Random(seed)
    houses = []
    for tid, town in sorted(TOWNS.items()):
        cx, cy = town["pos"]
        r, s = town["radius"], town["scale"]
        placed = []
        attempts = 0
        while len(placed) < town["count"] and attempts < 6000:
            attempts += 1
            if town["kind"] == "city":
                gx = cx + rng.uniform(-r, r)
                gy = cy + rng.uniform(-r * 0.75, r * 0.75)
                x, y = round(gx / 0.3) * 0.3 + rng.uniform(-0.03, 0.03), round(gy / 0.3) * 0.3 + rng.uniform(-0.03, 0.03)
                w, d, h = s * rng.uniform(0.8, 1.0), s * rng.uniform(0.8, 1.0), rng.uniform(0.28, 0.55)
            else:
                a, rr = rng.uniform(0.0, math.tau), rng.uniform(0.15, r)
                x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.8
                w, d, h = s * rng.uniform(0.85, 1.15), s * rng.uniform(0.8, 1.05), s * rng.uniform(0.7, 1.1)
            if not hm.is_land(x, y):
                continue
            if _near_road(x, y, 0.22):
                continue
            if any(math.hypot(x - o["x"], y - o["y"]) <= (max(w, d) + max(o["w"], o["d"])) / 2 + 0.06 for o in placed):
                continue
            yaw = 0.0 if town["kind"] == "city" else math.atan2(cy - y, cx - x) + rng.uniform(-0.3, 0.3)
            placed.append({"x": x, "y": y, "w": w, "d": d, "h": h, "yaw": yaw, "town": tid})
        houses += placed
    return houses


def exclusions():
    zones = [(p["pos"][0], p["pos"][1], PLACE_RADIUS[pid]) for pid, p in PLACES.items()]
    zones += [(t["pos"][0], t["pos"][1], t["radius"] + 0.2) for t in TOWNS.values()]
    zones += [(t["x"], t["y"], 0.4) for t in TOWERS]
    for road in ROADS.values():
        zones += [(x, y, 0.28) for x, y in placement.resample(road, 0.3)]
    for piste in SKI["pistes"]:
        zones += [(x, y, 0.3) for x, y in placement.resample(piste, 0.3)]
    return zones
```

- [ ] **Step 3: Run the tests**

```bash
pnpm world:test
```
Expected: `OK`. If `test_roads_follow_real_waypoints_and_stay_on_land` fails for `coast` with more than one point off land, the Beirut headland waypoints sit in the sea at this resolution; nudge the offending coordinate 0.003 degrees east. If `test_houses_land_on_land_and_do_not_overlap` fails on the Beirut count, raise `attempts` to 9000.

- [ ] **Step 4: Commit**

```bash
git add tools/world/lib/layout.py tools/world/tests/test_layout.py
git commit -F - <<'EOF'
feat(world): roads, towns, towers and the nine places from real coordinates

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3
EOF
```

---

### Task 5: Scene modules follow the new land

**Files:**
- Modify: `tools/world/scene/terrain.py`, `tools/world/scene/flora.py`, `tools/world/scene/buildings.py`, `tools/world/scene/places.py`, `tools/world/scene/common.py`, `tools/world/build_world.py`

**Interfaces:**
- Consumes everything from Tasks 3 and 4.
- Produces: `common.lathe(name, profile, coll, mat, segments=9, seed=0)` (moved from `flora._lathe`, same body); `buildings.build(coll) -> int` now builds every town, the towers, all three roads, Faraya's square platform and the pistes; `places.build(coll)` adds Harissa's statue, Pigeon Rocks, and the ski base lodge and lift.

- [ ] **Step 1: terrain paints by elevation as well as slope**

In `tools/world/scene/terrain.py`, replace the body of the land branch inside `_paint` with:
```python
                else:
                    m = hm.elevation_m(x, y)
                    dry = noise.fbm(x * 0.9, y * 0.9, octaves=3, seed=21)
                    grass = palette.mix(palette.GRASS, palette.GRASS_DRY, dry)
                    # Above the pine line the slopes turn to limestone scree.
                    high = hm.smoothstep(1350.0, 1900.0, m)
                    ground = palette.mix(grass, palette.mix(palette.ROCK, palette.SNOWFIELD, 0.45), high)
                    stone = hm.smoothstep(0.9, 1.9, hm.slope(x, y))
                    c = palette.mix(ground, palette.STONE_DARK, stone)
```
Nothing else in the file changes; `hm.height` and `hm.SEA_LEVEL` keep their names.

- [ ] **Step 2: move the lathe into common**

Cut `_lathe` out of `flora.py`, paste it into `tools/world/scene/common.py` as `def lathe(...)` (add `import random` at the top of `common.py`), and in `flora.py` replace every `_lathe(` with `common.lathe(`.

- [ ] **Step 3: flora by elevation**

In `tools/world/scene/flora.py` replace the three density functions and `build` with:
```python
def _olive_density(x, y):
    m = hm.elevation_m(x, y)
    if m <= 20.0 or hm.gradient(x, y) > 2.2:
        return 0.0
    return 0.8 * (1.0 - hm.smoothstep(600.0, 850.0, m))


def _pine_density(x, y):
    m = hm.elevation_m(x, y)
    if m <= 0.0 or hm.gradient(x, y) > 2.6:
        return 0.0
    return 0.55 * hm.smoothstep(350.0, 550.0, m) * (1.0 - hm.smoothstep(1250.0, 1450.0, m))


def _cedar_density(x, y):
    m = hm.elevation_m(x, y)
    if m <= 0.0:
        return 0.0
    return 0.35 * hm.smoothstep(1400.0, 1600.0, m) * (1.0 - hm.smoothstep(1950.0, 2150.0, m))


def build(coll):
    protos = _prototypes(coll)
    zones = layout.exclusions()
    counts = {}
    hw, hd = hm.TABLE_W / 2 - 0.3, hm.TABLE_D / 2 - 0.3
    bounds = (-hw, -hd, hw, hd)

    def put(kind, x, y, scale, yaw, lift=0.0):
        n = counts.get(kind, 0)
        common.instance(f"{kind}.{n:03d}", protos[kind], common.place_on_ground(x, y, lift), coll, scale=scale, yaw=yaw)
        counts[kind] = n + 1

    for x, y, s, yaw in placement.scatter(bounds, 0.5, _olive_density, seed=31, exclude=zones, jitter=0.3):
        put("olive", x, y, s, yaw)
    for x, y, s, yaw in placement.scatter(bounds, 0.6, _pine_density, seed=32, exclude=zones):
        put("pine", x, y, s, yaw)
    for x, y, s, yaw in placement.scatter(bounds, 1.1, _cedar_density, seed=33, exclude=zones):
        put("cedar", x, y, s * 1.05, yaw)
    place_zones = [(p["pos"][0], p["pos"][1], layout.PLACE_RADIUS[pid]) for pid, p in layout.PLACES.items()]
    for rid, road in layout.ROADS.items():
        for x, y, yaw in placement.along(road, 0.8, 0.3, seed=34 + len(rid)):
            if hm.is_land(x, y) and not any((x - zx) ** 2 + (y - zy) ** 2 < r * r for zx, zy, r in place_zones):
                put("cypress", x, y, 1.0, yaw)
    rng = random.Random(36)
    for x, y in placement.resample(layout.ROADS["coast"], 1.2):
        # Palms on the seaward side of the corniche: step toward the sea until the ground is low.
        for step in (0.25, 0.45, 0.65):
            px, py = x, y - step
            if hm.is_land(px, py) and hm.elevation_m(px, py) < 40.0 and rng.random() < 0.7:
                put("palm", px, py, rng.uniform(0.85, 1.15), rng.uniform(0, math.tau))
                break
    return counts
```

- [ ] **Step 4: buildings build towns, towers, roads, the square and the pistes**

In `tools/world/scene/buildings.py` replace `_square` and `build` with:
```python
def _platform(name, cx, cy, radius, coll, top_mat, side_mat, depth=0.9):
    z = hm.height(cx, cy) + 0.03
    segs = 24
    top = [(cx + math.cos(i * math.tau / segs) * radius, cy + math.sin(i * math.tau / segs) * radius, z) for i in range(segs)]
    base = [(x, y, z - depth) for x, y, _ in top]
    verts = [(cx, cy, z)] + top + base
    faces = [(0, 1 + i, 1 + (i + 1) % segs) for i in range(segs)]
    faces += [(1 + i, 1 + segs + i, 1 + segs + (i + 1) % segs, 1 + (i + 1) % segs) for i in range(segs)]
    obj = common.mesh_object(name, verts, faces, coll, [top_mat, side_mat])
    for poly in obj.data.polygons:
        poly.material_index = 0 if poly.index < segs else 1
    return obj


def tower(name, x, y, w, d, h, coll):
    """A city tower: a tall stone box with a glass band per floor."""
    z = hm.height(x, y)
    stone = common.material("stone", palette.STONE, 0.9)
    glass = common.material("glass", palette.GLASS, 0.15)
    common.box(f"{name}-core", (w, d, h + FOOTING), (x, y, z - FOOTING), coll, stone)
    floors = max(3, int(h / 0.12))
    for i in range(floors):
        common.box(f"{name}-band{i}", (w + 0.012, d + 0.012, 0.045), (x, y, z + 0.05 + i * (h / floors)), coll, glass)


def build(coll):
    road = common.material("road", palette.ROAD, 0.95)
    stone_dark = common.material("stone-dark", palette.STONE_DARK, 0.9)
    for rid, poly in layout.ROADS.items():
        ribbon(f"road-{rid}", poly, 0.3 if rid == "coast" else 0.22, coll, road)
    _platform("square", layout.SQUARE["pos"][0], layout.SQUARE["pos"][1], layout.SQUARE["radius"], coll, road, stone_dark)
    pale = common.material("piste", palette.SNOWFIELD, 0.95)
    for i, piste in enumerate(layout.SKI["pistes"]):
        ribbon(f"piste-{i}", piste, 0.26, coll, pale, lift=0.02)
    houses = layout.town_houses()
    for i, hse in enumerate(houses):
        house(f"house.{i:03d}", hse["x"], hse["y"], hse["w"], hse["d"], hse["h"], hse["yaw"], coll, windows=hse["w"] > 0.35)
    for i, t in enumerate(layout.TOWERS):
        tower(f"tower.{i}", t["x"], t["y"], t["w"], t["d"], t["h"], coll)
    return len(houses)
```
`house()` and `_hip_roof()` and `ribbon()` are unchanged.

- [ ] **Step 5: places re-homed, plus Harissa, Pigeon Rocks and the ski base**

In `tools/world/scene/places.py`:
- `_hill`: Warde is the wedding venue (Lucien, 2026-09-11), so the campanile gives way to a mountain venue. Replace the whole function with:
```python
def _hill(coll):
    """The wedding venue at the foot of the Warde slopes: a long stone hall with
    the ink roof, a wide terrace looking down the valley, a pergola along the
    terrace edge, lanterns, and the pistes rising behind."""
    x, y = layout.PLACES["hill"]["pos"]
    z = hm.height(x, y)
    stone = _mat("stone", palette.STONE)
    roof_ink = _mat("roof-ink", palette.ROOF_INK, 0.75)
    wood = _mat("trunk", palette.TRUNK, 0.95)
    # The hall sits at the back of the plateau, the terrace in front toward the valley (negative y).
    hx, hy = x, y + 0.45
    buildings.house("venue-hall", hx, hy, 1.7, 0.75, 0.62, 0.0, coll, roof_mat=roof_ink, windows=True)
    common.box("venue-wing", (0.6, 0.6, 0.5 + buildings.FOOTING), (hx - 1.1, hy + 0.1, z - buildings.FOOTING), coll, stone)
    buildings._hip_roof("venue-wing-roof", 0.6, 0.6, 0.5, coll, roof_ink).location = (hx - 1.1, hy + 0.1, z)
    common.box("venue-terrace", (2.4, 1.1, 0.1 + buildings.FOOTING), (x, y - 0.35, z - buildings.FOOTING), coll, stone)
    common.box("venue-parapet", (2.4, 0.06, 0.16), (x, y - 0.9, z + 0.1), coll, _mat("stone-dark", palette.STONE_DARK, 0.9))
    for i, px in enumerate((-1.0, -0.5, 0.0, 0.5, 1.0)):
        common.cylinder(f"venue-post{i}", 0.03, 0.55, (x + px, y - 0.75, z + 0.1 + 0.275), coll, wood, segments=6)
    common.box("venue-beam", (2.2, 0.05, 0.05), (x, y - 0.75, z + 0.65), coll, wood)
    for i in range(10):
        common.box(f"venue-slat{i}", (0.04, 0.5, 0.03), (x - 1.0 + i * 0.22, y - 0.55, z + 0.69), coll, wood)
    for i, px in enumerate((-0.9, -0.3, 0.3, 0.9)):
        lantern(f"venue-lantern{i}", (x + px, y - 0.75, z + 0.6), coll)
    for i in range(5):
        common.box(f"venue-step{i}", (0.9, 0.14, 0.05 * (5 - i)), (x, y - 0.95 - 0.14 * i - 0.07, z - 0.02), coll, stone)
```
The `steps` place moves to Harissa (Task 4 already does this), so the venue's own steps are decorative.
- `_garden`: unchanged; it reads `layout.PLACES["garden"]["pos"]`.
- `_shore`: unchanged in body; it now lands on the Jounieh corniche.
- `_harbour`: replace `shore_y = hm.coastline(x) + 0.2` with a search for the shore: 
```python
    shore_y = y
    while shore_y < y + 1.5 and not hm.is_land(x, shore_y):
        shore_y += 0.05
```
and keep the rest.
- Add three functions and call them from `build`:
```python
def _harissa(coll):
    """Our Lady of Lebanon: a white cone of steps under a small figure, on the hill above Jounieh."""
    x, y = layout.PLACES["steps"]["pos"]
    z = hm.height(x, y)
    paper = _mat("paper", palette.PAPER, 0.7)
    base = common.cone("harissa-base", 0.28, 0.5, (x, y, z + 0.25), coll, paper, segments=12)
    common.smooth_by_angle(base, 40)
    common.cylinder("harissa-pillar", 0.06, 0.16, (x, y, z + 0.58), coll, paper, segments=10)
    figure = common.icosphere("harissa-figure", 0.06, (x, y, z + 0.72), coll, paper, subdivisions=1, scale=(1.0, 1.0, 1.6))
    common.smooth_by_angle(figure, 40)
    for i in range(6):
        common.box(f"harissa-step{i}", (0.2, 0.9 - i * 0.12, 0.04), (x + 0.3 + i * 0.08, y, z + 0.04 * (5 - i)), coll, _mat("stone", palette.STONE))


def _pigeon_rocks(coll):
    x, y = frame.landmark_xy("pigeon_rocks")
    rock = _mat("rock", palette.ROCK, 0.95)
    for i, (dx, dy, r, sz) in enumerate(((-0.35, -0.5, 0.28, 1.7), (-0.05, -0.62, 0.2, 1.3))):
        blob = common.icosphere(f"pigeon-rock{i}", r, (x + dx, y + dy, -0.15), coll, rock, subdivisions=1, scale=(1.0, 0.8, sz))
        common.smooth_by_angle(blob, 35)


def _ski_base(coll):
    """Warde: a long lodge at the foot of the pistes and a lift line climbing to the top."""
    bx, by = layout.SKI["base"]
    tx, ty = layout.SKI["top"]
    buildings.house("warde-lodge", bx - 0.6, by - 0.4, 1.3, 0.6, 0.5, math.atan2(ty - by, tx - bx) + math.pi / 2, coll, windows=True)
    wood = _mat("trunk", palette.TRUNK, 0.95)
    steps = 7
    for i in range(steps + 1):
        t = i / steps
        px, py = bx + (tx - bx) * t, by + (ty - by) * t
        pz = hm.height(px, py)
        common.cylinder(f"lift-pylon{i}", 0.018, 0.42, (px, py, pz + 0.21), coll, wood, segments=5)
    for i in range(steps):
        t0, t1 = i / steps, (i + 1) / steps
        a = (bx + (tx - bx) * t0, by + (ty - by) * t0, hm.height(bx + (tx - bx) * t0, by + (ty - by) * t0) + 0.42)
        b = (bx + (tx - bx) * t1, by + (ty - by) * t1, hm.height(bx + (tx - bx) * t1, by + (ty - by) * t1) + 0.42)
        mid = tuple((a[k] + b[k]) / 2 for k in range(3))
        length = math.dist(a, b)
        cable = common.cylinder(f"lift-cable{i}", 0.006, length, mid, coll, wood, segments=4)
        direction = Vector(b) - Vector(a)
        cable.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
```
Add `from mathutils import Vector` and `from lib import frame` to the imports. In `build`, call `_harissa(coll)`, `_pigeon_rocks(coll)`, `_ski_base(coll)` after `_cedars(coll)`.

- [ ] **Step 6: build_world**

No interface change. Make sure `build_world.py` still calls `terrain.build`, `sea.build`, `flora.build`, `buildings.build`, `places.build`, `lighting.setup`, `lighting.set_time` in that order and prints `FLORA` and `HOUSES` lines.

- [ ] **Step 7: Run the preview and look**

```bash
pnpm world:test && pnpm world:preview 2>&1 | grep -E "^(FLORA|HOUSES|BUILD_S|RENDER_S|LUMINANCE)|Traceback|Error"
```
Expected: no traceback, `HOUSES` 180 or more, `FLORA olive` 250 to 600, `pine` 150 to 400, `cedar` 15 to 60.

Read `tools/world/out/preview.png`. Acceptance: Beirut's headland at the front left dense with small blocks and four towers, the coast road curving round Jounieh bay, Harissa's white cone on the hill above it, Byblos at the right with its harbour, olives on the lower slopes, pines above, bare pale slopes and cedars high at the back right with the pistes and lift at Warde, the garden's plateau above Bikfaya, Faraya's square. The relief should read as real: valleys cutting to the sea, Sannine's mass at the back. Fix geometry or layout constants; do not adjust cameras yet (Task 7).

- [ ] **Step 8: Commit**

```bash
git add tools/world
git commit -F - <<'EOF'
feat(world): the scene follows the real land, with Beirut, Harissa, Byblos and the Warde slopes

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3
EOF
```

---

### Task 6: Surface and atmosphere

**Files:**
- Modify: `tools/world/scene/lighting.py`, `tools/world/scene/common.py`, `tools/world/scene/sea.py`, `tools/world/scene/cameras.py`, `tools/world/stills.py`

**Interfaces:**
- Produces: `lighting.TIMES[t]["sky_view"]` (brightness the camera sees, separate from what lights the scene), `lighting.TIMES[t]["mist"]` (haze strength 0 to 1), `lighting.setup_compositor(scene)`, `common.paper_mode(on: bool)` (swaps every object's materials to paper, glossy paper on the sea and still water), `cameras.configure_render(..., dof=True)`.

- [ ] **Step 1: Camera-ray sky**

In `lighting.setup`, after creating `sky`, replace the single link to the Background with:
```python
    background = nodes["Background"]
    view = nodes.new("ShaderNodeBackground")
    view.name = "ViewBackground"
    light_path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMixShader")
    links.new(sky.outputs["Color"], background.inputs["Color"])
    links.new(sky.outputs["Color"], view.inputs["Color"])
    links.new(background.outputs["Background"], mix.inputs[1])
    links.new(view.outputs["Background"], mix.inputs[2])
    links.new(light_path.outputs["Is Camera Ray"], mix.inputs["Fac"])
    links.new(mix.outputs["Shader"], nodes["World Output"].inputs["Surface"])
```
In `set_time`, after setting `Background` strength, add:
```python
    nodes["ViewBackground"].inputs["Strength"].default_value = t["sky_view"]
```
Add to `TIMES`: afternoon `"sky_view": 0.12, "mist": 0.35`; dusk `"sky_view": 0.2, "mist": 0.5`.

- [ ] **Step 2: Mist haze in the compositor**

Add to `lighting.py`:
```python
def setup_compositor(scene):
    """Distance haze from the Mist pass, tinted with the sky. Cheap, and it is
    what makes the far ridge sit behind the near coast."""
    scene.view_layers[0].use_pass_mist = True
    scene.world.mist_settings.start = 14.0
    scene.world.mist_settings.depth = 26.0
    scene.world.mist_settings.falloff = "QUADRATIC"
    scene.use_nodes = True
    tree = scene.node_tree
    for node in list(tree.nodes):
        tree.nodes.remove(node)
    layers = tree.nodes.new("CompositorNodeRLayers")
    haze = tree.nodes.new("CompositorNodeRGB")
    haze.name = "HazeColour"
    strength = tree.nodes.new("CompositorNodeMath")
    strength.name = "HazeStrength"
    strength.operation = "MULTIPLY"
    mix = tree.nodes.new("CompositorNodeMixRGB")
    mix.blend_type = "MIX"
    out = tree.nodes.new("CompositorNodeComposite")
    tree.links.new(layers.outputs["Image"], mix.inputs[1])
    tree.links.new(haze.outputs["RGBA"], mix.inputs[2])
    tree.links.new(layers.outputs["Mist"], strength.inputs[0])
    tree.links.new(strength.outputs["Value"], mix.inputs["Fac"])
    tree.links.new(mix.outputs["Image"], out.inputs["Image"])
```
In `set_time`, add:
```python
    tree = scene.node_tree
    if tree is not None and "HazeStrength" in tree.nodes:
        tree.nodes["HazeStrength"].inputs[1].default_value = t["mist"]
        tree.nodes["HazeColour"].outputs[0].default_value = t["haze"]
```
Add to `TIMES`: afternoon `"haze": (0.78, 0.84, 0.88, 1.0)`; dusk `"haze": (0.62, 0.5, 0.48, 1.0)`. Call `lighting.setup_compositor(bpy.context.scene)` in `build_world.build` right after `lighting.setup`.

- [ ] **Step 3: Paper grain and paper mode**

In `common.material`, after the Base Color line, add:
```python
    if name.startswith("paper"):
        grain = nodes.new("ShaderNodeTexNoise")
        grain.inputs["Scale"].default_value = 180.0
        grain.inputs["Detail"].default_value = 4.0
        bump = nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.035
        mat.node_tree.links.new(grain.outputs["Fac"], bump.inputs["Height"])
        mat.node_tree.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
```
Add to `common.py`:
```python
_saved_materials: dict[str, list] = {}


def paper_mode(on: bool):
    """The unpainted maquette. Everything becomes matte paper except water, which
    becomes glossy paper so the sea stays visible by finish rather than colour."""
    matte = material("paper", palette.PAPER, 0.7)
    gloss = material("paper-gloss", palette.PAPER, 0.08)
    if on:
        for obj in bpy.data.objects:
            if obj.type != "MESH":
                continue
            _saved_materials[obj.name] = [slot.material for slot in obj.material_slots]
            water = obj.name in ("sea", "garden-water") or any(m is not None and m.name.startswith("sea") for m in _saved_materials[obj.name])
            for slot in obj.material_slots:
                slot.material = gloss if water else matte
    else:
        for name, mats in _saved_materials.items():
            obj = bpy.data.objects.get(name)
            if obj is None:
                continue
            for slot, mat in zip(obj.material_slots, mats):
                slot.material = mat
        _saved_materials.clear()
```
In `stills.py`, replace the `material_override` lines with `common.paper_mode(paper)` before the render and `common.paper_mode(False)` after.

- [ ] **Step 4: Miniature depth of field and an overview that shows sky**

In `cameras.py`:
```python
SHOTS["overview"] = {"loc": (-15.5, -23.0, 8.0), "target": (0.8, 1.6, 1.0), "focal": 35, "fstop": 0.7}
SHOTS["overview_portrait"] = {"loc": (-17.5, -25.5, 9.5), "target": (0.8, 1.8, 1.0), "focal": 35, "fstop": 0.7, "portrait": True}
```
and every place shot `fstop` becomes `1.2`. Add a `beirut` shot: `{"loc": (-9.5, -12.5, 3.2), "target": (-4.8, -5.8, 0.6), "focal": 45, "fstop": 1.2}`, and re-anchor the others to `layout.PLACES` positions: for each of `shore, hill, garden, post, harbour`, `loc = (px + dx, py + dy, hm.height(px, py) + dz)` and `target = (px, py, hm.height(px, py) + tz)` with these offsets:

| shot | dx | dy | dz | tz | focal |
|---|---|---|---|---|---|
| shore | -2.6 | -4.0 | 1.9 | 0.4 | 40 |
| hill | 2.6 | -5.0 | 3.4 | 1.2 | 40 |
| garden | -2.4 | -3.4 | 3.0 | 0.2 | 40 |
| post | 0.6 | -2.4 | 2.6 | 0.4 | 40 |
| harbour | 2.7 | -3.5 | 1.7 | 0.2 | 50 |

In `stills.STILLS` add `("beirut", "beirut", "dusk", False)` after `harbour`.

- [ ] **Step 5: Render the preview stills and look**

```bash
pnpm world:test && pnpm world:stills:preview 2>&1 | grep -E "^STILL|Traceback|Error"
```
Read every frame in `tools/world/out/stills/`. Acceptance additions over phase one: sky visible above the ridge in both overviews, graded warm to blue at dusk; the far ridge softened by haze while the near coast is crisp; the near sea and far mountains gently out of focus in the overview so it reads as a miniature; the paper maquette shows a glossy sea; Beirut at dusk with lit windows and the towers against the bay. Tune `mist`, `sky_view`, `fstop` one at a time and record what you changed.

- [ ] **Step 6: Full stills and commit**

```bash
pnpm world:stills 2>&1 | grep -E "^STILL|Traceback|Error"
git add tools/world public/world/stills
git commit -F - <<'EOF'
feat(world): a sky you can see, haze on the far ridge, paper grain, and a miniature's depth of field

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BqTZ9aEKDsBXirEL9kgfm3
EOF
```

---

### Task 7: Docs and handoff

- [ ] Update `tools/world/README.md`: add `pnpm world:terrain`, the frame constants, the data rule (tiles ignored, JSON committed, builds offline), and that place positions are placeholders until the venues are known.
- [ ] Update `docs/awaiting.md`: row 18 stays open; add a row asking Lucien to confirm which place should be the wedding venue once known, since the hill place at Warde is his hint, not a decision.
- [ ] Run `pnpm world:test && pnpm lint:check && pnpm typecheck && pnpm test`, commit, push `immersive-world`, and hand the ten stills to Lucien for the look decision.

---

## Self-review against the spec

- **As close to reality as possible, literal geography**: Tasks 1 to 5 (frame, real elevation, real roads, towns and landmarks).
- **Sea visible in the paper state**: Task 6 `paper_mode` with glossy paper on water.
- **Legend behind a button**: web phase, nothing here.
- **Ink as accent only**: unchanged from phase one; towers use `GLASS`, not ink.
- **Placeholders for venues**: stated in `layout.py`, in the plan constraints, and in Task 7's awaiting row.
- Not in this plan: bake, glTF, R3F. Phase two.

Name consistency checked: `hm.elevation_m`, `hm.is_land`, `hm.smoothstep`, `hm.gradient`, `hm.slope`, `hm.height`, `hm.PLATEAUS` used identically in Tasks 3 to 6; `layout.ROADS`, `layout.TOWNS`, `layout.TOWERS`, `layout.SQUARE`, `layout.SKI`, `layout.PLACES`, `layout.PLACE_RADIUS`, `layout.town_houses`, `layout.exclusions` in Tasks 4 to 6; `frame.landmark_xy`, `frame.to_table` throughout; material names `"paper"`, `"paper-gloss"`, `"glass"`, `"piste"`, `"rock"` spelled once each.
