"""Five trees, built once each, instanced hundreds of times with shared mesh
data. Olives on the terraces, cypress along the roads, stone pines on the upper
slopes, cedars on the ridge, palms along the shore.

Scale: a village house is about 0.6 high. A cypress is two and a half houses,
an olive a little under one, a cedar the tallest thing on the ridge."""

import math
import random

from lib import heightmap as hm
from lib import layout, noise, palette, placement

from . import common

PROTOTYPES = {}

# On real land at 2.2 km per unit a tree is texture, not a landmark. Every
# instance is scaled by this so the relief, towns and roads carry the image.
TREE_SCALE = 0.42


def _trunk(name, radius, height, coll, lean=0.0, segments=7):
    trunk = common.material("trunk", palette.TRUNK, 0.95)
    t = common.lathe(name, [(radius, 0.0), (radius * 0.9, height * 0.5), (radius * 0.7, height)], coll, trunk, segments=segments)
    t.rotation_euler = (lean, 0.0, 0.0)
    return t


def _olive(coll):
    rng = random.Random(101)
    parts = [_trunk("olive-trunk", 0.045, 0.34, coll, lean=0.1)]
    canopy = common.material("olive", palette.OLIVE, 0.9)
    for i in range(5):
        a = i * math.tau / 5 + 0.3
        r = 0.09 if i else 0.0
        parts.append(
            common.icosphere(
                f"olive-c{i}",
                rng.uniform(0.17, 0.24),
                (math.cos(a) * r, math.sin(a) * r, 0.5 + rng.uniform(-0.03, 0.05)),
                coll,
                canopy,
                subdivisions=2,
                scale=(1.0, 1.0, 0.72),
            )
        )
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "olive"
    common.smooth_by_angle(obj, 50)
    return obj


def _cypress(coll):
    mat = common.material("cypress", palette.CYPRESS, 0.9)
    body = common.lathe(
        "cypress-body",
        [(0.03, 0.12), (0.11, 0.25), (0.14, 0.5), (0.13, 0.8), (0.1, 1.05), (0.06, 1.28), (0.02, 1.46)],
        coll,
        mat,
        segments=9,
        seed=7,
    )
    parts = [_trunk("cypress-trunk", 0.025, 0.16, coll, segments=6), body]
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "cypress"
    common.smooth_by_angle(obj, 50)
    return obj


def _pine(coll):
    mat = common.material("pine", palette.PINE, 0.9)
    crown = common.lathe(
        "pine-crown",
        [(0.12, 0.78), (0.36, 0.88), (0.44, 1.0), (0.38, 1.14), (0.2, 1.26), (0.05, 1.32)],
        coll,
        mat,
        segments=10,
        seed=8,
    )
    parts = [_trunk("pine-trunk", 0.045, 0.85, coll, lean=0.06), crown]
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "pine"
    common.smooth_by_angle(obj, 50)
    return obj


def _cedar(coll):
    rng = random.Random(202)
    parts = [_trunk("cedar-trunk", 0.07, 1.0, coll)]
    mat = common.material("cedar", palette.CEDAR, 0.9)
    for i, (r, z) in enumerate(((0.62, 0.62), (0.52, 0.9), (0.4, 1.16), (0.27, 1.4), (0.13, 1.58))):
        parts.append(
            common.icosphere(
                f"cedar-t{i}",
                r,
                (rng.uniform(-0.06, 0.06), rng.uniform(-0.06, 0.06), z),
                coll,
                mat,
                subdivisions=1,
                scale=(1.0, rng.uniform(0.85, 1.0), 0.16),
            )
        )
    obj = common.join(parts)
    common.bake_origin(obj)
    obj.name = "cedar"
    common.smooth_by_angle(obj, 40)
    return obj


def _frond(name, coll, mat, length=0.62, width=0.14, steps=5):
    """A tapered strip that lifts then droops along a parabola, folded along its
    midrib so it has volume and catches light on one side."""
    verts, faces = [], []
    for k in range(steps + 1):
        t = k / steps
        x = t * length
        z = 0.5 * x - 0.9 * x * x
        w = width * (1.0 - 0.8 * t)
        verts += [(x, -w / 2, z - 0.03 * (1 - t)), (x, 0.0, z), (x, w / 2, z - 0.03 * (1 - t))]
    for k in range(steps):
        a = 3 * k
        faces.append((a, a + 3, a + 4, a + 1))
        faces.append((a + 1, a + 4, a + 5, a + 2))
    return common.mesh_object(name, verts, faces, coll, [mat])


def _palm(coll):
    rng = random.Random(303)
    trunk = common.material("trunk", palette.TRUNK, 0.95)
    parts = []
    height = 1.05
    for i in range(6):
        z = i * height / 6
        parts.append(
            common.cylinder(f"palm-s{i}", 0.04 - i * 0.002, height / 6 + 0.01, (i * i * 0.006, 0.0, z + height / 12), coll, trunk, segments=6)
        )
    frond = common.material("palm", palette.PALM, 0.85)
    for i in range(12):
        f = _frond(f"palm-f{i}", coll, frond, length=rng.uniform(0.5, 0.68))
        f.location = (0.18, 0.0, height + 0.02)
        f.rotation_euler = (0.0, rng.uniform(-0.35, -0.05), i * math.tau / 12 + rng.uniform(-0.12, 0.12))
        parts.append(f)
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


def _olive_density(x, y):
    """Olive groves on the lower slopes, thinning with height and kept off steep ground."""
    m = hm.elevation_m(x, y)
    if m <= 20.0 or hm.gradient(x, y) > 2.0:
        return 0.0
    return 0.55 * (1.0 - hm.smoothstep(550.0, 800.0, m))


def _pine_density(x, y):
    """Stone pine on the middle slopes, in stands rather than a blanket."""
    m = hm.elevation_m(x, y)
    if m <= 0.0 or hm.gradient(x, y) > 2.2:
        return 0.0
    stands = noise.fbm(x * 0.35, y * 0.35, octaves=3, seed=44)
    return 0.6 * hm.smoothstep(350.0, 550.0, m) * (1.0 - hm.smoothstep(1200.0, 1400.0, m)) * hm.smoothstep(0.42, 0.62, stands)


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
        common.instance(f"{kind}.{n:03d}", protos[kind], common.place_on_ground(x, y, lift), coll, scale=scale * TREE_SCALE, yaw=yaw)
        counts[kind] = n + 1

    for x, y, s, yaw in placement.scatter(bounds, 0.32, _olive_density, seed=31, exclude=zones, jitter=0.3):
        put("olive", x, y, s, yaw)
    for x, y, s, yaw in placement.scatter(bounds, 0.36, _pine_density, seed=32, exclude=zones):
        put("pine", x, y, s, yaw)
    for x, y, s, yaw in placement.scatter(bounds, 0.6, _cedar_density, seed=33, exclude=zones):
        put("cedar", x, y, s * 1.05, yaw)
    place_zones = [(p["pos"][0], p["pos"][1], layout.PLACE_RADIUS[pid]) for pid, p in layout.PLACES.items()]
    for rid, road in layout.ROADS.items():
        for x, y, yaw in placement.along(road, 0.45, 0.2, seed=34 + len(rid)):
            if hm.is_land(x, y) and not any((x - zx) ** 2 + (y - zy) ** 2 < r * r for zx, zy, r in place_zones):
                put("cypress", x, y, 1.0, yaw)
    rng = random.Random(36)
    for x, y in placement.resample(layout.ROADS["coast"], 0.7):
        # Palms on the seaward side of the corniche: step toward the sea until the ground is low.
        for step in (0.25, 0.45, 0.65):
            px, py = x, y - step
            if hm.is_land(px, py) and hm.elevation_m(px, py) < 40.0 and rng.random() < 0.7:
                put("palm", px, py, rng.uniform(0.85, 1.15), rng.uniform(0, math.tau))
                break
    return counts
