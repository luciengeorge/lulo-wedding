import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { atTop, grow, isTall, keep, REGROW_SCRIPT, regrow, shrink } from "./height";

const TALL = 6080;
const SHORT = 736;

/** The story's element, as tall as its page would make it. */
function story() {
  const element = document.createElement("div");
  Object.defineProperty(element, "offsetHeight", { get: () => (isTall(element) ? TALL : SHORT) });
  return element;
}

/** Moves to another entry in the browser's history, the way the router names them. */
function enter(key: string) {
  window.history.replaceState({ __TSR_key: key }, "");
}

function scrolledTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

let scrollTo: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.sessionStorage.clear();
  enter("first");
  scrolledTo(0);
  scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a page the story made tall", () => {
  it("is tall again for the entry it was left on, and for no other", () => {
    grow(story());

    enter("second");
    const elsewhere = story();
    regrow(elsewhere);
    expect(isTall(elsewhere)).toBe(false);

    enter("first");
    const back = story();
    regrow(back);
    expect(isTall(back)).toBe(true);
  });

  it("is remembered under a new entry it moves to, as a link to a section makes", () => {
    const page = story();
    grow(page);
    enter("second");
    keep(page);

    const back = story();
    regrow(back);
    expect(isTall(back)).toBe(true);
  });

  it("is made tall by the script too, for a page that arrives as HTML", () => {
    grow(story());
    const arrived = document.createElement("div");
    const script = arrived.appendChild(document.createElement("script"));
    Object.defineProperty(document, "currentScript", { value: script, configurable: true });

    window.eval(REGROW_SCRIPT);

    expect(isTall(arrived)).toBe(true);
  });

  it("is left alone by the script on an entry that was never tall", () => {
    const arrived = document.createElement("div");
    const script = arrived.appendChild(document.createElement("script"));
    Object.defineProperty(document, "currentScript", { value: script, configurable: true });

    window.eval(REGROW_SCRIPT);

    expect(isTall(arrived)).toBe(false);
  });
});

describe("taking the room away again", () => {
  it("keeps a guest who was past the story on what they were reading", () => {
    const page = story();
    grow(page);
    scrolledTo(7339);

    shrink(page);

    expect(isTall(page)).toBe(false);
    expect(scrollTo).toHaveBeenCalledWith(0, 7339 - (TALL - SHORT));
  });

  it("puts a guest who was inside the story at the top", () => {
    const page = story();
    grow(page);
    scrolledTo(2400);

    shrink(page);

    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("forgets the entry, so it comes back short", () => {
    const page = story();
    grow(page);
    shrink(page);

    const back = story();
    regrow(back);
    expect(isTall(back)).toBe(false);
  });

  it("moves nothing on a page that never grew", () => {
    scrolledTo(900);

    shrink(story());

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe("waiting for the top of the page", () => {
  it("is over at once for a guest already there", async () => {
    await expect(atTop(new AbortController().signal)).resolves.toBeUndefined();
  });

  it("lasts until a guest who has scrolled on comes back up", async () => {
    scrolledTo(500);
    let there = false;
    void atTop(new AbortController().signal).then(() => (there = true));

    scrolledTo(200);
    window.dispatchEvent(new Event("scroll"));
    await Promise.resolve();
    expect(there).toBe(false);

    scrolledTo(0);
    window.dispatchEvent(new Event("scroll"));
    await Promise.resolve();
    expect(there).toBe(true);
  });

  it("ends when the story is called off", async () => {
    scrolledTo(500);
    const stop = new AbortController();
    const waiting = atTop(stop.signal);

    stop.abort();

    await expect(waiting).resolves.toBeUndefined();
  });
});
