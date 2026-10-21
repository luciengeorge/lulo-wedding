// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { api } from "./_generated/api";
import { constantTimeEqual } from "./lib/secrets";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const SECRET = "app-server-secret-for-tests";

function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  return t;
}

describe("verifyGuestPassword", () => {
  const verify = (
    t: ReturnType<typeof setup>,
    serverSecret: string,
    password = "laura&lucien2027",
    clientKey = "1.2.3.4",
  ) => t.mutation(api.guests.verifyGuestPassword, { password, clientKey, serverSecret });

  beforeEach(() => {
    process.env.GUEST_PASSWORD = "laura&lucien2027";
    process.env.APP_SERVER_SECRET = SECRET;
  });
  afterEach(() => {
    delete process.env.GUEST_PASSWORD;
    delete process.env.APP_SERVER_SECRET;
  });

  it("checks the password for the app server", async () => {
    const t = setup();
    expect(await verify(t, SECRET)).toEqual({ ok: true });
    expect(await verify(t, SECRET, "wrong")).toEqual({ ok: false, reason: "wrong" });
  });

  it("refuses a caller without the app server's secret, even with the right password", async () => {
    const t = setup();
    await expect(verify(t, "")).rejects.toThrow(/Only the app server/);
    await expect(verify(t, "guessed")).rejects.toThrow(/Only the app server/);
  });

  it("refuses everyone when the deployment has no secret set", async () => {
    delete process.env.APP_SERVER_SECRET;
    const t = setup();
    await expect(verify(t, "")).rejects.toThrow(/APP_SERVER_SECRET is not set/);
    await expect(verify(t, SECRET)).rejects.toThrow(/APP_SERVER_SECRET is not set/);
  });
});

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
