import { type Stroke, type Weight, blobs, curve, curves, ellipse, line, lines } from "./hand.ts";

/** The party sits in its own drawing, pinned to the bottom centre. x = 320 is the middle. */
export const PARTY_VIEW = { w: 640, h: 936 };
const C = 320;
/** One beat of the music, in seconds. Everything that moves keeps time with it. */
const BEAT = 0.56;

const RED = "#9b0d17";
const ROSE = "#d98c93";
const WHITE = "#fffdf8";
const BARK = "#3e2f26";
const BLACK = "#2c2622";
const SLATE = "#55606b";
const NAVY = "#2f3a4f";
const TAUPE = "#6b5445";
const OLIVE = "#4f5a38";
const TEAL = "#6f9aa3";
const MUSTARD = "#e3bd5b";
const FOLIAGE = "#809b47";
const MAUVE = "#a86a92";
const AMBER = "#d89353";
const WOOD = "#e2c292";
const WOOD_DARK = "#c49b67";
const SKIN = ["#f0d2b4", "#e2b48d", "#cf9a70", "#b07a52"];
const HAIR = ["#2c211b", "#4b3223", "#7b4d2c", "#c79a56", "#9a9590"];
const SUITS = [NAVY, SLATE, TAUPE, OLIVE, BARK];
const DRESSES = [ROSE, TEAL, MUSTARD, FOLIAGE, MAUVE, AMBER, RED];

/** A wash of colour under the pencil: colour, path, and its own opacity when it needs one. */
export type Fill = [string, string] | [string, string, number];
export type Motion = {
  name: string;
  o: [number, number];
  dur: number;
  delay?: number;
  ease?: string;
  alt?: boolean;
  vars?: Record<string, string>;
};
export type Layer = {
  body: string;
  fills?: Fill[];
  strokes: Stroke[];
  only?: "wide" | "narrow";
  motion?: Motion;
  kids?: Layer[];
};

const RAD = Math.PI / 180;
const d1 = (n: number) => n.toFixed(1);
const fill = (pts: number[]) => {
  let d = "";
  for (let i = 0; i < pts.length; i += 2) d += `${i ? "L" : "M"}${d1(pts[i])} ${d1(pts[i + 1])}`;
  return `${d}Z`;
};
/** The hair on a head: the top of it, and further down the back when seen from the side. */
const cap = (head: number[], cx: number, cy: number, rx: number, ry: number, back = 0, low = -0.25) => {
  const out: number[] = [];
  for (let i = 0; i < head.length; i += 2) {
    const u = (head[i] - cx) / rx;
    const v = (head[i + 1] - cy) / ry;
    if (v < low + 0.8 * back * u) out.push(head[i], head[i + 1]);
  }
  return out;
};

const part = (): Layer => ({ body: "", fills: [], strokes: [] });
/** A filled shape with its outline. */
const put = (L: Layer, c: string, pts: number[], w: Weight = "mid", amp = 0.08) => {
  const d = fill(pts);
  L.body += d;
  L.fills?.push([c, d]);
  L.strokes.push(line([...pts, pts[0], pts[1]], w, amp));
};
const dot = (L: Layer, c: string, pts: number[], w: Weight = "far", amp = 0.04) => {
  const d = fill(pts);
  L.body += d;
  L.fills?.push([c, d]);
  L.strokes.push(blobs([pts], w, amp));
};

// Figures are built from a skeleton, in units of their own height, y up from the ground.
type V = [number, number];
/** Two segments of a limb, in degrees from straight down; positive swings away from the body. */
type Limb = [number, number];
const add = (a: V, b: V, s = 1): V => [a[0] + b[0] * s, a[1] + b[1] * s];
const aim = (deg: number, side: number): V => [side * Math.sin(deg * RAD), -Math.cos(deg * RAD)];
/** A limb with a joint in the middle, as one outline that tapers. */
function limb(p0: V, p1: V, p2: V, w0: number, w1: number, w2: number): V[] {
  const normal = (a: V, b: V): V => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  };
  const n1 = normal(p0, p1);
  const n2 = normal(p1, p2);
  const ml = Math.hypot(n1[0] + n2[0], n1[1] + n2[1]) || 1;
  const m: V = [(n1[0] + n2[0]) / ml, (n1[1] + n2[1]) / ml];
  return [
    add(p0, n1, w0 / 2),
    add(p1, m, w1 / 2),
    add(p2, n2, w2 / 2),
    add(p2, n2, -w2 / 2),
    add(p1, m, -w1 / 2),
    add(p0, n1, -w0 / 2),
  ];
}

/** Angles, or a place for the hand to reach: `at` in the figure's own units, `to` in the drawing's. */
type ArmSpec = Limb | { at: V; bend?: 1 | -1 } | { to: V; bend?: 1 | -1 };
/** How an arm moves: the upper arm swings by `u` degrees, the forearm by `f`, or claps by `clap` on each beat. */
type ArmMove = { u?: number; f?: number; clap?: number; lag?: number };
type Groove = { s: number; d: number; r?: number; beats?: number; delay?: number };
type Fig = {
  x: number;
  gy: number;
  h: number;
  kind: "suit" | "dress" | "gown";
  /** Clothes, skin, hair. */
  c: string;
  skin: string;
  hc: string;
  /** Which way they look: at us, away from us, or to one side. */
  face?: "front" | "back" | "left" | "right";
  armL: ArmSpec;
  armR: ArmSpec;
  legL?: Limb;
  legR?: Limb;
  /** The spine, in degrees from upright; positive leans to the right. */
  lean?: number;
  /** How far the skirt is thrown sideways, and how wide it flies. */
  swish?: number;
  flare?: number;
  hair?: "bun" | "long";
  veil?: boolean;
  phones?: boolean;
  /** A phone held up in that hand, filming. */
  phone?: "L" | "R";
  /** Weight shifts from foot to foot over the cycle, with a dip of the knees on each beat. */
  groove?: Groove;
  moveL?: ArmMove;
  moveR?: ArmMove;
  /** Leave an arm out, or draw only that arm, so it can go over a partner. */
  skip?: "L" | "R";
  just?: "L" | "R";
};

function figure(f: Fig): Layer {
  const { x, gy, h } = f;
  const suit = f.kind === "suit";
  const gown = f.kind === "gown";
  const face = f.face ?? "front";
  const turn = face === "left" ? -1 : face === "right" ? 1 : 0;
  const rear = face === "back";
  const nar = turn ? 0.66 : 1;
  const scr = ([u, v]: V): V => [x + u * h, gy - v * h];
  const S = (pts: V[]) => pts.flatMap(scr);
  const lean = (f.lean ?? 0) * RAD;
  const d: V = [Math.sin(lean), Math.cos(lean)];
  const p: V = [Math.cos(lean), -Math.sin(lean)];
  const at = (o: V, along: number, across = 0): V => [
    o[0] + d[0] * along + p[0] * across,
    o[1] + d[1] * along + p[1] * across,
  ];

  // The legs decide how high the hips sit: the lower foot is on the floor.
  const T = 0.245;
  const legs = (
    [
      [-1, f.legL ?? [4, 0]],
      [1, f.legR ?? [4, 0]],
    ] as [number, Limb][]
  ).map(([s, [a1, a2]]) => {
    const k = aim(a1, s);
    const a = aim(a2, s);
    return { s, knee: [k[0] * T, k[1] * T] as V, foot: [(k[0] + a[0]) * T, (k[1] + a[1]) * T] as V };
  });
  const hipY = Math.max(...legs.map((l) => -l.foot[1])) + 0.04;
  const P: V = [0, hipY];
  const W = at(P, 0.09);
  const Sh = at(P, 0.3);
  const H = at(Sh, 0.115);
  const sway = f.swish ?? 0;

  // Timing: one cycle is a shift of weight to one side and back, with two dips of the knees.
  const g = f.groove;
  const cycle = (g?.beats ?? 2) * BEAT;
  const delay = g?.delay ?? 0;
  const hh = hipY * h;
  const swing = (o: V, deg: number, dur: number, lag = 0, name = "swing"): Motion => ({
    name,
    o: scr(o),
    dur,
    delay: delay + lag,
    alt: true,
    vars: { "--u": `${deg}deg` },
  });

  // Arms: shoulder to elbow, then a forearm that can move on its own.
  const sw = (suit ? 0.125 : 0.095) * (turn ? 0.3 : 1);
  const L1 = 0.16;
  const L2 = 0.17;
  const part2 = (L: Layer, c: string, a: V, b: V, wa: number, wb: number, w: Weight) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const n: V = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    const q = [add(a, n, wa / 2), add(b, n, wb / 2), add(b, n, -wb / 2), add(a, n, -wa / 2)];
    const path = fill(S(q));
    L.body += path;
    L.fills?.push([c, path]);
    L.strokes.push(lines([S([q[0], q[1]]), S([q[3], q[2]])], w, 0.05));
  };
  const arm = (s: 1 | -1, spec: ArmSpec, move?: ArmMove, holds?: boolean) => {
    const J = at(Sh, -0.02, s * (sw - 0.024 * nar));
    let E: V;
    let hand: V;
    if (Array.isArray(spec)) {
      E = add(J, aim(spec[0], s), L1);
      hand = add(E, aim(spec[1], s), L2);
    } else {
      const target: V = "at" in spec ? spec.at : [(spec.to[0] - x) / h, (gy - spec.to[1]) / h];
      const dx = target[0] - J[0];
      const dy = target[1] - J[1];
      const dist = Math.hypot(dx, dy) || 0.001;
      const reach = Math.min(dist, L1 + L2 - 0.002);
      const base = Math.atan2(dy, dx);
      const alpha = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + reach * reach - L2 * L2) / (2 * L1 * reach))));
      const elbow = (b: number): V => [J[0] + L1 * Math.cos(base + b * alpha), J[1] + L1 * Math.sin(base + b * alpha)];
      const lo = elbow(1)[1] < elbow(-1)[1] ? 1 : -1;
      E = elbow(spec.bend ? spec.bend * lo : lo);
      hand = [J[0] + (dx * reach) / dist, J[1] + (dy * reach) / dist];
    }
    const fl = Math.hypot(hand[0] - E[0], hand[1] - E[1]) || 1;
    const wrist: V = [E[0] + ((hand[0] - E[0]) * (L2 - 0.02)) / fl, E[1] + ((hand[1] - E[1]) * (L2 - 0.02)) / fl];
    const [w0, w1, w2] = suit ? [0.052, 0.044, 0.036] : [0.036, 0.03, 0.022];
    const c = suit ? f.c : f.skin;
    const wt: Weight = suit ? "mid" : "far";
    const upper = part();
    part2(upper, c, J, E, w0, w1, wt);
    const [ex, ey] = scr(E);
    const joint = fill(ellipse(ex, ey, (w1 * h) / 2, (w1 * h) / 2));
    upper.body += joint;
    upper.fills?.push([c, joint]);
    const fore = part();
    part2(fore, c, E, wrist, w1, w2, wt);
    const [hx, hy] = scr(hand);
    dot(fore, f.skin, ellipse(hx, hy, 0.018 * h, 0.018 * h));
    if (holds) {
      const ph = [
        hx - 0.016 * h,
        hy - 0.05 * h,
        hx + 0.016 * h,
        hy - 0.05 * h,
        hx + 0.016 * h,
        hy + 0.006 * h,
        hx - 0.016 * h,
        hy + 0.006 * h,
      ];
      put(fore, BLACK, ph, "far", 0.03);
    }
    if (g && move) {
      const lag = move.lag ?? 0.08;
      if (move.u) upper.motion = swing(J, move.u, cycle / 2, lag);
      if (move.clap) fore.motion = swing(E, move.clap, BEAT / 2, 0, "clap");
      else if (move.f) fore.motion = swing(E, move.f, cycle / 2, lag + 0.1);
    }
    upper.kids = [fore];
    return upper;
  };

  const upperBody = (kids: Layer[]): Layer => ({
    body: "",
    strokes: [],
    kids,
    motion: g
      ? {
          name: "groove",
          o: scr(P),
          dur: cycle,
          delay,
          vars: { "--s": `${g.s}px`, "--d": `${g.d}px`, "--r": `${g.r ?? 1.5}deg` },
        }
      : undefined,
  });
  if (f.just)
    return upperBody([
      f.just === "L" ? arm(-1, f.armL, f.moveL, f.phone === "L") : arm(1, f.armR, f.moveR, f.phone === "R"),
    ]);

  const back = part();
  if (f.veil) {
    const fall = (s: number, out: number): V[] => [
      [H[0] + s * 0.035 * out, H[1] + 0.05],
      [H[0] + s * 0.1 * out + sway * 0.3, H[1] - 0.12],
      [H[0] + s * 0.15 * out + sway * 0.7, H[1] - 0.32],
      [H[0] + s * 0.17 * out + sway, H[1] - 0.52],
    ];
    // Turned, it trails down her back; otherwise it falls either side.
    const a = turn ? fall(-turn, 1.25) : fall(-1, 1);
    const b = turn ? fall(-turn, 0.15) : fall(1, 1);
    back.fills?.push([WHITE, fill(S([...a, ...b.reverse()])), 0.6]);
    back.strokes.push(curves([S(a), S(b)], "far", 0.15));
  }
  const hairFall = (): V[] =>
    turn
      ? [
          [H[0] - turn * 0.005, H[1] + 0.05],
          [H[0] - turn * 0.068, H[1] + 0.01],
          [H[0] - turn * 0.08 + sway * 0.7, H[1] - 0.15],
          [H[0] - turn * 0.02 + sway * 0.7, H[1] - 0.14],
          [H[0] - turn * 0.01, H[1] - 0.04],
        ]
      : [
          [H[0] - 0.048, H[1] + 0.045],
          [H[0] - 0.074, H[1] - 0.04],
          [H[0] - 0.07 + sway * 0.7, H[1] - 0.16],
          [H[0] + 0.07 + sway * 0.7, H[1] - 0.16],
          [H[0] + 0.074, H[1] - 0.04],
          [H[0] + 0.048, H[1] + 0.045],
        ];
  if (f.hair === "long" && !rear) put(back, f.hc, S(hairFall()), "far", 0.06);

  const legLayers: Layer[] = [];
  if (!gown) {
    for (const l of legs) {
      const leg = part();
      const hip: V = [l.s * 0.045 * nar, hipY];
      const knee = add(hip, l.knee);
      const foot = add(hip, l.foot);
      if (suit) put(leg, f.c, S(limb(hip, knee, foot, 0.078, 0.056, 0.042)), "mid", 0.08);
      else put(leg, f.skin, S(limb(hip, knee, foot, 0.05, 0.036, 0.022)), "far", 0.05);
      const toe = turn || l.s;
      const shoe: V[] = suit
        ? [
            [-0.024, 0.004],
            [0.024, 0.006],
            [0.075, -0.026],
            [0.075, -0.04],
            [-0.024, -0.04],
          ]
        : [
            [-0.012, 0],
            [0.014, 0.002],
            [0.055, -0.03],
            [0.05, -0.04],
            [-0.012, -0.04],
          ];
      put(leg, suit ? BARK : f.c, S(shoe.map(([a, b]) => [foot[0] + a * toe, foot[1] + b] as V)), "far", 0.04);
      // The foot stays put while the hip above it moves with the body.
      if (g)
        leg.motion = {
          name: "step",
          o: [scr(foot)[0], gy],
          dur: cycle,
          delay,
          vars: { "--a": `${(Math.atan(g.s / hh) / RAD).toFixed(2)}deg`, "--k": (1 - g.d / hh).toFixed(4) },
        };
      legLayers.push(leg);
    }
  }

  const torso = part();
  const skirt = part();
  if (suit) {
    put(
      torso,
      f.c,
      S([
        at(Sh, -0.005, -0.125 * nar),
        at(W, 0, -0.098 * nar),
        at(P, -0.04, -0.1 * nar),
        at(P, -0.04, 0.1 * nar),
        at(W, 0, 0.098 * nar),
        at(Sh, -0.005, 0.125 * nar),
        at(Sh, 0.014, 0.032 * nar),
        at(Sh, 0.014, -0.032 * nar),
      ]),
      "mid",
      0.1,
    );
    if (rear) torso.strokes.push(lines([S([at(P, -0.04), at(W, -0.01)])], "far", 0.04));
    else
      put(
        torso,
        WHITE,
        S([
          at(Sh, 0.014, turn * 0.05 - 0.03 * nar),
          at(Sh, -0.1, turn * 0.07),
          at(Sh, 0.014, turn * 0.05 + 0.03 * nar),
        ]),
        "far",
        0.04,
      );
  } else {
    const hem = gown ? 0.012 : hipY - 0.21;
    const fl = f.flare ?? (gown ? 0.2 : 0.15);
    const mid = (hipY + hem) / 2;
    put(
      skirt,
      f.c,
      S([
        at(W, 0, -0.06 * nar),
        at(P, 0, -0.092 * nar),
        [(-0.092 + sway - fl) / 2 - 0.012, mid],
        [sway - fl, hem + 0.012],
        [sway - fl * 0.5, hem - 0.006],
        [sway, hem + 0.008],
        [sway + fl * 0.5, hem - 0.008],
        [sway + fl, hem + 0.014],
        [(0.092 + sway + fl) / 2 + 0.012, mid],
        at(P, 0, 0.092 * nar),
        at(W, 0, 0.06 * nar),
      ]),
      "mid",
      0.1,
    );
    if (gown) {
      skirt.strokes.push(
        curves(
          [
            S([at(W, -0.03, -0.02), [sway - fl * 0.35, mid], [sway - fl * 0.45, hem + 0.03]]),
            S([at(W, -0.03, 0.025), [sway + fl * 0.3, mid], [sway + fl * 0.4, hem + 0.03]]),
          ],
          "far",
          0.15,
        ),
      );
    }
    // The skirt follows the hips a moment late.
    if (g)
      skirt.motion = {
        name: "swish",
        o: scr(W),
        dur: cycle / 2,
        delay: delay + cycle * 0.12,
        alt: true,
        vars: { "--u": gown ? "1.6deg" : "5deg" },
      };
    put(
      torso,
      f.skin,
      S([
        at(Sh, 0.006, -0.095 * nar),
        at(Sh, 0.006, 0.095 * nar),
        at(Sh, -0.07, 0.088 * nar),
        at(Sh, -0.07, -0.088 * nar),
      ]),
      "far",
      0.04,
    );
    const neckline: V[] = face === "front" ? [at(Sh, 0.004, 0.055), at(Sh, -0.055), at(Sh, 0.004, -0.055)] : [];
    put(
      torso,
      f.c,
      S([
        at(Sh, -0.04, -0.088 * nar),
        at(W, 0, -0.06 * nar),
        at(W, 0, 0.06 * nar),
        at(Sh, -0.04, 0.088 * nar),
        ...neckline,
      ]),
      "mid",
      0.06,
    );
  }
  put(torso, f.skin, S([at(Sh, 0, -0.022), at(Sh, 0, 0.022), at(H, -0.045, 0.02), at(H, -0.045, -0.02)]), "far", 0.03);

  const head = part();
  const [hx, hy] = scr(H);
  const rx = 0.052 * h;
  const ry = 0.066 * h;
  const skull = ellipse(hx, hy, rx, ry);
  if (turn)
    put(
      head,
      f.skin,
      S([add(H, [turn * 0.044, 0.014]), add(H, [turn * 0.066, -0.006]), add(H, [turn * 0.042, -0.02])]),
      "far",
      0.02,
    );
  dot(head, f.skin, skull, "mid", 0.04);
  head.fills?.push([f.hc, fill(cap(skull, hx, hy, rx, ry, -turn, rear ? 0.7 : -0.25))]);
  if (f.hair === "long" && rear) {
    put(
      head,
      f.hc,
      S([
        add(H, [-0.05, 0.02]),
        add(H, [-0.07, -0.06]),
        add(H, [-0.064 + sway * 0.7, -0.18]),
        add(H, [0.064 + sway * 0.7, -0.18]),
        add(H, [0.07, -0.06]),
        add(H, [0.05, 0.02]),
      ]),
      "far",
      0.06,
    );
  }
  if (f.hair === "bun") {
    const [bx, by] = scr(add(H, rear ? [0, 0.03] : turn ? [-turn * 0.05, 0.045] : [0.012, 0.074]));
    dot(head, f.hc, ellipse(bx, by, 0.03 * h, 0.027 * h));
  }
  if (f.phones) {
    for (const s of [-1, 1]) dot(head, RED, ellipse(hx + s * 0.058 * h, hy + 0.004 * h, 0.02 * h, 0.036 * h));
    head.strokes.push(
      curve(
        S([
          add(H, [-0.058, 0.02]),
          add(H, [-0.046, 0.066]),
          add(H, [0, 0.084]),
          add(H, [0.046, 0.066]),
          add(H, [0.058, 0.02]),
        ]),
        "mid",
        0.04,
      ),
    );
  }
  if (g) head.motion = swing(Sh, (g.r ?? 1.5) * 1.6, cycle / 2, cycle * 0.1);

  const arms = [
    f.skip === "L" ? null : arm(-1, f.armL, f.moveL, f.phone === "L"),
    f.skip === "R" ? null : arm(1, f.armR, f.moveR, f.phone === "R"),
  ].filter((a): a is Layer => a !== null);
  return { body: "", strokes: [], kids: [...legLayers, upperBody([back, skirt, torso, ...arms, head])] };
}

const rect = (x0: number, y0: number, x1: number, y1: number) => [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0];

// The floor: a low wooden deck, seen from just above its edge.
const FLOOR_BACK = 904;
const FLOOR_FRONT = 932;
const deck = [C - 152, FLOOR_BACK, C + 152, FLOOR_BACK, C + 174, FLOOR_FRONT, C - 174, FLOOR_FRONT];
const deckEdge = rect(C - 174, FLOOR_FRONT, C + 174, 935.4);
const floor: Layer = {
  body: fill(deck) + fill(deckEdge),
  fills: [
    [WOOD, fill(deck)],
    [WOOD_DARK, fill(deckEdge)],
  ],
  strokes: [
    line([C - 152, FLOOR_BACK, C + 152, FLOOR_BACK], "mid", 0.3),
    lines(
      [
        [C - 152, FLOOR_BACK, C - 174, FLOOR_FRONT],
        [C + 152, FLOOR_BACK, C + 174, FLOOR_FRONT],
      ],
      "mid",
      0.2,
    ),
    line(deckEdge, "near", 0.3),
  ],
};

// The DJ, on a platform a little up the slope, behind the middle of the floor.
const DJ_X = C;
const STAGE = 878;
const riser = rect(DJ_X - 44, STAGE, DJ_X + 44, FLOOR_BACK - 1);
const boxes = [rect(DJ_X - 43, STAGE - 36, DJ_X - 28, STAGE - 1), rect(DJ_X + 28, STAGE - 36, DJ_X + 43, STAGE - 1)];
// Each speaker: a cone that thumps on the beat, and rings of sound that spread up and away from it.
const speakers: Layer[] = [-1, 1].flatMap((s) => {
  const cx = DJ_X + s * 35.5;
  const cy = STAGE - 13;
  const woofer = part();
  dot(woofer, BARK, ellipse(cx, cy, 4.6, 4.6), "near", 0.05);
  woofer.motion = { name: "thump", o: [cx, cy], dur: BEAT / 2, alt: true, ease: "ease-out" };
  const tweeter = part();
  dot(tweeter, BARK, ellipse(cx, cy - 14.5, 2.6, 2.6), "near", 0.05);
  const base = s > 0 ? -32 : 212;
  const ring: number[] = [];
  for (let t = -40; t <= 40; t += 10)
    ring.push(cx + 15 * Math.cos((base + t) * RAD), cy + 15 * Math.sin((base + t) * RAD));
  const rings = [0, 1, 2].map((i): Layer => ({
    body: "",
    strokes: [curve(ring, "mid", 0.05)],
    motion: { name: "sound", o: [cx, cy], dur: BEAT * 3, delay: -i * BEAT, ease: "linear" },
  }));
  return [...rings, woofer, tweeter];
});
const stage: Layer = {
  body: fill(riser) + boxes.map(fill).join(""),
  fills: [[TAUPE, fill(riser), 0.55], ...boxes.map((b): Fill => [TAUPE, fill(b)])],
  strokes: [
    line(riser, "near", 0.2),
    lines(
      [
        [DJ_X - 44, STAGE + 4.5, DJ_X + 44, STAGE + 4.5],
        [DJ_X - 30, STAGE + 4.5, DJ_X - 30, FLOOR_BACK - 1],
        [DJ_X + 30, STAGE + 4.5, DJ_X + 30, FLOOR_BACK - 1],
      ],
      "mid",
      0.15,
    ),
    lines(boxes, "near", 0.15),
  ],
  kids: speakers,
};
// One hand on the headphones, one on the decks: nothing above the head, so the booth stays low.
const dj = figure({
  x: DJ_X,
  gy: STAGE,
  h: 48,
  kind: "suit",
  armL: [140, -90],
  armR: [30, -50],
  phones: true,
  c: BLACK,
  skin: SKIN[1],
  hc: HAIR[0],
  groove: { s: 0.6, d: 0.9, r: 1.2 },
  moveR: { f: 5 },
});
const heart = (x: number, y: number, s: number) => [
  x,
  y + 4 * s,
  x - 5 * s,
  y - 1 * s,
  x - 2.6 * s,
  y - 4 * s,
  x,
  y - 1.6 * s,
  x + 2.6 * s,
  y - 4 * s,
  x + 5 * s,
  y - 1 * s,
  x,
  y + 4 * s,
];
const booth = rect(DJ_X - 24, STAGE - 22, DJ_X + 24, STAGE);
const lip = rect(DJ_X - 26, STAGE - 24.5, DJ_X + 26, STAGE - 22);
const platters = [ellipse(DJ_X - 13, STAGE - 26.4, 7.5, 1.9), ellipse(DJ_X + 13, STAGE - 26.4, 7.5, 1.9)];
const mixer = [DJ_X - 3.5, STAGE - 24.5, DJ_X - 3.5, STAGE - 29, DJ_X + 3.5, STAGE - 29, DJ_X + 3.5, STAGE - 24.5];
const decks: Layer = {
  body: fill(booth),
  fills: [
    [RED, fill(booth)],
    [BARK, fill(lip)],
    ...platters.map((pl): Fill => [BARK, fill(pl)]),
    [SLATE, fill(mixer)],
    [WHITE, fill(heart(DJ_X, STAGE - 13, 1))],
  ],
  strokes: [
    line(booth, "near", 0.15),
    line(lip, "near", 0.08),
    blobs(platters, "near", 0.04),
    line(mixer, "near", 0.05),
    blobs([heart(DJ_X, STAGE - 13, 1)], "mid", 0.1),
  ],
};

// A round dinner table on the snow beside the floor: two guests behind it, one at each side.
type Seat = "suit" | "bun" | "long";
const GROUND = 929;
let seated = 0;
function table(tx: number, behind: [Seat, Seat], sides: [Seat, Seat] | [], only: "wide" | "narrow"): Layer[] {
  const gy = GROUND;
  const top = gy - 22;
  const sit: Layer = { ...part(), only };
  const dressed = (kind: Seat) => {
    const n = seated++;
    return {
      c: kind === "suit" ? SUITS[n % SUITS.length] : DRESSES[(n * 3) % DRESSES.length],
      skin: SKIN[(n * 7 + 1) % SKIN.length],
      hc: HAIR[(n * 3 + 2) % HAIR.length],
    };
  };
  const RX = 2.8;
  const RY = 3.5;

  behind.forEach((kind, i) => {
    const who = dressed(kind);
    const x = tx + (i ? 11.5 : -11.5);
    const hy = gy - 35.4;
    const head = ellipse(x, hy, RX, RY);
    const sh = kind === "suit" ? 6.2 : 4.6;
    const shoulders = [
      x - sh,
      top + 2,
      x - sh,
      gy - 27.8,
      x - 2,
      gy - 30.3,
      x + 2,
      gy - 30.3,
      x + sh,
      gy - 27.8,
      x + sh,
      top + 2,
    ];
    const neck = [x - 2, gy - 30.3, x, kind === "suit" ? gy - 25.5 : gy - 27.6, x + 2, gy - 30.3];
    if (kind === "long")
      put(
        sit,
        who.hc,
        [x - 2.6, hy - 2.4, x - 4, hy + 1.5, x - 3.7, hy + 6.2, x + 3.7, hy + 6.2, x + 4, hy + 1.5, x + 2.6, hy - 2.4],
        "far",
        0.05,
      );
    put(sit, who.c, shoulders, "mid", 0.08);
    put(sit, kind === "suit" ? WHITE : who.skin, neck, "far", 0.04);
    put(sit, who.skin, [x - 1.1, gy - 30.3, x + 1.1, gy - 30.3, x + 1, gy - 32.4, x - 1, gy - 32.4], "far", 0.03);
    dot(sit, who.skin, head, "mid", 0.04);
    sit.fills?.push([who.hc, fill(cap(head, x, hy, RX, RY))]);
    if (kind === "bun") dot(sit, who.hc, ellipse(x + 0.4, hy - 4, 1.5, 1.4));
  });

  sides.forEach((kind, i) => {
    const who = dressed(kind);
    const s = i ? 1 : -1;
    const X = (dx: number) => tx + s * dx;
    const suit = kind === "suit";
    const hx = X(31.6);
    const hy = gy - 35.6;
    const head = ellipse(hx, hy, RX, RY);
    const back = suit ? 35.2 : 34.6;
    const front = suit ? 29.6 : 30.4;
    const body = suit
      ? [
          X(back),
          gy - 13.5,
          X(back - 0.8),
          gy - 30,
          X(front),
          gy - 30,
          X(front + 0.4),
          gy - 17.5,
          X(22),
          gy - 17.5,
          X(22),
          gy - 13.5,
        ]
      : [
          X(back),
          gy - 17,
          X(back - 0.6),
          gy - 30,
          X(front),
          gy - 30,
          X(front + 0.3),
          gy - 17.5,
          X(22.5),
          gy - 17.5,
          X(24.6),
          gy - 4.2,
          X(36),
          gy - 5.2,
        ];
    // The chair: back post, seat, front leg.
    sit.strokes.push(
      lines(
        [
          [X(38.3), gy - 30.6, X(37.2), gy - 30, X(37), gy],
          [X(37.1), gy - 12.5, X(27.4), gy - 12.5, X(27.7), gy],
        ],
        "near",
        0.08,
      ),
    );
    if (kind === "long")
      put(
        sit,
        who.hc,
        [hx + s * 0.8, hy - 3.2, hx + s * 3.9, hy - 0.5, hx + s * 3.7, hy + 6, hx + s * 1.2, hy + 4.6],
        "far",
        0.05,
      );
    put(sit, who.c, body, "mid", 0.08);
    put(sit, who.skin, [hx - 1, gy - 30, hx + 1, gy - 30, hx + 0.9, gy - 32.6, hx - 0.9, gy - 32.6], "far", 0.03);
    sit.strokes.push(
      lines(
        [
          suit
            ? [X(25.6), gy - 13.5, X(25.8), gy - 1, X(21.8), gy - 1]
            : [X(27.2), gy - 4.4, X(27.2), gy - 0.9, X(24), gy - 0.9],
          [X(32), gy - 28, X(29), gy - 21.6, X(22.4), gy - 23.6],
        ],
        "mid",
        0.06,
      ),
    );
    dot(sit, who.skin, ellipse(X(21.6), gy - 23.8, 1, 1));
    dot(sit, who.skin, head, "mid", 0.04);
    sit.fills?.push([who.hc, fill(cap(head, hx, hy, RX, RY, s))]);
    if (kind === "bun") dot(sit, who.hc, ellipse(hx + s * 2.6, hy - 2.8, 1.5, 1.4));
  });

  const round = ellipse(tx, top, 22, 3.2);
  const cloth = [tx - 22, top, tx - 24.5, gy - 2.5, tx + 24.5, gy - 2.5, tx + 22, top];
  const flowers = [
    ellipse(tx - 2.6, top - 4, 2.1, 2),
    ellipse(tx + 2.4, top - 4.3, 2.1, 2),
    ellipse(tx - 0.2, top - 6.6, 2.2, 2.1),
  ];
  const tbl: Layer = {
    only,
    body: fill(cloth) + fill(round) + flowers.map(fill).join(""),
    fills: [
      [WHITE, fill(cloth)],
      [WHITE, fill(round)],
      [FOLIAGE, fill(flowers[0])],
      [ROSE, fill(flowers[1])],
      [RED, fill(flowers[2])],
    ],
    strokes: [
      lines(
        [
          [tx - 22, top, tx - 24.5, gy - 2.5],
          [tx + 22, top, tx + 24.5, gy - 2.5],
        ],
        "near",
        0.1,
      ),
      curve(
        [
          tx - 24.5,
          gy - 2.5,
          tx - 16,
          gy - 1,
          tx - 8,
          gy - 2.3,
          tx,
          gy - 0.9,
          tx + 8,
          gy - 2.3,
          tx + 16,
          gy - 1,
          tx + 24.5,
          gy - 2.5,
        ],
        "near",
        0.1,
      ),
      lines(
        [
          [tx - 9, top + 5, tx - 10.5, gy - 4],
          [tx + 3, top + 5.5, tx + 3.6, gy - 3.4],
          [tx + 13, top + 5, tx + 15, gy - 4],
        ],
        "far",
        0.15,
      ),
      blobs([round], "near", 0.05),
      blobs(flowers, "near", 0.04),
    ],
  };
  return [sit, tbl];
}
const tables: Layer[] = [
  ...table(C - 348, ["bun", "suit"], ["suit", "long"], "wide"),
  ...table(C - 252, ["suit", "long"], ["bun", "suit"], "wide"),
  ...table(C + 252, ["long", "suit"], ["suit", "bun"], "wide"),
  ...table(C + 348, ["suit", "bun"], ["long", "suit"], "wide"),
  // Phones: a smaller one each side, outside the two masts.
  ...table(C - 291, ["suit", "long"], [], "narrow"),
  ...table(C + 291, ["bun", "suit"], [], "narrow"),
];
// The narrow lifts stop their ground lines at the masts, so here the party draws the snow, edge to edge.
const snow: Layer = {
  body: "",
  only: "narrow",
  strokes: [
    lines(
      [
        [C - 700, 930.6, C - 174, 931],
        [C + 174, 931, C + 700, 930.6],
      ],
      "near",
      0.2,
    ),
  ],
};

// The guests stand in a ring round the two of them: those behind face us, those at the ends are
// side on, and those in front have their backs to us, with a gap left so we can see the middle.
const MID = 921;
const RING_BACK = 911;
const RING_FRONT = 929;
const half = BEAT;
const dancers: Layer[] = [
  // Behind.
  figure({
    x: C - 43,
    gy: RING_BACK,
    h: 47,
    kind: "suit",
    c: SLATE,
    skin: SKIN[2],
    hc: HAIR[0],
    armL: [30, -40],
    armR: [70, 150],
    legL: [9, 0],
    legR: [11, -6],
    lean: 3,
    groove: { s: 1.2, d: 1.1, delay: -0.3 },
    moveR: { u: 6, f: 14 },
    moveL: { u: 4 },
  }),
  figure({
    x: C - 91,
    gy: RING_BACK + 2,
    h: 44,
    kind: "dress",
    c: TEAL,
    skin: SKIN[0],
    hc: HAIR[3],
    hair: "long",
    armL: [150, 175],
    armR: [145, 190],
    legL: [6, 0],
    legR: [11, -8],
    lean: -3,
    swish: -0.02,
    groove: { s: 1.3, d: 1, delay: -half },
    moveL: { u: 8, f: 10 },
    moveR: { u: 8, f: 10, lag: 0.2 },
  }),
  figure({
    x: C + 43,
    gy: RING_BACK,
    h: 47,
    kind: "suit",
    c: TAUPE,
    skin: SKIN[1],
    hc: HAIR[4],
    armL: { at: [-0.012, 0.7] },
    armR: { at: [0.012, 0.7] },
    legL: [7, 0],
    legR: [7, 0],
    groove: { s: 1, d: 1.1, delay: -0.1 },
    moveL: { clap: -14 },
    moveR: { clap: 14 },
  }),
  figure({
    x: C + 93,
    gy: RING_BACK + 2,
    h: 44,
    kind: "dress",
    c: MUSTARD,
    skin: SKIN[3],
    hc: HAIR[0],
    hair: "bun",
    armL: [150, 166],
    armR: [150, 166],
    legL: [13, -6],
    legR: [5, 0],
    lean: 3,
    swish: 0.03,
    groove: { s: 1.4, d: 1, delay: -half - 0.15 },
    moveL: { u: 9, f: 8 },
    moveR: { u: 9, f: 8 },
  }),
  // At the ends, side on.
  figure({
    x: C - 138,
    gy: MID,
    h: 47,
    kind: "dress",
    face: "right",
    c: ROSE,
    skin: SKIN[1],
    hc: HAIR[1],
    hair: "bun",
    armL: { at: [0.19, 0.735] },
    armR: { at: [0.19, 0.755] },
    legL: [-6, 4],
    legR: [14, -6],
    lean: 4,
    swish: -0.03,
    groove: { s: 1.1, d: 1.1, delay: -0.2 },
    moveL: { clap: 12 },
    moveR: { clap: -12 },
  }),
  figure({
    x: C + 140,
    gy: MID,
    h: 52,
    kind: "suit",
    face: "left",
    c: NAVY,
    skin: SKIN[0],
    hc: HAIR[2],
    armL: { at: [-0.2, 0.9], bend: 1 },
    armR: [-8, -18],
    legL: [12, -4],
    legR: [-5, 3],
    lean: -3,
    phone: "L",
    groove: { s: 0.8, d: 0.8, r: 0.8, delay: -half },
  }),
  // The two of them, in the middle: his hand at her waist, hers on his shoulder, the other two joined.
  figure({
    x: C + 9,
    gy: MID,
    h: 51,
    kind: "suit",
    face: "left",
    c: BLACK,
    skin: SKIN[1],
    hc: HAIR[1],
    armL: { to: [C - 4.5, MID - 29] },
    armR: { to: [C - 0.2, MID - 40.5] },
    legL: [8, -2],
    legR: [4, 2],
    lean: -2,
    skip: "L",
    groove: { s: 1.7, d: 0.7, r: 1, beats: 4 },
  }),
  figure({
    x: C - 8,
    gy: MID,
    h: 46,
    kind: "gown",
    face: "right",
    c: WHITE,
    skin: SKIN[1],
    hc: HAIR[1],
    hair: "bun",
    armL: { to: [C + 0.6, MID - 40.5] },
    armR: { to: [C + 7.5, MID - 41.5] },
    lean: 2,
    swish: -0.04,
    veil: true,
    groove: { s: 1.7, d: 0.7, r: 1, beats: 4 },
  }),
  figure({
    x: C + 9,
    gy: MID,
    h: 51,
    kind: "suit",
    face: "left",
    c: BLACK,
    skin: SKIN[1],
    hc: HAIR[1],
    armL: { to: [C - 4.5, MID - 29] },
    armR: { to: [C - 0.2, MID - 40.5] },
    lean: -2,
    just: "L",
    groove: { s: 1.7, d: 0.7, r: 1, beats: 4 },
  }),
  // In front, backs to us.
  figure({
    x: C - 112,
    gy: RING_FRONT - 1,
    h: 56,
    kind: "suit",
    face: "back",
    c: OLIVE,
    skin: SKIN[1],
    hc: HAIR[0],
    armL: [150, 172],
    armR: [140, 186],
    legL: [9, 0],
    legR: [12, -5],
    lean: 3,
    groove: { s: 1.5, d: 1.3, delay: -half - 0.05 },
    moveL: { u: 7, f: 9 },
    moveR: { u: 7, f: 9, lag: 0.2 },
  }),
  figure({
    x: C - 70,
    gy: RING_FRONT,
    h: 51,
    kind: "dress",
    face: "back",
    c: AMBER,
    skin: SKIN[2],
    hc: HAIR[0],
    hair: "long",
    armL: [40, -30],
    armR: [150, 170],
    legL: [12, -8],
    legR: [8, 0],
    lean: 3,
    swish: 0.04,
    flare: 0.17,
    groove: { s: 1.6, d: 1.2, delay: -0.12 },
    moveR: { u: 10, f: 12 },
  }),
  figure({
    x: C + 72,
    gy: RING_FRONT,
    h: 51,
    kind: "dress",
    face: "back",
    c: MAUVE,
    skin: SKIN[0],
    hc: HAIR[2],
    hair: "bun",
    armL: { at: [-0.012, 1.1] },
    armR: { at: [0.012, 1.1] },
    legL: [6, 0],
    legR: [14, -10],
    lean: -3,
    swish: -0.04,
    groove: { s: 1.5, d: 1.2, delay: -half },
    moveL: { clap: -12 },
    moveR: { clap: 12 },
  }),
  figure({
    x: C + 114,
    gy: RING_FRONT - 1,
    h: 50,
    kind: "dress",
    face: "back",
    c: FOLIAGE,
    skin: SKIN[2],
    hc: HAIR[1],
    hair: "long",
    armL: [150, 170],
    armR: [60, 150],
    legL: [5, 0],
    legR: [15, -12],
    lean: -4,
    swish: 0.03,
    groove: { s: 1.6, d: 1.2, delay: -0.25 },
    moveL: { u: 8, f: 10 },
    moveR: { u: 5, f: 12 },
  }),
];

// Fairy lights: a string swagged between two poles at the back corners of the floor, low in the
// middle so it stays clear of the button above; on wide screens it carries on over the tables.
const GLOW = "#f3b83f";
const BULB = "#fbe08a";
function garland(x0: number, y0: number, x1: number, y1: number, sag: number, only?: "wide"): Layer {
  const at = (t: number): V => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t + sag * 4 * t * (1 - t)];
  const wire: number[] = [];
  for (let i = 0; i <= 16; i++) wire.push(...at(i / 16));
  // Three sets of bulbs, each glowing in its own time.
  const sets = [0, 1, 2].map((g): Layer => ({
    ...part(),
    motion: { name: "twinkle", o: [x0, y0], dur: BEAT * 3, delay: -g * BEAT * 2, alt: true },
  }));
  const count = Math.round(Math.abs(x1 - x0) / 11);
  for (let i = 1; i < count; i++) {
    const [bx, by] = at(i / count);
    const set = sets[i % 3];
    set.fills?.push([GLOW, fill(ellipse(bx, by + 2.6, 4.4, 4.4)), 0.3]);
    dot(set, BULB, ellipse(bx, by + 2.6, 1.5, 1.8), "far", 0.03);
  }
  return { body: "", strokes: [curve(wire, "far", 0.1)], only, kids: sets };
}
const pole = (x: number, base: number, top: number, only?: "wide"): Layer => ({
  body: "",
  only,
  strokes: [
    lines(
      [
        [x - 0.8, base, x - 0.6, top + 2],
        [x + 0.8, base, x + 0.6, top + 2],
      ],
      "near",
      0.08,
    ),
    blobs([ellipse(x, top + 0.6, 1.6, 1.6)], "near", 0.04),
  ],
});
const lights: Layer[] = [
  pole(C - 144, FLOOR_BACK, 800),
  pole(C + 144, FLOOR_BACK, 800),
  pole(C - 398, GROUND, 812, "wide"),
  pole(C + 398, GROUND, 812, "wide"),
  garland(C - 398, 813, C - 144, 801, 13, "wide"),
  garland(C + 144, 801, C + 398, 813, 13, "wide"),
  garland(C - 144, 801, C + 144, 801, 16),
];

export const PARTY: Layer[] = [...lights, stage, dj, decks, snow, floor, ...tables, ...dancers];
