import { ScriptOnce, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

import { type Act, FRIDAY, captionsOf, filmSeconds } from "./acts";
import { atTop, isTall, keep, REGROW_SCRIPT, regrow, shrink } from "./height";

type Line = { eyebrow: string | readonly string[]; text: string; turn: string };

/** What Friday's pictures are called. One name is up at a time, with its picture. */
const PLACES: Record<(typeof FRIDAY)[number], string> = {
  beirut: "Beirut",
  jeita: "Jeita Grotto",
  harissa: "Harissa",
  byblos: "Byblos",
  batroun: "Batroun",
  vineyards: "The vineyards",
  cedars: "The Cedars of God",
};

/** The lines that come up as the story runs, by act. Their timing is in timeline.ts, in the same order. */
const LINES: Record<Act, readonly Line[]> = {
  friday: [
    { eyebrow: FRIDAY.map((name) => PLACES[name]), text: "Friday is yours.", turn: "A few places worth the drive." },
  ],
  mountain: [
    { eyebrow: "Saturday 17 July 2027", text: "In winter, a ski slope.", turn: "In July, a dance floor." },
    { eyebrow: "The mountain", text: "Warm days, cooler evenings.", turn: "Bring a jacket or a shawl." },
    { eyebrow: "The night", text: "And your dancing shoes.", turn: "We expect you on the dance floor all night long." },
    { eyebrow: "17 · 07 · 27", text: "The moon will be all but full.", turn: "Come and dance under it." },
  ],
};

/** Screens of scrolling to a second of story, on top of the one screen the hero is. */
const SCREENS_A_SECOND = 0.165;

/**
 * The hero, and the story it opens into.
 *
 * At rest this is the hero, and looks like nothing else: but once the story is
 * ready, the pencil sketch behind the names is drawn in dots, one to a pixel.
 * When the story starts those dots come apart and become the place itself, and
 * the page pins while the camera goes up the slope past the two lifts and down
 * to the dance floor at night. Then the page carries on.
 *
 * It is an extra, and the page is whole without it: it stays the plain hero for
 * anyone who asked for less motion or whose device has no graphics card to draw
 * it with. What draws it (controller.ts, and three.js behind it) is loaded after
 * the page, and the page only grows to hold it once it can play and the guest is
 * at the top; someone who has scrolled on meets it when they next come back up.
 * height.ts has why, and how a guest who leaves and returns lands where they were.
 *
 * Scrolling plays it by hand. It also plays itself, the first time by itself:
 * player.ts, which the buttons here belong to.
 *
 * `acts` are the parts of the story this guest gets (acts.ts), which sets how
 * long it is and which lines it has.
 */
export function Story({ acts, children }: { acts: readonly Act[]; children: ReactNode }) {
  const lines = captionsOf(acts).map(({ act, line }) => LINES[act][line] as Line);
  const length = `${Math.round((1 + filmSeconds(acts) * SCREENS_A_SECOND) * 100)}svh`;
  // The story is set up once, for the acts the page arrived with.
  const story = useRef(acts);
  const ref = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Before the router puts a returning guest back where they were. Child effects run first.
  useLayoutEffect(() => {
    if (ref.current) regrow(ref.current);
  }, []);

  const entry = useRouterState({ select: (state) => state.resolvedLocation?.state.__TSR_key });
  useEffect(() => {
    if (ref.current) keep(ref.current);
  }, [entry]);

  useEffect(() => {
    const section = ref.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const tall = isTall(section);
    if (reduced && !tall) return;

    const since = performance.now();
    const stop = new AbortController();
    const { signal } = stop;
    // A page left tall gets its story back wherever the guest is on it, a frame on, once the router has scrolled.
    const settled = tall ? new Promise((resolve) => requestAnimationFrame(resolve)) : atTop(signal);
    void settled
      .then(() => {
        if (signal.aborted) return;
        const context = reduced
          ? null
          : canvas.getContext("webgl2", {
              alpha: true,
              antialias: false,
              powerPreference: "high-performance",
              // Drawn in software this would crawl. Better no story than a slow one.
              failIfMajorPerformanceCaveat: true,
            });
        if (!context) return shrink(section);
        // For the couple to compare the two, until they choose: the page's address ending in #living keeps the sketch.
        const rest = window.location.hash === "#living" ? "sketch" : "dots";
        return import("./controller").then(({ mountStory }) =>
          mountStory(section, context, signal, since, story.current, rest),
        );
      })
      // A chunk that fails to load leaves the hero as it was, which is a whole page.
      .catch(() => {
        if (!signal.aborted) shrink(section);
      });
    return () => stop.abort();
  }, []);

  return (
    <div ref={ref} className="lulo-story" style={{ "--story-length": length } as React.CSSProperties}>
      <ScriptOnce>{REGROW_SCRIPT}</ScriptOnce>
      <div data-story="stage" className="lulo-story-stage">
        <div data-story="dusk" aria-hidden className="lulo-story-sky lulo-story-dusk" />
        <div data-story="night" aria-hidden className="lulo-story-sky lulo-story-night" />
        <div data-story="hero" className="relative">
          {children}
        </div>
        <canvas ref={canvasRef} data-story="canvas" aria-hidden />
        <div className="lulo-story-captions">
          {lines.map((line) => (
            <p
              key={line.text}
              data-story="caption"
              className="lulo-story-caption flex flex-col items-center gap-2 lg:gap-3"
            >
              <span className="lulo-story-eyebrow font-display text-xs leading-4 font-semibold tracking-caps uppercase lg:text-[13px]">
                {typeof line.eyebrow === "string"
                  ? line.eyebrow
                  : // One name to a picture, all in the one place; controller.ts shows the one that is up.
                    line.eyebrow.map((name) => (
                      <span key={name} data-story="place" className="lulo-story-place">
                        {name}
                      </span>
                    ))}
              </span>
              <span className="font-display text-[26px] leading-[32px] text-balance lg:text-[40px] lg:leading-[48px]">
                {line.text} <em className="lulo-story-turn block">{line.turn}</em>
              </span>
            </p>
          ))}
        </div>
        <div
          data-story="controls"
          className="lulo-story-controls font-display text-xs font-semibold tracking-[0.18em] lg:text-[13px]"
        >
          <button type="button" data-story="skip" className="lulo-story-skip">
            Skip
            <svg
              aria-hidden
              viewBox="0 0 10 12"
              className="h-[11px] w-[9px] fill-none stroke-current stroke-[1.6]"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 1v10M1 7l4 4 4-4" />
            </svg>
          </button>
          {/* One button for both: what it says and shows follows the film (`data-film` on the stage). */}
          <button type="button" data-story="toggle" className="lulo-story-toggle">
            <span className="lulo-story-says-play sr-only">Play the story</span>
            <span className="lulo-story-says-pause sr-only">Pause</span>
            <span aria-hidden className="lulo-story-first">
              Play the story
            </span>
            <span aria-hidden className="lulo-story-disc">
              {/* How far through the film is, drawn round the edge by player.ts. */}
              <svg viewBox="0 0 44 44" className="lulo-story-ring">
                <circle data-story="ring" cx="22" cy="22" r="21.25" pathLength="1" />
              </svg>
              <svg viewBox="0 0 12 12" className="lulo-story-icon lulo-story-icon-play">
                <path d="M2.6 1.2l8 4.8-8 4.8z" />
              </svg>
              <svg viewBox="0 0 12 12" className="lulo-story-icon lulo-story-icon-pause">
                <path d="M2.2 1.2h2.7v9.6H2.2zM7.1 1.2h2.7v9.6H7.1z" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
