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
