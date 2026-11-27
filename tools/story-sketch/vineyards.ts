/**
 * A Lebanese vineyard: rows of vines running away up a gentle hillside to a
 * ridge, the mountains far behind, and in front a small table laid with a
 * bottle, two glasses and a bunch of grapes, a chair pulled up at each side.
 */
import { GROUND, INK, type Layer, curve, curves, dab, ellipse, line, lines, part, put, wash } from "./kit.ts";

const X = 452;
/** Where the rows would meet if they ran on past the ridge. */
const VP = [452, 30];
const NEAR = 456;
const RIDGE = 220;

const mountains: Layer = {
  ...part(),
  strokes: [
    curve([112, 232, 160, 210, 226, 186, 282, 176, 340, 190, 400, 204], "far", 1),
    curve([520, 200, 586, 178, 640, 164, 700, 174, 760, 196, 798, 216], "far", 1),
    curves(
      [
        [262, 180, 282, 175, 300, 181],
        [622, 168, 640, 163, 660, 170],
      ],
      "far",
      0.4,
    ),
  ],
};

const ridge: Layer = (() => {
  const L = part();
  L.strokes.push(curve([110, 250, 200, 234, 320, 220, 452, 214, 580, 218, 700, 228, 800, 244], "mid", 0.8));
  // A few trees along the top.
  dab(L, INK.olive, ellipse(232, 222, 12, 10), "far", 0.6, 0.6);
  dab(L, INK.olive, ellipse(252, 222, 8, 7), "far", 0.5, 0.6);
  dab(L, INK.olive, ellipse(664, 216, 11, 9), "far", 0.6, 0.6);
  L.strokes.push(
    lines(
      [
        [232, 232, 232, 236],
        [664, 225, 664, 230],
      ],
      "far",
      0.1,
    ),
  );
  return L;
})();

/** Along a row, from its foot on the near edge (t = 0) to the ridge (t = 1). */
function along(x0: number, t: number) {
  const k = ((NEAR - RIDGE) / (NEAR - VP[1])) * t;
  return [x0 + (VP[0] - x0) * k, NEAR + (VP[1] - NEAR) * k];
}

/**
 * One row of vines: a band of leaves with a scalloped top, one scallop to a
 * plant, the plants closing up and shrinking as the row runs to the ridge.
 */
function row(x0: number): Layer {
  const L = part();
  const top: number[] = [];
  const foot: number[] = [];
  const N = 90;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const [x, y] = along(x0, t);
    const size = 1 - t * 0.86;
    const plant = -Math.log(1 - 0.9 * t) * 5;
    const bump = 0.7 + 0.4 * Math.abs(Math.sin(Math.PI * plant));
    top.push(x, y - 30 * size * bump);
    if (i % 6 === 0 || i === N) foot.unshift(x, y);
  }
  dab(L, INK.foliage, [...top, ...foot], "mid", 0.3, 0.75);
  // Bunches hanging under the leaves on the outer rows, near enough to see.
  if (Math.abs(x0 - X) > 200) {
    for (const t of [0.07, 0.19]) {
      const [x, y] = along(x0, t);
      const r = 3.6 * (1 - t);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, 1.6], [-1.9, -1.4], [0, -1.6], [1.9, -1.4]]) {
        dab(L, INK.mauve, ellipse(x + 6 + dx * r, y - 8 + dy * r, r, r), "far", 0.1, 0.9);
      }
    }
  }
  // Posts at the near end, where they can still be seen.
  L.strokes.push(
    lines(
      [0.04, 0.24].map((t) => {
        const [x, y] = along(x0, t);
        return [x, y + 2, x, y - 40 * (1 - t * 0.86)];
      }),
      "far",
      0.2,
    ),
  );
  return L;
}

const ROWS = [-340, -236, -140, -46, 46, 140, 236, 340].map((dx) => X + dx);

const earth: Layer = (() => {
  const L = part();
  L.strokes.push(curve([100, GROUND + 4, 250, GROUND, X, GROUND - 1, 650, GROUND + 1, 804, GROUND + 5], "mid", 0.8));
  return L;
})();

/** The table group is drawn in its own units, out from the middle and up from the ground, then scaled. */
const K = 1.3;
function at(...pts: number[]) {
  return pts.map((v, i) => (i % 2 ? GROUND - v * K : X + v * K));
}

/** A chair at the table: back post, seat and legs, side on, facing in. */
function chair(sx: number, facing: 1 | -1): Layer {
  const L = part();
  const c = (dx: number) => sx + facing * dx;
  L.strokes.push(
    lines(
      [
        at(c(-4), 0, c(0), 58, c(-6), 140),
        at(c(42), 0, c(40), 58),
        at(c(-2), 26, c(41), 26),
      ],
      "near",
      0.3,
    ),
  );
  put(L, INK.wood, at(c(-4), 64, c(44), 64, c(44), 56, c(-3), 56), "mid", 0.2, 0.9);
  put(L, INK.wood, at(c(-3), 96, c(-5.5), 128, c(-0.5), 129, c(2), 97), "far", 0.2, 0.9);
  return L;
}

const table: Layer = (() => {
  const L = part();
  wash(L, INK.sand, ellipse(X, GROUND + 2, 240, 9), 0.4);
  L.strokes.push(
    lines(
      [
        at(-60, 76, -64, 0),
        at(60, 76, 64, 0),
        at(-44, 76, -46, 6),
        at(44, 76, 46, 6),
        at(-62, 30, 62, 30),
      ],
      "near",
      0.4,
    ),
  );
  // A cloth over the top, hanging a little way down the sides.
  put(L, INK.white, at(-80, 100, 80, 100, 84, 74, 60, 76, 30, 73, 0, 75, -30, 73, -60, 76, -84, 74), "mid", 0.3);
  L.strokes.push(
    lines(
      [
        at(-80, 100, -78, 96, 78, 96, 80, 100),
        at(-54, 95, -56, 77),
        at(54, 95, 56, 77),
      ],
      "far",
      0.3,
    ),
  );
  return L;
})();

/** The bottle: round shouldered, a plain label. */
const bottle: Layer = (() => {
  const L = part();
  const b = 100;
  put(
    L,
    INK.olive,
    at(-9, b, -9, b + 40, -6.5, b + 48, -3, b + 52, -3, b + 72, 3, b + 72, 3, b + 52, 6.5, b + 48, 9, b + 40, 9, b),
    "mid",
    0.15,
    0.85,
  );
  put(L, INK.white, at(-9, b + 10, 9, b + 10, 9, b + 30, -9, b + 30), "far", 0.1);
  put(L, INK.red, at(-3.6, b + 66, 3.6, b + 66, 3.6, b + 73, -3.6, b + 73), "far", 0.1, 0.8);
  L.strokes.push(line(at(-5, b + 42, -5, b + 34), "far", 0.1));
  return L;
})();

/** A wine glass, half full. */
function glass(gx: number): Layer {
  const L = part();
  const b = 100;
  L.strokes.push(
    curve(at(gx - 8, b + 22, gx - 9, b + 31, gx - 7, b + 39), "mid", 0.1),
    curve(at(gx + 8, b + 22, gx + 9, b + 31, gx + 7, b + 39), "mid", 0.1),
    line(at(gx, b + 18, gx, b), "mid", 0.1),
    line(at(gx - 6, b, gx + 6, b), "mid", 0.1),
  );
  put(L, INK.red, at(gx - 8.6, b + 29, gx + 8.6, b + 29, gx + 8, b + 22, gx + 3.5, b + 18, gx - 3.5, b + 18, gx - 8, b + 22), "mid", 0.1, 0.7);
  return L;
}

/** A bunch of grapes lying on the table, with a leaf. */
const grapes: Layer = (() => {
  const L = part();
  const gx = -44;
  const b = 100;
  const berries: [number, number][] = [
    [-9, 5],
    [0, 5],
    [9, 5],
    [18, 4.5],
    [-4.5, 12.5],
    [4.5, 12.5],
    [13.5, 12],
    [0, 19.5],
    [9, 19.5],
  ];
  dab(L, INK.foliage, at(gx + 14, b + 22, gx + 25, b + 31, gx + 36, b + 27, gx + 31, b + 20, gx + 20, b + 18), "far", 0.3, 0.8);
  L.strokes.push(curve(at(gx + 5, b + 23, gx + 9, b + 29, gx + 14, b + 31), "mid", 0.1));
  for (const [dx, h] of berries) {
    const [cx, cy] = at(gx + dx, b + h);
    dab(L, INK.mauve, ellipse(cx, cy, 4.9 * K, 4.7 * K), "far", 0.1, 0.85);
  }
  return L;
})();

const VINEYARDS: Layer[] = [
  mountains,
  ridge,
  ...ROWS.map(row),
  earth,
  chair(-118, 1),
  chair(118, -1),
  table,
  bottle,
  glass(26),
  glass(50),
  grapes,
];
export default VINEYARDS;
