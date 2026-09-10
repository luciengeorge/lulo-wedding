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
