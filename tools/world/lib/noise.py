"""Deterministic value noise. No dependencies, so it runs identically under
system Python and Blender's interpreter, and the same seed always gives the
same world."""

import math

_MASK = 0xFFFFFFFF


def _hash(ix: int, iy: int, seed: int) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1442695041) & _MASK
    n = ((n ^ (n >> 13)) * 1274126177) & _MASK
    n = (n ^ (n >> 16)) & _MASK
    return n / _MASK


def _smooth(t: float) -> float:
    return t * t * (3.0 - 2.0 * t)


def value_noise(x: float, y: float, seed: int = 0) -> float:
    ix, iy = math.floor(x), math.floor(y)
    fx, fy = x - ix, y - iy
    a = _hash(ix, iy, seed)
    b = _hash(ix + 1, iy, seed)
    c = _hash(ix, iy + 1, seed)
    d = _hash(ix + 1, iy + 1, seed)
    u, v = _smooth(fx), _smooth(fy)
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v


def fbm(x: float, y: float, octaves: int = 4, lacunarity: float = 2.0, gain: float = 0.5, seed: int = 0) -> float:
    amplitude, frequency, total, norm = 1.0, 1.0, 0.0, 0.0
    for i in range(octaves):
        total += amplitude * value_noise(x * frequency, y * frequency, seed + i)
        norm += amplitude
        amplitude *= gain
        frequency *= lacunarity
    return total / norm
