/**
 * Le Refuge as a cloud of points: the slope, the teleski up its left, the
 * chairlift up its right, and the wedding party at the foot of it. The same
 * place as the pencil sketch behind the hero (tools/venue-sketch), in three
 * dimensions, so the camera can fly through it.
 *
 * Units are metres. The party sits at the origin, the slope rises towards -z,
 * and y is up. Everything is drawn from one seeded generator, so the same count
 * always gives the same cloud.
 */

export type Vec3 = [number, number, number];
type RGB = [number, number, number];

/** Which part of the flat sketch a point starts from. */
export const GROUP = { left: 0, right: 1, party: 2, sky: 3 } as const;
/** How a point moves once it is in place. See the vertex shader. */
export const MODE = { still: 0, rider: 1, dancer: 2, couple: 3 } as const;
export const FX = { none: 0, star: 1, bulb: 2, flame: 3 } as const;

export type Lift = { a: Vec3; b: Vec3; gauge: number; speed: number };

export type World = {
  count: number;
  /** Where a point rests. For a lift's chairs and tows, an offset from its grip on the cable. */
  position: Float32Array;
  /** Colour and opacity by day and by night, 0 to 255. */
  day: Uint8Array;
  night: Uint8Array;
  /** size, fx, a random number, mode */
  look: Float32Array;
  /** Rider: lift, place on the loop. Dancer: pivot x, pivot z, phase, how much of an arm it is. */
  move: Float32Array;
  group: Uint8Array;
  /** Orders the points of a group, to pair them with the sketch. */
  key: Float32Array;
  lifts: [Lift, Lift];
};

// The sketch's own colours (tools/venue-sketch/party.ts).
const BARK: RGB = [62, 47, 38];
const CREAM: RGB = [246, 236, 220];
const RED: RGB = [155, 13, 23];
const ROSE: RGB = [217, 140, 147];
const WHITE: RGB = [255, 253, 248];
const BLACK: RGB = [44, 38, 34];
const SLATE: RGB = [85, 96, 107];
const NAVY: RGB = [47, 58, 79];
const TAUPE: RGB = [107, 84, 69];
const OLIVE: RGB = [79, 90, 56];
const TEAL: RGB = [111, 154, 163];
const MUSTARD: RGB = [227, 189, 91];
const FOLIAGE: RGB = [128, 155, 71];
const MAUVE: RGB = [168, 106, 146];
const AMBER: RGB = [216, 147, 83];
const WOOD: RGB = [196, 155, 103];
const BULB: RGB = [251, 224, 138];
const GLOW: RGB = [243, 184, 63];
const SKIN: RGB[] = [
  [240, 210, 180],
  [226, 180, 141],
  [207, 154, 112],
  [176, 122, 82],
];
const HAIR: RGB[] = [
  [44, 33, 27],
  [75, 50, 35],
  [123, 77, 44],
  [199, 154, 86],
  [154, 149, 144],
];
const DRESSES = [ROSE, TEAL, MUSTARD, FOLIAGE, MAUVE, AMBER];
const SUITS = [BLACK, SLATE, NAVY, TAUPE, OLIVE];

type Mat = { day: RGB; dayA: number; night: RGB; nightA: number; size: number; fx: number };

const lighten = (c: RGB, t: number): RGB => [c[0] + (255 - c[0]) * t, c[1] + (248 - c[1]) * t, c[2] + (236 - c[2]) * t];
const darken = (c: RGB, t: number): RGB => [c[0] * (1 - t), c[1] * (1 - t), c[2] * (1 - t)];

/** Pencil: bark on paper by day, cream on the night sky. */
const pencil = (dayA: number, nightA = dayA * 0.75, size = 1): Mat => ({
  day: BARK,
  dayA,
  night: CREAM,
  nightA,
  size,
  fx: FX.none,
});
/** A colour from the sketch. Pale ones are deepened by day so they hold on paper, and all lift a little at night. */
const paint = (c: RGB, a = 0.9, size = 1): Mat => {
  const pale = (c[0] + c[1] + c[2]) / 3 > 190;
  return { day: pale ? darken(c, 0.22) : c, dayA: a, night: lighten(c, 0.3), nightA: a, size, fx: FX.none };
};

/** A person's dots are a little bigger than a line's, so that up close a guest reads as a body and not a haze. */
const FIGURE = 1.22;

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the slope ----------

/** Flat ground runs this far back from the party before the slope starts. */
const TERRACE = 9;
const RUN = 80;
const RISE = 31;

/** Height of the ground. Steepens as it climbs, then rolls over into the crest; lower at the shoulders, and never quite even. */
export function ground(x: number, z: number): number {
  const s = -z - TERRACE;
  if (s <= 0) return 0;
  const steep = (1.55 * RISE) / RUN;
  const climb = s <= RUN ? RISE * (s / RUN) ** 1.55 : RISE + steep * 10 * (1 - Math.exp(-(s - RUN) / 10));
  const dome = 1 - 0.42 * smooth(16, 90, Math.abs(x - 4));
  const rolls =
    smooth(0, 30, s) *
    (2.4 * Math.sin(x * 0.055 + 1.3 + s * 0.012) +
      1.4 * Math.sin(x * 0.12 + z * 0.07) +
      0.7 * Math.sin(x * 0.27 - z * 0.11));
  return climb * dome + rolls;
}

const FLOOR_Y = 0.22;
/** The dance floor, in x and z. */
const FLOOR = { x: 5.2, back: -3.4, front: 3.2 };

const LIFT_SPECS = [
  { base: [-23, -5], top: [-15, -88], cable: 4.4, gauge: 1.05, carriers: 12, speed: 0.011 },
  { base: [23.5, -4], top: [17, -90], cable: 6.2, gauge: 1.5, carriers: 11, speed: 0.009 },
] as const;

function liftLine(spec: (typeof LIFT_SPECS)[number]): Lift {
  const [ax, az] = spec.base;
  const [bx, bz] = spec.top;
  return {
    a: [ax, ground(ax, az) + spec.cable, az],
    b: [bx, ground(bx, bz) + spec.cable, bz],
    gauge: spec.gauge,
    speed: spec.speed,
  };
}

/** The two cable lines, bottom wheel to top wheel. The camera aims by them. */
export const LIFTS: [Lift, Lift] = [liftLine(LIFT_SPECS[0]), liftLine(LIFT_SPECS[1])];

/** Where the moon hangs, and how big. */
export const MOON = { at: [40, 80, -230] as Vec3, radius: 10 };

export function buildWorld(count: number, seed = 17_072_027): World {
  const rnd = mulberry32(seed);
  const world: World = {
    count,
    position: new Float32Array(count * 3),
    day: new Uint8Array(count * 4),
    night: new Uint8Array(count * 4),
    look: new Float32Array(count * 4),
    move: new Float32Array(count * 4),
    group: new Uint8Array(count),
    key: new Float32Array(count),
    lifts: LIFTS,
  };
  let used = 0;
  const share = (fraction: number) => Math.round(count * fraction);

  /** One point. Dropped without a word once the cloud is full: the order below is by importance. */
  function put(
    x: number,
    y: number,
    z: number,
    mat: Mat,
    group: number,
    key: number,
    mode: number = MODE.still,
    m0 = 0,
    m1 = 0,
    m2 = 0,
    m3 = 0,
  ) {
    if (used >= count) return;
    const i = used++;
    world.position.set([x, y, z], i * 3);
    world.day.set([mat.day[0], mat.day[1], mat.day[2], mat.dayA * 255], i * 4);
    world.night.set([mat.night[0], mat.night[1], mat.night[2], mat.nightA * 255], i * 4);
    world.look.set([mat.size, mat.fx, rnd(), mode], i * 4);
    world.move.set([m0, m1, m2, m3], i * 4);
    world.group[i] = group;
    world.key[i] = key;
  }

  /** Still things at the party are ordered left to right; on the slope, by height. */
  const still = (x: number, y: number, z: number, mat: Mat, group: number) =>
    put(x, y, z, mat, group, group === GROUP.party ? x : y);

  const side = (x: number) => (x < 0 ? GROUP.left : GROUP.right);

  function line(a: Vec3, b: Vec3, n: number, mat: Mat, group: number, jitter = 0.015) {
    for (let i = 0; i < n; i++) {
      const t = rnd();
      still(
        lerp(a[0], b[0], t) + (rnd() - 0.5) * jitter,
        lerp(a[1], b[1], t) + (rnd() - 0.5) * jitter,
        lerp(a[2], b[2], t) + (rnd() - 0.5) * jitter,
        mat,
        group,
      );
    }
  }

  /** Points on the skin of a tube from a to b. */
  function tubePoint(a: Vec3, b: Vec3, ra: number, rb: number, t = rnd()): Vec3 {
    const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(d[0], d[1], d[2]) || 1;
    const w: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
    // Any vector not along the tube gives a first side; the cross product the second.
    const ref: Vec3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u: Vec3 = [w[1] * ref[2] - w[2] * ref[1], w[2] * ref[0] - w[0] * ref[2], w[0] * ref[1] - w[1] * ref[0]];
    const ul = Math.hypot(u[0], u[1], u[2]);
    u[0] /= ul;
    u[1] /= ul;
    u[2] /= ul;
    const v: Vec3 = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    const r = lerp(ra, rb, t);
    const ang = rnd() * TAU;
    const c = Math.cos(ang) * r;
    const s = Math.sin(ang) * r;
    return [
      a[0] + d[0] * t + u[0] * c + v[0] * s,
      a[1] + d[1] * t + u[1] * c + v[1] * s,
      a[2] + d[2] * t + u[2] * c + v[2] * s,
    ];
  }

  function tube(a: Vec3, b: Vec3, ra: number, rb: number, n: number, mat: Mat, group: number) {
    for (let i = 0; i < n; i++) {
      const p = tubePoint(a, b, ra, rb);
      still(p[0], p[1], p[2], mat, group);
    }
  }

  /** A flat ring or disc, lying level. */
  function round(c: Vec3, r: number, n: number, mat: Mat, group: number, filled = false) {
    for (let i = 0; i < n; i++) {
      const ang = rnd() * TAU;
      const q = filled ? Math.sqrt(rnd()) * r : r + (rnd() - 0.5) * 0.02;
      still(c[0] + Math.cos(ang) * q, c[1], c[2] + Math.sin(ang) * q, mat, group);
    }
  }

  /** The twelve edges of a box, and a scatter over its faces. */
  function box(
    c: Vec3,
    w: number,
    h: number,
    d: number,
    edges: number,
    faces: number,
    mat: Mat,
    fill: Mat,
    group: number,
  ) {
    const x0 = c[0] - w / 2;
    const y0 = c[1] - h / 2;
    const z0 = c[2] - d / 2;
    for (let i = 0; i < edges; i++) {
      const axis = Math.floor(rnd() * 3);
      const t = rnd();
      const p = rnd() < 0.5 ? 0 : 1;
      const q = rnd() < 0.5 ? 0 : 1;
      if (axis === 0) still(x0 + w * t, y0 + h * p, z0 + d * q, mat, group);
      else if (axis === 1) still(x0 + w * p, y0 + h * t, z0 + d * q, mat, group);
      else still(x0 + w * p, y0 + h * q, z0 + d * t, mat, group);
    }
    for (let i = 0; i < faces; i++) {
      const axis = Math.floor(rnd() * 3);
      const s = rnd();
      const t = rnd();
      const p = rnd() < 0.5 ? 0 : 1;
      if (axis === 0) still(x0 + w * p, y0 + h * s, z0 + d * t, fill, group);
      else if (axis === 1) still(x0 + w * s, y0 + h * p, z0 + d * t, fill, group);
      else still(x0 + w * s, y0 + h * t, z0 + d * p, fill, group);
    }
  }

  // ---------- people ----------

  /** Upper arm and forearm, each as degrees up from hanging (180 is straight up), and how far forward they reach. */
  type Arm = [upper: number, fore: number, forward: number];
  type Person = {
    x: number;
    z: number;
    /** Which way they face: 0 is down the hill, towards the first camera. */
    yaw: number;
    height: number;
    top: RGB;
    bottom: RGB;
    skin: RGB;
    hair: RGB;
    arms: [Arm, Arm];
    n: number;
    dress?: boolean;
    gown?: boolean;
    longHair?: boolean;
    /** Height of the chair seat, for a guest at a table. */
    seat?: number;
    y?: number;
    mode?: number;
    phase?: number;
    pivot?: [number, number];
  };

  function person(p: Person) {
    const H = p.height;
    const y0 = p.y ?? 0;
    const mode = p.mode ?? MODE.still;
    const phase = p.phase ?? 0;
    const [pivotX, pivotZ] = p.pivot ?? [p.x, p.z];
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    /** A point given in the person's own frame: x to their side, y up from their feet, z in front. */
    const place = (lx: number, ly: number, lz: number, mat: Mat, arm = 0) => {
      const x = p.x + fz * lx + fx * lz;
      const z = p.z - fx * lx + fz * lz;
      put(x, y0 + ly, z, mat, GROUP.party, x, mode, pivotX, pivotZ, phase, arm);
    };
    const limb = (a: Vec3, b: Vec3, ra: number, rb: number, n: number, mat: Mat, w0 = 0, w1 = 0) => {
      for (let i = 0; i < n; i++) {
        const t = rnd();
        const q = tubePoint(a, b, ra, rb, t);
        place(q[0], q[1], q[2], mat, lerp(w0, w1, t));
      }
    };

    const skin = paint(p.skin, 0.9, FIGURE);
    const hair = paint(p.hair, 0.9, FIGURE);
    const top = paint(p.top, 0.9, FIGURE);
    const bottom = paint(p.bottom, 0.9, FIGURE);
    const shoe = paint(BLACK, 0.9, FIGURE);

    const hipY = p.seat ?? 0.53 * H;
    const shoulderY = hipY + 0.285 * H;
    const headY = shoulderY + 0.115 * H;
    const headR = 0.078 * H;
    const shoulder = (p.dress || p.gown ? 0.1 : 0.118) * H;

    // Head: face to the front, hair over the top and back.
    for (let i = 0; i < p.n * 0.13; i++) {
      const u = rnd() * 2 - 1;
      const ang = rnd() * TAU;
      const q = Math.sqrt(1 - u * u);
      const nx = Math.cos(ang) * q;
      const nz = Math.sin(ang) * q;
      place(nx * headR * 0.9, headY + u * headR, nz * headR * 0.95, u > 0.35 || nz < -0.25 ? hair : skin);
    }
    if (p.longHair) {
      for (let i = 0; i < p.n * 0.05; i++) {
        const t = rnd();
        place((rnd() - 0.5) * headR * 1.7, headY - t * 0.2 * H, -headR * (0.75 + 0.3 * t), hair);
      }
    }
    limb([0, shoulderY, 0], [0, headY - headR * 0.8, 0], 0.03 * H, 0.03 * H, p.n * 0.015, skin);

    // Torso: a little narrower at the waist in a dress.
    for (let i = 0; i < p.n * 0.25; i++) {
      const t = rnd();
      const ang = rnd() * TAU;
      const waist = p.dress || p.gown ? 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.6)) : 0;
      const rx = lerp(0.092, shoulder / H + 0.012, t) - waist;
      place(Math.cos(ang) * rx * H, lerp(hipY, shoulderY, t), Math.sin(ang) * 0.06 * H, top);
    }

    // Arms. Sleeves on a suit, bare on a dress.
    const sleeve = p.dress || p.gown ? skin : top;
    p.arms.forEach(([upper, fore, forward], index) => {
      const s = index === 0 ? -1 : 1;
      const dir = (deg: number, reach: number): Vec3 => {
        const a = (deg * Math.PI) / 180;
        const d: Vec3 = [s * Math.sin(a) * (1 - reach * 0.5), -Math.cos(a), reach];
        const l = Math.hypot(d[0], d[1], d[2]);
        return [d[0] / l, d[1] / l, d[2] / l];
      };
      const from: Vec3 = [s * shoulder, shoulderY - 0.01 * H, 0];
      const u = dir(upper, forward * 0.7);
      const elbow: Vec3 = [from[0] + u[0] * 0.165 * H, from[1] + u[1] * 0.165 * H, from[2] + u[2] * 0.165 * H];
      const v = dir(fore, forward);
      const hand: Vec3 = [elbow[0] + v[0] * 0.16 * H, elbow[1] + v[1] * 0.16 * H, elbow[2] + v[2] * 0.16 * H];
      limb(from, elbow, 0.04 * H, 0.034 * H, p.n * 0.05, sleeve, 0, 0.45);
      limb(elbow, hand, 0.032 * H, 0.026 * H, p.n * 0.045, sleeve, 0.45, 1);
      for (let i = 0; i < p.n * 0.012; i++) {
        place(
          hand[0] + (rnd() - 0.5) * 0.05 * H,
          hand[1] + (rnd() - 0.5) * 0.06 * H,
          hand[2] + (rnd() - 0.5) * 0.05 * H,
          skin,
          1,
        );
      }
    });

    // Below the waist.
    const legs = p.n * 0.3;
    if (p.seat !== undefined) {
      for (const s of [-1, 1]) {
        const hip: Vec3 = [s * 0.055 * H, hipY, 0];
        const knee: Vec3 = [s * 0.06 * H, hipY, 0.25 * H];
        limb(hip, knee, 0.055 * H, 0.045 * H, legs * 0.3, bottom);
        limb(knee, [s * 0.06 * H, 0.03, 0.27 * H], 0.04 * H, 0.03 * H, legs * 0.2, p.dress ? skin : bottom);
      }
    } else if (p.gown) {
      // A bell to the floor, and a veil down the back.
      for (let i = 0; i < legs * 1.5; i++) {
        const t = rnd();
        const ang = rnd() * TAU;
        const r = (0.08 + 0.27 * t ** 1.4) * H;
        place(Math.cos(ang) * r, lerp(0.6 * H, 0.012 * H, t), Math.sin(ang) * r - 0.05 * H * t, bottom);
      }
      const veil: Mat = { ...paint(WHITE, 0.5), size: 0.9 };
      for (let i = 0; i < p.n * 0.1; i++) {
        const t = rnd();
        place((rnd() - 0.5) * (0.16 + 0.2 * t) * H, headY + headR * 0.6 - t * 0.5 * H, -(0.07 + 0.16 * t) * H, veil);
      }
    } else if (p.dress) {
      for (let i = 0; i < legs * 0.75; i++) {
        const t = rnd();
        const ang = rnd() * TAU;
        const r = lerp(0.08, 0.165, t ** 0.8) * H;
        place(Math.cos(ang) * r, lerp(0.6 * H, 0.3 * H, t), Math.sin(ang) * r, bottom);
      }
      for (const s of [-1, 1]) {
        limb([s * 0.045 * H, 0.3 * H, 0], [s * 0.05 * H, 0.03, 0], 0.03 * H, 0.022 * H, legs * 0.11, skin);
        for (let i = 0; i < legs * 0.03; i++) place(s * 0.05 * H + (rnd() - 0.5) * 0.04, 0.02, rnd() * 0.12, shoe);
      }
    } else {
      for (const s of [-1, 1]) {
        limb([s * 0.055 * H, hipY, 0], [s * 0.075 * H, 0.04, 0.01], 0.052 * H, 0.034 * H, legs * 0.45, bottom);
        for (let i = 0; i < legs * 0.05; i++)
          place(s * 0.075 * H + (rnd() - 0.5) * 0.05, 0.025, rnd() * 0.16 - 0.03, shoe);
      }
    }
  }

  const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)] as T;
  const UP: Arm = [158, 172, 0.05];
  const HIGH: Arm = [128, 168, 0.1];
  const BENT: Arm = [78, 150, 0.15];
  const DOWN: Arm = [14, 10, 0.05];
  const CLAP: Arm = [34, 96, 0.9];
  const REACH: Arm = [62, 84, 1];
  const DANCE_ARMS: [Arm, Arm][] = [
    [UP, UP],
    [UP, BENT],
    [HIGH, DOWN],
    [BENT, UP],
    [CLAP, CLAP],
    [HIGH, HIGH],
    [DOWN, UP],
    [BENT, BENT],
  ];

  function guest(x: number, z: number, yaw: number, n: number, extra: Partial<Person> = {}) {
    const dress = rnd() < 0.5;
    const colour = dress ? pick(DRESSES) : pick(SUITS);
    person({
      x,
      z,
      yaw,
      height: dress ? lerp(1.58, 1.72, rnd()) : lerp(1.72, 1.88, rnd()),
      top: colour,
      bottom: colour,
      skin: pick(SKIN),
      hair: pick(HAIR),
      arms: pick(DANCE_ARMS),
      n,
      dress,
      longHair: dress && rnd() < 0.7,
      ...extra,
    });
  }

  // ---------- the party ----------

  // The couple, turning slowly in the middle of the floor.
  const centre: [number, number] = [0, 0.2];
  person({
    x: -0.27,
    z: 0.2,
    yaw: Math.PI / 2,
    height: 1.68,
    top: WHITE,
    bottom: WHITE,
    skin: SKIN[1] as RGB,
    hair: HAIR[1] as RGB,
    arms: [REACH, BENT],
    n: share(0.024),
    gown: true,
    y: FLOOR_Y,
    mode: MODE.couple,
    pivot: centre,
  });
  person({
    x: 0.27,
    z: 0.2,
    yaw: -Math.PI / 2,
    height: 1.84,
    top: BLACK,
    bottom: BLACK,
    skin: SKIN[1] as RGB,
    hair: HAIR[0] as RGB,
    arms: [BENT, REACH],
    n: share(0.018),
    y: FLOOR_Y,
    mode: MODE.couple,
    phase: 1.6,
    pivot: centre,
  });

  // Guests in a ring round them, facing in.
  const RING = 11;
  for (let i = 0; i < RING; i++) {
    const ang = (i / RING) * TAU + 0.28;
    const r = 2.55 + (rnd() - 0.5) * 0.35;
    const x = centre[0] + Math.sin(ang) * r * 1.25;
    const z = centre[1] + Math.cos(ang) * r * 0.86;
    guest(x, z, Math.atan2(centre[0] - x, centre[1] - z), share(0.0125), {
      y: FLOOR_Y,
      mode: MODE.dancer,
      phase: rnd() * TAU,
    });
  }
  // And a few more towards the corners of the floor.
  for (const [x, z] of [
    [-4.3, 2.2],
    [-4.1, -1.4],
    [4.2, 2.3],
    [4.4, -1.2],
    [-2.2, 2.75],
    [2.5, 2.7],
  ] as const) {
    guest(x, z, Math.atan2(centre[0] - x, centre[1] - z) + (rnd() - 0.5), share(0.011), {
      y: FLOOR_Y,
      mode: MODE.dancer,
      phase: rnd() * TAU,
    });
  }

  // The dance floor: boards running across, a firm edge, a short skirt down to the ground.
  const board: Mat = { ...paint(WOOD, 0.8, 1.15), nightA: 0.42 };
  const floorN = share(0.07);
  for (let i = 0; i < floorN; i++) {
    const z = FLOOR.back + (Math.floor(rnd() * 30) / 30) * (FLOOR.front - FLOOR.back) + (rnd() - 0.5) * 0.02;
    still((rnd() * 2 - 1) * FLOOR.x, FLOOR_Y, z, board, GROUP.party);
  }
  const edge = pencil(0.85);
  const floorDepth = FLOOR.front - FLOOR.back;
  box(
    [0, FLOOR_Y / 2, (FLOOR.front + FLOOR.back) / 2],
    FLOOR.x * 2,
    FLOOR_Y,
    floorDepth,
    share(0.014),
    0,
    edge,
    edge,
    GROUP.party,
  );

  // The DJ: a grey desk, a red front with a white heart, a speaker on a stand either side.
  const deskZ = -2.75;
  box(
    [0, FLOOR_Y + 0.47, deskZ],
    3.3,
    0.94,
    0.8,
    share(0.004),
    share(0.014),
    edge,
    paint([154, 149, 144], 0.8),
    GROUP.party,
  );
  const fasciaZ = deskZ + 0.42;
  const heart = (hx: number, hy: number) => {
    // The usual heart curve, as wide as it is tall.
    const x = hx / 0.27;
    const y = hy / 0.27 + 0.25;
    return (x * x + y * y - 1) ** 3 - x * x * y * y * y < 0;
  };
  for (let i = 0; i < share(0.012); i++) {
    const x = (rnd() * 2 - 1) * 1.15;
    const y = rnd() * 0.66;
    still(x, FLOOR_Y + 0.94 + y, fasciaZ, heart(x, y - 0.33) ? paint(WHITE, 1, 1.1) : paint(RED, 0.95), GROUP.party);
  }
  for (const s of [-1, 1]) {
    const sx = s * 2.45;
    tube([sx, FLOOR_Y, deskZ - 0.1], [sx, FLOOR_Y + 1.25, deskZ - 0.1], 0.04, 0.04, share(0.0006), edge, GROUP.party);
    box(
      [sx, FLOOR_Y + 1.95, deskZ - 0.1],
      0.72,
      1.4,
      0.6,
      share(0.0025),
      share(0.006),
      edge,
      paint(TAUPE, 0.7),
      GROUP.party,
    );
    for (const [cy, r] of [
      [FLOOR_Y + 1.7, 0.24],
      [FLOOR_Y + 2.32, 0.13],
    ] as const) {
      for (let i = 0; i < share(0.0009); i++) {
        const ang = rnd() * TAU;
        const q = rnd() < 0.6 ? r : r * 0.45;
        still(sx + Math.cos(ang) * q, cy + Math.sin(ang) * q, deskZ + 0.21, pencil(0.9), GROUP.party);
      }
    }
  }
  person({
    x: 0,
    z: deskZ - 0.55,
    yaw: 0,
    height: 1.8,
    top: SLATE,
    bottom: BLACK,
    skin: SKIN[2] as RGB,
    hair: HAIR[0] as RGB,
    arms: [UP, [40, 80, 0.9]],
    n: share(0.012),
    y: FLOOR_Y,
    mode: MODE.dancer,
    phase: 0.4,
  });

  // Dinner tables either side: a cloth to the ground, flowers, a candle, chairs and guests.
  const cloth: Mat = { ...paint(WHITE, 0.55), size: 0.95 };
  for (const sx of [-1, 1]) {
    for (const [tx, tz] of [
      [8.4, -1.7],
      [12.4, -1.5],
      [8.5, 2.0],
      [12.5, 2.2],
    ] as const) {
      const x = sx * tx;
      const z = tz;
      const R = 0.86;
      round([x, 0.76, z], R, share(0.0011), pencil(0.8), GROUP.party);
      round([x, 0.76, z], R, share(0.0016), cloth, GROUP.party, true);
      // The cloth hangs in soft folds.
      for (let i = 0; i < share(0.0026); i++) {
        const ang = rnd() * TAU;
        const t = rnd();
        const r = R + 0.03 * Math.sin(ang * 9) * t + 0.05 * t;
        still(
          x + Math.cos(ang) * r,
          lerp(0.76, 0.06, t),
          z + Math.sin(ang) * r,
          t > 0.96 ? pencil(0.7) : cloth,
          GROUP.party,
        );
      }
      for (let i = 0; i < share(0.0006); i++) {
        const u = rnd() * 2 - 1;
        const ang = rnd() * TAU;
        const q = Math.sqrt(1 - u * u) * 0.14;
        still(
          x + Math.cos(ang) * q,
          0.94 + u * 0.1,
          z + Math.sin(ang) * q,
          paint(rnd() < 0.75 ? RED : FOLIAGE),
          GROUP.party,
        );
      }
      const flame: Mat = { day: AMBER, dayA: 0.9, night: BULB, nightA: 1, size: 1.6, fx: FX.flame };
      for (const cx of [-0.32, 0.32]) {
        line([x + cx, 0.77, z], [x + cx, 0.98, z], share(0.00012), pencil(0.7), GROUP.party, 0.01);
        for (let i = 0; i < 4; i++) still(x + cx, 1.0 + rnd() * 0.05, z, flame, GROUP.party);
      }

      const SEATS = 6;
      const turn = rnd() * TAU;
      for (let k = 0; k < SEATS; k++) {
        const ang = turn + (k / SEATS) * TAU;
        const cx = x + Math.sin(ang) * (R + 0.42);
        const cz = z + Math.cos(ang) * (R + 0.42);
        const facing = ang + Math.PI;
        // A chair: seat, back, legs.
        round([cx, 0.46, cz], 0.2, share(0.00022), pencil(0.6), GROUP.party);
        for (let i = 0; i < share(0.0003); i++) {
          const a = ang + (rnd() - 0.5) * 1.4;
          still(cx + Math.sin(a) * 0.2, lerp(0.46, 0.95, rnd()), cz + Math.cos(a) * 0.2, pencil(0.6), GROUP.party);
        }
        for (let i = 0; i < share(0.00016); i++) {
          const a = (Math.floor(rnd() * 4) / 4) * TAU + 0.6;
          still(cx + Math.sin(a) * 0.17, rnd() * 0.46, cz + Math.cos(a) * 0.17, pencil(0.5), GROUP.party);
        }
        if (k % 3 !== 2) {
          guest(cx, cz, facing, share(0.004), {
            seat: 0.47,
            arms:
              rnd() < 0.3
                ? [DOWN, [60, 120, 0.8]]
                : [
                    [30, 70, 0.9],
                    [30, 70, 0.9],
                  ],
          });
        }
      }
    }
  }

  // Fairy lights: two rows of poles, strings sagging between them and crossing over the floor.
  const POLE = 4.5;
  const rows = [FLOOR.back - 0.25, FLOOR.front + 0.25];
  const cols = [-15.6, -FLOOR.x - 0.25, FLOOR.x + 0.25, 15.6];
  for (const z of rows) {
    for (const x of cols) tube([x, 0, z], [x, POLE, z], 0.045, 0.035, share(0.0011), pencil(0.85), GROUP.party);
  }
  const bulb: Mat = { day: AMBER, dayA: 0.95, night: BULB, nightA: 1, size: 2.3, fx: FX.bulb };
  const halo: Mat = { day: GLOW, dayA: 0.5, night: GLOW, nightA: 0.6, size: 1.2, fx: FX.none };
  function lights(a: [number, number], b: [number, number], sag: number) {
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const at = (t: number): Vec3 => [lerp(a[0], b[0], t), POLE - 0.06 - sag * 4 * t * (1 - t), lerp(a[1], b[1], t)];
    for (let i = 0; i < share(0.00011) * span; i++) {
      const p = at(rnd());
      still(p[0], p[1], p[2], pencil(0.55, 0.3, 0.85), GROUP.party);
    }
    const bulbs = Math.round(span / 0.42);
    for (let k = 1; k < bulbs; k++) {
      const p = at(k / bulbs);
      still(p[0], p[1] - 0.07, p[2], bulb, GROUP.party);
      for (let i = 0; i < 3; i++) {
        still(
          p[0] + (rnd() - 0.5) * 0.07,
          p[1] - 0.07 + (rnd() - 0.5) * 0.07,
          p[2] + (rnd() - 0.5) * 0.07,
          halo,
          GROUP.party,
        );
      }
    }
  }
  for (const z of rows) {
    for (let c = 0; c < cols.length - 1; c++)
      lights([cols[c] as number, z], [cols[c + 1] as number, z], c === 1 ? 0.75 : 0.9);
  }
  const [back, front] = rows as [number, number];
  const [, left, right] = cols as [number, number, number, number];
  lights([left, back], [left, front], 0.5);
  lights([right, back], [right, front], 0.5);
  lights([left, back], [right, front], 0.95);
  lights([right, back], [left, front], 0.95);

  // ---------- the lifts ----------

  LIFT_SPECS.forEach((spec, index) => {
    const lift = LIFTS[index] as Lift;
    const group = index === 0 ? GROUP.left : GROUP.right;
    const chair = index === 1;
    const { a, b, gauge } = lift;
    const dx = b[0] - a[0];
    const dz = b[2] - a[2];
    const flat = Math.hypot(dx, dz);
    const fwd: Vec3 = [dx / flat, 0, dz / flat];
    const out: Vec3 = [-fwd[2], 0, fwd[0]];
    const along = (t: number, off = 0, lift_ = 0): Vec3 => [
      lerp(a[0], b[0], t) + out[0] * off,
      lerp(a[1], b[1], t) + lift_,
      lerp(a[2], b[2], t) + out[2] * off,
    ];
    const steel = pencil(0.82);

    for (const s of [-1, 1])
      line(along(0, s * gauge), along(1, s * gauge), share(0.0055), pencil(0.6, 0.4, 0.9), group, 0.02);

    for (const t of [0.13, 0.31, 0.5, 0.69, 0.87]) {
      const top = along(t);
      const foot: Vec3 = [top[0], ground(top[0], top[2]), top[2]];
      const head: Vec3 = [top[0], top[1] + 0.45, top[2]];
      const r = chair ? 0.27 : 0.15;
      tube(foot, head, r, r * 0.7, share(chair ? 0.0034 : 0.0022), steel, group);
      tube(along(t, -gauge - 0.35, 0.4), along(t, gauge + 0.35, 0.4), 0.07, 0.07, share(0.0011), steel, group);
      // The trains of wheels the cable runs over, one under each end of the arm.
      for (const s of [-1, 1]) {
        const dt = 0.9 / flat;
        line(along(t - dt, s * gauge, 0.12), along(t + dt, s * gauge, 0.12), share(0.0005), steel, group);
        for (let k = -2; k <= 2; k++) {
          const c = along(t + (k * dt) / 2.2, s * gauge, 0.08);
          for (let i = 0; i < share(0.00012); i++) {
            const ang = rnd() * TAU;
            still(
              c[0] + fwd[0] * Math.cos(ang) * 0.13,
              c[1] + Math.sin(ang) * 0.13,
              c[2] + fwd[2] * Math.cos(ang) * 0.13,
              steel,
              group,
            );
          }
        }
        line(along(t, s * gauge, 0.12), along(t, s * gauge, 0.42), share(0.0002), steel, group);
      }
      if (chair) {
        // A ladder up the mast and a platform at the top.
        const height = head[1] - foot[1];
        for (let i = 0; i < share(0.0012); i++) {
          const rung = Math.floor(rnd() * (height / 0.4)) * 0.4 + 0.5;
          const across = rnd() < 0.7 ? (rnd() - 0.5) * 0.4 : rnd() < 0.5 ? -0.2 : 0.2;
          still(
            foot[0] + fwd[0] * (r + 0.1) + out[0] * across,
            foot[1] + (rnd() < 0.7 ? rung : rnd() * height),
            foot[2] + fwd[2] * (r + 0.1) + out[2] * across,
            pencil(0.6),
            group,
          );
        }
        box([head[0], head[1] - 0.6, head[2]], 1.3, 0.05, 1.1, share(0.0006), 0, pencil(0.7), steel, group);
      }
    }

    // A wheel on a column at each end.
    for (const [t, base] of [
      [0, true],
      [1, false],
    ] as const) {
      const hub = along(t);
      const foot: Vec3 = [hub[0], ground(hub[0], hub[2]), hub[2]];
      tube(foot, [hub[0], hub[1] - 0.15, hub[2]], chair ? 0.36 : 0.26, chair ? 0.3 : 0.2, share(0.0026), steel, group);
      round(hub, gauge, share(0.0022), steel, group);
      round([hub[0], hub[1] - 0.1, hub[2]], gauge, share(0.001), pencil(0.5), group);
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * TAU;
        line(
          hub,
          [hub[0] + Math.cos(ang) * gauge, hub[1], hub[2] + Math.sin(ang) * gauge],
          share(0.0003),
          pencil(0.7),
          group,
        );
      }
      if (base) {
        round([foot[0], foot[1] + 0.05, foot[2]], 0.95, share(0.0009), steel, group);
        round([foot[0], foot[1] + 0.05, foot[2]], 0.95, share(0.0006), pencil(0.35), group, true);
      }
    }

    // What rides the cable. Each is drawn about its grip; the shader carries it round the loop.
    const rider = (lx: number, ly: number, lz: number, mat: Mat, place: number) => {
      const t = place < 0.5 ? place * 2 : (1 - place) * 2;
      put(lx, ly, lz, mat, group, lerp(a[1], b[1], t) + ly, MODE.rider, index, place);
    };
    for (let k = 0; k < spec.carriers; k++) {
      const place = (k + 0.5 * rnd()) / spec.carriers;
      if (chair) {
        const W = 0.68;
        const SEAT = -2.35;
        for (let i = 0; i < share(0.0031); i++) {
          const pickPart = rnd();
          if (pickPart < 0.14) rider((rnd() - 0.5) * 0.04, -rnd() * 1.25, (rnd() - 0.5) * 0.04, steel, place);
          else if (pickPart < 0.3) {
            // The bail: across, then down each side to the seat.
            if (rnd() < 0.4) rider((rnd() * 2 - 1) * W, -1.25, 0, steel, place);
            else rider(rnd() < 0.5 ? -W : W, lerp(-1.25, SEAT, rnd()), 0, steel, place);
          } else if (pickPart < 0.62) rider((rnd() * 2 - 1) * W, SEAT, lerp(-0.08, 0.42, rnd()), pencil(0.7), place);
          else if (pickPart < 0.92) {
            const t = rnd();
            rider((rnd() * 2 - 1) * W, SEAT + t * 0.6, -0.08 - t * 0.12, pencil(0.7), place);
          } else rider((rnd() * 2 - 1) * W, SEAT - 0.5, 0.5, pencil(0.5), place);
        }
      } else {
        for (let i = 0; i < share(0.00085); i++) {
          const pickPart = rnd();
          if (pickPart < 0.2) rider((rnd() - 0.5) * 0.12, -rnd() * 0.22, (rnd() - 0.5) * 0.2, steel, place);
          else if (pickPart < 0.7) {
            const t = rnd();
            rider((rnd() - 0.5) * 0.03, -0.2 - t * 1.9, -t * 0.3, steel, place);
          } else {
            const ang = rnd() * TAU;
            const q = Math.sqrt(rnd()) * 0.16;
            rider(Math.cos(ang) * q, -2.12, -0.3 + Math.sin(ang) * q, steel, place);
          }
        }
      }
    }
  });

  // ---------- the slope ----------

  // Contour lines: each sample slides along the fall line to the nearest level.
  const STEP = 1.6;
  const contour = pencil(0.42, 0.26, 0.9);
  const terrainN = share(0.12);
  let placed = 0;
  for (let tries = 0; placed < terrainN && tries < terrainN * 6; tries++) {
    let x = (rnd() * 2 - 1) * 80;
    let z = lerp(-132, -TERRACE, rnd());
    const h = ground(x, z);
    const gx = (ground(x + 0.2, z) - ground(x - 0.2, z)) / 0.4;
    const gz = (ground(x, z + 0.2) - ground(x, z - 0.2)) / 0.4;
    const g2 = gx * gx + gz * gz;
    if (g2 < 0.002) continue;
    const move = (Math.round(h / STEP) * STEP - h) / g2;
    if (Math.abs(move) * Math.sqrt(g2) > 4) continue;
    x += gx * move + (rnd() - 0.5) * 0.06;
    z += gz * move + (rnd() - 0.5) * 0.06;
    still(x, ground(x, z), z, contour, side(x));
    placed++;
  }
  // A light stipple over the level ground the party stands on, thinning out away from it.
  const dust = pencil(0.22, 0.12, 0.85);
  for (let i = 0; i < share(0.02); i++) {
    const r = Math.sqrt(-2 * Math.log(1 - rnd() * 0.98));
    const ang = rnd() * TAU;
    const x = Math.cos(ang) * r * 24;
    const z = Math.min(Math.sin(ang) * r * 9 + 3, 30);
    if (z < -TERRACE) continue;
    still(x, 0, z, dust, side(x));
  }

  // A further ridge behind the crest, drawn faint, so the slope has something to stand against.
  const far = pencil(0.8, 0.5, 0.95);
  for (let i = 0; i < share(0.012); i++) {
    const x = (rnd() * 2 - 1) * 230;
    const line_ = Math.floor(rnd() ** 1.6 * 4);
    const y = 60 + 11 * Math.sin(x * 0.017 + 0.6) + 4 * Math.sin(x * 0.05 + 2) - 0.00045 * x * x - line_ * 3.4;
    still(x, y, -215 + line_ * 9, far, side(x));
  }

  // Chalets on the shoulder of the hill, as in the sketch, their windows lit at night.
  const pane: Mat = { day: BARK, dayA: 0.7, night: GLOW, nightA: 1, size: 1.5, fx: FX.flame };
  for (const [x, z, w] of [
    [52, -60, 6.5],
    [60, -64, 8],
    [68, -59, 6],
  ] as const) {
    const y = ground(x, z);
    const h = w * 0.5;
    const d = w * 0.75;
    box([x, y + h / 2, z], w, h, d, share(0.0016), share(0.0005), pencil(0.75), pencil(0.2), GROUP.right);
    const ridge = y + h + w * 0.36;
    for (const s of [-1, 1]) {
      const zs = z + (s * d) / 2;
      line([x - w / 2 - 0.4, y + h - 0.1, zs], [x, ridge, zs], share(0.0004), pencil(0.8), GROUP.right);
      line([x + w / 2 + 0.4, y + h - 0.1, zs], [x, ridge, zs], share(0.0004), pencil(0.8), GROUP.right);
    }
    line([x, ridge, z - d / 2], [x, ridge, z + d / 2], share(0.0003), pencil(0.8), GROUP.right);
    for (const wx of [-0.25, 0.2]) {
      for (let i = 0; i < share(0.00025); i++) {
        still(x + w * wx + rnd() * w * 0.14, y + h * 0.5 + rnd() * w * 0.14, z + d / 2 + 0.02, pane, GROUP.right);
      }
    }
  }

  // ---------- the sky ----------

  // The moon is all but full on the night of 17 July 2027. Thinner patches stand for its seas.
  const moon: Mat = { day: CREAM, dayA: 0, night: [255, 247, 228], nightA: 0.95, size: 1.15, fx: FX.none };
  const seas: [number, number, number][] = [
    [-0.3, 0.35, 0.32],
    [0.25, 0.3, 0.24],
    [-0.05, -0.2, 0.3],
    [0.42, -0.1, 0.18],
  ];
  const moonN = share(0.022);
  for (let i = 0, tries = 0; i < moonN && tries < moonN * 4; tries++) {
    const u = rnd() * 2 - 1;
    const ang = rnd() * TAU;
    const q = Math.sqrt(1 - u * u);
    const nx = Math.cos(ang) * q;
    const nz = Math.abs(Math.sin(ang) * q);
    if (seas.some(([sx, sy, r]) => Math.hypot(nx - sx, u - sy) < r) && rnd() < 0.62) continue;
    put(MOON.at[0] + nx * MOON.radius, MOON.at[1] + u * MOON.radius, MOON.at[2] + nz * MOON.radius, moon, GROUP.sky, 0);
    i++;
  }

  // Whatever is left becomes the stars.
  while (used < count) {
    const up = lerp(0.04, 0.96, rnd());
    const ang = rnd() * TAU;
    const r = lerp(260, 330, rnd());
    const q = Math.sqrt(1 - up * up);
    const big = rnd() < 0.08;
    const star: Mat = {
      day: CREAM,
      dayA: 0,
      night: [255, 250, 238],
      nightA: lerp(0.5, 1, rnd()),
      size: big ? 2.1 : lerp(0.95, 1.4, rnd()),
      fx: FX.star,
    };
    put(Math.cos(ang) * q * r, up * r, Math.sin(ang) * q * r, star, GROUP.sky, 0);
  }

  return world;
}
