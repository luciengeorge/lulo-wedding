/**
 * Draws the home page sketch of Le Refuge and writes it to public/art/venue.
 *
 *   pnpm tsx tools/venue-sketch/build.ts
 *
 * Three drawings, each in a wide and a narrow version: the teleski (left), the
 * chairlift (right), and the wedding party (centre). They are plain SVG files
 * that animate themselves, shown by src/components/wedding/venue-sketch.tsx.
 */
import { mkdirSync, writeFileSync } from "node:fs";

import { type Stroke, draw } from "./hand.ts";
import { type Layer, PARTY } from "./party.ts";
import {
  CH,
  CHAIR_DOWN,
  CHAIR_DOWN_BODY,
  CHAIR_UP,
  CHAIR_UP_BODY,
  EMPTY_TOW,
  LEFT,
  LEFT_FRONT,
  RIGHT,
  TK,
  VIEW,
} from "./slope.ts";

type Variant = "wide" | "narrow";
type Box = [x: number, y: number, w: number, h: number];

const OUT = new URL("../../public/art/venue/", import.meta.url);

/** Pencil, paper and colour washes. Stroke widths are in the drawing's own units. */
const BASE =
  "svg{color:rgb(62 47 38/.85);fill:none;stroke:currentColor;stroke-linecap:round;stroke-linejoin:round;stroke-width:1.3}" +
  ".far{stroke-width:.91}.near{stroke-width:1.625}" +
  ".body{fill:#f8efe3;fill-opacity:.94;stroke:none}.wash{stroke:none;fill-opacity:.88}" +
  // The page asks for a still drawing by loading the file as `#still`: a
  // browser does not reliably pass its reduced motion setting on to an image.
  ":target .ride,:target .mv{animation-play-state:paused!important}" +
  "@media (prefers-reduced-motion:reduce){.ride,.mv{animation-play-state:paused!important}}";

/** The party keeps time: weight from foot to foot, arms from the shoulder and elbow, skirts a moment late. */
const DANCE =
  "@keyframes groove{0%,100%{transform:translate(calc(var(--s)*-1),0) rotate(var(--r))}25%,75%{transform:translate(0,var(--d)) rotate(0deg)}50%{transform:translate(var(--s),0) rotate(calc(var(--r)*-1))}}" +
  "@keyframes step{0%,100%{transform:skewX(var(--a)) scaleY(1)}25%,75%{transform:skewX(0deg) scaleY(var(--k))}50%{transform:skewX(calc(var(--a)*-1)) scaleY(1)}}" +
  "@keyframes swing{from{transform:rotate(calc(var(--u)*-1))}to{transform:rotate(var(--u))}}" +
  "@keyframes clap{from{transform:rotate(0deg)}to{transform:rotate(var(--u))}}" +
  "@keyframes swish{from{transform:skewX(calc(var(--u)*-1))}to{transform:skewX(var(--u))}}" +
  "@keyframes thump{from{transform:scale(1)}to{transform:scale(1.18)}}" +
  "@keyframes twinkle{from{opacity:.4}to{opacity:1}}" +
  "@keyframes sound{0%{transform:scale(.45);opacity:0}18%{opacity:.85}100%{transform:scale(1.65);opacity:0}}";

/** Strokes of one weight in a row share a path. Every stroke is drawn, so the hand is the same in both versions. */
function paths(strokes: Stroke[], seed: number, variant: Variant) {
  const ds = draw(strokes, seed);
  let out = "";
  let cur = "";
  let buf = "";
  const flush = () => {
    if (buf) out += `<path class="${cur}" d="${buf}"/>`;
    buf = "";
  };
  strokes.forEach((st, i) => {
    if (st.wide && variant === "narrow") return;
    if (st.w !== cur) {
      flush();
      cur = st.w;
    }
    buf += ds[i];
  });
  flush();
  return out;
}

/**
 * A ride is scaled about its lift's vanishing point, which carries it along the
 * cable and shrinks it together. The stops trace 1 / (1 + k * time): a steady
 * climb seen in perspective, quick while near and slow far off.
 */
function rideFrames(name: string, top: number) {
  const k = 1 / top - 1;
  let css = `@keyframes ${name}{`;
  for (let i = 0; i <= 12; i++) {
    const p = i / 12;
    const opacity = i === 0 || i === 12 ? "opacity:0;" : "";
    css += `${+(p * 100).toFixed(2)}%{${opacity}transform:scale(${(1 / (1 + k * p)).toFixed(3)})}`;
  }
  return `${css}3%{opacity:1}95%{opacity:1}}`;
}

function rides(
  vp: [number, number],
  anim: string,
  dur: number,
  count: number,
  inner: string,
  reverse: boolean,
  phase: number,
) {
  let out = "";
  for (let i = 0; i < count; i++) {
    const delay = -(((i + phase) / count) * dur).toFixed(2);
    out += `<g class="ride" style="transform-origin:${vp[0]}px ${vp[1]}px;animation:${anim} ${dur}s linear ${delay}s infinite${reverse ? " reverse" : ""}">${inner}</g>`;
  }
  return out;
}

function chairlift(variant: Variant) {
  const chair = (body: string, strokes: Stroke[], seed: number, at: [number, number]) =>
    `<g transform="translate(${at[0] - 30} ${at[1]})"><path class="body" d="${body}"/>${paths(strokes, seed, variant)}</g>`;
  return (
    paths(RIGHT, 17, variant) +
    rides(CH.vp, "ride", 54, 6, chair(CHAIR_DOWN_BODY, CHAIR_DOWN, 7, CH.down), true, 0.5) +
    rides(CH.vp, "ride", 54, 6, chair(CHAIR_UP_BODY, CHAIR_UP, 5, CH.up), false, 0.2)
  );
}

function teleski(variant: Variant) {
  const tow = paths(EMPTY_TOW, 3, variant);
  return (
    paths(LEFT, 23, variant) +
    rides(TK.vp, "ride", 46, 5, tow, true, 0.4) +
    rides(TK.vp, "ride", 46, 5, `<g transform="translate(${TK.up[0] - TK.down[0]} 0)">${tow}</g>`, false, 0.62) +
    paths(LEFT_FRONT, 29, variant)
  );
}

function party(variant: Variant) {
  let seed = 41;
  const render = (layer: Layer): string => {
    if (layer.only && layer.only !== variant) return "";
    const washes = (layer.fills ?? [])
      .map(([c, d, o]) => `<path class="wash" fill="${c}"${o ? ` style="fill-opacity:${o}"` : ""} d="${d}"/>`)
      .join("");
    // The seed moves on for every layer, shown or not, so both versions are drawn by the same hand.
    seed += 3;
    const own =
      (layer.body ? `<path class="body" d="${layer.body}"/>` : "") + washes + paths(layer.strokes, seed, variant);
    const inner = own + (layer.kids ?? []).map(render).join("");
    const m = layer.motion;
    if (!m) return inner;
    const vars = Object.entries(m.vars ?? {})
      .map(([k, v]) => `;${k}:${v}`)
      .join("");
    return `<g class="mv" style="transform-origin:${m.o[0].toFixed(1)}px ${m.o[1].toFixed(1)}px;animation:${m.name} ${+m.dur.toFixed(3)}s ${m.ease ?? "ease-in-out"} ${+(m.delay ?? 0).toFixed(3)}s infinite${m.alt ? " alternate" : ""}${vars}">${inner}</g>`;
  };
  return PARTY.map(render).join("");
}

function write(name: string, box: Box, css: string, inner: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" id="still" viewBox="${box.join(" ")}" width="${box[2]}" height="${box[3]}"><style>${BASE}${css}</style>${inner}</svg>\n`;
  writeFileSync(new URL(name, OUT), svg);
  console.log(`${name}: ${(svg.length / 1024).toFixed(0)} KB`);
}

// The wide drawings reach past their own 640 units: the crest and the ground
// run on towards the middle of the page, where the page clips them, and the
// party carries the tables and the outer strings of lights.
const NARROW: Box = [0, 0, VIEW.w, VIEW.h];
mkdirSync(OUT, { recursive: true });
write("teleski.svg", [0, 0, 1500, VIEW.h], rideFrames("ride", TK.top), teleski("wide"));
write("teleski-narrow.svg", NARROW, rideFrames("ride", TK.top), teleski("narrow"));
write("chairlift.svg", [VIEW.w - 1500, 0, 1500, VIEW.h], rideFrames("ride", CH.top), chairlift("wide"));
write("chairlift-narrow.svg", NARROW, rideFrames("ride", CH.top), chairlift("narrow"));
write("party.svg", [-120, 0, 880, VIEW.h], DANCE, party("wide"));
write("party-narrow.svg", [-380, 0, 1400, VIEW.h], DANCE, party("narrow"));
