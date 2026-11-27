import { ScriptOnce, useRouterState } from "@tanstack/react-router";
import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";

import { atTop, isTall, keep, REGROW_SCRIPT, regrow, shrink } from "./height";

/** The lines that come up as the guest scrolls. Their timing is CAPTIONS in timeline.ts, in the same order. */
const LINES = [
  { eyebrow: "Saturday 17 July 2027", text: "In winter, a ski slope.", turn: "In July, a dance floor." },
  { eyebrow: "The mountain", text: "Warm days, cooler evenings.", turn: "Bring a jacket or a shawl." },
  { eyebrow: "The night", text: "And your dancing shoes.", turn: "We expect you on the dance floor all night long." },
  { eyebrow: "17 · 07 · 27", text: "The moon will be all but full.", turn: "Come and dance under it." },
] as const;

/**
 * The hero, and the story it opens into.
 *
 * At rest this is the hero and nothing else. As the guest scrolls, the pencil
 * sketch behind the names comes apart into dots, the dots become the place
 * itself, and the page pins while the camera goes up the slope past the two
 * lifts and down to the dance floor at night. Then the page carries on.
 *
 * It is an extra, and the page is whole without it: it stays the plain hero for
 * anyone who asked for less motion or whose device has no graphics card to draw
 * it with. What draws it (controller.ts, and three.js behind it) is loaded after
 * the page, and the page only grows to hold it once it can play and the guest is
 * at the top; someone who has scrolled on meets it when they next come back up.
 * height.ts has why, and how a guest who leaves and returns lands where they were.
 */
export function Story({ children }: { children: ReactNode }) {
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
        return import("./controller").then(({ mountStory }) => mountStory(section, context, signal));
      })
      // A chunk that fails to load leaves the hero as it was, which is a whole page.
      .catch(() => {
        if (!signal.aborted) shrink(section);
      });
    return () => stop.abort();
  }, []);

  return (
    <div ref={ref} className="lulo-story">
      <ScriptOnce>{REGROW_SCRIPT}</ScriptOnce>
      <div data-story="stage" className="lulo-story-stage">
        <div data-story="dusk" aria-hidden className="lulo-story-sky lulo-story-dusk" />
        <div data-story="night" aria-hidden className="lulo-story-sky lulo-story-night" />
        <div data-story="hero" className="relative">
          {children}
        </div>
        <canvas ref={canvasRef} data-story="canvas" aria-hidden />
        <div className="lulo-story-captions">
          {LINES.map((line) => (
            <p
              key={line.eyebrow}
              data-story="caption"
              className="lulo-story-caption flex flex-col items-center gap-2 lg:gap-3"
            >
              <span className="lulo-story-eyebrow font-display text-xs leading-4 font-semibold tracking-caps uppercase lg:text-[13px]">
                {line.eyebrow}
              </span>
              <span className="font-display text-[26px] leading-[32px] text-balance lg:text-[40px] lg:leading-[48px]">
                {line.text} <em className="lulo-story-turn block">{line.turn}</em>
              </span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
