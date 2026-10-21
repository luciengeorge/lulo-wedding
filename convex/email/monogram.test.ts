// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MONOGRAM_PNG_BASE64 } from "./monogram";

describe("embedded email monogram", () => {
  it("is the same image the site serves", () => {
    const onDisk = readFileSync("public/art/monogram-email.png").toString("base64");
    expect(MONOGRAM_PNG_BASE64).toBe(onDisk);
  });
});
