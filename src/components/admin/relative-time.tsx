import { useSyncExternalStore } from "react";

import { formatAbsolute, formatRelative } from "@/lib/relative-time";

/**
 * One shared minute clock, so a table of 400 "3 days ago" cells keeps moving on
 * a single timer instead of one per row, and stops when nothing is showing.
 */
let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 60_000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getNow = () => now;

export function useNow(): number {
  return useSyncExternalStore(subscribe, getNow, getNow);
}

/** "3 days ago", with the exact date and time on hover. */
export function RelativeTime({ at, className }: { at: number; className?: string }) {
  const current = useNow();
  const exact = formatAbsolute(at);
  return (
    <time dateTime={new Date(at).toISOString()} title={exact} className={className}>
      {formatRelative(at, current)}
    </time>
  );
}
