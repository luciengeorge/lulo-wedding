/**
 * Runs the story: turns how far the guest has scrolled into a frame, and keeps
 * the page's own layers (the hero, the sky, the captions) in step with it.
 *
 * story.tsx decides whether there is a story at all. By the time this loads,
 * the page is already tall and the hero pinned; until this is ready, scrolling
 * simply holds the hero where it is.
 */
import { pairFlat, pairingOrder, sampleSketch } from "./flat";
import { createScene } from "./scene";
import { metresPerPixel, momentAt } from "./timeline";
import { buildWorld } from "./world";

/** Fewer points on a phone: a smaller screen needs fewer, and has less to draw them with. */
const pointCount = () => (window.innerWidth < 820 ? 100_000 : 150_000);
/** Slower than this for this long, and the picture is drawn with fewer pixels. */
const SLOW_FRAME = 1 / 34;
const SLOW_FRAMES = 40;

const idle = () =>
  new Promise<void>((resolve) => {
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => resolve(), { timeout: 1500 });
    else setTimeout(resolve, 400);
  });

function part<T extends HTMLElement>(root: HTMLElement, name: string) {
  return root.querySelector<T>(`[data-story="${name}"]`);
}

/** Starts the story in `section`. Aborting `signal` stops it and leaves the hero as it was. */
export async function mountStory(
  section: HTMLElement,
  context: WebGL2RenderingContext,
  signal: AbortSignal,
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
    const pools = await sampleSketch(stage);
    if (signal.aborted) return;
    scene.setFlat(pairFlat(world, order, pools, width, height), metresPerPixel(height, width / height));
  };
  scene.resize(width, height);
  await place();
  if (signal.aborted) {
    scene.dispose();
    return;
  }

  const started = performance.now();
  let last = started;
  let p = 0;
  let frame = 0;
  let onScreen = true;
  let slow = 0;
  let canEase = true;
  const shown = { canvas: false, night: false, caption: -1, hero: -1, dusk: -1, dark: -1 };

  const draw = (now: number) => {
    frame = requestAnimationFrame(draw);
    const travel = section.offsetHeight - height;
    const raw = Math.min(1, Math.max(0, -section.getBoundingClientRect().top / travel));
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // Eased towards the scroll position, at the same rate whatever the screen's refresh.
    p += (raw - p) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(raw - p) < 0.0002) p = raw;

    const moment = momentAt(p, width / height);
    // At rest on the first screen the pencil sketch is the picture, and nothing is drawn here.
    const drawing = p > 0;
    if (drawing !== shown.canvas) {
      shown.canvas = drawing;
      canvas.style.opacity = drawing ? "1" : "0";
    }
    if (drawing) {
      scene.render(moment, (now - started) / 1000);
      slow = canEase && dt > SLOW_FRAME ? slow + 1 : 0;
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
      stage.querySelectorAll('[data-story="caption"]').forEach((caption, index) => {
        caption.toggleAttribute("data-on", index === moment.caption);
      });
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
    scene.dispose();
    hero.style.opacity = "";
    hero.style.visibility = "";
    canvas.style.opacity = "0";
  });
}
