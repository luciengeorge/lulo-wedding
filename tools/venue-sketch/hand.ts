/**
 * The pencil. A drawing is written as plain geometry; each stroke is then
 * redrawn with a slight wobble, so it reads as drawn by hand. The hand is
 * seeded, so the same geometry always gives the same lines.
 */
export type Point = [number, number];
export type Weight = "far" | "mid" | "near";
export type Kind = "line" | "curve" | "blob";
export type Stroke = { kind: Kind; lines: Point[][]; w: Weight; amp?: number; wide?: boolean };
type Command = [string, ...number[]];

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function P(flat: number[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}
export const flat = (pts: Point[]) => pts.flat();

export const lines = (marks: number[][], w: Weight = "mid", amp?: number): Stroke => ({
  kind: "line",
  lines: marks.map(P),
  w,
  amp,
});
export const line = (mark: number[], w: Weight = "mid", amp?: number) => lines([mark], w, amp);
export const curves = (marks: number[][], w: Weight = "mid", amp?: number): Stroke => ({
  kind: "curve",
  lines: marks.map(P),
  w,
  amp,
});
export const curve = (mark: number[], w: Weight = "mid", amp?: number) => curves([mark], w, amp);
export const wide = (stroke: Stroke): Stroke => ({ ...stroke, wide: true });
export const blobs = (marks: number[][], w: Weight = "mid", amp?: number): Stroke => ({
  kind: "blob",
  lines: marks.map(P),
  w,
  amp,
});

export function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  from = -Math.PI / 2,
  sweep = Math.PI * 2 + 0.3,
) {
  const steps = Math.max(5, Math.round((Math.abs(sweep) / (Math.PI * 2)) * 12));
  const out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = from + (sweep * i) / steps;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
function numbers(values: number[]) {
  let out = "";
  for (const value of values) {
    const text = String(value).replace(/^(-?)0\./, "$1.");
    out += out && !text.startsWith("-") ? ` ${text}` : text;
  }
  return out;
}
function encode(commands: Command[]) {
  let d = "";
  let cx = 0;
  let cy = 0;
  for (const [command, ...points] of commands) {
    const abs = points.map(r1);
    if (command === "M") d += `M${numbers(abs)}`;
    else d += command.toLowerCase() + numbers(abs.map((value, i) => r1(value - (i % 2 ? cy : cx))));
    cx = abs[abs.length - 2];
    cy = abs[abs.length - 1];
  }
  return d;
}
function spline(pts: Point[], open: boolean): Command[] {
  const commands: Command[] = open ? [["M", ...pts[0]]] : [];
  if (pts.length === 2) return [...commands, ["L", ...pts[1]]];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    commands.push([
      "C",
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      ...p2,
    ]);
  }
  return commands;
}
function resample(pts: Point[], step: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const steps = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push(
        ([0, 1] as const).map(
          (a) =>
            0.5 *
            (2 * p1[a] +
              (p2[a] - p0[a]) * t +
              (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t +
              (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t * t * t),
        ) as Point,
      );
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function mark(kind: Kind, pts: Point[], amp: number, shape: () => number, frame: () => number): Command[] {
  const shiver = 0.32;
  const nudge = (scale: number) => (frame() - 0.5) * 2 * shiver * scale;
  if (kind === "curve") {
    const along = resample(pts, 16);
    const phases = [shape() * Math.PI * 2, shape() * Math.PI * 2];
    let travelled = 0;
    const drawn = along.map(([x, y], i): Point => {
      const before = along[Math.max(0, i - 1)];
      const after = along[Math.min(along.length - 1, i + 1)];
      if (i > 0) travelled += Math.hypot(x - before[0], y - before[1]);
      const len = Math.hypot(after[0] - before[0], after[1] - before[1]) || 1;
      const off =
        amp * (0.7 * Math.sin(phases[0] + travelled / 30) + 0.3 * Math.sin(phases[1] + travelled / 12)) + nudge(0.8);
      return [x - ((after[1] - before[1]) / len) * off, y + ((after[0] - before[0]) / len) * off];
    });
    return spline(drawn, true);
  }
  if (kind === "blob") {
    return spline(
      pts.map(([x, y]): Point => [
        x + (shape() - 0.5) * 2 * amp + nudge(0.5),
        y + (shape() - 0.5) * 2 * amp + nudge(0.5),
      ]),
      true,
    );
  }
  const corners = pts.map(([x, y]): Point => [
    x + (shape() - 0.5) * amp + nudge(0.6),
    y + (shape() - 0.5) * amp + nudge(0.6),
  ]);
  const commands: Command[] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const steps = Math.max(1, Math.round(len / 26));
    const bow = (shape() - 0.5) * 2 * amp * Math.min(1, len / 40);
    const run: Point[] = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const edge = Math.sin(Math.PI * t);
      const off = edge * bow + nudge(edge);
      run.push([ax + (bx - ax) * t - ((by - ay) / len) * off, ay + (by - ay) * t + ((bx - ax) / len) * off]);
    }
    commands.push(...spline(run, i === 0));
  }
  return commands;
}
const DEFAULT_AMP = { line: 0.35, curve: 0.5, blob: 0.2 };

/** Frame one only: one path string per stroke. */
export function draw(strokes: Stroke[], seed: number) {
  const frame = rng(seed * 7919 + 1);
  return strokes.map((stroke, i) => {
    const shape = rng(seed + i * 131);
    return stroke.lines
      .map((pts) => encode(mark(stroke.kind, pts, stroke.amp ?? DEFAULT_AMP[stroke.kind], shape, frame)))
      .join("");
  });
}
