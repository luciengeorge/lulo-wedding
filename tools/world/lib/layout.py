"""Roads, towns, landmarks and the nine places, from real coordinates.

Everything here is placed with frame.to_table so the diorama is literal
geography at souvenir scale: real shapes and positions, oversized buildings.
The venues are still unknown (docs/awaiting.md rows 2 to 4); the hill place
sits at the foot of the Warde slopes because Lucien named that spot, and the
others are placeholders near towns a guest would recognise.
"""

import math
import random

from . import frame
from . import heightmap as hm
from . import placement


def _pts(*ids_or_coords):
    out = []
    for item in ids_or_coords:
        if isinstance(item, str):
            out.append(frame.landmark_xy(item))
        else:
            out.append(frame.to_table(*item))
    return out


# Waypoints along the real highways, densified later by the ribbon builder.
ROADS = {
    "coast": _pts("airport", (33.870, 35.500), "ashrafieh", (33.905, 35.545), "dbayeh", "zouk", "jounieh", "tabarja", (34.070, 35.640), "byblos"),
    "faraya": _pts("jounieh", (33.985, 35.660), "ajaltoun", (33.990, 35.720), "faytroun", (34.006, 35.790), "faraya", "warde"),
    "metn": _pts("ashrafieh", (33.880, 35.580), "broummana", (33.900, 35.660), "bikfaya"),
}

# kind decides the vocabulary: city blocks small and dense, villages loose.
TOWNS = {
    "beirut": {"pos": frame.to_table(33.885, 35.510), "radius": 2.3, "kind": "city", "count": 120, "scale": 0.2, "label": "Beirut"},
    "dbayeh": {"pos": frame.landmark_xy("dbayeh"), "radius": 0.95, "kind": "town", "count": 14, "scale": 0.4, "label": "Dbayeh"},
    "zouk": {"pos": frame.landmark_xy("zouk"), "radius": 0.9, "kind": "town", "count": 12, "scale": 0.4, "label": "Zouk"},
    "jounieh": {"pos": frame.landmark_xy("jounieh"), "radius": 1.5, "kind": "town", "count": 26, "scale": 0.42, "label": "Jounieh"},
    "byblos": {"pos": frame.landmark_xy("byblos"), "radius": 1.15, "kind": "town", "count": 18, "scale": 0.45, "label": "Byblos"},
    "broummana": {"pos": frame.landmark_xy("broummana"), "radius": 1.15, "kind": "village", "count": 14, "scale": 0.55, "label": "Broummana"},
    "bikfaya": {"pos": frame.landmark_xy("bikfaya"), "radius": 1.15, "kind": "village", "count": 14, "scale": 0.55, "label": "Bikfaya"},
    "ajaltoun": {"pos": frame.landmark_xy("ajaltoun"), "radius": 0.95, "kind": "village", "count": 10, "scale": 0.55, "label": "Ajaltoun"},
    "faytroun": {"pos": frame.landmark_xy("faytroun"), "radius": 0.85, "kind": "village", "count": 8, "scale": 0.55, "label": "Faytroun"},
    "faraya": {"pos": frame.landmark_xy("faraya"), "radius": 1.35, "kind": "village", "count": 22, "scale": 0.6, "label": "Faraya"},
    "warde": {"pos": frame.to_table(34.022, 35.885), "radius": 1.0, "kind": "resort", "count": 6, "scale": 0.6, "label": "Warde"},
}

TOWERS = [
    {**dict(zip(("x", "y"), frame.landmark_xy("ashrafieh"))), "w": 0.22, "d": 0.22, "h": 1.35, "label": "Ashrafieh Tower"},
    {**dict(zip(("x", "y"), frame.to_table(33.896, 35.500))), "w": 0.2, "d": 0.2, "h": 0.95, "label": "downtown"},
    {**dict(zip(("x", "y"), frame.to_table(33.892, 35.488))), "w": 0.18, "d": 0.18, "h": 0.85, "label": "Raouche"},
    {**dict(zip(("x", "y"), frame.to_table(33.900, 35.520))), "w": 0.2, "d": 0.2, "h": 1.05, "label": "Mar Mikhael"},
]

SQUARE = {"pos": frame.landmark_xy("faraya"), "radius": 0.55}

SKI = {
    "base": frame.landmark_xy("warde"),
    "top": frame.to_table(33.998, 35.882),
    "pistes": [
        _pts("warde", (34.003, 35.872), (34.000, 35.885)),
        _pts("warde", (34.008, 35.874), (34.006, 35.888)),
        _pts("warde", (33.999, 35.870), (33.995, 35.882)),
    ],
}

PLACES = {
    "shore": {"label": "By the sea", "pos": frame.to_table(33.986, 35.623), "note": "North end of Jounieh bay, placeholder"},
    "hill": {"label": "On the hill", "pos": frame.landmark_xy("warde"), "note": "Foot of the Warde slopes, named by Lucien"},
    "garden": {"label": "In the garden", "pos": frame.to_table(33.930, 35.726), "note": "On the ridge east of Bikfaya, placeholder"},
    "post": {"label": "The post house", "pos": frame.to_table(34.013, 35.826), "note": "Faraya village"},
    "hotel": {"label": "Where to stay", "pos": frame.to_table(34.003, 35.757), "note": "Above Faytroun on the Faraya road, where guests would stay"},
    "harbour": {"label": "Getting there", "pos": frame.to_table(34.121, 35.640), "note": "Byblos harbour"},
    "cedars": {"label": "Things to do", "pos": frame.to_table(34.024, 35.843), "note": "High slopes above Faraya"},
    "steps": {"label": "Registry", "pos": frame.landmark_xy("harissa"), "note": "Harissa, the statue and its steps"},
    "square": {"label": "Questions", "pos": frame.landmark_xy("faraya"), "note": "Faraya square"},
}

PLACE_RADIUS = {"shore": 0.8, "hill": 1.25, "garden": 1.9, "post": 0.9, "hotel": 0.9, "harbour": 1.0, "cedars": 0.8, "steps": 0.7, "square": 0.7}


def _near_road(x, y, radius):
    for road in ROADS.values():
        for ax, ay in placement.resample(road, 0.2):
            if math.hypot(x - ax, y - ay) < radius:
                return True
    return False


def town_houses(seed=3):
    """Every town's houses. Cities pack a jittered grid; villages ring loosely."""
    rng = random.Random(seed)
    houses = []
    for tid, town in sorted(TOWNS.items()):
        cx, cy = town["pos"]
        r, s = town["radius"], town["scale"]
        placed = []
        attempts = 0
        while len(placed) < town["count"] and attempts < 9000:
            attempts += 1
            if town["kind"] == "city":
                gx = cx + rng.uniform(-r, r)
                gy = cy + rng.uniform(-r * 0.75, r * 0.75)
                x, y = round(gx / 0.24) * 0.24 + rng.uniform(-0.02, 0.02), round(gy / 0.24) * 0.24 + rng.uniform(-0.02, 0.02)
                w, d, h = s * rng.uniform(0.8, 1.0), s * rng.uniform(0.8, 1.0), rng.uniform(0.28, 0.55)
            else:
                a, rr = rng.uniform(0.0, math.tau), rng.uniform(0.15, r)
                x, y = cx + math.cos(a) * rr, cy + math.sin(a) * rr * 0.8
                w, d, h = s * rng.uniform(0.85, 1.15), s * rng.uniform(0.8, 1.05), s * rng.uniform(0.7, 1.1)
            if not hm.is_land(x, y):
                continue
            if _near_road(x, y, 0.17):
                continue
            if any(math.hypot(x - p["pos"][0], y - p["pos"][1]) < PLACE_RADIUS[pid] for pid, p in PLACES.items()):
                continue
            if any(math.hypot(x - o["x"], y - o["y"]) <= (max(w, d) + max(o["w"], o["d"])) / 2 + 0.06 for o in placed):
                continue
            yaw = 0.0 if town["kind"] == "city" else math.atan2(cy - y, cx - x) + rng.uniform(-0.3, 0.3)
            placed.append({"x": x, "y": y, "w": w, "d": d, "h": h, "yaw": yaw, "town": tid})
        houses += placed
    return houses


def exclusions():
    zones = [(p["pos"][0], p["pos"][1], PLACE_RADIUS[pid]) for pid, p in PLACES.items()]
    # A city fills a rectangle of half sides r by 0.75 r, so its disc must reach the corners.
    zones += [(t["pos"][0], t["pos"][1], t["radius"] * (1.3 if t["kind"] == "city" else 1.0) + 0.2) for t in TOWNS.values()]
    zones += [(t["x"], t["y"], 0.4) for t in TOWERS]
    for road in ROADS.values():
        zones += [(x, y, 0.28) for x, y in placement.resample(road, 0.3)]
    for piste in SKI["pistes"]:
        zones += [(x, y, 0.3) for x, y in placement.resample(piste, 0.3)]
    return zones
