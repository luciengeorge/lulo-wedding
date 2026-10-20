import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EngagementRow } from "./engagement-table";

import { EngagementTable } from "./engagement-table";

const hour = 60 * 60 * 1000;

/** Cast because the generated type marks the query's optional fields as present. */
function row(overrides: Partial<EngagementRow>, id: string): EngagementRow {
  return {
    partyId: id as EngagementRow["partyId"],
    displayName: id,
    visitCount: 0,
    bounced: false,
    replied: false,
    ...overrides,
  } as EngagementRow;
}

const rows: EngagementRow[] = [
  row({ displayName: "Rae & Cherif", lastVisitAt: Date.now() - 5 * hour, visitCount: 3, invitedVia: "email" }, "p1"),
  row(
    { displayName: "Marc", lastVisitAt: Date.now() - hour, visitCount: 1, replied: true, invitedVia: "whatsapp" },
    "p2",
  ),
  row({ displayName: "Sami", bounced: true, latestEmailStatus: "bounced", invitedVia: "email" }, "p3"),
];

function names(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((tr) => within(tr).getAllByRole("cell")[0]?.textContent ?? "");
}

describe("EngagementTable", () => {
  it("opens on the most recently seen, with the never-seen last", () => {
    render(<EngagementTable rows={rows} onOpen={vi.fn()} />);
    expect(names()).toEqual(["Marc", "Rae & Cherif", "Sami"]);
  });

  it("flips the order and sorts by visits", () => {
    render(<EngagementTable rows={rows} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Last seen/ }));
    expect(names()[0]).toBe("Sami");
    fireEvent.click(screen.getByRole("button", { name: /Visits/ }));
    expect(names()).toEqual(["Rae & Cherif", "Marc", "Sami"]);
  });

  it("narrows to the people worth a nudge, and to the bounced", () => {
    render(<EngagementTable rows={rows} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Seen, not replied/ }));
    expect(names()).toEqual(["Rae & Cherif"]);
    fireEvent.click(screen.getByRole("button", { name: /Bounced/ }));
    expect(names()).toEqual(["Sami"]);
    expect(screen.getByRole("button", { name: /Bounced/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("counts each view on its button", () => {
    render(<EngagementTable rows={rows} onOpen={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Everyone/ })).toHaveTextContent("3");
    expect(screen.getByRole("button", { name: /Never seen/ })).toHaveTextContent("1");
  });

  it("marks a bounce in red and opens the party's timeline", () => {
    const onOpen = vi.fn();
    render(<EngagementTable rows={rows} onOpen={onOpen} />);
    expect(screen.getByText("Bounced", { selector: "td span" }).className).toContain("#9F1239");
    fireEvent.click(screen.getByRole("button", { name: "Marc" }));
    expect(onOpen).toHaveBeenCalledWith(rows[1]);
  });

  it("says so when a view is empty", () => {
    render(<EngagementTable rows={[rows[1]!]} onOpen={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Bounced/ }));
    expect(screen.getByText("Nobody in this view.")).toBeInTheDocument();
  });
});
