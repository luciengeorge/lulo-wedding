import { describe, expect, it } from "vitest";

import { constantTimeEqual } from "./guests";

describe("constantTimeEqual", () => {
  it("matches identical strings", () => {
    expect(constantTimeEqual("laura&lucien2027", "laura&lucien2027")).toBe(true);
  });

  it("matches two empty strings", () => {
    expect(constantTimeEqual("", "")).toBe(true);
  });

  it("rejects same-length strings with different content", () => {
    expect(constantTimeEqual("abcd", "abce")).toBe(false);
  });

  it("rejects a difference in the final character only", () => {
    expect(constantTimeEqual("laura&lucien2027", "laura&lucien2026")).toBe(false);
  });

  it("rejects a difference in the first character only", () => {
    expect(constantTimeEqual("Xaura&lucien2027", "laura&lucien2027")).toBe(false);
  });

  it("rejects differing lengths in both orders", () => {
    expect(constantTimeEqual("abc", "abcd")).toBe(false);
    expect(constantTimeEqual("abcd", "abc")).toBe(false);
  });

  it("rejects an empty string against a non-empty one", () => {
    expect(constantTimeEqual("", "abc")).toBe(false);
    expect(constantTimeEqual("abc", "")).toBe(false);
  });

  it("is case sensitive", () => {
    expect(constantTimeEqual("Laura", "laura")).toBe(false);
  });

  it("handles multi-byte characters", () => {
    expect(constantTimeEqual("café🎉", "café🎉")).toBe(true);
    expect(constantTimeEqual("café🎉", "cafe🎉")).toBe(false);
    expect(constantTimeEqual("🎉", "🎊")).toBe(false);
  });

  it("does not treat an out-of-range read as a NUL character", () => {
    // charCodeAt past the end yields NaN, normalised to 0 — so a trailing NUL must
    // still compare unequal to a shorter string, which the length seed guarantees.
    expect(constantTimeEqual("ab", "ab\u0000")).toBe(false);
    expect(constantTimeEqual("ab\u0000", "ab")).toBe(false);
  });
});
