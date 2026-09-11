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
