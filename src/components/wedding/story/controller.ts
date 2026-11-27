/**
 * Runs the story: turns how far the guest has scrolled into a frame, and keeps
 * the page's own layers (the hero, the sky, the captions) in step with it.
 *
 * story.tsx decides whether there is a story at all. This gets it ready to
 * play first, and only then makes the page tall enough to hold it: a tall page
 * with nothing to play is screens of scrolling past a hero that does not move.
 *
 * From then on the dots are the hero's drawing too. The pencil sketch is what a
 * guest sees until the story is ready, and what one whose device cannot play it
 * goes on seeing; here it is redrawn in dots, so that the story starts from the
 * picture already on the page rather than swapping one for another.
 */
import type { Act } from "./acts";

import { pairFlat, pairPicture, pairingOrder, pictureOrder, samplePicture, sampleSketch } from "./flat";
import { atTop, grow, isTall } from "./height";
import { createPlayer } from "./player";
import { createScene } from "./scene";
import { film, metresPerPixel } from "./timeline";
import { buildWorld } from "./world";

/** Fewer points on a phone: a smaller screen needs fewer, and has less to draw them with. */
const pointCount = () => (window.innerWidth < 820 ? 100_000 : 150_000);
/** Slower than this for this long, and the picture is drawn with fewer pixels. */
const SLOW_FRAME = 1 / 34;
const SLOW_FRAMES = 40;
/** When the hero's own sketch starts to show, and how long it takes: `.lulo-scene` in styles.css. */
const SKETCH_AT = 1700;
const SKETCH_IN = 1400;
/** How long the dots take to replace a sketch that is already showing. Matches `[data-drawn]` in styles.css. */
const TAKEOVER = 700;

const idle = () =>
  new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 400);
  });

function part<T extends HTMLElement>(root: HTMLElement, name: string) {
  return root.querySelector<T>(`[data-story="${name}"]`);
}

/**
 * Starts the story in `section`. Aborting `signal` stops it and leaves the hero
 * as it was. `since` is when the page showed the hero, for the film's first
 * showing, and `acts` are the ones this guest's story has.
 */
export async function mountStory(
  section: HTMLElement,
  context: WebGL2RenderingContext,
  signal: AbortSignal,
  since: number,
  acts: readonly Act[],
): Promise<void> {
  const stage = part(section, "stage");
  const canvas = part<HTMLCanvasElement>(section, "canvas");
  const hero = part(section, "hero");
  const dusk = part(section, "dusk");
  const night = part(section, "night");
  if (!stage || !canvas || !hero || !dusk || !night) return;

  await idle();
  if (signal.aborted) return;
  const story = film(acts);
  const world = buildWorld(pointCount());
  const scene = createScene(canvas, context, world);
  const order = pairingOrder(world);
  const across = pictureOrder(world);

  let width = stage.clientWidth;
  let height = stage.clientHeight;
  const place = async () => {
    const sketch = await sampleSketch(
      stage,
      order.map((members) => members.length),
    );
    const pictures = [pairFlat(world, order, sketch, width, height)];
    // One at a time, with a breath between: read all at once they would hold the page up.
    for (const name of story.pictures.slice(1)) {
      await new Promise((resolve) => setTimeout(resolve));
      if (signal.aborted) return;
      pictures.push(pairPicture(world, across, await samplePicture(stage, name as string, world.count)));
    }
    if (signal.aborted) return;
    scene.setPictures(pictures, metresPerPixel(height, width / height));
  };
  scene.resize(width, height);
  await place();
  // Growing the page under someone part way down it would move what they are reading.
  const untouched = !isTall(section) && window.scrollY <= 4;
  if (!signal.aborted && !isTall(section)) await atTop(signal);
  if (signal.aborted) {
    scene.dispose();
    return;
  }
  grow(section);
  const player = createPlayer(section, stage, since, story.seconds);
  // Only for a guest who has not moved since the page opened. One who has is finding their own way.
  if (untouched) player.premiere();

  const started = performance.now();
  let last = started;
  let p = 0;
  let frame = 0;
  let onScreen = true;
  let slow = 0;
  let canEase = true;
  let still = false;
  const shown = { night: false, caption: -1, place: -1, hero: -1, dusk: -1, dark: -1 };
  const captions = stage.querySelectorAll('[data-story="caption"]');
  const places = stage.querySelectorAll('[data-story="place"]');

  // The dots take the drawing over from the sketch: in its place if it has not shown yet, across it if it has.
  let inkFrom = Infinity;
  let inkOver = TAKEOVER;
  const takeOver = () => {
    const now = performance.now();
    const sketch = since + SKETCH_AT;
    inkFrom = Math.max(now, sketch);
    inkOver = now < sketch ? SKETCH_IN : TAKEOVER;
    stage.dataset.drawn = "";
  };
  /** Back to the sketch, which follows the page as it changes size. The dots do not until they are read again. */
  const handBack = () => {
    inkFrom = Infinity;
    still = false;
    delete stage.dataset.drawn;
  };
  takeOver();
  canvas.style.opacity = "1";

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    player.tick(dt);
    const travel = section.offsetHeight - height;
    const raw = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel));
    // Eased towards the scroll position, at the same rate whatever the screen's refresh.
    p += (raw - p) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(raw - p) < 0.0002) p = raw;

    const moment = story.at(p, width / height);
    const taken = Math.min(1, Math.max(0, (now - inkFrom) / inkOver));
    const ink = Math.max(taken * taken * (3 - 2 * taken), moment.swap);
    // At rest on the hero the picture does not change: it is drawn the once, and left.
    const resting = raw === 0 && p === 0 && taken === 1;
    if (!resting || !still) {
      still = resting;
      scene.render(moment, (now - started) / 1000, ink);
      slow = canEase && p > 0 && dt > SLOW_FRAME ? slow + 1 : 0;
      if (slow > SLOW_FRAMES) {
        slow = 0;
        canEase = scene.ease();
      }
    }

    if (moment.swap !== shown.hero) {
      shown.hero = moment.swap;
      hero.style.opacity = String(1 - moment.swap);
      hero.style.visibility = moment.swap >= 1 ? "hidden" : "";
    }
    const duskNow = Math.min(1, moment.night * 2.2);
    const darkNow = Math.min(1, Math.max(0, (moment.night - 0.3) / 0.7));
    if (duskNow !== shown.dusk) dusk.style.opacity = String((shown.dusk = duskNow));
    if (darkNow !== shown.dark) night.style.opacity = String((shown.dark = darkNow));
    const isNight = moment.night > 0.5;
    if (isNight !== shown.night) {
      shown.night = isNight;
      stage.toggleAttribute("data-night", isNight);
    }
    if (moment.caption !== shown.caption) {
      shown.caption = moment.caption;
      captions.forEach((caption, index) => caption.toggleAttribute("data-on", index === moment.caption));
    }
    if (moment.place !== shown.place) {
      shown.place = moment.place;
      // The hero's sketch is the first picture and has no name, so the names start one on.
      places.forEach((name, index) => name.toggleAttribute("data-on", index + 1 === moment.place));
    }
  };

  const run = () => {
    cancelAnimationFrame(frame);
    if (!onScreen || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(draw);
  };

  const seen = new IntersectionObserver(([entry]) => {
    onScreen = entry?.isIntersecting ?? true;
    run();
  });
  seen.observe(section);
  document.addEventListener("visibilitychange", run);

  let settle = 0;
  const sized = new ResizeObserver(() => {
    if (stage.clientWidth === width && stage.clientHeight === height) return;
    width = stage.clientWidth;
    height = stage.clientHeight;
    scene.resize(width, height);
    // The sketch has moved with the page; read it again once the resizing stops.
    handBack();
    clearTimeout(settle);
    settle = window.setTimeout(async () => {
      await place();
      if (!signal.aborted) takeOver();
    }, 250);
  });
  sized.observe(stage);
  run();

  signal.addEventListener("abort", () => {
    cancelAnimationFrame(frame);
    clearTimeout(settle);
    seen.disconnect();
    sized.disconnect();
    document.removeEventListener("visibilitychange", run);
    player.dispose();
    scene.dispose();
    hero.style.opacity = "";
    hero.style.visibility = "";
    handBack();
    canvas.style.opacity = "0";
  });
}
