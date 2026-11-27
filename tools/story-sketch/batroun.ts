/**
 * The coast at Batroun: the Phoenician wall, a long low ridge of rock along
 * the shore, with a wave breaking over it; the open sea beyond with one small
 * boat; and on the sand in front a parasol and a sunbed.
 */
import { GROUND, INK, type Layer, blobs, curve, curves, dab, ellipse, line, lines, part, put, wash } from "./kit.ts";

const HORIZON = 206;

const sea: Layer = (() => {
  const L = part();
  wash(L, INK.sea, [128, HORIZON + 2, 776, HORIZON + 2, 780, 252, 124, 248], 0.32);
  L.strokes.push(
    line([110, HORIZON, 792, HORIZON], "far", 0.4),
    lines(
      [
        [150, 228, 196, 228],
        [440, 236, 492, 236],
        [700, 224, 744, 224],
        [560, 252, 604, 252],
        [700, 258, 738, 258],
      ],
      "far",
      0.4,
    ),
  );
  return L;
})();

/** A small fishing boat out on the open sea. */
const boat: Layer = (() => {
  const L = part();
  const x = 636;
  const y = 240;
  put(L, INK.white, [x - 6, y - 4, x - 6, y - 14, x + 6, y - 14, x + 6, y - 4], "far", 0.15);
  put(L, INK.white, [x - 26, y - 5, x + 26, y - 7, x + 19, y + 4, x - 20, y + 4], "mid", 0.2);
  wash(L, INK.navy, [x - 24, y - 1, x + 23, y - 3, x + 21, y + 1, x - 22, y + 2], 0.8);
  L.strokes.push(line([x - 14, y + 9, x + 12, y + 9], "far", 0.3));
  return L;
})();

/** The wave behind the wall, its water rising green before it breaks. */
const swell: Layer = (() => {
  const L = part();
  wash(L, INK.teal, [150, 312, 200, 290, 262, 270, 340, 262, 420, 268, 490, 286, 552, 314], 0.4);
  L.strokes.push(
    curves(
      [
        [158, 306, 210, 286, 262, 272],
        [450, 274, 500, 290, 544, 310],
      ],
      "mid",
      0.5,
    ),
  );
  return L;
})();

/**
 * Where it hits the rock: a cloud of white spray, wider than it is tall, its
 * edge in uneven billows and the whole of it leaning the way the wave was going.
 */
const SX = 352;
const SY = 318;
function burst(): number[] {
  const out: number[] = [];
  for (let deg = 180; deg >= 0; deg -= 3) {
    const a = (deg * Math.PI) / 180;
    const billow = 8 * Math.sin(deg * 0.2 + 0.5) + 6 * Math.sin(deg * 0.46 + 2.1) + 3 * Math.sin(deg * 0.9 + 1);
    const r = 50 + 26 * Math.sin(a) + billow * Math.sin(a) ** 0.5;
    out.push(SX + 16 * Math.sin(a) + Math.cos(a) * r * 1.55, SY - Math.sin(a) * r);
  }
  return out;
}
const spray: Layer = (() => {
  const L = part();
  dab(L, INK.white, burst(), "mid", 0.9);
  L.strokes.push(
    // The billows inside it, in a few short arcs.
    blobs(
      [
        ellipse(318, 286, 17, 12, Math.PI * 1.05, Math.PI * 0.9),
        ellipse(366, 268, 20, 14, Math.PI * 1.1, Math.PI * 0.85),
        ellipse(404, 292, 15, 11, Math.PI * 1.15, Math.PI * 0.8),
        ellipse(346, 300, 12, 8, Math.PI * 1.1, Math.PI * 0.8),
      ],
      "far",
      0.4,
    ),
    // Drops thrown clear of it, most of them ahead of the wave.
    blobs(
      [
        ellipse(262, 262, 3, 2.8),
        ellipse(286, 232, 2.6, 2.4),
        ellipse(330, 214, 3.2, 3),
        ellipse(372, 204, 2.6, 2.4),
        ellipse(410, 212, 3.4, 3.2),
        ellipse(436, 196, 2.4, 2.2),
        ellipse(452, 232, 3, 2.8),
        ellipse(476, 258, 2.6, 2.4),
        ellipse(488, 284, 2.2, 2),
      ],
      "far",
      0.2,
    ),
  );
  return L;
})();

/** The wall: one long ridge of sandstone, its top worn flat and its face in layers. */
const TOP = [
  128, 312, 166, 304, 214, 310, 262, 302, 306, 308, 364, 304, 420, 312, 474, 308, 524, 316, 584, 312, 640, 320, 700, 316, 744, 322, 776, 326,
];
const wall: Layer = (() => {
  const L = part();
  put(L, INK.stone, [...TOP, 784, 344, 780, 366, 700, 370, 560, 374, 400, 378, 250, 382, 132, 386, 122, 350], "near", 0.8, 0.85);
  L.strokes.push(
    // The edge of the flat top, seen from below.
    curve([126, 326, 210, 322, 320, 322, 420, 326, 540, 330, 660, 334, 780, 338], "mid", 0.9),
    // Layers in the rock.
    curves(
      [
        [140, 350, 200, 348, 260, 352],
        [330, 356, 400, 354, 450, 358],
        [520, 350, 590, 348, 640, 352],
        [690, 352, 740, 350, 772, 354],
        [180, 368, 240, 366],
        [600, 362, 660, 360],
      ],
      "far",
      0.7,
    ),
    // Hollows worn by the sea.
    blobs([ellipse(470, 362, 9, 5), ellipse(560, 344, 6, 4), ellipse(706, 338, 7, 4), ellipse(166, 338, 6, 3.5)], "far", 0.4),
    // A crack, and the steps cut into the rock.
    lines(
      [
        [300, 324, 304, 348, 298, 378],
        [620, 332, 616, 370],
        [728, 336, 728, 346, 740, 346, 740, 356, 752, 356, 752, 366],
      ],
      "far",
      0.4,
    ),
  );
  return L;
})();

/** Foam running back off the top, in a few thin tongues down the face. */
const spill: Layer = (() => {
  const L = part();
  dab(L, INK.white, [252, 310, 300, 306, 360, 308, 420, 308, 462, 310, 468, 318, 446, 322, 440, 334, 430, 322, 378, 324, 370, 338, 360, 324, 302, 322, 294, 332, 284, 320, 256, 318], "mid", 0.4);
  return L;
})();

const beach: Layer = (() => {
  const L = part();
  wash(L, INK.sand, ellipse(590, GROUND - 2, 180, 11), 0.4);
  L.strokes.push(
    curve([120, GROUND + 4, 260, GROUND, 420, GROUND - 2, 580, GROUND, 720, GROUND + 2, 800, GROUND + 6], "mid", 0.8),
  );
  dab(L, INK.stone, ellipse(150, 392, 12, 6), "far", 0.6, 0.7);
  dab(L, INK.stone, ellipse(170, 396, 7, 4), "far", 0.4, 0.7);
  return L;
})();

/** The sunbed: a wooden frame, back raised, a towel along it, in the parasol's shade. */
const sunbed: Layer = (() => {
  const L = part();
  wash(L, INK.taupe, ellipse(600, GROUND - 4, 96, 8), 0.18);
  L.strokes.push(
    lines(
      [
        [580, 438, 578, GROUND - 2],
        [700, 438, 702, GROUND - 2],
        [560, 412, 566, GROUND - 2],
      ],
      "mid",
      0.3,
    ),
  );
  put(L, INK.wood, [576, 430, 712, 430, 712, 440, 576, 440], "mid", 0.3, 0.9);
  put(L, INK.wood, [576, 430, 540, 392, 548, 386, 584, 426], "mid", 0.3, 0.9);
  put(L, INK.teal, [586, 426, 704, 426, 706, 431, 584, 431], "far", 0.2, 0.9);
  put(L, INK.teal, [586, 426, 552, 390, 556, 386, 590, 422], "far", 0.2, 0.9);
  return L;
})();

/** The parasol: a pole leaning a little, and a shallow scalloped canopy in stripes. */
const parasol: Layer = (() => {
  const L = part();
  const ax = 566;
  const ay = 314;
  const PANELS = 8;
  L.strokes.push(line([ax + 2, ay, ax + 14, GROUND], "near", 0.3));
  const rim: [number, number][] = [];
  for (let i = 0; i <= PANELS; i++) {
    const t = i / PANELS;
    // The hem bows down toward the viewer in the middle.
    rim.push([ax - 84 + t * 168, ay + 34 - t * 4 + Math.sin(Math.PI * t) * 8]);
  }
  const dome = [ax - 84, ay + 34, ax - 52, ay + 12, ax - 22, ay + 2, ax, ay, ax + 22, ay + 1, ax + 52, ay + 9, ax + 84, ay + 30];
  const hem = rim
    .slice(1, -1)
    .reverse()
    .flat();
  put(L, INK.white, [...dome, ...hem], "mid", 0.4);
  // Every other panel in colour: a fan from the top down to the hem.
  for (let i = 0; i < PANELS; i += 2) {
    wash(L, INK.mustard, [ax, ay + 1, ...rim[i], ...rim[i + 1]], 0.85);
  }
  L.strokes.push(
    curves(
      rim.slice(1, -1).map(([x, y]) => [ax, ay + 1, ax + (x - ax) * 0.55, ay + (y - ay) * 0.5 - 2, x, y]),
      "far",
      0.2,
    ),
    curves(
      rim.slice(0, -1).map(([x0, y0], i) => {
        const [x1, y1] = rim[i + 1];
        return [x0, y0, (x0 + x1) / 2, (y0 + y1) / 2 + 5, x1, y1];
      }),
      "mid",
      0.2,
    ),
    line([ax, ay, ax - 1, ay - 9], "mid", 0.1),
  );
  return L;
})();

const BATROUN: Layer[] = [sea, boat, swell, spray, wall, spill, beach, sunbed, parasol];
export default BATROUN;
