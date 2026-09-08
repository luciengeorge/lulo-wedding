import { describe, expect, it } from "vitest";

import { maskAnalyticsPath, maskAnalyticsUrl } from "./analytics-path";

describe("maskAnalyticsPath", () => {
  /**
   * The token is the guest's whole credential. Sent verbatim it sits in Google
   * Analytics and PostHog, where reading the dashboard is enough to open someone
   * else's reply.
   */
  it("removes the RSVP token", () => {
    expect(maskAnalyticsPath("/rsvp/AbC123xyz789")).toBe("/rsvp/[token]");
    expect(maskAnalyticsPath("/rsvp/AbC123xyz789/")).toBe("/rsvp/[token]/");
  });

  it("removes better-auth's one-time callback tokens", () => {
    expect(maskAnalyticsPath("/api/auth/magic-link/verify?token=secret")).toBe("/api/auth/[callback]");
  });

  it("leaves ordinary paths alone", () => {
    expect(maskAnalyticsPath("/")).toBe("/");
    expect(maskAnalyticsPath("/enter")).toBe("/enter");
    expect(maskAnalyticsPath("/admin")).toBe("/admin");
    // Not a token: the bare route carries nothing secret.
    expect(maskAnalyticsPath("/rsvp")).toBe("/rsvp");
  });
});

describe("maskAnalyticsUrl", () => {
  it("keeps the origin, masks the path and drops the query", () => {
    expect(maskAnalyticsUrl("https://lauralucien.com/rsvp/AbC123?utm=whatsapp")).toBe(
      "https://lauralucien.com/rsvp/[token]",
    );
  });

  /** ?redirect=/rsvp/<token> on the gate carries the same secret. */
  it("drops a query string that carries the token indirectly", () => {
    expect(maskAnalyticsUrl("https://lauralucien.com/enter?redirect=%2Frsvp%2FAbC123")).toBe(
      "https://lauralucien.com/enter",
    );
  });

  it("falls back to path masking when handed something that is not a URL", () => {
    expect(maskAnalyticsUrl("/rsvp/AbC123")).toBe("/rsvp/[token]");
  });
});
