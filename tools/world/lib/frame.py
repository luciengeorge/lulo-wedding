"""Where the table is on the Earth.

The table is a rotated, scaled window onto real coordinates: x runs along the
coast toward the north-north-east, y runs inland toward the east-south-east so
the sea lies toward negative y as the rest of the code expects. Chosen with
Lucien on 2026-09-11: Ashrafieh at the south-west, the foot of the Warde ski
slopes at the north-east.
"""

import math

CENTRE = (33.9362, 35.6797)
BEARING = 20.0
KM_PER_UNIT = 2.2

_KM_LAT = 111.32
_KM_LON = _KM_LAT * math.cos(math.radians(CENTRE[0]))


def to_table(lat: float, lon: float) -> tuple[float, float]:
    east = (lon - CENTRE[1]) * _KM_LON
    north = (lat - CENTRE[0]) * _KM_LAT
    b = math.radians(BEARING)
    x = east * math.sin(b) + north * math.cos(b)
    y = east * math.cos(b) - north * math.sin(b)
    return x / KM_PER_UNIT, y / KM_PER_UNIT


def to_latlon(x: float, y: float) -> tuple[float, float]:
    b = math.radians(BEARING)
    xk, yk = x * KM_PER_UNIT, y * KM_PER_UNIT
    east = xk * math.sin(b) + yk * math.cos(b)
    north = xk * math.cos(b) - yk * math.sin(b)
    return CENTRE[0] + north / _KM_LAT, CENTRE[1] + east / _KM_LON


def metres_to_units(m: float) -> float:
    return m / (KM_PER_UNIT * 1000.0)


# id -> (lat, lon, label). Approximate to a few hundred metres, which is under
# a fifth of a table unit; good enough to place a model, not a survey.
LANDMARKS = {
    "airport": (33.821, 35.488, "Beirut airport"),
    "pigeon_rocks": (33.890, 35.470, "Pigeon Rocks"),
    "ashrafieh": (33.887, 35.517, "Ashrafieh"),
    "dbayeh": (33.945, 35.585, "Dbayeh"),
    "zouk": (33.968, 35.610, "Zouk"),
    "jounieh": (33.981, 35.630, "Jounieh"),
    "harissa": (33.982, 35.652, "Harissa"),
    "jeita": (33.944, 35.641, "Jeita"),
    "tabarja": (34.020, 35.640, "Tabarja"),
    "byblos": (34.121, 35.648, "Byblos"),
    "broummana": (33.883, 35.632, "Broummana"),
    "bikfaya": (33.922, 35.680, "Bikfaya"),
    "ajaltoun": (33.980, 35.690, "Ajaltoun"),
    "faytroun": (34.000, 35.750, "Faytroun"),
    "faraya": (34.011, 35.822, "Faraya"),
    "warde": (34.005, 35.860, "Warde, foot of the slopes"),
    "sannine": (33.958, 35.855, "Mount Sannine"),
}


def landmark_xy(pid: str) -> tuple[float, float]:
    lat, lon, _ = LANDMARKS[pid]
    return to_table(lat, lon)
