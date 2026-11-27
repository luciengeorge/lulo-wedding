/**
 * Downtown Beirut: the Mohammad Al-Amin Mosque, ochre stone under its blue
 * dome with four slim minarets, and right beside it Saint George's Maronite
 * Cathedral, its pale columned front and its tall bell tower.
 */
import { GROUND, INK, type Layer, curve, curves, line, lines, part, put, wash } from "./kit.ts";

/** Points along an ellipse, finer than the kit's, for a dome that must look round. */
function arc(cx: number, cy: number, rx: number, ry: number, from: number, sweep: number, steps = 16) {
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + (sweep * i) / steps;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}
/** A round-headed window or door, standing on `foot`. */
const arch = (x: number, foot: number, w: number, h: number) => [
  x - w / 2,
  foot,
  ...arc(x, foot - h + w / 2, w / 2, w / 2, Math.PI, Math.PI, 8),
  x + w / 2,
  foot,
];
const box = (x0: number, y0: number, x1: number, y1: number) => [x0, y1, x0, y0, x1, y0, x1, y1];

/** A pencil minaret: a slim shaft with two balconies and a pointed blue cap. */
function minaret(cx: number, foot: number, top: number, w: number): Layer {
  const L = part();
  const b1 = top + (foot - top) * 0.42;
  const b2 = top + 64;
  const v = w * 0.78;
  put(L, INK.sand, box(cx - w / 2, b1 + 8, cx + w / 2, foot), "mid", 0.4, 0.8);
  put(L, INK.sand, box(cx - v / 2, b2 + 8, cx + v / 2, b1), "mid", 0.4, 0.8);
  put(L, INK.sand, box(cx - v * 0.4, top + 40, cx + v * 0.4, b2), "far", 0.3, 0.8);
  // Each balcony on its corbels, with a railing.
  for (const [y, half] of [
    [b1, w / 2 + 5],
    [b2, v / 2 + 5],
  ]) {
    put(L, INK.sand, [cx - half + 4, y + 8, cx - half, y, cx + half, y, cx + half - 4, y + 8], "far", 0.2, 0.9);
    L.strokes.push(lines([box(cx - half, y - 7, cx + half, y), [cx, y - 7, cx, y]], "far", 0.2));
  }
  put(L, INK.teal, [cx - v * 0.48, top + 40, cx, top, cx + v * 0.48, top + 40], "mid", 0.3, 0.75);
  // The finial, with its crescent.
  L.strokes.push(line([cx, top, cx, top - 12], "far", 0.1), curve([cx - 3.5, top - 19, cx, top - 13, cx + 3.5, top - 19], "far", 0.1));
  return L;
}

/** The mosque's middle, and half the width of its hall. */
const MX = 600;
const HW = 168;
const TIP = 100;
/** The cathedral's middle. */
const CX = 220;

const ground: Layer = {
  ...part(),
  strokes: [
    curve([96, GROUND + 6, 260, GROUND + 1, 470, GROUND, 660, GROUND + 1, 836, GROUND + 6], "mid", 0.8),
    lines(
      [
        [118, GROUND + 15, 168, GROUND + 15],
        [700, GROUND + 15, 770, GROUND + 15],
      ],
      "far",
      0.6,
    ),
  ],
};

const backMinarets = [minaret(MX - 128, 340, TIP + 8, 13), minaret(MX + 128, 340, TIP + 8, 13)];

/** Small domes on the corners and the half-domes that step up to the great one. */
const shoulders: Layer = (() => {
  const L = part();
  for (const x of [MX - HW + 28, MX + HW - 28]) {
    put(L, INK.sand, box(x - 16, 326, x + 16, 340), "far", 0.3, 0.8);
    put(L, INK.teal, [x - 18, 326, ...arc(x, 326, 18, 16, Math.PI, Math.PI, 8), x + 18, 326], "far", 0.3, 0.7);
    L.strokes.push(line([x, 310, x, 301], "far", 0.1));
  }
  put(L, INK.teal, [MX - 112, 340, ...arc(MX - 64, 340, 48, 42, Math.PI, Math.PI / 2, 8), MX - 64, 340], "mid", 0.4, 0.65);
  put(L, INK.teal, [MX + 64, 340, ...arc(MX + 64, 340, 48, 42, -Math.PI / 2, Math.PI / 2, 8), MX + 112, 340], "mid", 0.4, 0.65);
  return L;
})();

const dome: Layer = (() => {
  const L = part();
  put(L, INK.sand, box(MX - 78, 270, MX + 78, 340), "mid", 0.4, 0.8);
  L.strokes.push(
    lines([-60, -36, -12, 12, 36, 60].map((x) => arch(MX + x, 328, 10, 32)), "far", 0.2),
    line([MX - 86, 270, MX + 86, 270], "mid", 0.3),
  );
  put(L, INK.teal, [MX - 84, 270, ...arc(MX, 270, 84, 86, Math.PI, Math.PI, 20), MX + 84, 270], "near", 0.5, 0.72);
  L.strokes.push(
    // Ribs on the dome, and the crescent on its finial.
    curves(
      [
        [MX - 44, 268, MX - 38, 222, MX - 16, 190],
        [MX + 44, 268, MX + 38, 222, MX + 16, 190],
      ],
      "far",
      0.4,
    ),
    line([MX, 184, MX, 160], "mid", 0.1),
    curve([MX - 6, 150, MX, 158, MX + 6, 150], "far", 0.1),
  );
  return L;
})();

/** The prayer hall: a square of ochre stone with arcades along its front. */
const hall: Layer = (() => {
  const L = part();
  put(L, INK.sand, box(MX - HW, 346, MX + HW, GROUND), "mid", 0.5, 0.75);
  // The shade inside the arcade along the bottom.
  wash(L, INK.amber, box(MX - HW + 6, 414, MX + HW - 6, GROUND), 0.28);
  L.strokes.push(
    lines(
      [
        [MX - HW, 414, MX + HW, 414],
        [MX - HW - 4, 346, MX + HW + 4, 346],
        [MX - HW - 4, 346, MX - HW - 4, 340, MX + HW + 4, 340, MX + HW + 4, 346],
      ],
      "far",
      0.3,
    ),
    lines(
      [-148, -112, -76, -40, 40, 76, 112, 148].map((x) => arch(MX + x, GROUND, 22, 40)),
      "far",
      0.3,
    ),
    lines(
      [-140, -104, -68, -32, 32, 68, 104, 140].map((x) => arch(MX + x, 398, 12, 26)),
      "far",
      0.2,
    ),
    // The tall main door.
    line(arch(MX, GROUND, 36, 74), "mid", 0.3),
  );
  return L;
})();

const frontMinarets = [minaret(MX - HW - 12, GROUND, TIP, 16), minaret(MX + HW + 12, GROUND, TIP, 16)];

/** The bell tower, a little taller than the minarets beside it. */
const tower: Layer = (() => {
  const L = part();
  // Pale stone like the church, with only the belfry shaded.
  wash(L, INK.stone, box(331, 153, 361, 224), 0.75);
  put(L, INK.stone, [326, 152, 346, 108, 366, 152], "mid", 0.3, 0.75);
  L.strokes.push(
    line(box(330, 152, 362, GROUND), "mid", 0.4),
    lines([[324, 152, 368, 152], [324, 224, 368, 224], [326, 304, 366, 304]], "far", 0.2),
    lines([arch(339, 216, 8, 48), arch(353, 216, 8, 48)], "far", 0.2),
    lines([[346, 108, 346, 80], [338, 90, 354, 90]], "mid", 0.1),
  );
  return L;
})();

/**
 * Saint George's, left as bare paper so it reads pale beside the ochre:
 * columns below, pilasters and a pediment above.
 */
const cathedral: Layer = (() => {
  const L = part();
  put(L, INK.stone, [CX - 62, 344, CX, 304, CX + 62, 344], "mid", 0.4, 0.6);
  // Shade inside the door and the portico.
  wash(L, INK.taupe, arch(CX, GROUND, 32, 58), 0.3);
  wash(L, INK.stone, box(CX - 70, 404, CX - 44, GROUND), 0.5);
  wash(L, INK.stone, box(CX + 44, 404, CX + 70, GROUND), 0.5);
  L.strokes.push(
    lines([box(CX - 84, 392, CX + 84, GROUND), box(CX - 52, 344, CX + 52, 392)], "mid", 0.4),
    lines([[CX - 90, 392, CX + 90, 392], [CX - 90, 398, CX + 90, 398], [CX - 58, 349, CX + 58, 349]], "far", 0.2),
    lines(
      [
        ...[-70, -44, 44, 70].map((x) => [CX + x, 404, CX + x, GROUND - 2]),
        ...[-38, 38].map((x) => [CX + x, 354, CX + x, 390]),
      ],
      "mid",
      0.3,
    ),
    line(arch(CX, GROUND, 32, 58), "mid", 0.3),
    lines([arch(CX - 19, 386, 11, 28), arch(CX + 19, 386, 11, 28)], "far", 0.2),
    // The round window in the pediment and the cross above it.
    curve(arc(CX, 330, 7, 7, 0, Math.PI * 2 + 0.3, 10), "far", 0.1),
    lines([[CX, 304, CX, 282], [CX - 7, 290, CX + 7, 290]], "mid", 0.1),
  );
  return L;
})();

const BEIRUT: Layer[] = [ground, ...backMinarets, shoulders, dome, hall, ...frontMinarets, tower, cathedral];
export default BEIRUT;
