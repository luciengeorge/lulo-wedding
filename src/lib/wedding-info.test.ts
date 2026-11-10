import { describe, expect, it } from "vitest";

import { isPublic, showTo, visibleTo } from "./wedding-info";

describe("who sees a tagged detail", () => {
  it("shows untagged and wedding details to everyone", () => {
    expect(isPublic({})).toBe(true);
    expect(isPublic({ events: [] })).toBe(true);
    expect(isPublic({ events: ["wedding"] })).toBe(true);
    expect(isPublic({ events: ["brunch", "wedding"] })).toBe(true);
    expect(visibleTo({ events: ["wedding"] }, [])).toBe(true);
  });

  it("shows an event's details only to parties invited to it", () => {
    expect(isPublic({ events: ["brunch"] })).toBe(false);
    expect(visibleTo({ events: ["brunch"] }, ["wedding"])).toBe(false);
    expect(visibleTo({ events: ["brunch"] }, ["wedding", "brunch"])).toBe(true);
  });

  it("shows a detail tagged with several events to a party invited to any of them", () => {
    const item = { events: ["preWedding", "brunch"] as const };
    expect(visibleTo(item, ["brunch"])).toBe(true);
    expect(visibleTo(item, ["preWedding"])).toBe(true);
    expect(visibleTo(item, ["wedding"])).toBe(false);
  });
});

describe("showTo", () => {
  const faqs = [
    { question: "Weather?", answer: "Warm." },
    { question: "Kids at brunch?", answer: "Yes.", events: ["brunch"] as const },
    { question: "Both?", answer: "Yes.", events: ["preWedding", "brunch"] as const },
  ];

  it("drops what the party cannot see and labels the rest, without the tag", () => {
    expect(showTo(faqs, ["wedding"])).toEqual([{ question: "Weather?", answer: "Warm.", onlyFor: null }]);
    expect(showTo(faqs, ["wedding", "brunch"])).toEqual([
      { question: "Weather?", answer: "Warm.", onlyFor: null },
      { question: "Kids at brunch?", answer: "Yes.", onlyFor: "Brunch" },
      { question: "Both?", answer: "Yes.", onlyFor: "Pre-wedding and Brunch" },
    ]);
  });
});
