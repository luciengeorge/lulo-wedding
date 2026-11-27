/**
 * The story's flat pictures as dots: the pencil sketch behind the hero, which
 * every story starts on, and the drawings some acts turn it into on the way.
 *
 * A drawing is read back as pixels, in the place and at the size it has on the
 * stage, and each pixel is given one dot of its own colour. Laid out like that
 * the dots are the drawing, pixel for pixel, which is how they can stand in for
 * the hero's sketch and then leave it without a jump.
 */
import { GROUP, type World } from "./world";

/**
 * One drawing as the dots that would redraw it: where each goes, x and y from
 * the middle of the stage (y up) in CSS pixels; its colour; and how big it has
 * to be to fill its place, a pixel of the drawing or a block of four alike.
 */
export type Pool = { points: Float32Array; inks: Uint8Array; sizes: Float32Array };

const WIDE = "(min-width: 64rem), (min-aspect-ratio: 13/10)";
/** The wide lifts are cut this far short of the middle of the page. Matches `.lulo-scene-*` in styles.css. */
const CREST_GAP = 90;
/** The most of a drawing's box that is read at once: enough for a lift at two pixels to the pixel on a desktop. */
const MAX_PIXELS = 5_600_000;
/**
 * How faint a pixel may be and still get a dot. The soft edge of a line is kept
 * where there are the points for it; a drawing with too many pixels gives up
 * its faintest first, and only then any of its sharpness.
 */
const FAINT = [28, 64, 110] as const;
/** Pixels this alike, in each of red, green, blue and alpha, are one flat colour. */
const ALIKE = 6;

const DRAWINGS = [
  { name: "teleski", group: GROUP.left },
  { name: "chairlift", group: GROUP.right },
  { name: "party", group: GROUP.party },
] as const;

async function load(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return image;
}

type Box = { left: number; top: number; width: number; height: number };

const EMPTY = (): Pool => ({ points: new Float32Array(0), inks: new Uint8Array(0), sizes: new Float32Array(0) });

/**
 * One drawing as dots. `box` is where it sits on the stage, in CSS pixels from
 * the stage's top left corner; `frame` is the stage, and only what falls inside
 * it, between `min` and `max` across, is kept. `points` is how many points
 * there are to draw it with: a drawing that would need more is read again less
 * finely, so that every dot it needs is one it has.
 */
function dotsOf(
  image: HTMLImageElement,
  box: Box,
  frame: { width: number; height: number },
  { min, max }: { min: number; max: number },
  points: number,
): Pool {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || points < 1) return EMPTY();

  const read = (scale: number, faint: number) => {
    canvas.width = Math.round(box.width * scale);
    canvas.height = Math.round(box.height * scale);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height } = canvas;
    const found: number[] = [];
    const inks: number[] = [];
    const sizes: number[] = [];
    const shows = (x: number, y: number) => {
      if (x >= width || y >= height || (data[(y * width + x) * 4 + 3] as number) < faint) return false;
      const sx = box.left + (x + 0.5) / scale;
      const sy = box.top + (y + 0.5) / scale;
      return sx >= min && sx <= max && sy >= 0 && sy <= frame.height;
    };
    const alike = (a: number, b: number) => {
      for (let c = 0; c < 4; c++) if (Math.abs((data[a + c] as number) - (data[b + c] as number)) > ALIKE) return false;
      return true;
    };
    /** A dot `span` pixels across with its corner at x, y, in the colour found there. */
    const dot = (x: number, y: number, span: number) => {
      const o = (y * width + x) * 4;
      found.push(
        box.left + (x + span / 2) / scale - frame.width / 2,
        frame.height / 2 - box.top - (y + span / 2) / scale,
      );
      inks.push(data[o] as number, data[o + 1] as number, data[o + 2] as number, data[o + 3] as number);
      sizes.push(span / scale);
    };
    // Two by two: four pixels of one flat colour, as the dance floor is, make do with one dot between them.
    for (let y = 0; y < height; y += 2) {
      for (let x = 0; x < width; x += 2) {
        const o = (y * width + x) * 4;
        const flat =
          shows(x, y) &&
          shows(x + 1, y) &&
          shows(x, y + 1) &&
          shows(x + 1, y + 1) &&
          alike(o, o + 4) &&
          alike(o, o + width * 4) &&
          alike(o, o + width * 4 + 4);
        if (flat) {
          dot(x, y, 2);
          continue;
        }
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) if (shows(x + dx, y + dy)) dot(x + dx, y + dy, 1);
      }
    }
    return { found, inks, sizes };
  };

  // As fine as the screen itself, where there are the points for it.
  const fine = Math.min(2, window.devicePixelRatio || 1, Math.sqrt(MAX_PIXELS / (box.width * box.height)));
  let reading = read(fine, FAINT[0]);
  for (let attempt = 1; reading.sizes.length > points; attempt++) {
    const faint = FAINT[attempt];
    // Out of faint pixels to give up: coarser, by as much as it is over.
    reading = faint
      ? read(fine, faint)
      : read(fine * Math.sqrt(points / reading.sizes.length) * 0.97, FAINT[FAINT.length - 1] as number);
    if (!faint) break;
  }
  return {
    points: Float32Array.from(reading.found),
    inks: Uint8Array.from(reading.inks),
    sizes: Float32Array.from(reading.sizes),
  };
}

/**
 * Reads the hero's three drawings, where the page has put them. `budget` is how
 * many points each has to be drawn with. A drawing that cannot be read gives an
 * empty pool, and its points start unseen.
 */
export async function sampleSketch(stage: HTMLElement, budget: readonly number[]): Promise<Pool[]> {
  const frame = stage.getBoundingClientRect();
  const wide = window.matchMedia(WIDE).matches;
  const pools: Pool[] = DRAWINGS.map(EMPTY);

  await Promise.all(
    DRAWINGS.map(async ({ name, group }) => {
      const img = stage.querySelector<HTMLImageElement>(`.lulo-scene-${name}`);
      if (!img) return;
      // A drawing takes its width from its own file, so it has no place on the page until that has arrived.
      await img.decode().catch(() => {});
      const box = img.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      // The still copy: a chair half way up its ride would leave a gap in the line.
      const image = await load(`${(img.currentSrc || img.src).split(/[?#]/)[0]}?still#still`).catch(() => null);
      if (!image) return;
      pools[group] = dotsOf(
        image,
        { left: box.left - frame.left, top: box.top - frame.top, width: box.width, height: box.height },
        frame,
        {
          min: wide && name === "chairlift" ? frame.width / 2 + CREST_GAP : 0,
          max: wide && name === "teleski" ? frame.width / 2 - CREST_GAP : frame.width,
        },
        budget[group] ?? 0,
      );
    }),
  );
  return pools;
}

/** The shape of the paper the story's pictures are drawn on (tools/story-sketch): three wide to two high. */
const PAPER = 1.5;

/**
 * Where a picture goes on a stage this size: as big as fits above the lines of
 * text, and no bigger than it was drawn to be looked at.
 */
export function pictureBox(width: number, height: number): Box {
  const w = Math.min(width * 0.94, 900, height * 0.68 * PAPER);
  const h = w / PAPER;
  return { left: (width - w) / 2, top: Math.max(56, height * 0.4 - h / 2), width: w, height: h };
}

/** Reads one of the story's pictures, by name, as the dots that would draw it on this stage. Empty if it cannot be had. */
export async function samplePicture(stage: HTMLElement, name: string, points: number): Promise<Pool> {
  const frame = stage.getBoundingClientRect();
  const image = await load(`/art/story/${name}.svg`).catch(() => null);
  if (!image) return EMPTY();
  return dotsOf(image, pictureBox(frame.width, frame.height), frame, { min: 0, max: frame.width }, points);
}

/** The order to hand out a group's pixels in, so a point starts near where it will end up. */
export function pairingOrder(world: World): Uint32Array[] {
  return [GROUP.left, GROUP.right, GROUP.party].map((group) => {
    const members: number[] = [];
    for (let i = 0; i < world.count; i++) if (world.group[i] === group) members.push(i);
    const key = world.key;
    // The slope by height, top first; the party left to right.
    members.sort(
      group === GROUP.party
        ? (a, b) => (key[a] as number) - (key[b] as number)
        : (a, b) => (key[b] as number) - (key[a] as number),
    );
    return Uint32Array.from(members);
  });
}

/** A dot is drawn this much bigger than the gap to the next, so that no paper shows between two. */
const OVERLAP = 1.12;

/**
 * A flat start for every point: where, how big a dot there (none, for a point
 * that waits unseen), and in what colour.
 *
 * Every place in a drawing gets one dot, no more, so that the dots weigh what
 * the drawing weighs. A drawing mostly needs fewer dots than its part of the
 * cloud has points; the points left over start on a dot too, unseen, and show
 * as they leave it.
 */
export function pairFlat(
  world: World,
  order: Uint32Array[],
  pools: Pool[],
  width: number,
  height: number,
  rnd: () => number = Math.random,
): { flat: Float32Array; ink: Uint8Array } {
  const flat = new Float32Array(world.count * 3);
  const ink = new Uint8Array(world.count * 4);
  // The sky has no line to start from: it waits, unseen, above the names.
  for (let i = 0; i < world.count; i++) {
    if (world.group[i] !== GROUP.sky) continue;
    flat[i * 3] = (rnd() - 0.5) * width;
    flat[i * 3 + 1] = rnd() * height * 0.5;
  }

  order.forEach((members, group) => {
    const { points: pool, inks, sizes } = pools[group] as Pool;
    const pixels = pool.length / 2;
    // Sorted so that the first pixel handed out is the top of a lift, or the left of the party.
    const ranked = rankPool(pool, group === GROUP.party);
    let last = -1;
    for (let rank = 0; rank < members.length; rank++) {
      const i = members[rank] as number;
      if (pixels === 0) {
        flat[i * 3] = (rnd() - 0.5) * width;
        flat[i * 3 + 1] = -height / 2;
        continue;
      }
      const slot = Math.min(pixels - 1, Math.floor((rank * pixels) / members.length));
      const pick = ranked[slot] as number;
      flat[i * 3] = pool[pick * 2] as number;
      flat[i * 3 + 1] = pool[pick * 2 + 1] as number;
      // The first point to a place is its dot.
      flat[i * 3 + 2] = slot === last ? 0 : (sizes[pick] as number) * OVERLAP;
      last = slot;
      ink.set(inks.subarray(pick * 4, pick * 4 + 4), i * 4);
    }
  });
  return { flat, ink };
}

/**
 * The order the whole cloud takes a picture's dots in: left to right by where
 * each point ends up on the mountain. A point then keeps to its own side from
 * one picture to the next, and on into the place.
 */
export function pictureOrder(world: World): Uint32Array {
  const order = new Uint32Array(world.count);
  for (let i = 0; i < world.count; i++) order[i] = i;
  const x = world.position;
  return order.sort((a, b) => (x[a * 3] as number) - (x[b * 3] as number));
}

/**
 * A place in one of the story's pictures for every point. As on the hero's
 * sketch, a place gets one dot, and the points left over wait on it unseen.
 */
export function pairPicture(world: World, order: Uint32Array, pool: Pool): { flat: Float32Array; ink: Uint8Array } {
  const flat = new Float32Array(world.count * 3);
  const ink = new Uint8Array(world.count * 4);
  const dots = pool.sizes.length;
  if (dots === 0) return { flat, ink };
  const ranked = rankPool(pool.points, true);
  let last = -1;
  for (let rank = 0; rank < order.length; rank++) {
    const i = order[rank] as number;
    const slot = Math.min(dots - 1, Math.floor((rank * dots) / order.length));
    const pick = ranked[slot] as number;
    flat[i * 3] = pool.points[pick * 2] as number;
    flat[i * 3 + 1] = pool.points[pick * 2 + 1] as number;
    flat[i * 3 + 2] = slot === last ? 0 : (pool.sizes[pick] as number) * OVERLAP;
    last = slot;
    ink.set(pool.inks.subarray(pick * 4, pick * 4 + 4), i * 4);
  }
  return { flat, ink };
}

function rankPool(pool: Float32Array, leftToRight: boolean): Uint32Array {
  const ranked = new Uint32Array(pool.length / 2);
  for (let i = 0; i < ranked.length; i++) ranked[i] = i;
  return leftToRight
    ? ranked.sort((a, b) => (pool[a * 2] as number) - (pool[b * 2] as number))
    : ranked.sort((a, b) => (pool[b * 2 + 1] as number) - (pool[a * 2 + 1] as number));
}
