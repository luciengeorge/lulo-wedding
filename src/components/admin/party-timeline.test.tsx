import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ActivityItem } from "./party-timeline";

import { PartyTimeline } from "./party-timeline";

vi.mock("convex/react", () => ({ useQuery: vi.fn() }));

const day = 24 * 60 * 60 * 1000;
const now = Date.now();

type SendItem = Extract<ActivityItem, { type: "send" }>;

const email: SendItem = {
  type: "send",
  at: now - 3 * day,
  sendId: "s1" as SendItem["sendId"],
  channel: "email",
  kind: "invite",
  to: "rae@example.com",
  status: "delivered",
  deliveredAt: now - 3 * day,
  firstOpenedAt: now - 3 * day,
  openCount: 2,
  lastOpenedAt: now - 2 * day,
  clickCount: 0,
  firstClickedAt: undefined,
  lastClickedAt: undefined,
  bouncedAt: undefined,
  bounceReason: undefined,
  complainedAt: undefined,
  failedAt: undefined,
  error: undefined,
};

describe("PartyTimeline", () => {
  it("tells the story of an email: sent, delivered, opened", () => {
    render(<PartyTimeline items={[email]} />);
    expect(screen.getByText("Invitation emailed to rae@example.com")).toBeInTheDocument();
    expect(screen.getByText(/^Delivered/)).toBeInTheDocument();
    expect(screen.getByText(/Opened 2 times, last/)).toHaveTextContent("2 days ago");
  });

  it("names a WhatsApp send and how a visit arrived", () => {
    render(
      <PartyTimeline
        items={[
          { type: "visit", at: now - day, source: "lookup", sendId: undefined },
          { ...email, sendId: "s2" as SendItem["sendId"], channel: "whatsapp", to: undefined },
        ]}
      />,
    );
    expect(screen.getByText("Opened their invitation after finding their name")).toBeInTheDocument();
    expect(screen.getByText("Invitation sent on WhatsApp")).toBeInTheDocument();
    expect(screen.queryByText(/^Delivered/)).not.toBeInTheDocument();
  });

  it("puts a bounce in red with its reason", () => {
    render(
      <PartyTimeline
        items={[{ ...email, status: "bounced", openCount: 0, bouncedAt: now - day, bounceReason: "Mailbox full" }]}
      />,
    );
    expect(screen.getByText(/Bounced: Mailbox full/).className).toContain("#9F1239");
  });

  it("says so when nothing has happened yet", () => {
    render(<PartyTimeline items={[]} />);
    expect(screen.getByText(/Nothing yet/)).toBeInTheDocument();
  });
});
