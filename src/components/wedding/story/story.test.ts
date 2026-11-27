import { describe, expect, it } from "vitest";

import { pairFlat, pairingOrder, type Pool } from "./flat";
import { CAPTIONS, FLAT, momentAt } from "./timeline";
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
  const world = buildWorld(20_000);

  it("uses every point it was given, the same way each time", () => {
    const again = buildWorld(20_000);
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
    return { points, inks, area: 20 };
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

  it("takes the drawing's colour, and shows only as many points as it has pixels for", () => {
    let shown = 0;
    for (let i = 0; i < world.count; i++) {
      if (world.group[i] === GROUP.sky) {
        expect(flat[i * 3 + 2]).toBe(0);
        continue;
      }
      expect(Array.from(ink.subarray(i * 4, i * 4 + 4))).toEqual([155, 13, 23, 255]);
      shown += flat[i * 3 + 2] as number;
    }
    expect(shown).toBeGreaterThan(20);
    expect(shown).toBeLessThan(200);
  });

  it("leaves a part unseen when its drawing could not be read", () => {
    const empty: Pool = { points: new Float32Array(0), inks: new Uint8Array(0), area: 0 };
    const blank = pairFlat(world, order, [empty, empty, empty], 800, 600, seeded());
    expect(blank.flat.filter((_, index) => index % 3 === 2).every((value) => value === 0)).toBe(true);
  });
});
