"""Fetch real elevation for the table frame and resample it onto the grid the
world is built from.

    pnpm world:terrain

Reads Mapzen Terrarium tiles (public, on AWS, no key) at zoom 11, caches them
under data/tiles/ (ignored), and writes data/heightmap.json (committed). Builds
never touch the network; they read the JSON. Re-run only if the frame changes.
Standard library only, so it runs under plain python3.
"""

import json
import math
import os
import struct
import sys
import urllib.request
import zlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lib import frame  # noqa: E402

ZOOM = 11
RES = 0.1
X0, Y0 = -12.0, -8.0
W, H = 241, 161
HERE = os.path.dirname(os.path.abspath(__file__))
TILES = os.path.join(HERE, "data", "tiles")
OUT = os.path.join(HERE, "data", "heightmap.json")


def _png_decode(data: bytes):
    pos, idat = 8, b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        kind, body = data[pos + 4 : pos + 8], data[pos + 8 : pos + 8 + length]
        pos += 12 + length
        if kind == b"IHDR":
            w, h, _, colour = struct.unpack(">IIBB", body[:10])
        elif kind == b"IDAT":
            idat += body
    raw = zlib.decompress(idat)
    channels = {2: 3, 6: 4}[colour]
    stride = w * channels
    out, prev, p = bytearray(), bytearray(stride), 0
    for _ in range(h):
        f = raw[p]
        p += 1
        line = bytearray(raw[p : p + stride])
        p += stride
        for i in range(stride):
            a = line[i - channels] if i >= channels else 0
            b = prev[i]
            c = prev[i - channels] if i >= channels else 0
            if f == 1:
                line[i] = (line[i] + a) & 255
            elif f == 2:
                line[i] = (line[i] + b) & 255
            elif f == 3:
                line[i] = (line[i] + ((a + b) >> 1)) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[i] = (line[i] + pred) & 255
        out += line
        prev = line
    return w, h, channels, bytes(out)


_tiles = {}


def _tile(tx: int, ty: int):
    if (tx, ty) not in _tiles:
        path = os.path.join(TILES, f"{ZOOM}-{tx}-{ty}.png")
        if not os.path.exists(path):
            url = f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{tx}/{ty}.png"
            os.makedirs(TILES, exist_ok=True)
            with urllib.request.urlopen(url, timeout=30) as response:
                open(path, "wb").write(response.read())
            print(f"FETCH {url}")
        _tiles[(tx, ty)] = _png_decode(open(path, "rb").read())
    return _tiles[(tx, ty)]


def elevation(lat: float, lon: float) -> float:
    n = 2**ZOOM
    xf = (lon + 180.0) / 360.0 * n
    yf = (1.0 - math.log(math.tan(math.radians(lat)) + 1.0 / math.cos(math.radians(lat))) / math.pi) / 2.0 * n
    tx, ty = int(xf), int(yf)
    w, h, channels, px = _tile(tx, ty)
    i = min(w - 1, int((xf - tx) * w))
    j = min(h - 1, int((yf - ty) * h))
    o = (j * w + i) * channels
    return px[o] * 256 + px[o + 1] + px[o + 2] / 256.0 - 32768.0


def main():
    rows = []
    for j in range(H):
        row = []
        for i in range(W):
            lat, lon = frame.to_latlon(X0 + i * RES, Y0 + j * RES)
            row.append(round(elevation(lat, lon)))
        rows.append(row)
    flat = [v for row in rows for v in row]
    print(f"GRID {W}x{H} min {min(flat)} max {max(flat)} sea_cells {sum(1 for v in flat if v <= 0)} tiles {len(_tiles)}")
    json.dump(
        {
            "frame": {"centre": list(frame.CENTRE), "bearing": frame.BEARING, "km_per_unit": frame.KM_PER_UNIT},
            "res": RES,
            "w": W,
            "h": H,
            "x0": X0,
            "y0": Y0,
            "elev": rows,
        },
        open(OUT, "w"),
        separators=(",", ":"),
    )
    print(f"WROTE {OUT} {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    main()
