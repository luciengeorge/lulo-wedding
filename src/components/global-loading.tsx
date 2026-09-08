import { useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useSpinDelay } from "spin-delay";

import { cn } from "@/lib/utils";

const START = 8;
const TRICKLE_CAP = 90;
const TRICKLE_MS = 300;
const FADE_MS = 400;

/**
 * `idle` is not rendered at all; `done` is the completed bar fading out, which
 * outlives the navigation it belongs to.
 */
type Phase = "idle" | "loading" | "done";

export function GlobalLoading() {
  const busy = useRouterState({
    select: (state) => state.isLoading || state.status === "pending",
  });
  const pending = useSpinDelay(busy, { delay: 200, minDuration: 500 });

  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  // Seeded false rather than from `pending`, so a navigation already in flight on
  // first render still counts as an edge and shows the bar.
  const [wasPending, setWasPending] = useState(false);

  // Adjusting state during render rather than inside the effect: React re-runs
  // this component immediately with the new phase, so the bar never paints a
  // frame of the previous navigation. Same pattern as useRowWindow in the admin
  // table, and it keeps the effects to what genuinely needs them, the timers.
  if (wasPending !== pending) {
    setWasPending(pending);
    if (pending) {
      setPhase("loading");
      setProgress(START);
    } else if (phase === "loading") {
      setPhase("done");
      setProgress(100);
    }
  }

  useEffect(() => {
    if (phase !== "loading") return;

    const trickle = window.setInterval(() => {
      setProgress((p) => {
        if (p >= TRICKLE_CAP) return p;
        const step = Math.max(0.6, (TRICKLE_CAP - p) * 0.12);
        return Math.min(TRICKLE_CAP, p + step);
      });
    }, TRICKLE_MS);

    return () => window.clearInterval(trickle);
  }, [phase]);

  useEffect(() => {
    if (phase !== "done") return;

    const hide = window.setTimeout(() => {
      setPhase("idle");
      setProgress(0);
    }, FADE_MS);

    return () => window.clearTimeout(hide);
  }, [phase]);

  const visible = phase !== "idle";

  return (
    <div
      role="progressbar"
      aria-hidden={visible ? undefined : true}
      aria-label="Page loading"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={visible ? Math.round(progress) : undefined}
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 transition-opacity duration-300 ease-out",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className="h-full bg-primary transition-[width] duration-300 ease-linear"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
