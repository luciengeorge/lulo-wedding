"""The land: a heightmap grid with terrace risers in stone, a paper skirt down to
the board, the board itself, and the card it all sits on."""

import bpy

from lib import heightmap as hm
from lib import noise
from lib import palette

from . import common

RES = 0.1
SKIRT_DEPTH = -0.6
BOARD_MARGIN = 0.35
CARD_SIZE = 200.0


def _grid():
    nx, ny = int(hm.TABLE_W / RES) + 1, int(hm.TABLE_D / RES) + 1
    verts, faces = [], []
    for j in range(ny):
        for i in range(nx):
            x, y = -hm.TABLE_W / 2 + i * RES, -hm.TABLE_D / 2 + j * RES
            verts.append((x, y, hm.height(x, y)))
    for j in range(ny - 1):
        for i in range(nx - 1):
            a = j * nx + i
            faces.append((a, a + 1, a + nx + 1, a + nx))
    return verts, faces, nx, ny


def _paint(mesh, verts):
    """Grass on the flats with a noise-driven dry mix, stone where the surface is
    steep, sand under the water. Painted per corner with a soft edge so a riser
    is one continuous band rather than a per-face coin toss."""
    col = mesh.color_attributes.new("Col", "BYTE_COLOR", "CORNER")
    loops = mesh.loops
    cache = {}
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi = loops[li].vertex_index
            if vi not in cache:
                x, y, z = verts[vi]
                if z < hm.SEA_LEVEL:
                    c = palette.SAND
                else:
                    dry = noise.fbm(x * 0.9, y * 0.9, octaves=3, seed=21)
                    grass = palette.mix(palette.GRASS, palette.GRASS_DRY, dry)
                    stone = hm.smoothstep(0.9, 1.9, hm.slope(x, y))
                    c = palette.mix(grass, palette.STONE_DARK, stone)
                cache[vi] = palette.rgba(c)
            col.data[li].color = cache[vi]


def build(coll):
    verts, faces, nx, ny = _grid()
    ground = common.material("ground", palette.GRASS, roughness=0.95, vertex_color=True)
    land = common.mesh_object("terrain", verts, faces, coll, [ground])
    _paint(land.data, verts)
    common.smooth_by_angle(land, 40)

    # Skirt: the cut edge of the diorama, in paper, from the rim down to the board.
    paper = common.material("paper", palette.PAPER, roughness=0.7)
    rim = []
    rim += [j * nx for j in range(ny)]
    rim += [(ny - 1) * nx + i for i in range(1, nx)]
    rim += [j * nx + (nx - 1) for j in range(ny - 2, -1, -1)]
    rim += [i for i in range(nx - 2, 0, -1)]
    sverts, sfaces = [], []
    for k, vi in enumerate(rim):
        x, y, z = verts[vi]
        sverts += [(x, y, z), (x, y, SKIRT_DEPTH)]
    n = len(rim)
    for k in range(n):
        a, b = 2 * k, 2 * ((k + 1) % n)
        sfaces.append((a, b, b + 1, a + 1))
    common.mesh_object("skirt", sverts, sfaces, coll, [paper])

    # Board and card.
    hw, hd = hm.TABLE_W / 2 + BOARD_MARGIN, hm.TABLE_D / 2 + BOARD_MARGIN
    board = common.box("board", (2 * hw, 2 * hd, 0.5), (0, 0, SKIRT_DEPTH - 0.5), coll, paper)
    bevel = board.modifiers.new("Bevel", "BEVEL")
    bevel.width = 0.08
    bevel.segments = 4
    common.mesh_object(
        "card",
        [(-CARD_SIZE, -CARD_SIZE, SKIRT_DEPTH - 0.5), (CARD_SIZE, -CARD_SIZE, SKIRT_DEPTH - 0.5), (CARD_SIZE, CARD_SIZE, SKIRT_DEPTH - 0.5), (-CARD_SIZE, CARD_SIZE, SKIRT_DEPTH - 0.5)],
        [(0, 1, 2, 3)],
        coll,
        [paper],
    )
