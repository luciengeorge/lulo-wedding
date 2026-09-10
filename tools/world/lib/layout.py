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
        r = rng.uniform(SQUARE_RADIUS + 0.55, 3.6)
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
