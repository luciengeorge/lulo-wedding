/**
 * The Cedars of God: one old cedar, as wide as it is tall, its branches held
 * out flat in shelves the way only a cedar's are, with the mountain behind.
 */
import { GROUND, INK, type Layer, blobs, curve, curves, dab, ellipse, lines, part, put, wash } from "./kit.ts";

const X = 452;

/** A shelf of foliage: bumpy along the top, nearly flat underneath. */
function shelf(cx: number, cy: number, rx: number, ry: number, lean: number): number[] {
  const out: number[] = [];
  const bumps = Math.max(5, Math.round(rx / 17));
  for (let i = 0; i <= bumps * 2; i++) {
    const t = i / (bumps * 2);
    const a = Math.PI * (1 - t);
    const lift = i % 2 ? 1.22 : 0.92;
    out.push(cx + Math.cos(a) * rx, cy - Math.sin(a) * ry * lift + (t - 0.5) * lean);
  }
  // Back along the underside, which sags a little in the middle.
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    out.push(cx + rx - t * rx * 2, cy + ry * 0.42 * Math.sin(Math.PI * t) - (t - 0.5) * lean);
  }
  return out;
}

const SHELVES: [cx: number, cy: number, rx: number, ry: number, lean: number][] = [
  [X - 148, 372, 168, 22, -10],
  [X + 152, 356, 176, 23, 12],
  [X - 170, 312, 150, 21, -8],
  [X + 166, 296, 152, 21, 10],
  [X - 126, 256, 128, 19, -6],
  [X + 128, 240, 124, 19, 8],
  [X - 78, 204, 100, 17, -4],
  [X + 84, 190, 96, 16, 5],
  [X + 4, 156, 92, 16, 0],
];

/** The range behind, low and far off, with snow still lying near the top. */
const mountain: Layer = {
  ...part(),
  strokes: [
    curve([30, 452, 96, 430, 150, 402, 196, 388, 236, 400, 290, 426, 330, 440], "far", 1.1),
    curve([590, 440, 650, 418, 706, 392, 744, 380, 790, 398, 840, 430, 880, 450], "far", 1.1),
    curves(
      [
        [170, 398, 190, 393, 206, 398],
        [722, 390, 742, 385, 760, 392],
      ],
      "far",
      0.5,
    ),
  ],
};

const ground: Layer = (() => {
  const L = part();
  wash(L, INK.olive, ellipse(X, GROUND + 6, 250, 13), 0.16);
  L.strokes.push(
    curve([96, GROUND + 8, 250, GROUND + 2, X - 40, GROUND, X + 60, GROUND + 1, 640, GROUND + 4, 806, GROUND + 10], "mid", 0.9),
    // Tufts of grass.
    lines(
      [
        [188, GROUND + 4, 184, GROUND - 5],
        [194, GROUND + 4, 196, GROUND - 7],
        [200, GROUND + 4, 205, GROUND - 4],
        [690, GROUND + 6, 686, GROUND - 3],
        [696, GROUND + 6, 698, GROUND - 6],
        [702, GROUND + 6, 707, GROUND - 2],
      ],
      "far",
      0.3,
    ),
  );
  return L;
})();

const stones: Layer = (() => {
  const L = part();
  dab(L, INK.stone, ellipse(262, GROUND + 3, 17, 9), "far", 0.9, 0.7);
  dab(L, INK.stone, ellipse(284, GROUND + 5, 10, 6), "far", 0.6, 0.7);
  dab(L, INK.stone, ellipse(642, GROUND + 4, 14, 8), "far", 0.8, 0.7);
  return L;
})();

const trunk: Layer = (() => {
  const L = part();
  put(
    L,
    INK.taupe,
    [X - 30, GROUND + 2, X - 19, GROUND - 26, X - 13, 380, X - 9, 290, X - 6, 200, X - 2, 166, X + 3, 166, X + 7, 200, X + 11, 290, X + 15, 380, X + 21, GROUND - 26, X + 32, GROUND + 2],
    "near",
    0.6,
    0.6,
  );
  L.strokes.push(
    // Bark, and where the roots take hold.
    lines(
      [
        [X - 6, GROUND - 6, X - 4, 404],
        [X + 5, GROUND - 16, X + 5, 392],
        [X - 1, 372, X, 316],
        [X + 3, 300, X + 3, 246],
      ],
      "far",
      0.5,
    ),
    curves(
      [
        [X - 30, GROUND + 2, X - 44, GROUND + 5, X - 56, GROUND + 4],
        [X + 32, GROUND + 2, X + 46, GROUND + 5, X + 60, GROUND + 3],
      ],
      "mid",
      0.4,
    ),
  );
  return L;
})();

/** The branch a shelf sits on, from the trunk out along its underside. */
const branches: Layer = {
  ...part(),
  strokes: [
    curves(
      SHELVES.slice(0, 8).map(([cx, cy, rx, ry]) => {
        const side = Math.sign(cx - X);
        const from = cy + 34 - (372 - cy) * 0.04;
        return [X + side * 5, from, X + side * rx * 0.36, cy + ry + 7, cx - side * rx * 0.1, cy + ry * 0.5, cx + side * rx * 0.55, cy + 3];
      }),
      "mid",
      0.6,
    ),
  ],
};

const foliage: Layer[] = SHELVES.map(([cx, cy, rx, ry, lean], i) => {
  const L = part();
  const outline = shelf(cx, cy, rx, ry, lean);
  dab(L, i % 3 === 1 ? INK.olive : INK.foliage, outline, "mid", 1.1, i % 3 === 1 ? 0.62 : 0.74);
  // The shade under each shelf.
  wash(L, INK.olive, shelf(cx, cy + ry * 0.2, rx * 0.86, ry * 0.36, lean), 0.3);
  L.strokes.push(
    blobs(
      [
        ellipse(cx - rx * 0.36, cy - ry * 0.2, rx * 0.16, ry * 0.3, Math.PI, Math.PI),
        ellipse(cx + rx * 0.3, cy - ry * 0.1, rx * 0.2, ry * 0.3, Math.PI, Math.PI),
      ],
      "far",
      0.5,
    ),
  );
  return L;
});

const CEDARS: Layer[] = [mountain, ground, stones, branches, trunk, ...foliage];
export default CEDARS;
