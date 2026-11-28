/**
 * Runs the story: turns how far the guest has scrolled into a frame, and keeps
 * the page's own layers (the hero, the sky, the captions) in step with it.
 *
 * story.tsx decides whether there is a story at all. This gets it ready to
 * play first, and only then makes the page tall enough to hold it: a tall page
 * with nothing to play is screens of scrolling past a hero that does not move.
 *
 * At rest the hero's picture is its own pencil sketch, which moves: the party
 * dances, the chairs ride. As the story starts the dots take the drawing over,
 * laid on it pixel for pixel, and give it back when the guest returns to the top.
 */
import { pairFlat, pairingOrder, sampleSketch } from "./flat";
import { atTop, grow, isTall } from "./height";
import { createPlayer } from "./player";
import { createScene } from "./scene";
import { FILM_SECONDS, metresPerPixel, momentAt, towards } from "./timeline";
import { buildWorld } from "./world";

/** Fewer points on a phone: a smaller screen needs fewer, and has less to draw them with. */
const pointCount = () => (window.innerWidth < 820 ? 160_000 : 250_000);
/** Slower than this for this long, and the picture is drawn with fewer pixels. */
const SLOW_FRAME = 1 / 34;
const SLOW_FRAMES = 40;
/** How long the dots take to take the drawing over from the sketch as the story starts, and to give it back. */
const HANDOVER = 280;

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
 * showing.
 */
export async function mountStory(
  section: HTMLElement,
  context: WebGL2RenderingContext,
  signal: AbortSignal,
  since: number,
): Promise<void> {
  const stage = part(section, "stage");
  const canvas = part<HTMLCanvasElement>(section, "canvas");
  const hero = part(section, "hero");
  const dusk = part(section, "dusk");
  const night = part(section, "night");
  if (!stage || !canvas || !hero || !dusk || !night) return;

  await idle();
  if (signal.aborted) return;
  const world = buildWorld(pointCount());
  const scene = createScene(canvas, context, world);
  const order = pairingOrder(world);

  let width = stage.clientWidth;
  let height = stage.clientHeight;
  const place = async () => {
    const sketch = await sampleSketch(
      stage,
      order.map((members) => members.length),
    );
    if (signal.aborted) return;
    scene.setFlat(pairFlat(world, order, sketch, width, height), metresPerPixel(height, width / height));
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
  const player = createPlayer(section, stage, since, FILM_SECONDS);
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
  const shown = { night: false, caption: -1, hero: -1, dusk: -1, dark: -1 };
  const captions = stage.querySelectorAll('[data-story="caption"]');

  // How much of the drawing is the dots' (the rest is the sketch's own), on its way to `goal`.
  const inked = { value: 0, goal: 0, rate: 0 };
  /** The dots take the drawing over from the sketch. */
  const takeOver = () => {
    inked.goal = 1;
    inked.rate = 1000 / HANDOVER;
    stage.dataset.drawn = "";
  };
  /** Back to the sketch: over a moment, or at once when the page has changed size under the dots. */
  const handBack = (over = 0) => {
    inked.goal = 0;
    inked.rate = over ? 1000 / over : Infinity;
    still = false;
    delete stage.dataset.drawn;
  };
  canvas.style.opacity = "1";

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    // A frame can be stamped earlier than the clock run() read: then no time has passed, not less than none.
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    player.tick(dt);
    const travel = section.offsetHeight - height;
    const raw = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel));
    // Eased towards the scroll position, at the same rate whatever the screen's refresh.
    p += (raw - p) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(raw - p) < 0.0002) p = raw;

    const moment = momentAt(p, width / height);
    const moving = raw > 0 || p > 0;
    // The picture is the dots' only while the story is under way.
    if (moving !== (inked.goal === 1)) {
      if (moving) takeOver();
      else handBack(HANDOVER);
    }
    inked.value = towards(inked.value, inked.goal, inked.rate, dt);
    const ink = inked.value * inked.value * (3 - 2 * inked.value);
    // At rest on the hero the picture does not change: it is drawn the once, and left.
    const resting = !moving && inked.value === inked.goal;
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
    settle = window.setTimeout(() => void place(), 250);
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
