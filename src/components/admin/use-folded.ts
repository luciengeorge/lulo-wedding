import { useSyncExternalStore } from "react";

/**
 * Which groups are folded away, remembered per browser. Storage can be missing or
 * throw (a private window, blocked site data), so every read and write is guarded
 * and the folds then last as long as the tab.
 */
const listeners = new Set<() => void>();
const memory = new Map<string, string>();
let storageWorks = true;

function read(key: string): string {
  if (storageWorks) {
    try {
      return window.localStorage.getItem(key) ?? "[]";
    } catch {
      storageWorks = false;
    }
  }
  return memory.get(key) ?? "[]";
}

function write(key: string, value: string) {
  memory.set(key, value);
  if (storageWorks) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      storageWorks = false;
    }
  }
  for (const notify of listeners) notify();
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/** Everything starts open, including on the server. */
export function useFolded(key: string): { isOpen: (id: string) => boolean; toggle: (id: string) => void } {
  const raw = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => "[]",
  );
  const folded = parse(raw);
  return {
    isOpen: (id) => !folded.includes(id),
    toggle: (id) => {
      const current = parse(read(key));
      write(key, JSON.stringify(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
    },
  };
}
