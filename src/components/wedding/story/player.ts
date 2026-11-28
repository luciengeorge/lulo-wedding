/**
 * Plays the story by itself, as a film.
 *
 * It does so by scrolling the page at a film's pace. The scroll stays the one
 * clock that everything else follows (controller.ts, the jump bar, where a
 * guest is put back on return), and a guest can take over by hand at any
 * moment: whatever they do to the page stops it, and Play picks it up again
 * from where they are.
 *
 * The first time a browser shows the story it starts on its own, once the hero
 * has had its moment. After that it waits to be asked.
 */

/** How long the hero is left alone before the first showing starts, from when the page showed it. */
const HERO_HOLD = 5000;
/** The hero's own entrance is nearly over by now, and the buttons can join it. */
const HERO_ENTRANCE = 2600;
/** At least this long after the story is ready to play, however late that was. */
const SETTLE = 1200;
/** The page is somewhere other than where the film last put it: someone else is scrolling. */
const DRIFT = 3;
const SEEN = "lulo-story-seen";
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/** Where the film is: not begun, running, stopped part way, or over. Drives which controls show. */
export type Film = "rest" | "playing" | "paused" | "end";

export type Player = {
  /** Once a frame, with the seconds since the last one. */
  tick(dt: number): void;
  /** Starts the first showing by itself, unless this browser has seen it. */
  premiere(): void;
  dispose(): void;
};

function seen(): boolean {
  try {
    return window.localStorage.getItem(SEEN) !== null;
  } catch {
    // No storage to remember in: every visit is a first one.
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(SEEN, "1");
  } catch {
    // As above.
  }
}

/**
 * `section` is the tall block the story scrolls through and `stage` the screen
 * pinned inside it. The controls are the stage's own, marked `data-story`:
 * `"toggle"` plays and pauses, `"skip"` skips, and `"ring"` is the circle that
 * shows how far through the film is. `since` is when the page showed the hero,
 * and `seconds` how long this guest's story runs.
 */
export function createPlayer(section: HTMLElement, stage: HTMLElement, since: number, seconds: number): Player {
  const controls = stage.querySelector<HTMLElement>('[data-story="controls"]');
  const waited = () => performance.now() - since;
  controls?.style.setProperty("--story-controls-in", `${Math.max(0, HERO_ENTRANCE - waited())}ms`);
  const toggleButton = controls?.querySelector<HTMLButtonElement>('[data-story="toggle"]') ?? null;
  const skipButton = controls?.querySelector<HTMLButtonElement>('[data-story="skip"]') ?? null;
  const ring = controls?.querySelector<SVGElement>('[data-story="ring"]') ?? null;

  let playing = false;
  /** How far through the story the film is, 0 to 1, and where on the page it last scrolled to. */
  let at = 0;
  let sent = 0;
  let opening = 0;
  let film: Film | null = null;
  let ringed = -1;

  const top = () => section.getBoundingClientRect().top + window.scrollY;
  const travel = () => Math.max(1, section.offsetHeight - stage.offsetHeight);
  const here = () => Math.min(1, Math.max(0, (window.scrollY - top()) / travel()));

  const show = () => {
    const progress = here();
    const next: Film = playing ? "playing" : progress <= 0.0005 ? "rest" : progress >= 0.9995 ? "end" : "paused";
    if (next !== film) stage.dataset.film = film = next;
    // The ring's length is 1 (`pathLength`), so what is left of it to draw is what is left of the film.
    // A hair more than that, or the rounding leaves a speck of it showing before the film has begun.
    if (ring && Math.abs(progress - ringed) > 0.0005) ring.style.strokeDashoffset = String(1.002 - (ringed = progress));
  };

  const play = () => {
    window.clearTimeout(opening);
    at = here();
    if (at >= 1) return;
    sent = window.scrollY;
    playing = true;
    remember();
    show();
  };

  const pause = () => {
    window.clearTimeout(opening);
    playing = false;
    show();
  };

  /** Past the story, to whatever the page has after it. */
  const skip = () => {
    pause();
    remember();
    window.scrollTo({ top: top() + section.offsetHeight, behavior: "smooth" });
  };

  // Anything a guest does to the page is them taking over. Pressing the film's own buttons is not that.
  const taken = (event: Event) => {
    const own = event.target instanceof Node && controls?.contains(event.target);
    if (event instanceof KeyboardEvent) {
      // Space scrolls a page, except on a button, which it presses.
      if (!SCROLL_KEYS.has(event.key) || (own && event.key === " ")) return;
    } else if (own && event.type !== "wheel") return;
    pause();
  };
  const TAKEOVERS = ["wheel", "touchstart", "pointerdown", "click", "keydown"] as const;
  for (const type of TAKEOVERS) window.addEventListener(type, taken, { capture: true, passive: true });

  const toggle = () => (playing ? pause() : play());
  toggleButton?.addEventListener("click", toggle);
  skipButton?.addEventListener("click", skip);
  show();

  return {
    tick(dt) {
      if (playing) {
        if (Math.abs(window.scrollY - sent) > DRIFT) {
          pause();
          return;
        }
        at = Math.min(1, at + dt / seconds);
        sent = top() + travel() * at;
        window.scrollTo(0, sent);
        if (at >= 1) playing = false;
      }
      show();
    },
    premiere() {
      if (seen()) return;
      const wait = Math.max(SETTLE, HERO_HOLD - waited());
      opening = window.setTimeout(() => {
        // Opened in a tab nobody is looking at, or scrolled on already: it waits to be asked.
        if (!document.hidden && window.scrollY <= 4) play();
      }, wait);
    },
    dispose() {
      window.clearTimeout(opening);
      playing = false;
      for (const type of TAKEOVERS) window.removeEventListener(type, taken, { capture: true });
      toggleButton?.removeEventListener("click", toggle);
      skipButton?.removeEventListener("click", skip);
      delete stage.dataset.film;
    },
  };
}
