import { describe, expect, it } from "vitest";

import type { CampaignSummary } from "./email-composer";

import { progressText, progressTitle, skippedLines } from "./email-composer";

function campaign(overrides: Partial<CampaignSummary> = {}): CampaignSummary {
  return {
    campaignId: "c1" as CampaignSummary["campaignId"],
    kind: "invite",
    createdAt: 1,
    createdBy: "laura@example.com",
    total: 20,
    status: "done",
    sent: 20,
    failed: 0,
    stopped: 0,
    skipped: [],
    remaining: 0,
    ...overrides,
  };
}

const skippedAmal = { displayName: "Amal", surname: "Khalil", reason: "replied" as const };

describe("a run's progress", () => {
  it("reads All sent only when everyone got it", () => {
    expect(progressTitle(campaign(), "invite")).toBe("All sent");
    expect(progressText(campaign())).toBe("20 sent");
  });

  it("keeps a party skipped at send time apart from the rest, and finishes rather than all-sends", () => {
    const run = campaign({ sent: 19, skipped: [skippedAmal] });
    expect(progressTitle(run, "invite")).toBe("Finished");
    expect(progressText(run)).toBe("19 sent · 1 skipped at send time");
    expect(skippedLines(run)).toEqual(["Amal Khalil: Already replied"]);
  });

  it("says Finished when something failed", () => {
    expect(progressTitle(campaign({ sent: 19, failed: 1 }), "reminder")).toBe("Finished");
  });

  it("counts only Stop as not sent, and only pending ones as left", () => {
    const stopped = campaign({ status: "cancelled", sent: 4, stopped: 15, skipped: [skippedAmal] });
    expect(progressTitle(stopped, "invite")).toBe("Stopped");
    expect(progressText(stopped)).toBe("Stopped: 4 sent · 15 not sent · 1 skipped at send time");

    const sending = campaign({ status: "sending", sent: 5, remaining: 14, skipped: [skippedAmal] });
    expect(progressTitle(sending, "reminder")).toBe("Sending the reminder");
    expect(progressText(sending)).toBe("5 of 20 sent · 1 skipped at send time");
  });
});
