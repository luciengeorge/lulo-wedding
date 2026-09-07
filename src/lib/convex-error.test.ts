import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";

import { convexErrorMessage } from "./convex-error";

describe("convexErrorMessage", () => {
  it("unwraps a ConvexError's string payload, which survives production redaction", () => {
    expect(convexErrorMessage(new ConvexError("That party no longer exists"))).toBe("That party no longer exists");
  });

  it("falls back when the payload is not a string", () => {
    expect(convexErrorMessage(new ConvexError({ code: 409 }), "Could not save")).toBe("Could not save");
  });

  it("uses a plain Error's message", () => {
    expect(convexErrorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back for anything else, including an empty message", () => {
    expect(convexErrorMessage(new Error(""), "Could not save")).toBe("Could not save");
    expect(convexErrorMessage("nope", "Could not save")).toBe("Could not save");
  });
});
