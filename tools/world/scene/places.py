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
    """A walled grove with a basin at its heart, on ground the heightmap levels
    for it (see heightmap.PLATEAUS). Walls tall enough to read as walls beside
    the terrace risers, a gravel floor so the enclosure is a different ground
    from the groves outside."""
    x, y = layout.PLACES["garden"]["pos"]
    z = hm.height(x, y)
    wall = _mat("stone-dark", palette.STONE_DARK, 0.9)
    w, d, wall_h, wall_t = 3.2, 2.4, 0.34, 0.14
    for i, (sx, sy, sw, sd) in enumerate(((0, -d / 2, w, wall_t), (0, d / 2, w, wall_t), (-w / 2, 0, wall_t, d), (w / 2, 0, wall_t, d))):
        common.box(f"garden-wall{i}", (sw, sd, wall_h + 0.1), (x + sx, y + sy, z - 0.1), coll, wall)
    common.box("garden-floor", (w - wall_t, d - wall_t, 0.06), (x, y, z - 0.03), coll, _mat("road", palette.ROAD, 0.95))
    basin = common.cylinder("garden-basin", 0.42, 0.22, (x, y, z + 0.14), coll, _mat("stone", palette.STONE), segments=16)
    common.smooth_by_angle(basin, 40)
    water = common.cylinder("garden-water", 0.36, 0.02, (x, y, z + 0.25), coll, _mat("sea-still", palette.SEA_SHALLOW, 0.05), segments=16)
    common.smooth_by_angle(water, 40)
    for i in range(2):
        for j in range(3):
            gx, gy = x - 1.05 + j * 1.05, y - 0.62 + i * 1.24
            common.instance(f"garden-olive{i}{j}", flora.PROTOTYPES["olive"], (gx, gy, z + 0.03), coll, scale=0.6, yaw=(i * 3 + j) * 0.9)
    for i, (lx, ly) in enumerate(((-w / 2 + 0.1, -d / 2 + 0.1), (w / 2 - 0.1, -d / 2 + 0.1), (-w / 2 + 0.1, d / 2 - 0.1), (w / 2 - 0.1, d / 2 - 0.1))):
        common.cylinder(f"garden-lamp{i}", 0.015, 0.5, (x + lx, y + ly, z + wall_h + 0.25), coll, _mat("trunk", palette.TRUNK), segments=5)
        lantern(f"garden-lantern{i}", (x + lx, y + ly, z + wall_h + 0.52), coll)


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
