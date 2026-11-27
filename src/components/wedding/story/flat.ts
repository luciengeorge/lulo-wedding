/**
 * Where each point starts: on a line of the pencil sketch behind the hero.
 *
 * The three drawings are read back as pixels, in the place and at the size the
 * page shows them, so the dots can take over from the sketch without a jump.
 */
import { GROUP, type World } from "./world";

/**
 * The pixels of one drawing that carry a line or a wash of colour: x and y from
 * the middle of the stage (y up), in CSS pixels; the colour of each; and how
 * much of the page they cover between them.
 */
export type Pool = { points: Float32Array; inks: Uint8Array; area: number };

const WIDE = "(min-width: 64rem), (min-aspect-ratio: 13/10)";
/** The wide lifts are cut this far short of the middle of the page. Matches `.lulo-scene-*` in styles.css. */
const CREST_GAP = 90;
const MAX_PIXELS = 2_400_000;

const DRAWINGS = [
  { name: "teleski", group: GROUP.left },
  { name: "chairlift", group: GROUP.right },
  { name: "party", group: GROUP.party },
] as const;

async function load(src: string) {
  const image = new Image();
  image.decoding = "async";
  // The still copy: a chair half way up its ride would leave a gap in the line.
  image.src = `${src.split(/[?#]/)[0]}?still#still`;
  await image.decode();
  return image;
}

/** Reads the three drawings. A drawing that cannot be read gives an empty pool, and its points start unseen. */
export async function sampleSketch(stage: HTMLElement): Promise<Pool[]> {
  const frame = stage.getBoundingClientRect();
  const wide = window.matchMedia(WIDE).matches;
  const pools: Pool[] = DRAWINGS.map(() => ({ points: new Float32Array(0), inks: new Uint8Array(0), area: 0 }));

  await Promise.all(
    DRAWINGS.map(async ({ name, group }) => {
      const img = stage.querySelector<HTMLImageElement>(`.lulo-scene-${name}`);
      if (!img) return;
      // A drawing takes its width from its own file, so it has no place on the page until that has arrived.
      await img.decode().catch(() => {});
      const box = img.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      const image = await load(img.currentSrc || img.src).catch(() => null);
      if (!image) return;

      const scale = Math.min(2, Math.sqrt(MAX_PIXELS / (box.width * box.height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(box.width * scale);
      canvas.height = Math.round(box.height * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

      const left = box.left - frame.left;
      const top = box.top - frame.top;
      const min = wide && name === "chairlift" ? frame.width / 2 + CREST_GAP : 0;
      const max = wide && name === "teleski" ? frame.width / 2 - CREST_GAP : frame.width;
      const found: number[] = [];
      const inks: number[] = [];
      for (let y = 0; y < canvas.height; y++) {
        const sy = top + y / scale;
        if (sy < 0 || sy > frame.height) continue;
        for (let x = 0; x < canvas.width; x++) {
          const o = (y * canvas.width + x) * 4;
          // A line or a wash of colour, not the pale fill that hides what is behind a figure.
          if (
            (data[o + 3] as number) < 110 ||
            (data[o] as number) + (data[o + 1] as number) + (data[o + 2] as number) > 640
          )
            continue;
          const sx = left + x / scale;
          if (sx < min || sx > max) continue;
          found.push(sx - frame.width / 2, frame.height / 2 - sy);
          inks.push(data[o] as number, data[o + 1] as number, data[o + 2] as number, data[o + 3] as number);
        }
      }
      pools[group] = {
        points: Float32Array.from(found),
        inks: Uint8Array.from(inks),
        area: found.length / 2 / (scale * scale),
      };
    }),
  );
  return pools;
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

/**
 * A flat start for every point: where (x, y, and whether it shows in the
 * sketch) and in what colour. A drawing has far fewer pixels than its part of
 * the cloud has points, so only enough of them show to draw each line once; the
 * rest wait unseen.
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
    const { points: pool, inks, area } = pools[group] as Pool;
    const pixels = pool.length / 2;
    const share = Math.min(1, (area * 1.1) / Math.max(1, members.length));
    // Sorted so that the first pixel handed out is the top of a lift, or the left of the party.
    const ranked = rankPool(pool, group === GROUP.party);
    for (let rank = 0; rank < members.length; rank++) {
      const i = members[rank] as number;
      if (pixels === 0) {
        flat[i * 3] = (rnd() - 0.5) * width;
        flat[i * 3 + 1] = -height / 2;
        continue;
      }
      const pick = (ranked[Math.min(pixels - 1, Math.floor(((rank + rnd()) / members.length) * pixels))] as number) * 2;
      flat[i * 3] = (pool[pick] as number) + (rnd() - 0.5) * 0.7;
      flat[i * 3 + 1] = (pool[pick + 1] as number) + (rnd() - 0.5) * 0.7;
      flat[i * 3 + 2] = rnd() < share ? 1 : 0;
      ink.set(inks.subarray(pick * 2, pick * 2 + 4), i * 4);
    }
  });
  return { flat, ink };
}

function rankPool(pool: Float32Array, leftToRight: boolean): Uint32Array {
  const ranked = new Uint32Array(pool.length / 2);
  for (let i = 0; i < ranked.length; i++) ranked[i] = i;
  return leftToRight
    ? ranked.sort((a, b) => (pool[a * 2] as number) - (pool[b * 2] as number))
    : ranked.sort((a, b) => (pool[b * 2 + 1] as number) - (pool[a * 2 + 1] as number));
}
