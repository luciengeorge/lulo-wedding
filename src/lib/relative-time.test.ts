import { describe, expect, it } from "vitest";

import { formatAbsolute, formatRelative } from "./relative-time";

const now = Date.UTC(2026, 9, 20, 12, 0);
const minute = 60 * 1000;
const day = 24 * 60 * minute;

describe("formatRelative", () => {
  it("calls the last minute, and clock skew, just now", () => {
    expect(formatRelative(now - 20 * 1000, now)).toBe("just now");
    expect(formatRelative(now + 5 * 1000, now)).toBe("just now");
  });

  it("picks the largest whole unit", () => {
    expect(formatRelative(now - 5 * minute, now)).toBe("5 minutes ago");
    expect(formatRelative(now - 3 * 60 * minute, now)).toBe("3 hours ago");
    expect(formatRelative(now - 3 * day, now)).toBe("3 days ago");
    expect(formatRelative(now - 15 * day, now)).toBe("2 weeks ago");
    expect(formatRelative(now - 400 * day, now)).toBe("last year");
  });

  it("says yesterday rather than 1 day ago", () => {
    expect(formatRelative(now - day - minute, now)).toBe("yesterday");
  });
});

describe("formatAbsolute", () => {
  it("gives the date and time", () => {
    expect(formatAbsolute(now)).toMatch(/20 Oct 2026/);
  });
});
