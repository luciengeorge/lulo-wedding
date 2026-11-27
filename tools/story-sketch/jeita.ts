/**
 * Inside the Jeita Grotto: the cave's mouth framing it all, curtains of
 * stalactites hanging from the roof, a column and stalagmites at the edges,
 * and the still underground river with one small boat and its reflection.
 */
import { GROUND, INK, type Layer, curve, curves, dab, line, lines, part, put, shape, wash } from "./kit.ts";

/** The near edge of the water, and the far one where the river goes on into the dark. */
const NEAR = GROUND - 14;
const FAR = 418;

/** The roof and walls of the cave, from the left bank round to the right. */
const ROOF: [number, number][] = [
  [100, NEAR],
  [112, 410],
  [98, 352],
  [112, 292],
  [140, 238],
  [176, 198],
  [222, 170],
  [262, 152],
  [302, 146],
  [344, 130],
  [400, 120],
  [452, 124],
  [502, 114],
  [556, 122],
  [604, 138],
  [642, 136],
  [686, 162],
  [726, 198],
  [758, 242],
  [782, 292],
  [794, 342],
  [784, 398],
  [800, NEAR],
];
function roofAt(x: number) {
  for (let i = 0; i < ROOF.length - 1; i++) {
    const [x0, y0] = ROOF[i];
    const [x1, y1] = ROOF[i + 1];
    if (y0 < 260 && y1 < 260 && x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
  }
  return 260;
}

/**
 * A curtain of stalactites: stone grown down from the roof between `x0` and
 * `x1`, with drips hanging from it, each [x, length, width]. Only its
 * underside is drawn; the roof line over it is the cave's own.
 */
function curtain(L: Layer, colour: string, x0: number, x1: number, drips: [number, number, number][], w: "far" | "mid" = "mid") {
  const top: number[] = [];
  for (let x = x0; x < x1; x += 12) top.push(x, roofAt(x) - 3);
  top.push(x1, roofAt(x1) - 3);
  const under: number[] = [x1, roofAt(x1) - 2];
  for (const [x, len, dw] of [...drips].sort((a, b) => b[0] - a[0])) {
    const y = roofAt(x) + 10;
    under.push(x + dw / 2, y, x + dw * 0.22, y + len * 0.55, x + dw * 0.06, y + len * 0.9, x, y + len, x - dw * 0.1, y + len * 0.86, x - dw * 0.26, y + len * 0.5, x - dw / 2, y);
  }
  under.push(x0, roofAt(x0) - 2);
  const d = shape([...top, ...under]);
  L.body += d;
  L.fills.push([colour, d, 0.8]);
  L.strokes.push(line(under, w, 0.6));
}
/** One stalagmite, rising from the bank, rounded at the tip. */
const rise = (x: number, foot: number, h: number, w: number) => [
  x - w / 2,
  foot + 2,
  x - w * 0.32,
  foot - h * 0.5,
  x - w * 0.12,
  foot - h * 0.9,
  x,
  foot - h,
  x + w * 0.14,
  foot - h * 0.88,
  x + w * 0.3,
  foot - h * 0.45,
  x + w / 2,
  foot + 2,
];

/** The rock beyond the mouth, a few strokes of it. */
const rock: Layer = {
  ...part(),
  strokes: [
    curves(
      [
        [84, 424, 78, 366, 90, 304],
        [102, 252, 132, 202, 176, 168],
        [236, 138, 300, 120, 372, 104],
        [470, 98, 560, 100, 636, 116],
        [700, 140, 752, 182, 788, 234],
        [806, 296, 818, 356, 812, 414],
      ],
      "far",
      1,
    ),
    curves(
      [
        [92, 330, 90, 300],
        [120, 226, 136, 206],
        [300, 126, 330, 118],
        [604, 120, 640, 126],
        [772, 226, 788, 250],
        [810, 374, 812, 402],
      ],
      "far",
      0.5,
    ),
  ],
};

/** The cave going on beyond, smaller and fainter, where the river comes from. */
const beyond: Layer = (() => {
  const L = part();
  L.strokes.push(curve([330, FAR, 336, 340, 370, 292, 430, 266, 498, 262, 560, 282, 600, 330, 612, FAR], "mid", 1));
  for (const [x, len] of [
    [392, 22],
    [414, 34],
    [436, 18],
    [470, 26],
    [522, 30],
    [546, 16],
    [570, 24],
  ]) {
    const y = x < 498 ? 292 - ((x - 370) / 128) * 30 : 262 + ((x - 498) / 62) * 20;
    L.strokes.push(line([x - 4, y + 2, x, y + len, x + 4, y + 2], "far", 0.2));
  }
  return L;
})();

const water: Layer = (() => {
  const L = part();
  wash(L, INK.sea, [330, FAR, 612, FAR, 680, 436, 760, NEAR - 2, 720, NEAR + 18, 600, NEAR + 30, 470, NEAR + 34, 320, NEAR + 30, 190, NEAR + 18, 140, NEAR - 2, 240, 436], 0.4);
  L.strokes.push(
    // Ripples, and the reflections of what stands at the edge.
    lines(
      [
        [382, FAR + 8, 430, FAR + 8],
        [504, FAR + 10, 560, FAR + 10],
        [190, NEAR + 10, 240, NEAR + 10],
        [272, NEAR + 18, 330, NEAR + 18],
        [608, NEAR + 16, 650, NEAR + 16],
        [676, NEAR + 8, 736, NEAR + 8],
        [340, NEAR + 30, 400, NEAR + 30],
        [548, NEAR + 28, 600, NEAR + 28],
        [700, 448, 702, 462],
        [710, 450, 712, 468],
        [726, 448, 727, 458],
      ],
      "far",
      0.4,
    ),
  );
  return L;
})();

/** Where a stalactite met a stalagmite long ago: a column from roof to bank. */
const column: Layer = (() => {
  const L = part();
  const x = 712;
  const top = roofAt(x) - 4;
  const foot = 444;
  // Its top follows the roof as it falls away to the right.
  dab(
    L,
    INK.stone,
    [x - 28, roofAt(x - 28) - 4, x - 14, top + 50, x - 9, 290, x - 7, 330, x - 12, 380, x - 24, 420, x - 40, foot, x + 36, foot, x + 22, 416, x + 10, 370, x + 8, 320, x + 10, 270, x + 14, roofAt(x + 14) + 40, x + 22, roofAt(x + 22) - 4],
    "mid",
    0.9,
    0.8,
  );
  L.strokes.push(curves([[x - 2, top + 30, x - 1, 300, x - 3, 380, x - 12, foot - 8], [x + 10, 400, x + 16, foot - 6]], "far", 0.5));
  return L;
})();

const stalactites: Layer = (() => {
  const L = part();
  curtain(L, INK.stone, 146, 304, [[166, 40, 16], [192, 78, 20], [218, 32, 12], [244, 112, 22], [268, 48, 14], [290, 28, 10]]);
  curtain(L, INK.sand, 328, 478, [[346, 40, 12], [368, 74, 18], [394, 196, 26], [420, 56, 14], [442, 92, 18], [464, 34, 12]]);
  curtain(L, INK.stone, 518, 688, [[536, 60, 16], [558, 128, 22], [582, 44, 14], [606, 80, 18], [630, 38, 12], [654, 66, 16], [676, 30, 12]]);
  curtain(L, INK.stone, 306, 328, [[316, 36, 12]], "far");
  curtain(L, INK.stone, 480, 518, [[490, 24, 10], [506, 52, 14]], "far");
  // Lines down the long ones, where the water ran.
  L.strokes.push(
    curves(
      [
        [394, 150, 393, 250, 395, 300],
        [244, 180, 245, 240],
        [558, 150, 558, 220],
        [192, 196, 193, 230],
      ],
      "far",
      0.4,
    ),
  );
  return L;
})();

/** The cave's own outline, drawn last so the stalactites hang from it. */
const rim: Layer = { ...part(), strokes: [curve(ROOF.flat(), "near", 1.4)] };

const banks: Layer = (() => {
  const L = part();
  dab(L, INK.stone, [100, NEAR + 2, 108, NEAR - 18, 150, NEAR - 28, 206, 428, 262, 420, 306, 414, 330, FAR + 2, 300, 428, 240, 438, 180, 446, 134, NEAR + 2], "mid", 0.8, 0.55);
  dab(L, INK.stone, [612, FAR + 2, 646, 414, 700, 424, 750, NEAR - 18, 790, NEAR - 12, 800, NEAR + 2, 770, NEAR + 2, 720, 446, 680, 438, 640, 428], "mid", 0.8, 0.55);
  for (const [x, foot, h, w] of [
    [144, 438, 86, 20],
    [172, 434, 52, 14],
    [206, 428, 30, 12],
    [764, 440, 60, 18],
    [786, 444, 32, 12],
    [664, 424, 26, 10],
  ])
    dab(L, INK.sand, rise(x, foot, h, w), "far", 0.4, 0.85);
  L.strokes.push(curves([[120, NEAR - 6, 160, NEAR - 14, 200, NEAR - 16], [744, NEAR - 6, 780, NEAR - 4]], "far", 0.5));
  return L;
})();

/** The boat, three people in it, and the boat again upside down in the water. */
const boat: Layer = (() => {
  const L = part();
  const x = 462;
  const y = 442;
  wash(L, INK.wood, [x - 70, y + 6, x + 72, y + 6, x + 60, y + 20, x - 58, y + 18], 0.35);
  L.strokes.push(
    lines(
      [
        [x - 72, y + 8, x + 76, y + 8],
        [x - 54, y + 17, x + 58, y + 17],
        [x - 26, y + 25, x + 30, y + 25],
      ],
      "far",
      0.5,
    ),
  );
  for (const [px, c, tall] of [
    [x - 38, INK.navy, 1],
    [x - 6, INK.red, 0.9],
    [x + 28, INK.teal, 1],
  ] as const) {
    put(L, c, [px - 8, y - 10, px - 6, y - 10 - 18 * tall, px + 6, y - 10 - 18 * tall, px + 8, y - 10], "far", 0.2, 0.75);
    dab(L, INK.wood, [px - 5, y - 15 - 18 * tall, px, y - 21 - 18 * tall, px + 5, y - 15 - 18 * tall, px, y - 10 - 18 * tall], "far", 0.2, 0.85);
  }
  put(L, INK.wood, [x - 80, y - 16, x + 82, y - 14, x + 64, y + 2, x - 62, y + 2], "mid", 0.3, 0.85);
  L.strokes.push(line([x - 72, y - 10, x + 74, y - 8], "far", 0.2));
  return L;
})();

const JEITA: Layer[] = [rock, beyond, water, column, stalactites, rim, banks, boat];
export default JEITA;
