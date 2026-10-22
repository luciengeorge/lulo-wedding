import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildDashboard } from "@/lib/dashboard";

import type { DashboardData } from "./dashboard-charts";

import { DashboardCharts } from "./dashboard-charts";

const EMPTY: DashboardData = buildDashboard([], []);

const T0 = Date.UTC(2026, 8, 1, 10);
const DAY = 24 * 60 * 60 * 1000;

const party = {
  headCount: 2,
  plusOneAllowed: true,
  earlyDecline: false,
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  who: "laura" as const,
  link: "family" as const,
  wave: "tier1" as const,
};

const guest = {
  firstName: "Rae",
  lastName: "Haddad",
  isPlusOne: false,
  preWedding: "pending" as const,
  wedding: "yes" as const,
  brunch: "pending" as const,
};

const SOME: DashboardData = buildDashboard(
  [
    {
      party: { ...party, respondedAt: T0 + DAY },
      guests: [guest, { ...guest, firstName: "Cherif", dietaryNotes: "Vegan" }],
      sends: [
        {
          channel: "email",
          kind: "invite",
          status: "delivered",
          sentAt: T0,
          openCount: 1,
          clickCount: 0,
          campaignId: "c1",
        },
      ],
      visits: [{ at: T0 + DAY, source: "email" }],
    },
    { party: { ...party, earlyDecline: true }, guests: [], sends: [], visits: [] },
    {
      party,
      guests: [],
      sends: [{ channel: "whatsapp", kind: "invite", status: "sent", sentAt: T0, openCount: 0, clickCount: 0 }],
      visits: [],
    },
  ],
  [{ id: "c1", kind: "invite", createdAt: T0 }],
);

const card = (title: string) => screen.getByRole("region", { name: title });

describe("DashboardCharts", () => {
  it("shows an intentional empty state on every chart before anything has happened", () => {
    render(<DashboardCharts data={EMPTY} />);
    expect(within(card("Seats per event")).getByText("No one invited yet")).toBeInTheDocument();
    expect(within(card("Replies over time")).getByText("No replies yet")).toBeInTheDocument();
    expect(within(card("Time to reply")).getByText("No replies to an invitation yet")).toBeInTheDocument();
    expect(within(card("Funnel by channel")).getByText("No invitations sent yet")).toBeInTheDocument();
    expect(within(card("Email health per send run")).getByText("No emails sent yet")).toBeInTheDocument();
    expect(within(card("Visits per day")).getByText("No visits yet")).toBeInTheDocument();
    expect(within(card("Plus-ones & dietary needs")).getByText("No plus-ones offered")).toBeInTheDocument();
    expect(within(card("Reply rate by group")).getByText("No one asked yet")).toBeInTheDocument();
    // No chart is drawn over nothing.
    expect(document.querySelectorAll("svg[role='img']")).toHaveLength(0);
  });

  it("says each chart's numbers in words and in a table", () => {
    render(<DashboardCharts data={SOME} />);

    const seats = card("Seats per event");
    expect(within(seats).getByText(/2 of 6 seats coming, 2 not coming, 2 no answer yet\./)).toBeInTheDocument();
    expect(within(seats).getByRole("table", { name: "Seats per event" })).toBeInTheDocument();
    expect(within(seats).getByRole("row", { name: "Wedding 6 2 0 2 2" })).toBeInTheDocument();

    expect(within(card("Projected headcount")).getByText(/appears after 10 replies \(2 so far\)/)).toBeInTheDocument();
    expect(
      within(card("Plus-ones & dietary needs")).getByText("3 plus-ones allowed, 0 named, 0 coming."),
    ).toBeInTheDocument();
    expect(within(card("Plus-ones & dietary needs")).getByText("Vegan")).toBeInTheDocument();
    expect(within(card("Replies over time")).getByText(/1 party coming and 0 declined online/)).toBeInTheDocument();
    expect(
      within(card("Replies over time")).getByText(/1 early decline from the sheet has no date/),
    ).toBeInTheDocument();
    expect(within(card("Time to reply")).getByText(/Median 1 day across 1 reply\./)).toBeInTheDocument();
    expect(card("Funnel by channel").querySelector("[data-slot=chart-summary] li")).toHaveTextContent(
      "Email first: 1 invited → 1 seen (100%) → 1 replied (100%).",
    );
    expect(within(card("Email health per send run")).getByText(/1 email, 1 delivered, 1 opened/)).toBeInTheDocument();
    expect(within(card("Visits per day")).getByText(/1 visit over 1 day/)).toBeInTheDocument();
    expect(document.querySelectorAll("svg[role='img']").length).toBeGreaterThan(0);
  });
});
