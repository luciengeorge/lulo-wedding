/**
 * The old harbour of Byblos: the little stone harbour with its tower at the
 * mouth, fishing boats on calm water, and the square keep of the Crusader
 * castle on the rise behind, over the low houses and palms of the old town.
 */
import { INK, type Layer, curve, curves, dab, ellipse, line, lines, part, put, wash } from "./kit.ts";

const QUAY = 404;
const WATER = 420;
const ROOF = "#c98a64";

/** The open sea past the harbour mouth, and the line of the rise behind the town. */
const behind: Layer = {
  ...part(),
  strokes: [
    line([84, 352, 196, 352], "far", 0.4),
    line([226, 352, 268, 352], "far", 0.4),
    lines(
      [
        [438, 336, 436, 330],
        [444, 335, 446, 328],
        [722, 338, 720, 332],
        [728, 338, 731, 331],
        [756, 362, 754, 356],
      ],
      "far",
      0.2,
    ),
    curve([296, QUAY - 2, 352, 360, 420, 326, 486, 304, 560, 294, 640, 298, 704, 318, 760, 352, 806, QUAY - 2], "far", 0.9),
  ],
};

/** The castle: the square keep, with a stretch of curtain wall and a corner tower. */
const castle: Layer = (() => {
  const L = part();
  // Curtain wall, left and right of the keep.
  put(L, INK.stone, [430, 318, 434, 276, 508, 268, 508, 312], "mid", 0.4, 0.7);
  put(L, INK.stone, [602, 306, 602, 272, 664, 276, 668, 316], "mid", 0.4, 0.7);
  // A round tower at the corner.
  put(L, INK.stone, [664, 324, 662, 258, 670, 252, 694, 252, 702, 258, 700, 330], "mid", 0.4, 0.75);
  // The keep, a little ruined along the top.
  put(
    L,
    INK.stone,
    [506, 306, 508, 168, 522, 164, 522, 172, 538, 170, 540, 162, 560, 162, 562, 170, 578, 168, 580, 160, 598, 162, 600, 304],
    "near",
    0.5,
    0.85,
  );
  L.strokes.push(
    // Merlons along the curtain wall.
    lines(
      [
        [434, 276, 434, 268, 446, 267, 446, 275],
        [462, 273, 462, 265, 474, 264, 474, 272],
        [490, 270, 490, 262, 500, 262, 500, 269],
        [618, 273, 618, 265, 630, 265, 630, 274],
        [644, 275, 644, 267, 654, 267, 654, 275],
      ],
      "far",
      0.3,
    ),
    // Courses of stone, a few only.
    lines(
      [
        [512, 200, 596, 199],
        [510, 246, 598, 245],
        [512, 280, 552, 280],
      ],
      "far",
      0.6,
    ),
    // Windows: narrow, round headed.
    curves(
      [
        [529, 228, 529, 214, 533, 210, 537, 214, 537, 228],
        [571, 228, 571, 214, 575, 210, 579, 214, 579, 228],
        [552, 190, 552, 182, 555, 179, 558, 182, 558, 190],
        [680, 286, 680, 276, 683, 273, 686, 276, 686, 286],
      ],
      "mid",
      0.15,
    ),
  );
  return L;
})();

/** One flat roofed stone house with an arched door and a window. */
function house(L: Layer, x0: number, x1: number, top: number, door: number) {
  put(L, INK.stone, [x0, QUAY, x0, top, x1, top, x1, QUAY], "mid", 0.4, 0.8);
  L.strokes.push(
    curve([door - 8, QUAY, door - 8, QUAY - 18, door - 4, QUAY - 25, door + 4, QUAY - 25, door + 8, QUAY - 18, door + 8, QUAY], "mid", 0.2),
    line([x0 - 3, top, x1 + 3, top], "mid", 0.3),
  );
}

const town: Layer = (() => {
  const L = part();
  house(L, 300, 352, 364, 326);
  // The one with the tiled roof.
  put(L, INK.stone, [348, QUAY, 348, 352, 422, 352, 422, QUAY], "mid", 0.4, 0.8);
  put(L, ROOF, [342, 354, 362, 330, 408, 330, 428, 354], "mid", 0.4, 0.8);
  L.strokes.push(
    curve([377, QUAY, 377, 384, 385, 376, 393, 384, 393, QUAY], "mid", 0.2),
    lines([[360, 366, 360, 376, 368, 376, 368, 366, 360, 366], [402, 366, 402, 376, 410, 376, 410, 366, 402, 366]], "far", 0.2),
    lines([[352, 344, 418, 344]], "far", 0.4),
  );
  house(L, 668, 734, 358, 712);
  house(L, 734, 790, 372, 760);
  L.strokes.push(lines([[680, 368, 680, 378, 690, 378, 690, 368, 680, 368]], "far", 0.2));
  return L;
})();

/** A palm: a leaning trunk and a crown of drooping fronds. */
function palm(bx: number, tx: number, ty: number): Layer {
  const L = part();
  const by = QUAY;
  put(L, INK.wood, [bx - 5, by, tx - 3, ty + 4, tx + 3, ty + 4, bx + 5, by], "mid", 0.6, 0.55);
  L.strokes.push(
    lines(
      [0.2, 0.36, 0.52, 0.68, 0.84].map((t) => {
        const x = bx + (tx - bx) * t;
        const y = by + (ty - by) * t;
        return [x - 4, y + 1, x + 4, y - 1];
      }),
      "far",
      0.2,
    ),
  );
  // Each frond arches out from the crown and droops at its tip: angle, length, droop.
  const fronds: [number, number, number][] = [
    [-168, 62, 34],
    [-138, 52, 24],
    [-100, 34, 12],
    [-62, 46, 22],
    [-16, 62, 34],
    [28, 40, 26],
    [152, 40, 26],
  ];
  for (const [deg, len, droop] of fronds) {
    const a = (deg * Math.PI) / 180;
    const at = (t: number) => [tx + Math.cos(a) * len * t, ty + Math.sin(a) * len * t + droop * t * t];
    const upper: number[] = [];
    const lower: number[] = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const [x, y] = at(t);
      const dx = Math.cos(a) * len;
      const dy = Math.sin(a) * len + 2 * droop * t;
      const n = Math.hypot(dx, dy);
      // The side of the frond facing up is the full one; the side underneath is narrow.
      const flip = dx > 0 ? -1 : 1;
      const nx = (-dy / n) * flip;
      const ny = (dx / n) * flip;
      const w = 7 * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.95));
      upper.push(x + nx * w, y + ny * w);
      lower.unshift(x - nx * w * 0.35, y - ny * w * 0.35);
    }
    dab(L, INK.foliage, [...upper, ...lower], "mid", 0.3, 0.8);
  }
  return L;
}

/** The harbour tower at the mouth, on the end of the mole, ruined at the top. */
const tower: Layer = (() => {
  const L = part();
  put(
    L,
    INK.stone,
    [166, WATER, 172, 292, 184, 286, 192, 294, 206, 288, 218, 282, 230, 290, 236, WATER],
    "near",
    0.6,
    0.9,
  );
  // Rocks round its foot.
  dab(L, INK.stone, ellipse(160, WATER - 2, 14, 8), "far", 0.8, 0.7);
  dab(L, INK.stone, ellipse(244, WATER - 1, 11, 6), "far", 0.6, 0.7);
  L.strokes.push(
    lines(
      [
        [174, 330, 232, 330],
        [170, 372, 234, 372],
        [190, 330, 190, 372],
        [214, 372, 214, WATER],
      ],
      "far",
      0.5,
    ),
    lines(
      [
        [199, 306, 199, 320],
        [208, 344, 208, 360],
      ],
      "mid",
      0.1,
    ),
  );
  return L;
})();

/** The quay: the mole from the tower along to the town, its face in big blocks. */
const quay: Layer = (() => {
  const L = part();
  L.strokes.push(
    line([236, QUAY + 2, 300, QUAY], "mid", 0.5),
    line([236, WATER, 812, WATER], "mid", 0.6),
    line([790, QUAY, 812, QUAY], "mid", 0.4),
    lines(
      [
        [262, QUAY + 2, 262, WATER],
        [318, QUAY, 318, WATER],
        [380, QUAY, 380, WATER],
        [452, QUAY, 452, WATER],
        [536, QUAY, 536, WATER],
        [612, QUAY, 612, WATER],
        [700, QUAY, 700, WATER],
        [770, QUAY, 770, WATER],
      ],
      "far",
      0.4,
    ),
  );
  return L;
})();

const water: Layer = (() => {
  const L = part();
  wash(L, INK.sea, [128, WATER + 1, 812, WATER + 1, 806, 442, 784, 462, 730, 472, 600, 476, 430, 474, 270, 477, 170, 470, 136, 452], 0.36);
  L.strokes.push(
    lines(
      [
        [130, 470, 172, 470],
        [250, 476, 296, 476],
        [560, 472, 610, 472],
        [700, 466, 740, 466],
        [146, 436, 162, 436],
      ],
      "far",
      0.4,
    ),
  );
  return L;
})();

/** A fishing boat: a wooden hull with a raised bow, and a stripe along it. */
function boat(cx: number, cy: number, len: number, colour: string, cabin: boolean): Layer {
  const L = part();
  const h = len * 0.22;
  if (cabin) put(L, INK.white, [cx - len * 0.2, cy - h * 0.4, cx - len * 0.2, cy - h * 1.3, cx + len * 0.12, cy - h * 1.3, cx + len * 0.12, cy - h * 0.4], "mid", 0.2);
  else L.strokes.push(line([cx - len * 0.05, cy - h * 0.4, cx - len * 0.05, cy - h * 3.2], "mid", 0.3));
  // The sheer rises to a high bow on the right.
  put(
    L,
    INK.white,
    [cx - len * 0.5, cy - h * 0.6, cx - len * 0.1, cy - h * 0.35, cx + len * 0.3, cy - h * 0.5, cx + len * 0.56, cy - h * 1.15, cx + len * 0.4, cy + h * 0.5, cx - len * 0.42, cy + h * 0.55],
    "near",
    0.3,
  );
  wash(L, colour, [cx - len * 0.48, cy - h * 0.05, cx + len * 0.5, cy - h * 0.3, cx + len * 0.43, cy + h * 0.1, cx - len * 0.45, cy + h * 0.2], 0.85);
  L.strokes.push(
    curves(
      [
        [cx - len * 0.36, cy + h * 0.9, cx - len * 0.1, cy + h * 1.1, cx + len * 0.2, cy + h * 0.9],
        [cx - len * 0.2, cy + h * 1.5, cx + len * 0.08, cy + h * 1.55],
      ],
      "far",
      0.3,
    ),
  );
  return L;
}

const BYBLOS: Layer[] = [
  behind,
  castle,
  palm(458, 468, 316),
  town,
  palm(642, 630, 322),
  tower,
  quay,
  water,
  boat(326, 448, 92, INK.teal, true),
  boat(492, 456, 76, INK.navy, false),
  boat(650, 446, 84, INK.amber, false),
];
export default BYBLOS;
