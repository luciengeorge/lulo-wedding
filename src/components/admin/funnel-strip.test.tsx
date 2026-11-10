import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Funnel } from "./funnel-strip";

import { FunnelStrip, invitedDetail } from "./funnel-strip";

const funnel: Funnel = {
  parties: 10,
  // Invited on WhatsApp, then reminded by email: emailed, but not invited by email.
  invited: { email: 1, whatsapp: 4, any: 5 },
  email: { sent: 3, delivered: 3, opened: 2, clicked: 1, bounced: 0, complained: 0 },
  visited: 2,
  replied: 1,
  byFirstChannel: {
    email: { parties: 1, visited: 1, replied: 1 },
    whatsapp: { parties: 4, visited: 1, replied: 0 },
  },
};

describe("FunnelStrip", () => {
  it("shows three numbers, each out of every party on the list", () => {
    render(<FunnelStrip funnel={funnel} />);
    expect(screen.getByRole("group", { name: "Invited" })).toHaveTextContent("Invited5of 10 parties · 50%");
    expect(screen.getByRole("group", { name: "Seen" })).toHaveTextContent("Seen2of 10 parties · 20%");
    expect(screen.getByRole("group", { name: "Replied" })).toHaveTextContent("Replied1of 10 parties · 10%");
    expect(screen.queryByText(/bounced/)).not.toBeInTheDocument();
  });

  it("keeps the channel and email numbers for the Invited popover", () => {
    expect(invitedDetail(funnel)).toEqual(["1 by email, 4 on WhatsApp", "Emails: 3 sent, 2 opened, 0 bounced"]);
    expect(
      invitedDetail({ ...funnel, invited: { email: 0, whatsapp: 0, any: 0 }, email: { ...funnel.email, sent: 0 } }),
    ).toEqual([]);
  });
});
