// @vitest-environment node
import { render } from "react-email";
import { describe, expect, it } from "vitest";

import InviteEmail from "./templates/invite";
import ReminderEmail from "./templates/reminder";

const props = {
  displayName: "Rae & Cherif",
  events: [
    { label: "Pre-wedding", date: "Thursday 15 July 2027" },
    { label: "Wedding", date: "Saturday 17 July 2027" },
  ],
  rsvpUrl: "https://lauralucien.com/rsvp/token-haddad?s=send-1",
};

describe("the invitation and reminder emails", () => {
  it("greet the party, list its events and link to its own form", async () => {
    for (const Template of [InviteEmail, ReminderEmail]) {
      const html = await render(Template(props));
      expect(html).toContain("Dear Rae &amp; Cherif,");
      expect(html).toContain("Pre-wedding");
      expect(html).toContain("Saturday 17 July 2027");
      expect(html).not.toContain("Brunch");
      expect(html).toContain("Venues and times will be on the site soon.");
      expect(html).toContain('href="https://lauralucien.com/rsvp/token-haddad?s=send-1"');
      expect(html).toContain("Reply to our invitation");
      expect(html).toContain("cid:monogram");
      expect(html).not.toContain("Please reply by");
      expect(html).not.toContain("—");
    }
  });

  it("asks for a reply by the deadline when there is one", async () => {
    const html = await render(InviteEmail({ ...props, replyBy: "Tuesday 1 June 2027" }));
    expect(html).toContain("Please reply by Tuesday 1 June 2027.");
  });

  it("render as plain text too, link included", async () => {
    const text = await render(ReminderEmail({ ...props, replyBy: "Tuesday 1 June 2027" }), { plainText: true });
    expect(text).toContain("A small nudge in case our invitation slipped past you.");
    expect(text).toContain("https://lauralucien.com/rsvp/token-haddad?s=send-1");
    expect(text).toContain("Please reply by Tuesday 1 June 2027.");
    expect(text).toContain("Laura & Lucien");
  });
});
