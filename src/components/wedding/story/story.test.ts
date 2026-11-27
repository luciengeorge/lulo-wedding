import { describe, expect, it } from "vitest";

import { FRIDAY, HOLD, TURN, filmSeconds } from "./acts";
import { pairFlat, pairPicture, pairingOrder, pictureBox, pictureOrder, type Pool } from "./flat";
import { CAPTIONS, FLAT, film } from "./timeline";
import { buildWorld, FX, GROUP, ground, LIFTS, MODE } from "./world";

const WIDE = 1440 / 836;
const TALL = 393 / 600;

function seeded() {
  let a = 1;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
}

describe("the cloud", () => {
  // As many points as a phone gets, the fewer of the two counts in use. With far fewer the party alone would fill it.
  const world = buildWorld(160_000);

  it("uses every point it was given, the same way each time", () => {
    const again = buildWorld(160_000);
    expect(world.position.every(Number.isFinite)).toBe(true);
    expect(world.group.every((group) => group <= GROUP.sky)).toBe(true);
    expect(Array.from(again.position)).toEqual(Array.from(world.position));
    // A full cloud ends on stars; one that ran out early would end on zeros.
    expect(world.look[(world.count - 1) * 4 + 1]).toBe(FX.star);
  });

  it("has the party, the lifts and the sky in it", () => {
    const modes = new Set<number>();
    for (let i = 0; i < world.count; i++) modes.add(world.look[i * 4 + 3] as number);
    expect([...modes].sort()).toEqual([MODE.still, MODE.rider, MODE.dancer, MODE.couple]);
    for (const group of Object.values(GROUP)) expect(world.group.includes(group)).toBe(true);
  });

  it("keeps the stars for the night", () => {
    for (let i = 0; i < world.count; i++) {
      if (world.look[i * 4 + 1] !== FX.star) continue;
      expect(world.day[i * 4 + 3]).toBe(0);
      expect(world.night[i * 4 + 3]).toBeGreaterThan(100);
    }
  });

  it("hangs both cables clear of the ground all the way up", () => {
    for (const lift of LIFTS) {
      for (let t = 0; t <= 1; t += 0.02) {
        const x = lift.a[0] + (lift.b[0] - lift.a[0]) * t;
        const z = lift.a[2] + (lift.b[2] - lift.a[2]) * t;
        const cable = lift.a[1] + (lift.b[1] - lift.a[1]) * t;
        expect(cable - ground(x, z)).toBeGreaterThan(2);
      }
    }
  });
});

/** The story of a guest who is at the wedding only: the mountain, and nothing before it. */
const momentAt = film(["mountain"]).at;

describe("the story by scroll position", () => {
  it("starts square on to the sketch, with nothing changed", () => {
    const start = momentAt(0, WIDE);
    expect(start.camera.target).toEqual(FLAT.target);
    expect(start.camera.position).toEqual([FLAT.target[0], FLAT.target[1], FLAT.target[2] + FLAT.radius]);
    expect(start).toMatchObject({ swap: 0, morph: 0, night: 0, caption: -1, lift: 0 });
  });

  it("has the dots in place before the sketch starts to lift", () => {
    for (let p = 0; p <= 1; p += 0.005) {
      const moment = momentAt(p, WIDE);
      if (moment.morph > 0) expect(moment.swap).toBe(1);
    }
  });

  it("goes from day to night once, and ends at night", () => {
    expect(momentAt(0.5, WIDE).night).toBe(0);
    expect(momentAt(0.75, WIDE).night).toBe(1);
    expect(momentAt(1, WIDE)).toMatchObject({ morph: 1, night: 1 });
  });

  it("shows each line in turn, and the last one to the end", () => {
    const seen: number[] = [];
    for (let p = 0; p <= 1.0001; p += 0.002) {
      const { caption } = momentAt(Math.min(p, 1), WIDE);
      if (caption >= 0 && seen[seen.length - 1] !== caption) seen.push(caption);
    }
    expect(seen).toEqual(CAPTIONS.map((_, index) => index));
    expect(momentAt(1, WIDE).caption).toBe(CAPTIONS.length - 1);
  });

  it.each([WIDE, TALL])("never jumps the camera (aspect %f)", (aspect) => {
    let last = momentAt(0, aspect).camera.position;
    for (let p = 0.001; p <= 1; p += 0.001) {
      const next = momentAt(p, aspect).camera.position;
      expect(Math.hypot(next[0] - last[0], next[1] - last[1], next[2] - last[2])).toBeLessThan(4);
      last = next;
    }
  });

  it("stands further back on a narrow screen to keep the slope in", () => {
    const distance = (aspect: number) => {
      const { position, target } = momentAt(0.25, aspect).camera;
      return Math.hypot(position[0] - target[0], position[1] - target[1], position[2] - target[2]);
    };
    expect(distance(TALL)).toBeGreaterThan(distance(WIDE));
  });
});

describe("a story with Friday in it", () => {
  const weekend = film(["friday", "mountain"]);
  const at = (seconds: number) => weekend.at(seconds / weekend.seconds, WIDE);
  /** When the names have gone and the first picture starts to form. */
  const opening = 1.4;

  it("runs as long as its acts, and the mountain alone as long as it always did", () => {
    expect(film(["mountain"]).seconds).toBe(40);
    expect(weekend.seconds).toBeCloseTo(40 + FRIDAY.length * (TURN + HOLD));
    expect(weekend.seconds).toBe(filmSeconds(["friday", "mountain"]));
  });

  it("lists the hero's sketch and then Friday's places as its pictures", () => {
    expect(weekend.pictures).toEqual([null, ...FRIDAY]);
    expect(film(["mountain"]).pictures).toEqual([null]);
  });

  it("opens as every story does: the hero, and the names going", () => {
    expect(at(0)).toMatchObject({ from: 0, to: 0, turn: 0, swap: 0, morph: 0, caption: -1, place: -1 });
    expect(at(opening - 0.01)).toMatchObject({ from: 0, to: 0, swap: 1, morph: 0 });
  });

  it("turns each picture into the next, in order, and holds it", () => {
    FRIDAY.forEach((_, i) => {
      const start = opening + i * (TURN + HOLD);
      expect(at(start + 0.001)).toMatchObject({ from: i, to: i + 1, morph: 0 });
      expect(at(start + 0.001).turn).toBeLessThan(0.01);
      expect(at(start + TURN + HOLD / 2)).toMatchObject({ from: i, to: i + 1, turn: 1, place: i + 1 });
    });
  });

  it("never moves the camera or lifts the picture while the pictures are up", () => {
    for (let t = 0; t < opening + FRIDAY.length * (TURN + HOLD); t += 0.25) {
      const moment = at(t);
      expect(moment.camera.position).toEqual([FLAT.target[0], FLAT.target[1], FLAT.target[2] + FLAT.radius]);
      expect(moment).toMatchObject({ morph: 0, night: 0, lift: 0 });
    }
  });

  it("keeps Friday's line up through all seven, then gives way to the mountain's", () => {
    const fridays = FRIDAY.length * (TURN + HOLD);
    expect(at(opening + 1).caption).toBe(0);
    expect(at(opening + fridays - 0.1).caption).toBe(0);
    const seen = new Set<number>();
    for (let t = opening + fridays; t <= weekend.seconds; t += 0.1) seen.add(at(t).caption);
    seen.delete(-1);
    expect([...seen]).toEqual(CAPTIONS.map((_, index) => index + 1));
    expect(weekend.captions.map((caption) => caption.act)).toEqual([
      "friday",
      "mountain",
      "mountain",
      "mountain",
      "mountain",
    ]);
  });

  it("leaves the last picture for the mountain exactly as the mountain's own story leaves the hero", () => {
    const fridays = FRIDAY.length * (TURN + HOLD);
    const alone = film(["mountain"]);
    for (const seconds of [1.5, 5, 12, 25, 39.9]) {
      const { from, to, turn, place, caption, ...withFriday } = at(seconds + fridays);
      const mountain = alone.at(seconds / alone.seconds, WIDE);
      expect(from).toBe(FRIDAY.length);
      expect(to).toBe(FRIDAY.length);
      expect(withFriday.morph).toBeCloseTo(mountain.morph, 6);
      expect(withFriday.night).toBeCloseTo(mountain.night, 6);
      expect(withFriday.camera.position[2]).toBeCloseTo(mountain.camera.position[2], 4);
      expect(caption).toBe(mountain.caption < 0 ? -1 : mountain.caption + 1);
    }
  });
});

describe("where each point starts on the sketch", () => {
  const world = buildWorld(6_000);
  const order = pairingOrder(world);
  /** A drawing that is one short row of red pixels at height `y`. */
  const row = (y: number): Pool => {
    const points = new Float32Array(40);
    const inks = new Uint8Array(80);
    for (let i = 0; i < 20; i++) {
      points.set([i - 10, y], i * 2);
      inks.set([155, 13, 23, 255], i * 4);
    }
    return { points, inks, sizes: new Float32Array(20).fill(0.5) };
  };
  const { flat, ink } = pairFlat(world, order, [row(100), row(0), row(-100)], 800, 600, seeded());
  const where = (group: number) => {
    const ys: number[] = [];
    for (let i = 0; i < world.count; i++) if (world.group[i] === group) ys.push(flat[i * 3 + 1] as number);
    return ys;
  };

  it("puts every part of the place on its own drawing", () => {
    for (const [group, y] of [
      [GROUP.left, 100],
      [GROUP.right, 0],
      [GROUP.party, -100],
    ] as const) {
      expect(where(group).every((value) => Math.abs(value - y) < 1)).toBe(true);
    }
  });

  it("takes the drawing's colour, and gives each of its pixels one dot and no more", () => {
    const dots = new Map<string, number>();
    for (let i = 0; i < world.count; i++) {
      if (world.group[i] === GROUP.sky) {
        expect(flat[i * 3 + 2]).toBe(0);
        continue;
      }
      expect(Array.from(ink.subarray(i * 4, i * 4 + 4))).toEqual([155, 13, 23, 255]);
      if (flat[i * 3 + 2] === 0) continue;
      const pixel = `${flat[i * 3]},${flat[i * 3 + 1]}`;
      dots.set(pixel, (dots.get(pixel) ?? 0) + 1);
    }
    // Three drawings of twenty pixels each.
    expect(dots.size).toBe(60);
    expect([...dots.values()].every((count) => count === 1)).toBe(true);
  });

  it("makes a dot just big enough to fill its pixel", () => {
    const sizes = new Set(Array.from(flat.filter((_, index) => index % 3 === 2)).filter((size) => size > 0));
    expect([...sizes]).toEqual([expect.closeTo(0.56, 2)]);
  });

  it("spreads its dots over the whole drawing when it has fewer points than pixels", () => {
    const few = buildWorld(40);
    const spread = pairFlat(few, pairingOrder(few), [row(100), row(0), row(-100)], 800, 600, seeded());
    for (const group of [GROUP.left, GROUP.right, GROUP.party]) {
      const xs: number[] = [];
      for (let i = 0; i < few.count; i++) if (few.group[i] === group) xs.push(spread.flat[i * 3] as number);
      if (xs.length < 3) continue;
      expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(10);
    }
  });

  it("leaves a part unseen when its drawing could not be read", () => {
    const empty: Pool = { points: new Float32Array(0), inks: new Uint8Array(0), sizes: new Float32Array(0) };
    const blank = pairFlat(world, order, [empty, empty, empty], 800, 600, seeded());
    expect(blank.flat.filter((_, index) => index % 3 === 2).every((value) => value === 0)).toBe(true);
  });
});

describe("one of the story's pictures", () => {
  const world = buildWorld(6_000);
  const order = pictureOrder(world);
  /** A picture that is one row of pixels, each its own shade, left to right. */
  const row = (pixels: number): Pool => {
    const points = new Float32Array(pixels * 2);
    const inks = new Uint8Array(pixels * 4);
    for (let i = 0; i < pixels; i++) {
      points.set([i - pixels / 2, 0], i * 2);
      inks.set([i % 256, 0, 0, 255], i * 4);
    }
    return { points, inks, sizes: new Float32Array(pixels).fill(0.5) };
  };

  it("sits above the lines of text, in the middle, three wide to two high", () => {
    for (const [width, height] of [
      [1440, 836],
      [393, 800],
      [1024, 600],
    ] as const) {
      const box = pictureBox(width, height);
      expect(box.width / box.height).toBeCloseTo(1.5);
      expect(box.left).toBeCloseTo((width - box.width) / 2);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(56);
      expect(box.top + box.height).toBeLessThan(height * 0.78);
    }
  });

  it("is drawn by the whole cloud: one dot to a place, the rest of the points waiting on it unseen", () => {
    const { flat } = pairPicture(world, order, row(200));
    const dots = new Map<number, number>();
    for (let i = 0; i < world.count; i++) {
      if (flat[i * 3 + 2] === 0) continue;
      dots.set(flat[i * 3] as number, (dots.get(flat[i * 3] as number) ?? 0) + 1);
    }
    expect(dots.size).toBe(200);
    expect([...dots.values()].every((count) => count === 1)).toBe(true);
  });

  it("keeps a point on its own side: left of the mountain, left of the picture", () => {
    const { flat } = pairPicture(world, order, row(200));
    const left: number[] = [];
    const right: number[] = [];
    for (let i = 0; i < world.count; i++) {
      const side =
        (world.position[i * 3] as number) < -15 ? left : (world.position[i * 3] as number) > 15 ? right : null;
      side?.push(flat[i * 3] as number);
    }
    const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(left)).toBeLessThan(mean(right) - 20);
  });

  it("shows nothing when it could not be read", () => {
    const { flat } = pairPicture(world, order, {
      points: new Float32Array(0),
      inks: new Uint8Array(0),
      sizes: new Float32Array(0),
    });
    expect(flat.every((value) => value === 0)).toBe(true);
  });
});
