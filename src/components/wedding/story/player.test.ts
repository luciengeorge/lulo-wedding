import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPlayer, type Player } from "./player";

const FILM_SECONDS = 40;

const SCREEN = 800;
const STORY = SCREEN * 7.6;
/** The story's own scroll: from its top to where its stage stops being pinned. */
const TRAVEL = STORY - SCREEN;

let section: HTMLElement;
let stage: HTMLElement;
let player: Player;
let scrollY = 0;

function height(element: HTMLElement, value: number) {
  Object.defineProperty(element, "offsetHeight", { value, configurable: true });
}

/** The page as the browser would have it: a story at the top of the document, scrolled to `scrollY`. */
function page() {
  document.body.innerHTML = `
    <div class="story">
      <div data-story="stage">
        <div data-story="controls">
          <button data-story="skip">Skip</button>
          <button data-story="toggle"><svg><circle data-story="ring" /></svg></button>
        </div>
      </div>
    </div>
    <a href="#travel" id="link">Travel</a>`;
  section = document.querySelector<HTMLElement>(".story") as HTMLElement;
  stage = section.querySelector<HTMLElement>('[data-story="stage"]') as HTMLElement;
  height(section, STORY);
  height(stage, SCREEN);
  section.getBoundingClientRect = () => ({ top: -scrollY }) as DOMRect;
}

const button = (name: string) => stage.querySelector<HTMLButtonElement>(`[data-story="${name}"]`) as HTMLButtonElement;
const film = () => stage.dataset.film;
/** A second of film, a frame at a time. */
function run(seconds: number) {
  for (let frame = 0; frame < seconds * 60; frame++) player.tick(1 / 60);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  scrollY = 0;
  Object.defineProperty(window, "scrollY", { get: () => scrollY, configurable: true });
  vi.spyOn(window, "scrollTo").mockImplementation(((x: number | ScrollToOptions, y?: number) => {
    scrollY = typeof x === "number" ? (y as number) : (x.top as number);
  }) as typeof window.scrollTo);
  page();
  player = createPlayer(section, stage, performance.now(), FILM_SECONDS);
});

afterEach(() => {
  player.dispose();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the film", () => {
  it("waits on the hero until it is asked", () => {
    run(3);

    expect(film()).toBe("rest");
    expect(scrollY).toBe(0);
  });

  it("plays the whole story in its running time, and stops on the last frame", () => {
    button("toggle").click();
    run(FILM_SECONDS / 2);
    expect(film()).toBe("playing");
    expect(scrollY).toBeCloseTo(TRAVEL / 2, 0);

    run(FILM_SECONDS / 2 + 1);
    expect(film()).toBe("end");
    expect(scrollY).toBeCloseTo(TRAVEL, 0);
  });

  it("pauses where it is, and picks up from there", () => {
    button("toggle").click();
    run(10);
    button("toggle").click();
    const paused = scrollY;
    run(5);
    expect(film()).toBe("paused");
    expect(scrollY).toBe(paused);

    button("toggle").click();
    run(10);
    expect(scrollY).toBeCloseTo(TRAVEL / 2, 0);
  });

  it("draws how far it has got round its button", () => {
    const ring = stage.querySelector<SVGElement>('[data-story="ring"]') as SVGElement;
    button("toggle").click();
    run(FILM_SECONDS / 4);

    expect(Number(ring.style.strokeDashoffset)).toBeCloseTo(0.75, 1);
  });

  it("skips past the story to what comes after it", () => {
    button("toggle").click();
    run(5);
    button("skip").click();

    expect(scrollY).toBe(STORY);
    run(1);
    expect(film()).toBe("end");
  });
});

describe("a guest taking over", () => {
  beforeEach(() => {
    button("toggle").click();
    run(5);
  });

  it.each(["wheel", "touchstart", "pointerdown"])("stops it with a %s on the page", (type) => {
    document.body.dispatchEvent(new Event(type, { bubbles: true }));
    const left = scrollY;
    run(2);

    expect(film()).toBe("paused");
    expect(scrollY).toBe(left);
  });

  it("stops it by following a link, which then scrolls the page itself", () => {
    (document.getElementById("link") as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    run(1);

    expect(film()).toBe("paused");
  });

  it("stops it with a key that scrolls, and not with one that does not", () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    run(1);
    expect(film()).toBe("playing");

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    run(1);
    expect(film()).toBe("paused");
  });

  it("stops it by moving the page some other way, as dragging the scroll bar does", () => {
    scrollY += 400;
    run(1);

    expect(film()).toBe("paused");
    expect(scrollY).toBeCloseTo((TRAVEL * 5) / FILM_SECONDS + 400, 0);
  });

  it("is not stopped by its own buttons being pressed", () => {
    button("skip").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    button("skip").dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    run(1);

    expect(film()).toBe("playing");
  });

  it("is stopped by a scroll that starts on its buttons", () => {
    button("skip").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    run(1);
    expect(film()).toBe("paused");

    button("toggle").click();
    button("toggle").dispatchEvent(new Event("wheel", { bubbles: true }));
    run(1);
    expect(film()).toBe("paused");
  });
});

describe("the first showing", () => {
  it("starts by itself once the hero has had its moment", () => {
    player.premiere();
    vi.advanceTimersByTime(4000);
    run(1);
    expect(film()).toBe("rest");

    vi.advanceTimersByTime(1500);
    run(1);
    expect(film()).toBe("playing");
  });

  it("happens once: a browser that has seen it is not shown it again unasked", () => {
    player.premiere();
    vi.advanceTimersByTime(6000);
    player.dispose();

    scrollY = 0;
    page();
    player = createPlayer(section, stage, performance.now(), FILM_SECONDS);
    player.premiere();
    vi.advanceTimersByTime(10_000);
    run(1);

    expect(film()).toBe("rest");
  });

  it("is called off by a guest who moves first", () => {
    player.premiere();
    vi.advanceTimersByTime(2000);
    document.body.dispatchEvent(new Event("wheel", { bubbles: true }));
    vi.advanceTimersByTime(10_000);
    run(1);

    expect(film()).toBe("rest");
    expect(window.localStorage.length).toBe(0);
  });

  it("does not start under a guest who has already scrolled on", () => {
    player.premiere();
    scrollY = 300;
    vi.advanceTimersByTime(6000);
    run(1);

    expect(film()).toBe("paused");
  });
});
