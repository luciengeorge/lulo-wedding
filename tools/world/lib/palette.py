"""The card's colour tokens, as Blender wants them.

Hex values are copied from the @theme block in src/styles.css. Blender materials
take linear RGB, so every token is converted once here. Derived shades are named
mixes of tokens, never new hex values, so the world stays in the card's family.
"""

TOKENS = {
    "paper": "#F9F1E5",
    "ink": "#9B0D17",
    "bark": "#3E2F26",
    "amber": "#D89353",
    "foliage": "#809B47",
    "sea": "#C6D6D5",
    "field": "#DFCDB4",
    "faded": "#6B5445",
}


def _srgb_to_linear(c: float) -> float:
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4))
    return (_srgb_to_linear(r), _srgb_to_linear(g), _srgb_to_linear(b))


def mix(a, b, t: float):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def shade(c, k: float):
    return tuple(min(1.0, max(0.0, v * k)) for v in c)


def rgba(c, alpha: float = 1.0):
    return (c[0], c[1], c[2], alpha)


PAPER = hex_to_linear(TOKENS["paper"])
INK = hex_to_linear(TOKENS["ink"])
BARK = hex_to_linear(TOKENS["bark"])
AMBER = hex_to_linear(TOKENS["amber"])
FOLIAGE = hex_to_linear(TOKENS["foliage"])
SEA = hex_to_linear(TOKENS["sea"])
FIELD = hex_to_linear(TOKENS["field"])
FADED = hex_to_linear(TOKENS["faded"])

# Ground and stone
STONE = FIELD
STONE_DARK = mix(FIELD, BARK, 0.35)
EARTH = mix(BARK, FIELD, 0.45)
SAND = mix(FIELD, SEA, 0.3)
GRASS = mix(FOLIAGE, FIELD, 0.22)
GRASS_DRY = mix(FOLIAGE, FIELD, 0.5)
ROAD = mix(FIELD, BARK, 0.25)
ROCK = mix(STONE_DARK, FADED, 0.35)
SNOWFIELD = mix(PAPER, SEA, 0.25)

# Flora
OLIVE = mix(FOLIAGE, SEA, 0.2)
CYPRESS = shade(FOLIAGE, 0.55)
PINE = shade(FOLIAGE, 0.8)
CEDAR = mix(shade(FOLIAGE, 0.6), SEA, 0.2)
PALM = mix(FOLIAGE, AMBER, 0.2)
TRUNK = BARK

# Built
ROOF = mix(AMBER, BARK, 0.45)
ROOF_INK = INK
WINDOW = shade(BARK, 0.5)
LANTERN = AMBER

# Water
SEA_SHALLOW = SEA
SEA_DEEP = shade(SEA, 0.55)
GLASS = shade(SEA, 0.8)
