import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Funnel } from "./funnel-strip";

import { FunnelStrip } from "./funnel-strip";

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
  it("counts opens against every party emailed, the same parties the opens come from", () => {
    render(<FunnelStrip funnel={funnel} />);
    expect(screen.getByText("Opened email").parentElement).toHaveTextContent("Opened email2parties· of 3 emailed");
  });
});
