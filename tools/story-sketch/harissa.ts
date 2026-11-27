/**
 * Harissa: Our Lady of Lebanon in white, arms open over the bay, on her tall
 * cone of stone with the stair winding round it, on a hill of pines. Below
 * and behind, the curve of Jounieh bay, and the cable car climbing to her.
 */
import { GROUND, INK, type Layer, curve, curves, dab, line, lines, part, put, shape, wash } from "./kit.ts";

function arc(cx: number, cy: number, rx: number, ry: number, from: number, sweep: number, steps = 12) {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + (sweep * i) / steps;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

/** The statue's middle, the hilltop under the cone, and the cone's top. */
const SX = 500;
const HILL = 346;
const TOP = 214;
/** Half the cone's width at height `y`. */
const coneAt = (y: number) => 11 + ((y - TOP) / (HILL - TOP)) * 26;

const HORIZON = 250;
/** The shore of the bay, from the foot of the hill round to the far point. */
const SHORE = [336, 432, 266, 422, 200, 402, 152, 374, 124, 340, 118, 306, 136, 284, 178, 274];

const sea: Layer = (() => {
  const L = part();
  // A band of water along the shore, thinning to nothing at each end.
  wash(
    L,
    INK.sea,
    [
      336, 432, 318, 430, 292, 426, 266, 422, 243, 416, 221, 410, 200, 402, 182, 393, 166, 384, 152, 374, 140, 363, 131, 352, 124, 340, 119, 328, 117, 316, 118, 306, 121, 297, 127, 290, 136, 284, 150, 279, 166, 276, 178, 274,
      179, 282, 168, 284, 156, 289, 148, 296, 146, 304, 148, 312, 152, 319, 156, 324, 161, 330, 168, 337, 176, 345, 186, 353, 198, 362, 213, 372, 230, 381, 250, 391, 271, 400, 294, 409, 319, 417, 337, 424,
    ],
    0.4,
  );
  L.strokes.push(
    line([206, HORIZON, 790, HORIZON], "far", 0.6),
    lines(
      [
        [250, 300, 300, 300],
        [330, 280, 372, 280],
        [610, 272, 680, 272],
        [700, 292, 744, 292],
        [236, 340, 282, 340],
        [300, 366, 350, 366],
      ],
      "far",
      0.5,
    ),
  );
  return L;
})();

/** Jounieh along the shore: the waterline, and a crowd of small houses behind it. */
const town: Layer = (() => {
  const L = part();
  L.strokes.push(curve(SHORE, "mid", 0.8), curve([346, 452, 262, 444, 186, 422, 130, 390, 102, 344, 100, 300, 118, 276], "far", 0.8));
  const houses: number[][] = [];
  for (const [x, y, w, h] of [
    [128, 318, 10, 12],
    [134, 352, 12, 10],
    [154, 378, 10, 12],
    [176, 396, 14, 10],
    [206, 410, 10, 12],
    [232, 422, 12, 10],
    [290, 432, 12, 12],
    [314, 438, 10, 10],
    [112, 296, 8, 10],
  ])
    houses.push([x, y + h, x, y, x + w, y, x + w, y + h, x, y + h]);
  L.strokes.push(lines(houses, "far", 0.3));
  return L;
})();

/** The hill's outline, from the bay round over the top and down to the right. */
const HILLSIDE = [300, GROUND, 340, 426, 372, 400, 404, 382, 432, 362, 470, HILL + 2, 530, HILL, 574, HILL + 6, 618, 362, 664, 384, 700, 404, 734, 428, 760, 450, 782, GROUND];
function hillAt(x: number) {
  for (let i = 0; i < HILLSIDE.length - 2; i += 2)
    if (x >= HILLSIDE[i] && x <= HILLSIDE[i + 2]) return HILLSIDE[i + 1] + ((HILLSIDE[i + 3] - HILLSIDE[i + 1]) * (x - HILLSIDE[i])) / (HILLSIDE[i + 2] - HILLSIDE[i]);
  return GROUND;
}

const hill: Layer = (() => {
  const L = part();
  L.body += shape(HILLSIDE);
  L.strokes.push(
    curve(HILLSIDE, "mid", 0.9),
    curve([110, GROUND + 4, 300, GROUND, 520, GROUND + 2, 794, GROUND + 4], "mid", 0.8),
    curves(
      [
        [470, 430, 520, 424, 560, 430],
        [380, 448, 420, 456, 450, 452],
      ],
      "far",
      0.6,
    ),
  );
  return L;
})();

/** An umbrella pine: a slim trunk and a flat green crown. */
function pine(L: Layer, x: number, foot: number, h: number, w: number, lean = 0) {
  const t = foot - h;
  L.strokes.push(curve([x, foot, x + lean * 0.5, foot - h * 0.5, x + lean, t + 4], "far", 0.4));
  dab(L, INK.foliage, [x + lean - w / 2, t + 2, x + lean - w * 0.38, t - 7, x + lean - w * 0.08, t - 11, x + lean + w * 0.26, t - 10, x + lean + w / 2, t - 2, x + lean + w * 0.28, t + 4, x + lean - w * 0.2, t + 5], "far", 0.3, 0.72);
}
/** A dark upright pine, a narrow flame of green. */
function spire(L: Layer, x: number, foot: number, h: number, w: number) {
  dab(L, INK.olive, [x - w / 2, foot, x - w * 0.3, foot - h * 0.55, x, foot - h, x + w * 0.3, foot - h * 0.55, x + w / 2, foot], "far", 0.3, 0.72);
}

/**
 * A row of pines along the hill, `drop` below the skyline: umbrella pines
 * with the odd dark upright one among them, crowding into a wood.
 */
function grove(xs: number[], drop: number, size: number) {
  const L = part();
  xs.forEach((x, i) => {
    const foot = Math.min(hillAt(x) + drop, GROUND - 4);
    const s = size * (0.85 + ((i * 7) % 5) * 0.08);
    if (i % 3 === 1) spire(L, x, foot, s * 1.5, s * 0.42);
    else pine(L, x, foot, s * 0.8, s * 1.3, ((i % 2) - 0.5) * 6);
  });
  return L;
}

const backPines = grove([420, 444, 466, 540, 562, 586, 610, 634, 658, 682, 704, 726, 746], 12, 38);

/** The cable car: two cables from the shore up the hill, a pylon, and the cabins. */
const cable: Layer = (() => {
  const L = part();
  const [x0, y0, x1, y1] = [214, 404, 452, 336];
  const at = (t: number, dy: number) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * 12 + dy];
  L.strokes.push(
    curve([...at(0, 0), ...at(0.25, 0), ...at(0.5, 0), ...at(0.75, 0), ...at(1, 0)], "far", 0.2),
    curve([...at(0, 6), ...at(0.25, 6), ...at(0.5, 6), ...at(0.75, 6), ...at(1, 6)], "far", 0.2),
    // The stations at each end, and a pylon on the slope.
    lines(
      [
        [x0 - 12, y0 + 16, x0 - 12, y0 - 6, x0 + 8, y0 - 6, x0 + 8, y0 + 16],
        [x1 - 6, y1 + 14, x1 - 6, y1 - 8, x1 + 14, y1 - 8, x1 + 14, y1 + 14],
        [380, 404, 386, 366, 392, 404],
        [378, 366, 394, 366],
      ],
      "far",
      0.2,
    ),
  );
  for (const [t, dy, c] of [
    [0.16, 0, INK.rose],
    [0.38, 6, INK.red],
    [0.62, 0, INK.rose],
    [0.84, 6, INK.red],
  ] as const) {
    const [x, y] = at(t, dy);
    L.strokes.push(line([x, y, x, y + 7], "far", 0.1));
    put(L, c, [x - 8, y + 7, x + 8, y + 7, x + 7, y + 21, x - 7, y + 21], "far", 0.2, 0.75);
    L.strokes.push(line([x - 6, y + 12, x + 6, y + 12], "far", 0.1));
  }
  return L;
})();

/** The cone, with the stair wound round it, and the railed top she stands on. */
const cone: Layer = (() => {
  const L = part();
  put(L, INK.stone, [SX - coneAt(HILL), HILL, SX - coneAt(TOP), TOP, SX + coneAt(TOP), TOP, SX + coneAt(HILL), HILL], "mid", 0.4, 0.7);
  // Each turn of the stair crosses the front rising to the right.
  const turns: number[][] = [];
  for (let y = HILL - 6; y > TOP + 22; y -= 24) {
    const y1 = y - 22;
    turns.push([SX - coneAt(y), y, SX, (y + y1) / 2 + 4, SX + coneAt(y1), y1]);
    turns.push([SX - coneAt(y + 5), y + 5, SX, (y + y1) / 2 + 9, SX + coneAt(y1 + 5), y1 + 5]);
  }
  L.strokes.push(curves(turns, "far", 0.3), line([SX - 6, HILL, SX - 6, HILL - 14, SX, HILL - 19, SX + 6, HILL - 14, SX + 6, HILL], "far", 0.2));
  put(L, INK.stone, [SX - 16, TOP + 2, SX - 18, TOP - 4, SX + 18, TOP - 4, SX + 16, TOP + 2], "far", 0.2, 0.85);
  L.strokes.push(lines([[SX - 18, TOP - 10, SX + 18, TOP - 10], ...[-16, -6, 6, 16].map((x) => [SX + x, TOP - 10, SX + x, TOP - 4])], "far", 0.1));
  return L;
})();

/** Our Lady, white, crowned, her arms held out and down over the bay. */
const statue: Layer = (() => {
  const L = part();
  const F = TOP - 4;
  const k = 1.3;
  const p = (pts: number[]) => pts.map((v, i) => (i % 2 ? F - v * k : SX + v * k));
  put(
    L,
    INK.white,
    p([-11, 0, -9, 24, -15, 24, -23, 30, -20, 34, -9, 44, -6, 49, ...arc(0, 53, 6, -7, Math.PI * 0.75, Math.PI * 1.5, 12), 6, 49, 9, 44, 20, 34, 23, 30, 15, 24, 9, 24, 11, 0]),
    "mid",
    0.2,
    0.9,
  );
  L.strokes.push(
    // The crown, and the folds of her robe.
    line(p([-5, 59, -5, 64, -2, 61, 0, 66, 2, 61, 5, 64, 5, 59]), "far", 0.1),
    curves(
      [p([-3, 40, -4, 20, -5, 2]), p([3, 38, 4, 18, 4, 2])],
      "far",
      0.2,
    ),
  );
  return L;
})();

const midPines = grove([474, 498, 522, 548, 574, 600, 626, 652, 678, 702, 724, 746], 40, 36);
const frontPines = grove([344, 368, 394, 420, 446, 472, 500, 560, 616, 668, 712], 72, 32);

const HARISSA: Layer[] = [sea, town, hill, backPines, cable, cone, statue, midPines, frontPines];
export default HARISSA;
