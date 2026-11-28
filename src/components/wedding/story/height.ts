/**
 * The story makes the page some six screens taller, and only where and when it
 * can play. The router, though, puts a returning guest back where they were by
 * counting pixels from the top. A page that was tall when they left has to be
 * tall again before that count is used, or they land six screens too far down.
 *
 * So each entry in the browser's history remembers whether its page was left
 * tall, and a page is made tall in only two ways: `grow`, under a guest at the
 * top of it, where nothing they can see moves; and `regrow`, for an entry that
 * was left that way.
 */

const REMEMBERED = "lulo-story-tall:";

/** The router's own name for the history entry on show, which is what it files scroll positions under. */
function entry(): string | null {
  const key: unknown = window.history.state?.__TSR_key;
  return typeof key === "string" ? REMEMBERED + key : null;
}

function remember(tall: boolean) {
  const key = entry();
  if (!key) return;
  try {
    if (tall) window.sessionStorage.setItem(key, "1");
    else window.sessionStorage.removeItem(key);
  } catch {
    // No storage, as in a private window: the router has none either, and puts nobody back.
  }
}

function remembered(): boolean {
  const key = entry();
  if (!key) return false;
  try {
    return window.sessionStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export const isTall = (section: HTMLElement) => section.hasAttribute("data-active");

/** Makes room for the story under the hero. */
export function grow(section: HTMLElement) {
  section.dataset.active = "";
  remember(true);
}

/** Takes the room away again, keeping whatever the guest is reading where it is. */
export function shrink(section: HTMLElement) {
  // Read first: some browsers move the scroll themselves as the page shortens, and some do not.
  const from = window.scrollY;
  const before = section.offsetHeight;
  delete section.dataset.active;
  remember(false);
  const lost = before - section.offsetHeight;
  if (lost > 0 && from > 0) window.scrollTo(0, Math.max(0, from - lost));
}

/** Makes the page as tall as this entry left it. To run before the router scrolls. */
export function regrow(section: HTMLElement) {
  if (remembered()) section.dataset.active = "";
}

/** A tall page that has moved to a new entry, as a link to a section does, is remembered under that one too. */
export function keep(section: HTMLElement) {
  if (isTall(section)) remember(true);
}

/**
 * `regrow` for a page that arrives as HTML, on a reload: the router scrolls that
 * with a script of its own before any of this has loaded, so this has to be a
 * script too, and come first. It runs inside the story's element.
 */
export const REGROW_SCRIPT = `(function(s){try{var k=history.state&&history.state.__TSR_key;typeof k=="string"&&sessionStorage.getItem(${JSON.stringify(REMEMBERED)}+k)!==null&&s.parentElement.setAttribute("data-active","")}catch(e){}})(document.currentScript)`;

/** Settles once the guest is at the top of the page, now or when they next come back to it, or `signal` aborts. */
export function atTop(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (window.scrollY > 4 && !signal.aborted) return;
      window.removeEventListener("scroll", check);
      signal.removeEventListener("abort", check);
      resolve();
    };
    window.addEventListener("scroll", check, { passive: true });
    signal.addEventListener("abort", check);
    check();
  });
}
