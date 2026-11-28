/**
 * The story as a function of how far through it the guest is, 0 to 1: where
 * the camera is, how far the dots have become the place, how late in the day
 * it is and which line of text is up. No drawing here, so it can be tested as
 * numbers.
 */
import { LIFTS, type Vec3 } from "./world";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** How far `p` is through the stretch from `a` to `b`. */
export const span = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
/**
 * `value` moved towards `goal` at `rate` a second, over a frame `dt` seconds
 * long. The rate may be infinite: there at once. A frame with no time in it
 * moves nothing, whatever the rate.
 */
export function towards(value: number, goal: number, rate: number, dt: number) {
  if (!(dt > 0)) return value;
  const gap = goal - value;
  return Math.abs(gap) <= rate * dt ? goal : value + Math.sign(gap) * rate * dt;
}

/** A phone held upright sees a narrow slice, so it gets a wider lens. */
export const fieldOfView = (aspect: number) => (aspect < 0.8 ? 54 : 36);

type Key = {
  at: number;
  target: Vec3;
  radius: number;
  /** Degrees above the target. */
  elevation: number;
  /** Degrees round it: 0 looks up the hill from below, 180 back down from above. */
  azimuth: number;
  /** How wide the subject is for its distance. A narrower screen backs off to keep it in. */
  fit: number;
};

const mid = (a: Vec3, b: Vec3, t: number, lift = 0): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t) + lift,
  lerp(a[2], b[2], t),
];

/** The flat sketch sits on this plane, seen square on from this far. */
export const FLAT = { target: [0, 10, 0] as Vec3, radius: 60 };
const DANCE_FLOOR: Vec3 = [0, 1.9, 0];

/*
 * The picture is raised to clear the captions (see `lift`), so a target shows
 * about a third of the way down the stage, with room for more below it than above.
 */
const KEYS: Key[] = [
  { at: 0, target: FLAT.target, radius: FLAT.radius, elevation: 0, azimuth: 0, fit: 0 },
  { at: 0.035, target: FLAT.target, radius: FLAT.radius, elevation: 0, azimuth: 0, fit: 0 },
  // The whole slope, from below, the party at its foot.
  { at: 0.21, target: [0, 18.5, -15], radius: 92, elevation: 1, azimuth: 0, fit: 0.8 },
  { at: 0.31, target: [0, 17.5, -15], radius: 82, elevation: 2, azimuth: -8, fit: 0.8 },
  // Up the line of the teleski from beside its bottom wheel, then across to ride beside the chairlift.
  { at: 0.43, target: mid(LIFTS[0].a, LIFTS[0].b, 0.45), radius: 46, elevation: -14, azimuth: -6, fit: 0.5 },
  { at: 0.55, target: mid(LIFTS[1].a, LIFTS[1].b, 0.44, 1), radius: 40, elevation: 9, azimuth: 36, fit: 0.65 },
  // Down to the dance floor as the light goes, and once round it.
  { at: 0.625, target: [3, 7, -8], radius: 46, elevation: 15, azimuth: 26, fit: 0.75 },
  { at: 0.7, target: DANCE_FLOOR, radius: 21, elevation: 8, azimuth: 12, fit: 0.85 },
  { at: 0.8, target: DANCE_FLOOR, radius: 17, elevation: 12, azimuth: 150, fit: 0.8 },
  { at: 0.9, target: DANCE_FLOOR, radius: 18, elevation: 14, azimuth: 300, fit: 0.8 },
  // Last, from low on the ground: the party, the slope behind it, the moon over the crest.
  { at: 1, target: [0, 15.5, -46], radius: 81, elevation: -8.5, azimuth: 360, fit: 1 },
];

/** Lines of text, and the stretch of the story each is up for. */
export const CAPTIONS = [
  { from: 0.2, to: 0.32 },
  { from: 0.38, to: 0.56 },
  { from: 0.72, to: 0.87 },
  { from: 0.93, to: 2 },
] as const;

export type Moment = {
  camera: { position: Vec3; target: Vec3; fov: number };
  /** 0: the hero's names are still up. 1: they have gone, and the story has the stage. */
  swap: number;
  /** 0: the flat sketch. 1: the place. */
  morph: number;
  /** 0: day. 1: night. */
  night: number;
  /** Which caption is up, or -1. */
  caption: number;
  /** How far the picture is raised to clear the captions, as a share of the stage's height. */
  lift: number;
};

/** How long the story runs when it plays itself. */
export const FILM_SECONDS = 40;

export function momentAt(p: number, aspect: number): Moment {
  let i = 0;
  while (i < KEYS.length - 2 && p > (KEYS[i + 1] as Key).at) i++;
  const a = KEYS[i] as Key;
  const b = KEYS[i + 1] as Key;
  const t = inOut(span(p, a.at, b.at));
  const fitted = (key: Key) => key.radius * Math.max(1, key.fit / aspect);
  const radius = lerp(fitted(a), fitted(b), t);
  const elevation = (lerp(a.elevation, b.elevation, t) * Math.PI) / 180;
  const azimuth = (lerp(a.azimuth, b.azimuth, t) * Math.PI) / 180;
  const target = mid(a.target, b.target, t);

  const morph = inOut(span(p, 0.035, 0.21));
  return {
    camera: {
      position: [
        target[0] + Math.cos(elevation) * Math.sin(azimuth) * radius,
        target[1] + Math.sin(elevation) * radius,
        target[2] + Math.cos(elevation) * Math.cos(azimuth) * radius,
      ],
      target,
      fov: fieldOfView(aspect),
    },
    swap: span(p, 0.004, 0.03),
    morph,
    night: inOut(span(p, 0.56, 0.72)),
    caption: CAPTIONS.findIndex((caption) => p >= caption.from && p < caption.to),
    // Less on a phone held upright: the picture is small there, and the captions sit on open ground.
    lift: (aspect < 0.8 ? 0.12 : 0.2) * morph,
  };
}

/** How many metres one CSS pixel covers on the flat sketch's plane. */
export function metresPerPixel(stageHeight: number, aspect: number) {
  return (2 * FLAT.radius * Math.tan((fieldOfView(aspect) * Math.PI) / 360)) / stageHeight;
}
