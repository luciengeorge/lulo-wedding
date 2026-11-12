/**
 * The slope at Le Refuge, Faraya, as geometry: one crest rising to a summit
 * behind the names, the teleski up its left side and the chairlift up its
 * right. Each lift is its own drawing, 640 by 936 units, pinned to a bottom
 * corner of the page. Strokes marked `wide` are left out of the narrow version.
 */
import {
  type Point,
  type Stroke,
  type Weight,
  blobs,
  curve,
  curves,
  ellipse,
  flat,
  line,
  lines,
  wide,
} from "./hand.ts";

export const VIEW = { w: 640, h: 936 };

export type Lift = { vp: Point; up: Point; down: Point; top: number };
const on = (L: Lift, near: Point, s: number): Point => [
  L.vp[0] + (near[0] - L.vp[0]) * s,
  L.vp[1] + (near[1] - L.vp[1]) * s,
];
const weightOf = (s: number): Weight => (s > 0.55 ? "near" : s > 0.3 ? "mid" : "far");

// ---------- small things ----------

const marker = (x: number, gy: number, h: number, w: Weight): Stroke[] => [
  line([x, gy, x, gy - h], w, 0.15),
  blobs([ellipse(x, gy - h - h * 0.16, h * 0.16, h * 0.16)], w, 0.1),
];

const bird = (x: number, y: number, r: number) => [
  x - r,
  y + r * 0.1,
  x - r * 0.45,
  y - r * 0.4,
  x,
  y + r * 0.3,
  x + r * 0.5,
  y - r * 0.45,
  x + r,
  y,
];

function chalet(x: number, gy: number, wd: number, ht: number, w: Weight, chimney = false): Stroke[] {
  const top = gy - ht;
  const mid = x + wd / 2;
  const peak = top - wd * 0.34;
  const o = wd * 0.12;
  const win = (wx: number) => {
    const s = wd * 0.15;
    const y = gy - ht * 0.72;
    return [wx, y, wx + s, y, wx + s, y + s, wx, y + s, wx, y];
  };
  const out = [
    lines(
      [
        [x, gy, x, top],
        [x + wd, top, x + wd, gy],
      ],
      w,
      0.15,
    ),
    // Roof: its edge, and the line of the eaves under it.
    lines(
      [
        [x - o, top + o * 0.5, mid, peak, x + wd + o, top + o * 0.5],
        [x - o * 0.5, top + o * 1.3, mid, peak + o * 1.05, x + wd + o * 0.5, top + o * 1.3],
      ],
      w,
      0.15,
    ),
    lines(
      [
        [mid - wd * 0.08, gy, mid - wd * 0.08, gy - ht * 0.6, mid + wd * 0.08, gy - ht * 0.6, mid + wd * 0.08, gy],
        win(x + wd * 0.12),
        win(x + wd * 0.73),
      ],
      w,
      0.08,
    ),
  ];
  if (chimney) {
    const cx = mid + wd * 0.22;
    out.push(
      line(
        [cx, peak + wd * 0.2, cx, peak + wd * 0.02, cx + wd * 0.1, peak + wd * 0.02, cx + wd * 0.1, peak + wd * 0.27],
        w,
        0.08,
      ),
    );
    out.push(
      curve(
        [cx + wd * 0.05, peak - 2, cx + wd * 0.0, peak - 12, cx + wd * 0.14, peak - 21, cx + wd * 0.06, peak - 32],
        "far",
        0.3,
      ),
    );
  }
  return out;
}

// ---------- the chairlift, on the right ----------

export const CH: Lift = { vp: [413.7, 181], up: [265, 842], down: [355, 842], top: 0.18 };
const CH_TOWERS = [0.22, 0.28, 0.37, 0.5, 0.7];

function tower(L: Lift, s: number): Stroke[] {
  const w = weightOf(s);
  const u = on(L, L.up, s);
  const d = on(L, L.down, s);
  const arm = u[1] - 12 * s;
  const cx = (u[0] + d[0]) / 2;
  const left = u[0] - 15 * s;
  const right = d[0] + 15 * s;
  const base = arm + 150 * s;
  const hangers = [
    [u[0], arm + 4 * s, u[0], u[1] - 3 * s],
    [d[0], arm + 4 * s, d[0], d[1] - 3 * s],
  ];
  const braces = [
    [cx - 4 * s, arm + 36 * s, u[0] + 3 * s, arm + 4 * s],
    [cx + 4 * s, arm + 36 * s, d[0] - 3 * s, arm + 4 * s],
  ];
  const trains = [L.up, L.down].map((near) =>
    flat([on(L, near, s * 1.04), on(L, near, s * 0.96)].map(([x, y]): Point => [x, y - 3 * s])),
  );
  if (s <= 0.3) {
    return [
      line([left, arm, right, arm], w, 0.15),
      line([cx, arm, cx + 1.5 * s, base], w, 0.15),
      lines([...hangers, ...braces, ...trains], w, 0.1),
    ];
  }
  const rungs: number[][] = [];
  for (let y = arm + 16 * s; y < base - 8 * s; y += 11 * s) {
    const lean = ((y - arm) / (base - arm)) * 2 * s;
    rungs.push([cx + 3.2 * s + lean, y, cx + 9 * s + lean, y]);
  }
  const wheels = [L.up, L.down].flatMap((near) =>
    [1.036, 1.012, 0.988, 0.964].map((k) => {
      const [x, y] = on(L, near, s * k);
      return ellipse(x, y - 3 * s, 2.3 * s, 2.3 * s);
    }),
  );
  return [
    line([left, arm, right, arm, right, arm + 4 * s, left, arm + 4 * s, left, arm], w, 0.2),
    line([u[0] - 5 * s, arm, u[0] - 1 * s, arm - 12 * s, d[0] + 1 * s, arm - 12 * s, d[0] + 5 * s, arm], w, 0.2),
    lines(
      [
        [cx - 3.2 * s, arm + 4 * s, cx - 5.2 * s, base],
        [cx + 3.2 * s, arm + 4 * s, cx + 5.2 * s, base],
      ],
      w,
      0.2,
    ),
    lines(braces, w, 0.2),
    lines([...hangers, ...trains], w, 0.15),
    blobs(wheels, w, 0.06),
    lines([[cx + 9 * s, arm + 10 * s, cx + 11 * s, base - 4 * s], ...rungs], w, 0.12),
    line(
      [
        cx - 3 * s,
        arm + 50 * s,
        cx + 3 * s,
        arm + 50 * s,
        cx + 3.2 * s,
        arm + 58 * s,
        cx - 3.2 * s,
        arm + 58 * s,
        cx - 3 * s,
        arm + 50 * s,
      ],
      w,
      0.1,
    ),
    line(
      [cx - 10 * s, base + 4 * s, cx - 8 * s, base - 2 * s, cx + 8 * s, base - 2 * s, cx + 10 * s, base + 4 * s],
      w,
      0.2,
    ),
  ];
}

const cable = (L: Lift, near: Point, stops: number[]) =>
  flat([near, ...[...stops].reverse().map((s) => on(L, near, s)), on(L, near, L.top)]);

const chTop = on(CH, [310, 842], CH.top);
const chWheel: Point = [310, 842];
const spokes = [15, 75, 135, 195, 255, 315].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return [
    chWheel[0] + Math.cos(a) * 5,
    chWheel[1] + Math.sin(a) * 1.4,
    chWheel[0] + Math.cos(a) * 41,
    chWheel[1] + Math.sin(a) * 8,
  ];
});

export const RIGHT: Stroke[] = [
  // One far dome behind, and birds over it.
  curve([432, 314, 480, 294, 540, 284, 596, 288, 640, 298], "far", 0.5),
  blobs([bird(500, 246, 6), bird(526, 231, 4.5), bird(550, 252, 5)], "far", 0.1),
  // The crest: one slope, rising to a summit behind the names.
  wide(
    curve(
      [
        338, 318, 290, 306, 230, 285, 160, 258, 90, 235, 20, 220, -30, 215, -72, 211.5, -112, 209, -153, 207.5, -260,
        206, -460, 205.5, -860, 205,
      ],
      "mid",
      0.5,
    ),
  ),
  curve([328, 315, 360, 322, 395, 325, 450, 327, 510, 331, 570, 335, 640, 338], "mid", 0.5),
  // Top station.
  blobs([ellipse(chTop[0], chTop[1], 8.1, 1.8)], "far", 0.05),
  lines(
    [
      [chTop[0], 302, chTop[0], 324],
      [406, 324, 406, 313, 420, 313, 420, 324],
      [404, 314, 413, 307, 422, 314],
    ],
    "far",
    0.1,
  ),
  // The chalets on the shoulder, with their poplars.
  curve([410, 438, 432, 427, 477, 422, 527, 426, 556, 433], "mid", 0.4),
  ...chalet(420, 426, 28, 16, "mid"),
  ...chalet(458, 423, 38, 19, "mid", true),
  ...chalet(506, 427, 26, 14, "mid"),
  // Towers, then the cables over them.
  ...CH_TOWERS.slice(0, 4).flatMap((s) => tower(CH, s)),
  line(cable(CH, CH.up, CH_TOWERS), "mid", 0.12),
  line(cable(CH, CH.down, CH_TOWERS), "mid", 0.12),
  ...tower(CH, CH_TOWERS[4]),
  // Piste markers down the inside of the line, cedars down the outside.
  ...marker(326, 446, 6, "far"),
  ...marker(310, 498, 9, "far"),
  ...marker(289, 572, 13, "mid"),
  ...marker(262, 664, 19, "mid"),
  ...marker(232, 772, 27, "mid"),
  // Folds in the snow, off piste.
  curves(
    [
      [520, 716, 560, 706, 606, 712, 640, 706],
      [404, 800, 440, 792, 474, 798],
    ],
    "far",
    0.4,
  ),
  // Near ground. It stops short of the dance floor on phones.
  curve([300, 931, 380, 930, 470, 931, 560, 929, 640, 930], "near", 0.4),
  wide(
    curve(
      [-860, 930, -600, 931, -340, 930, -104, 930, -58, 931, 2, 930.5, 80, 930, 160, 931, 240, 930, 308, 931],
      "near",
      0.4,
    ),
  ),
  // The departure wheel.
  blobs([ellipse(310, 842, 47.5, 10), ellipse(310, 842, 42, 8.2), ellipse(310, 842, 6, 1.7)], "near", 0.12),
  blobs([ellipse(310, 845.6, 47.5, 10, 0.12, Math.PI - 0.24)], "near", 0.1),
  lines(spokes, "near", 0.1),
  lines(
    [
      [304, 855, 302.5, 921],
      [316, 855, 317.5, 921],
      [294.5, 929, 297.5, 921, 322.5, 921, 325.5, 929],
      [310, 870, 310, 884],
      [305, 884, 315, 884, 315, 896, 305, 896, 305, 884],
    ],
    "near",
    0.2,
  ),
];

// A chair like the ones at Le Refuge: a long curved hanger from the grip at (30, 0) down to a wide, low, open frame.
const HANGER = [
  [26.5, 0, 33.5, 0, 33.5, 4, 26.5, 4, 26.5, 0],
  [29.3, 4, 30.7, 15, 30.5, 28, 29.3, 40],
  [30.7, 4, 32.1, 15, 31.9, 28, 30.7, 40],
];
const FRAME = [4, 58, 4, 44, 5.5, 41, 9, 40, 51, 40, 54.5, 41, 56, 44, 56, 58];
/** Going up: it faces the summit, so we see the back rails and the back edge of the bench. */
export const CHAIR_UP: Stroke[] = [
  lines(HANGER, "near", 0.08),
  lines(
    [
      FRAME,
      [4, 46.2, 56, 46.2],
      [4, 52.2, 56, 52.2],
      [1.5, 58, 58.5, 58, 58.5, 62, 1.5, 62, 1.5, 58],
      // The footrest, seen under the bench.
      [17, 62, 17, 72],
      [43, 62, 43, 72],
      [11, 72, 49, 72],
    ],
    "near",
    0.1,
  ),
];
export const CHAIR_UP_BODY = "M1.5 58H58.5V62H1.5Z";
/** Coming down: it faces the valley, so we see the seats, the armrests, and the bar with its footrests in front. */
export const CHAIR_DOWN: Stroke[] = [
  lines(HANGER, "near", 0.08),
  lines(
    [
      FRAME,
      [4, 48, 56, 48],
      // The bench, a cushion per seat.
      [1.5, 55.5, 58.5, 55.5, 58.5, 63, 1.5, 63, 1.5, 55.5],
      [20.5, 55.5, 20.5, 63],
      [39.5, 55.5, 39.5, 63],
      // Armrests, then the lowered bar and a footrest each side.
      [4, 47, 0.5, 49.5, 0.5, 55.5],
      [56, 47, 59.5, 49.5, 59.5, 55.5],
      [0.5, 51, 59.5, 51],
      [19, 51, 19, 75],
      [12, 75, 26, 75],
      [41, 51, 41, 75],
      [34, 75, 48, 75],
    ],
    "near",
    0.1,
  ),
];
export const CHAIR_DOWN_BODY = "M1.5 55.5H58.5V63H1.5Z";
// ---------- the teleski, on the left ----------

/** `up` and `down` are the cables at the drive wheel. */
export const TK: Lift = { vp: [230, 293.75], up: [372, 825], down: [288, 825], top: 0.14 };
const TK_POLES = [0.18, 0.24, 0.31, 0.41, 0.56, 0.78];

function pole(L: Lift, s: number): Stroke[] {
  const w = weightOf(s);
  const a = on(L, L.down, s);
  const b = on(L, L.up, s);
  const y = a[1];
  const arm = y - 6 * s;
  const cx = (a[0] + b[0]) / 2;
  const base = y + 105 * s;
  const out: Stroke[] = [line([a[0] - 8 * s, arm, b[0] + 8 * s, arm], w, 0.15)];
  if (s <= 0.3) {
    out.push(line([cx, arm, cx + s, base], w, 0.15));
    out.push(
      lines(
        [
          [a[0], arm, a[0], y],
          [b[0], arm, b[0], y],
        ],
        w,
        0.08,
      ),
    );
    return out;
  }
  const sheaves = [L.down, L.up].flatMap((near) =>
    [1.022, 0.978].map((k) => {
      const [x, yy] = on(L, near, s * k);
      return ellipse(x, yy - 2.6 * s, 2.5 * s, 2.5 * s);
    }),
  );
  out.push(
    // A second line makes the arm a beam.
    line([a[0] - 8 * s, arm - 3 * s, b[0] + 8 * s, arm - 3 * s], w, 0.15),
    lines(
      [
        [a[0] - 8 * s, arm - 3 * s, a[0] - 8 * s, arm],
        [b[0] + 8 * s, arm - 3 * s, b[0] + 8 * s, arm],
      ],
      w,
      0.05,
    ),
    lines(
      [
        [cx - 2.6 * s, arm, cx - 4 * s, base],
        [cx + 2.6 * s, arm, cx + 4 * s, base],
      ],
      w,
      0.2,
    ),
    lines(
      [
        [cx - 3 * s, arm + 20 * s, a[0] + 3 * s, arm],
        [cx + 3 * s, arm + 20 * s, b[0] - 3 * s, arm],
      ],
      w,
      0.15,
    ),
    blobs(sheaves, w, 0.06),
    // Cap, and a band round the mast.
    lines(
      [
        [cx - 3.4 * s, arm - 3 * s, cx - 2 * s, arm - 8 * s, cx + 2 * s, arm - 8 * s, cx + 3.4 * s, arm - 3 * s],
        [cx - 3.2 * s, arm + 46 * s, cx + 3.2 * s, arm + 46 * s],
        [cx - 3.4 * s, arm + 52 * s, cx + 3.4 * s, arm + 52 * s],
      ],
      w,
      0.1,
    ),
    line(
      [cx - 8 * s, base + 3 * s, cx - 6 * s, base - 1.5 * s, cx + 6 * s, base - 1.5 * s, cx + 8 * s, base + 3 * s],
      w,
      0.15,
    ),
  );
  return out;
}

const tkTop = on(TK, [330, 825], TK.top);
export const LEFT: Stroke[] = [
  // The crest: the same slope, rising to the summit behind the names.
  curve([0, 398, 60, 396, 120, 393, 190, 388, 244, 383, 296, 373], "mid", 0.5),
  wide(
    curve(
      [
        286, 375, 350, 360, 420, 339, 500, 304, 580, 261, 640, 233, 680, 219, 716, 212.5, 756, 209, 797, 207.5, 900,
        206, 1100, 205.5, 1500, 205,
      ],
      "mid",
      0.5,
    ),
  ),
  // Top of the teleski: the return wheel on its mast, and a hut.
  blobs([ellipse(tkTop[0], tkTop[1], 4.6, 1.2)], "far", 0.05),
  lines(
    [
      [tkTop[0], tkTop[1] + 1.2, tkTop[0], 383],
      [256, 382, 256, 374, 266, 374, 266, 382],
      [254.5, 375, 261, 369.5, 267.5, 375],
    ],
    "far",
    0.1,
  ),
  // Poles, then the cables over them.
  ...TK_POLES.slice(0, -1).flatMap((s) => pole(TK, s)),
  line(cable(TK, TK.up, TK_POLES), "mid", 0.1),
  line(cable(TK, TK.down, TK_POLES), "mid", 0.1),
  ...pole(TK, TK_POLES[5]),
  // Piste markers down the inside of the line.
  ...marker(280.7, 459, 7, "far"),
  ...marker(296.3, 510, 9, "far"),
  ...marker(317.8, 580, 12, "mid"),
  ...marker(347, 675.5, 16, "mid"),
  ...marker(386, 803, 22, "mid"),
  // Folds in the snow.
  curves(
    [
      [96, 800, 140, 790, 184, 796],
      [392, 792, 428, 784, 462, 790],
    ],
    "far",
    0.4,
  ),
  // Near ground. The line stops short of the dance floor on phones.
  curve([0, 930, 80, 931, 170, 929, 260, 931, 340, 930], "near", 0.4),
  wide(
    curve(
      [332, 930, 420, 931, 500, 929, 570, 931, 636, 930, 690, 931, 736, 930, 1000, 931, 1260, 930, 1500, 931],
      "near",
      0.4,
    ),
  ),
];

/** Drawn over the people on the tow, who set off from behind it. */
export const LEFT_FRONT: Stroke[] = [
  // The drive wheel on its mast.
  blobs([ellipse(330, 825, 44, 9), ellipse(330, 825, 39, 7.4), ellipse(330, 825, 5, 1.5)], "near", 0.1),
  blobs([ellipse(330, 828.4, 44, 9, 0.14, Math.PI - 0.28)], "near", 0.08),
  lines(
    [0, 60, 120, 180, 240, 300].map((deg) => {
      const a = ((deg + 20) * Math.PI) / 180;
      return [330 + Math.cos(a) * 5, 825 + Math.sin(a) * 1.3, 330 + Math.cos(a) * 38, 825 + Math.sin(a) * 7.2];
    }),
    "near",
    0.08,
  ),
  lines(
    [
      [325.6, 836, 324.4, 923],
      [334.4, 836, 335.6, 923],
      [318, 930, 320.5, 923, 339.5, 923, 342, 930],
      [326, 866, 334, 866],
      [326, 872, 334, 872],
    ],
    "near",
    0.2,
  ),
];

/** An empty tow coming back down, drawn at the drive wheel. */
export const EMPTY_TOW: Stroke[] = [
  lines([[285, 823, 291, 823, 291, 828, 285, 828, 285, 823]], "near", 0.05),
  line([288, 828, 288.6, 868], "near", 0.2),
  blobs([ellipse(288.6, 871, 5.5, 2)], "near", 0.05),
];
