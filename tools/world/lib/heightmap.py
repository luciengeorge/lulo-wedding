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
# Horizontal width of a riser. A hard floor aliases on the mesh grid into teeth
# wherever a contour runs diagonally; a short continuous ramp cannot.
RISER_WIDTH = 0.16
TERRACE_BAND = (-1.0, 4.0)
RIDGE_Y, RIDGE_H = 6.5, 3.6
INLAND_RISE, INLAND_REACH = 2.4, 4.5
VILLAGE = (3.0, 2.5)

# Levelled ground cut into the slope for a place that needs a flat floor:
# id -> ((x, y), half width, half depth). The level is the natural terrace
# height at the centre, so a plateau is one wide terrace, not a mesa.
PLATEAUS = {
    "garden": ((-5.5, 1.6), 1.75, 1.35),
}
PLATEAU_APRON = 0.5


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


def smooth_height(x: float, y: float) -> float:
    """The land without its small-scale roughness. Terraces are cut from this so a
    step boundary is a continuous contour, not a per-vertex coin toss."""
    d = y - coastline(x)
    if d <= 0:
        return -0.6 * smoothstep(0.0, 2.5, -d)
    # Saturating rise, so the land behind the ridge falls away instead of climbing to the edge.
    ramp = INLAND_RISE * (1.0 - math.exp(-d / INLAND_REACH))
    ridge = RIDGE_H * math.exp(-(((y - RIDGE_Y) / 2.2) ** 2)) * (0.75 + 0.25 * noise.fbm(x * 0.25, 3.1, seed=5))
    vx, vy = VILLAGE
    knoll = 1.1 * math.exp(-(((x - vx) / 2.6) ** 2 + ((y - vy) / 1.9) ** 2))
    return ramp + ridge + knoll


def roughness(x: float, y: float) -> float:
    d = y - coastline(x)
    if d <= 0:
        return 0.0
    return 0.35 * (noise.fbm(x * 0.6, y * 0.6, seed=2) - 0.5) * smoothstep(0.0, 1.5, d)


def base_height(x: float, y: float) -> float:
    return smooth_height(x, y) + roughness(x, y)


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
    lift = smoothstep(1.0 - k, 1.0, f)
    return (n + lift) * TERRACE_STEP + 0.04


def riser_fraction(x: float, y: float) -> float:
    """The fraction of a terrace's width taken by its riser, so the riser is
    RISER_WIDTH wide on the ground whatever the slope. Unclamped above: a value
    past about 0.5 means the ground is too steep to hold a terrace at all."""
    return max(0.05, RISER_WIDTH * gradient(x, y) / TERRACE_STEP)


def terrace_weight(x: float, y: float) -> float:
    """How terraced this point is: 1 on the groves, fading to 0 toward the pines
    and on ground too steep for a terrace to be wider than its riser."""
    lo, hi = TERRACE_BAND
    if not (lo <= y <= hi):
        return 0.0
    band = 1.0 - smoothstep(hi - 0.8, hi, y)
    steep = 1.0 - smoothstep(0.35, 0.6, riser_fraction(x, y))
    return band * steep


def _height_unlevelled(x: float, y: float) -> float:
    smooth = smooth_height(x, y)
    if smooth > 0.05:
        weight = terrace_weight(x, y)
        if weight > 0.0:
            stepped = terrace(smooth, min(0.6, riser_fraction(x, y)))
            return base_height(x, y) * (1.0 - weight) + stepped * weight
    return base_height(x, y)


def plateau_mask(x: float, y: float) -> float:
    """1 inside a plateau, easing to 0 across PLATEAU_APRON outside it."""
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
    """Gradient magnitude of the final surface, for painting stone onto risers."""
    eps = 0.04
    gx = (height(x + eps, y) - height(x - eps, y)) / (2 * eps)
    gy = (height(x, y + eps) - height(x, y - eps)) / (2 * eps)
    return math.hypot(gx, gy)


def is_land(x: float, y: float) -> bool:
    return height(x, y) > SEA_LEVEL + 0.02
