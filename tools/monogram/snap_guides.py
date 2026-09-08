"""Snap hand-authored guide paths onto the monogram's true centreline.

The stroke ORDER and DIRECTION are mine — no tracing algorithm can infer how a
hand would write the mark. But the exact path should follow the ink, and my
eyeballed curves drift off it (the script L's median half-width measured 0,
i.e. off the stroke for half its length). So: keep my ordering, snap the
geometry to the skeleton, then measure the width each stroke actually needs.
"""

import math, re, subprocess, json

SIZE = (573, 580)

GUIDES = [
    ("crescent", "M90,10 C56,29 25,56 14,92 C6,131 31,171 76,193 C106,206 130,203 153,199"),
    ("roman-l", "M193,54 C195,150 197,300 199,428 C232,447 330,450 458,437"),
    ("script-l",
     "M246,202 C278,195 300,189 318,179 C350,148 374,104 397,66 "
     "C414,60 419,86 405,107 C386,140 356,184 331,224 C301,290 268,346 245,387"),
    ("swash",
     "M115,464 C86,467 65,485 70,501 C77,517 106,521 129,508 "
     "C151,496 172,505 202,515 C281,534 381,532 451,511 "
     "C506,494 536,454 528,404 C521,361 490,337 466,350 C449,358 447,369 453,379"),
]


def pixels(path, predicate):
    out = subprocess.run(["magick", path, "-depth", "8", "txt:-"],
                         capture_output=True, text=True).stdout
    pts = set()
    for line in out.splitlines():
        m = re.match(r"(\d+),(\d+): \((\d+)", line)
        if m:
            x, y, v = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if predicate(v):
                pts.add((x, y))
    return pts


def bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
            u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1])


def sample(d, per_seg=60):
    nums = [float(x) for x in re.findall(r"-?\d+(?:\.\d+)?", d)]
    cur = (nums[0], nums[1])
    pts = [cur]
    i = 2
    while i + 5 < len(nums):
        p1, p2, p3 = (nums[i], nums[i+1]), (nums[i+2], nums[i+3]), (nums[i+4], nums[i+5])
        for k in range(1, per_seg + 1):
            pts.append(bez(cur, p1, p2, p3, k / per_seg))
        cur = p3
        i += 6
    return pts


def snap(pts, skel, radius=34):
    """Move each sample to the nearest skeleton pixel, if one is close enough."""
    out = []
    for (x, y) in pts:
        best, bestd = None, radius * radius
        ix, iy = int(round(x)), int(round(y))
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                p = (ix + dx, iy + dy)
                if p in skel:
                    d = dx * dx + dy * dy
                    if d < bestd:
                        best, bestd = p, d
        out.append(best if best else (x, y))
    return out


def smooth(pts, window=9):
    n = len(pts)
    out = []
    for i in range(n):
        lo, hi = max(0, i - window // 2), min(n, i + window // 2 + 1)
        xs = sum(p[0] for p in pts[lo:hi]) / (hi - lo)
        ys = sum(p[1] for p in pts[lo:hi]) / (hi - lo)
        out.append((xs, ys))
    return out


def thin(pts, min_step=6.0):
    out = [pts[0]]
    for p in pts[1:]:
        if math.hypot(p[0] - out[-1][0], p[1] - out[-1][1]) >= min_step:
            out.append(p)
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def needed_half_width(pts, ink, cap=90):
    req = []
    for j in range(1, len(pts)):
        x0, y0 = pts[j-1]
        x1, y1 = pts[j]
        dx, dy = x1 - x0, y1 - y0
        L = math.hypot(dx, dy)
        if L < 1e-6:
            continue
        nx, ny = -dy / L, dx / L
        for sgn in (1, -1):
            r = 0
            while r < cap:
                px, py = int(round(x1 + nx*sgn*r)), int(round(y1 + ny*sgn*r))
                if (px, py) not in ink:
                    break
                r += 1
            req.append(r)
    req.sort()
    return req[len(req)//2], req[int(len(req)*0.9)], req[-1]


# Rasterise the very SVG the component renders, so "ink" here is exactly the
# ink on screen rather than a re-derived approximation.
subprocess.run(["magick", "-background", "white",
                "public/art/monogram.svg",
                "-flatten", "-resize", f"{SIZE[0]}x{SIZE[1]}!",
                "-colorspace", "Gray", "-threshold", "62%", "tools/monogram/.g_bin.png"], check=True)
subprocess.run(["magick", "tools/monogram/.g_bin.png", "-negate",
                "-morphology", "Thinning:-1", "Skeleton", "tools/monogram/.g_skel.png"], check=True)

ink = pixels("tools/monogram/.g_bin.png", lambda v: v < 128)
skel = pixels("tools/monogram/.g_skel.png", lambda v: v > 127)
print(f"ink {len(ink)}  skeleton {len(skel)}")

result = []
for name, d in GUIDES:
    pts = sample(d)
    snapped = thin(smooth(snap(pts, skel)))
    med, p90, mx = needed_half_width(snapped, ink)
    # p90 rather than max: the max is a single fat junction, and sizing every
    # stroke for it would bleed into neighbouring ink.
    width = int(math.ceil(p90 * 2 / 4) * 4)
    print(f"  {name:10s} pts={len(snapped):3d}  half-width med={med:2d} p90={p90:2d} max={mx:2d}  -> stroke {width}")
    d_out = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in snapped)
    result.append({"name": name, "d": d_out, "width": width})

json.dump(result, open("tools/monogram/guides.json", "w"), indent=1)
print("wrote tools/monogram/guides.json")
