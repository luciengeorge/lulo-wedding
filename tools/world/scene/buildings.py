"""A small vocabulary of stone buildings and the roads between them. Everything
is boxes and prisms with a footing sunk into the slope, so nothing floats."""

import math
import random

from lib import heightmap as hm
from lib import layout, palette, placement

from . import common

FOOTING = 0.35


def _hip_roof(name, w, d, h, coll, mat, eave=0.07, pitch=0.28):
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
    door_x = -w * 0.24
    door = common.box(f"{name}-door", (0.16, 0.03, 0.26), (door_x, -d / 2 - 0.01, 0), coll, door_mat)
    parts.append(door)
    if windows:
        n = max(1, int(w / 0.32))
        for i in range(n):
            wx = -w / 2 + (i + 0.5) * (w / n)
            if abs(wx - door_x) < 0.16:
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
