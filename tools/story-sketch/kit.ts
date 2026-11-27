/**
 * What every drawing in the story is made with: the same pencil as the hero's
 * sketch (tools/venue-sketch/hand.ts), the same washes of colour under it, and
 * one size of paper.
 */
import { type Stroke, type Weight, blobs, draw, line } from "../venue-sketch/hand.ts";

export { blobs, curve, curves, ellipse, line, lines } from "../venue-sketch/hand.ts";
export type { Stroke, Weight } from "../venue-sketch/hand.ts";

/** The paper every drawing is made on, in its own units. The film fits this box to the screen. */
export const PAPER = { w: 900, h: 600 };
/** Where the ground sits on it, for a drawing that stands on some. */
export const GROUND = 468;

export const INK = {
  bark: "#3e2f26",
  red: "#9b0d17",
  rose: "#d98c93",
  white: "#fffdf8",
  slate: "#55606b",
  navy: "#2f3a4f",
  taupe: "#6b5445",
  olive: "#4f5a38",
  teal: "#6f9aa3",
  sea: "#8fb4bd",
  mustard: "#e3bd5b",
  foliage: "#809b47",
  mauve: "#a86a92",
  amber: "#d89353",
  sand: "#e2c292",
  stone: "#d9c7a8",
  wood: "#c49b67",
  glow: "#f3b83f",
  sky: "#c9d8dc",
} as const;

/** A wash of colour under the pencil: colour, path, and its own opacity when it needs one. */
export type Fill = [string, string] | [string, string, number];
/**
 * One thing in a drawing. `body` is the paper it covers, which hides whatever
 * was drawn behind it; `fills` are its washes; `strokes` its pencil lines.
 */
export type Layer = { body: string; fills: Fill[]; strokes: Stroke[] };

const d1 = (n: number) => n.toFixed(1);
/** A closed shape through these points, as a path. */
export const shape = (pts: number[]) => {
  let d = "";
  for (let i = 0; i < pts.length; i += 2) d += `${i ? "L" : "M"}${d1(pts[i])} ${d1(pts[i + 1])}`;
  return `${d}Z`;
};

export const part = (): Layer => ({ body: "", fills: [], strokes: [] });
/** A filled shape with its outline. */
export const put = (L: Layer, colour: string, pts: number[], w: Weight = "mid", amp = 0.3, opacity?: number) => {
  const d = shape(pts);
  L.body += d;
  L.fills.push(opacity === undefined ? [colour, d] : [colour, d, opacity]);
  L.strokes.push(line([...pts, pts[0], pts[1]], w, amp));
};
/** A filled shape with a soft outline, for something round. */
export const dab = (L: Layer, colour: string, pts: number[], w: Weight = "far", amp = 0.2, opacity?: number) => {
  const d = shape(pts);
  L.body += d;
  L.fills.push(opacity === undefined ? [colour, d] : [colour, d, opacity]);
  L.strokes.push(blobs([pts], w, amp));
};
/** Colour with no outline and nothing hidden behind it: water, sky, a shadow. */
export const wash = (L: Layer, colour: string, pts: number[], opacity = 0.5) => {
  L.fills.push([colour, shape(pts), opacity]);
};

/** Pencil, paper and washes, as in the hero's sketch. Stroke widths are in the drawing's own units. */
const STYLE =
  "svg{color:rgb(62 47 38/.85);fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.5}" +
  ".far{stroke-width:1.05}.near{stroke-width:1.9}" +
  ".body{fill:#f8efe3;fill-opacity:.94;stroke:none}.wash{stroke:none;fill-opacity:.88}";

function strokes(all: Stroke[], seed: number) {
  const ds = draw(all, seed);
  let out = "";
  let weight = "";
  let buffer = "";
  const flush = () => {
    if (buffer) out += `<path class="${weight}" d="${buffer}"/>`;
    buffer = "";
  };
  all.forEach((stroke, i) => {
    if (stroke.w !== weight) {
      flush();
      weight = stroke.w;
    }
    buffer += ds[i];
  });
  flush();
  return out;
}

/** The drawing as one SVG file's text. Layers are drawn in order, the last on top. */
export function render(layers: Layer[], seed: number) {
  let inner = "";
  layers.forEach((layer, i) => {
    const washes = layer.fills
      .map(([c, d, o]) => `<path class="wash" fill="${c}"${o === undefined ? "" : ` style="fill-opacity:${o}"`} d="${d}"/>`)
      .join("");
    inner += (layer.body ? `<path class="body" d="${layer.body}"/>` : "") + washes + strokes(layer.strokes, seed + i * 17);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAPER.w} ${PAPER.h}" width="${PAPER.w}" height="${PAPER.h}"><style>${STYLE}</style>${inner}</svg>\n`;
}
