import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PartyRow } from "./party-row";

import { GuestListTable, GuestListTableSkeleton, useGuestListTable, useRowWindow } from "./guest-list-table";

/**
 * /admin cannot be opened by hand without a signed-in allowlisted account, so
 * the table's behaviour is pinned here instead: the cell rendering rules, and
 * the TanStack search / column-filter / sort wiring the toolbar drives.
 */

/**
 * The selection and infinite-scroll cases render 150 rows and then scroll the
 * window to the end, re-rendering on every append. That is 1 to 4 seconds each
 * on an idle machine and more with fifteen jsdom workers competing, so vitest's
 * 5s default failed a different one of them on every run. Raised here rather
 * than in vitest.config.ts, so the default keeps its bite on every other file.
 */
vi.setConfig({ testTimeout: 20_000 });

const base: PartyRow = {
  _id: "p1" as PartyRow["_id"],
  importKey: "rae & cherif|haddad",
  displayName: "Rae & Cherif",
  surname: "Haddad",
  token: "AbC123",
  headCount: 4,
  plusOneAllowed: false,
  link: "family",
  whereFrom: "Childhood",
  who: "laura",
  wave: "tier1",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: true,
  earlyDecline: false,
  rsvp: { state: "awaiting", attending: 0, guestCount: 0, seatsNamed: 0 },
  invitedTo: { preWedding: false, wedding: true, brunch: false },
  visitCount: 0,
  emailBounced: false,
};

/** `invitedTo` follows the overridden flags, as it does for a party with no couple-named guests. */
function party(overrides: Partial<PartyRow>, id: string): PartyRow {
  const row = { ...base, ...overrides };
  return {
    ...row,
    invitedTo: overrides.invitedTo ?? {
      preWedding: row.invitedToPreWedding,
      wedding: row.invitedToWedding,
      brunch: row.invitedToBrunch,
    },
    _id: id as PartyRow["_id"],
  };
}

/**
 * jsdom has no IntersectionObserver. This one records every observed sentinel so
 * a test can say "the reader scrolled to the bottom" explicitly, rather than the
 * window growing on its own.
 */
let scrollTriggers: (() => void)[] = [];

class FakeIntersectionObserver implements IntersectionObserver {
  readonly root = null;
  readonly rootMargin = "";
  readonly scrollMargin = "";
  readonly thresholds: readonly number[] = [];
  private readonly callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element) {
    scrollTriggers.push(() => {
      const entry = { isIntersecting: true, target } as IntersectionObserverEntry;
      this.callback([entry], this);
    });
  }

  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver);

afterEach(() => {
  scrollTriggers = [];
});

/** Fires every live sentinel once, i.e. one scroll to the end of the list. */
function scrollToEnd() {
  const pending = [...scrollTriggers];
  scrollTriggers = [];
  act(() => {
    for (const trigger of pending) trigger();
  });
}

/** Mirrors the page: the table owns its state, the controls drive it. */
function Harness({
  rows,
  onEdit = vi.fn(),
  selectionDisabled,
}: {
  rows: PartyRow[];
  onEdit?: (party: PartyRow) => void;
  selectionDisabled?: boolean;
}) {
  const table = useGuestListTable(rows, { siteUrl: "https://lauralucien.com", onEdit, selectionDisabled });
  const rowWindow = useRowWindow(table);

  return (
    <>
      <input
        aria-label="Search"
        value={table.state.globalFilter ?? ""}
        onChange={(event) => table.setGlobalFilter(event.target.value)}
      />
      <button type="button" onClick={() => table.getColumn("whose")?.setFilterValue(["laura"])}>
        Only Laura
      </button>
      <button type="button" onClick={() => table.getColumn("whose")?.setFilterValue(["laura", "lucien"])}>
        Laura or Lucien
      </button>
      <button type="button" onClick={() => table.getColumn("whose")?.setFilterValue(undefined)}>
        Clear whose
      </button>
      <button type="button" onClick={() => table.getColumn("whereFrom")?.setFilterValue(["friends"])}>
        Only friends
      </button>
      <button type="button" onClick={() => table.getColumn("wave")?.setFilterValue(["tier1", "tier2"])}>
        Either wave
      </button>
      <button type="button" onClick={() => table.getColumn("invitedTo")?.setFilterValue(["brunch"])}>
        Only brunch
      </button>
      <button type="button" onClick={() => table.getColumn("invitedTo")?.setFilterValue(["brunch", "none"])}>
        Brunch or uninvited
      </button>
      <button type="button" onClick={() => table.getColumn("lastSeen")?.setFilterValue(["seenNotReplied"])}>
        Seen, not replied
      </button>
      <button type="button" onClick={() => table.getColumn("invitedVia")?.setFilterValue(["bounced"])}>
        Bounced
      </button>
      <output aria-label="Filtered count">{table.getFilteredRowModel().rows.length}</output>
      <output aria-label="Rendered count">{rowWindow.visibleCount}</output>
      <output aria-label="Selected ids">
        {table
          .getSelectedRowModel()
          .rows.map((row) => row.id)
          .join(",")}
      </output>
      <GuestListTable table={table} rowWindow={rowWindow} />
    </>
  );
}

function filteredCount(): number {
  return Number(screen.getByLabelText("Filtered count").textContent);
}

/** The PARTY cell of each body row, in the order the table rendered them. */
function partyNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent ?? "");
}

describe("GuestListTable rendering", () => {
  it("shows the party name over the surname", () => {
    render(<Harness rows={[base]} />);
    expect(screen.getByText("Rae & Cherif")).toBeInTheDocument();
    expect(screen.getByText("Haddad")).toBeInTheDocument();
  });

  it("marks a plus-one beside the seat count, and only when allowed", () => {
    const { rerender } = render(<Harness rows={[base]} />);
    expect(screen.queryByText("+1")).not.toBeInTheDocument();

    rerender(<Harness rows={[party({ plusOneAllowed: true }, "p1")]} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("pairs where-from with the link, and falls back to the link alone", () => {
    render(<Harness rows={[base, party({ whereFrom: undefined, link: "friends" }, "p2")]} />);
    expect(screen.getByText("Childhood · Family")).toBeInTheDocument();
    expect(screen.getByText("Friends")).toBeInTheDocument();
  });

  it("shows one chip per event the party is invited to", () => {
    render(<Harness rows={[party({ invitedToPreWedding: true, invitedToBrunch: true }, "p1")]} />);
    expect(screen.getByTitle("Pre-wedding")).toBeInTheDocument();
    expect(screen.getByTitle("Wedding")).toBeInTheDocument();
    expect(screen.getByTitle("Brunch")).toBeInTheDocument();
  });

  it("keeps the four RSVP states visually distinct", () => {
    render(
      <Harness
        rows={[
          party({ headCount: 4, rsvp: { state: "attending", attending: 3, guestCount: 4, seatsNamed: 4 } }, "p1"),
          party({ earlyDecline: true, rsvp: { state: "declined", attending: 0, guestCount: 0, seatsNamed: 0 } }, "p2"),
          party({ rsvp: { state: "awaiting", attending: 0, guestCount: 0, seatsNamed: 0 } }, "p3"),
          party(
            { invitedToWedding: false, rsvp: { state: "notInvited", attending: 0, guestCount: 0, seatsNamed: 0 } },
            "p4",
          ),
        ]}
      />,
    );

    expect(screen.getByText("3 coming of 4").className).toContain("#166534");
    expect(screen.getByText("Declined").className).toContain("#9F1239");
    expect(screen.getByText("Awaiting reply").className).toContain("#A1A1AA");
    expect(screen.getByText("Not yet invited").className).toContain("#C4C4C8");
  });

  /**
   * A household can name two people now and the rest later, so a partial reply
   * must not render the same as a settled one. "2 of 4 attending" reads as
   * finished and hides the two nobody has heard about.
   */
  it("says how many seats a party has not spoken for yet", () => {
    render(
      <Harness
        rows={[
          party({ headCount: 4, rsvp: { state: "attending", attending: 2, guestCount: 2, seatsNamed: 2 } }, "p1"),
          party({ headCount: 4, rsvp: { state: "attending", attending: 2, guestCount: 4, seatsNamed: 4 } }, "p2"),
        ]}
      />,
    );

    expect(screen.getByText("2 coming, 2 not yet said")).toBeInTheDocument();
    expect(screen.getByText("2 coming of 4")).toBeInTheDocument();
  });

  it("offers copy-link and edit on every row, and edit reaches the page", () => {
    const onEdit = vi.fn();
    render(<Harness rows={[base]} onEdit={onEdit} />);

    const row = screen.getAllByRole("row")[1];
    expect(within(row!).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    fireEvent.click(within(row!).getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(base);
  });

  it("shows the brunch chip for a party whose brunch invite is per person", () => {
    render(<Harness rows={[party({ invitedTo: { preWedding: false, wedding: true, brunch: true } }, "p1")]} />);
    expect(screen.getByTitle("Brunch")).toBeInTheDocument();
  });

  it("says how a party was invited, and flags a bounce beside it", () => {
    render(
      <Harness
        rows={[
          party({ invitedVia: "both", emailBounced: true }, "p1"),
          party({ displayName: "Marc", invitedVia: "whatsapp" }, "p2"),
          party({ displayName: "Sami" }, "p3"),
        ]}
      />,
    );
    expect(screen.getByText("Email + WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp")).toBeInTheDocument();
    expect(screen.getByText("Not yet")).toBeInTheDocument();
    expect(screen.getAllByTitle(/bounced/)).toHaveLength(1);
  });

  it("shows when a party last opened their link, exact time on hover", () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000 - 60_000;
    render(<Harness rows={[party({ lastVisitAt: threeDaysAgo, visitCount: 2 }, "p1"), party({}, "p2")]} />);
    const seen = screen.getByText("3 days ago");
    expect(seen.tagName).toBe("TIME");
    expect(seen.getAttribute("title")).toMatch(/\d{4}/);
    expect(screen.getByText("Never")).toBeInTheDocument();
  });

  it("says so when the filters match nothing", () => {
    render(<Harness rows={[]} />);
    expect(screen.getByText("No parties match these filters.")).toBeInTheDocument();
  });
});

const rows = [
  party({ displayName: "Rae & Cherif", surname: "Abou Jaoudé", who: "laura", headCount: 4 }, "p1"),
  party({ displayName: "Marc", surname: "Zeidan", who: "lucien", headCount: 1, link: "friends" }, "p2"),
  party({ displayName: "Nayla & Paul", surname: "Bechara", who: "laura", headCount: 2, invitedToBrunch: true }, "p3"),
];

describe("GuestListTable search, filter and sort", () => {
  it("sorts by surname on first render, which is how the sheet reads", () => {
    render(<Harness rows={rows} />);
    const [first, second, third] = partyNames();
    expect(first).toContain("Abou Jaoudé");
    expect(second).toContain("Bechara");
    expect(third).toContain("Zeidan");
  });

  it("reverses the order when the PARTY header is clicked, and never drops to unsorted", () => {
    render(<Harness rows={rows} />);
    const header = screen.getByRole("button", { name: /Party/ });

    fireEvent.click(header);
    expect(partyNames()[0]).toContain("Zeidan");

    fireEvent.click(header);
    expect(partyNames()[0]).toContain("Abou Jaoudé");

    // A third click stays on a deliberate order rather than falling back to
    // whatever order the query returned.
    fireEvent.click(header);
    expect(partyNames()[0]).toContain("Zeidan");
  });

  it("sorts numerically on SEATS", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: /Seats/ }));
    expect(partyNames()[0]).toContain("Marc");
  });

  it("searches name and surname, ignoring accents", () => {
    render(<Harness rows={rows} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "jaoude" } });
    expect(partyNames()).toHaveLength(1);
    expect(partyNames()[0]).toContain("Rae & Cherif");
  });

  it("clears the search when the box is emptied", () => {
    render(<Harness rows={rows} />);
    const box = screen.getByLabelText("Search");
    fireEvent.change(box, { target: { value: "zeidan" } });
    expect(partyNames()).toHaveLength(1);
    fireEvent.change(box, { target: { value: "" } });
    expect(partyNames()).toHaveLength(3);
  });

  it("filters on whose side the party is", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    expect(partyNames()).toHaveLength(2);
    expect(partyNames().join(" ")).not.toContain("Marc");
  });

  it("ORs several values inside one dropdown", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Laura or Lucien" }));
    expect(partyNames()).toHaveLength(3);
  });

  it("restores every row when a dropdown is cleared", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    expect(partyNames()).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Clear whose" }));
    expect(partyNames()).toHaveLength(3);
  });

  it("does not read a whole-set selection as a filter that excludes anything", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Either wave" }));
    expect(partyNames()).toHaveLength(3);
  });

  it("ANDs across dropdowns while ORing within one", () => {
    render(<Harness rows={rows} />);
    // Laura OR Lucien covers all three; Friends narrows it to Marc alone.
    fireEvent.click(screen.getByRole("button", { name: "Laura or Lucien" }));
    fireEvent.click(screen.getByRole("button", { name: "Only friends" }));
    expect(partyNames()).toHaveLength(1);
    expect(partyNames()[0]).toContain("Marc");
  });

  it("ORs 'not invited yet' with a real event", () => {
    render(
      <Harness rows={[...rows, party({ displayName: "Sami", surname: "Wehbe", invitedToWedding: false }, "p4")]} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Brunch or uninvited" }));
    expect(partyNames()).toHaveLength(2);
    expect(partyNames().join(" ")).toContain("Nayla & Paul");
    expect(partyNames().join(" ")).toContain("Sami");
  });

  it("filters on the link, which lives in the WHERE FROM lane", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Only friends" }));
    expect(partyNames()).toHaveLength(1);
    expect(partyNames()[0]).toContain("Marc");
  });

  it("narrows to parties who opened their link but have not replied", () => {
    render(
      <Harness
        rows={[
          party({ displayName: "Seen", lastVisitAt: 10 }, "p1"),
          party({ displayName: "Replied", lastVisitAt: 10, respondedAt: 20 }, "p2"),
          party({ displayName: "Silent" }, "p3"),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Seen, not replied" }));
    expect(partyNames()).toEqual([expect.stringContaining("Seen")]);
  });

  it("narrows to parties whose email bounced", () => {
    render(<Harness rows={[party({ emailBounced: true, invitedVia: "email" }, "p1"), party({}, "p2")]} />);
    fireEvent.click(screen.getByRole("button", { name: "Bounced" }));
    expect(filteredCount()).toBe(1);
  });

  it("sorts LAST SEEN most recent first, with the never-seen last", () => {
    render(
      <Harness
        rows={[
          party({ displayName: "Old", surname: "A", lastVisitAt: 1_000 }, "p1"),
          party({ displayName: "Never", surname: "B" }, "p2"),
          party({ displayName: "New", surname: "C", lastVisitAt: 5_000 }, "p3"),
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Last seen/ }));
    expect(partyNames().map((name) => name.split(/[ABC]$/)[0])).toEqual(["New", "Old", "Never"]);
  });

  it("filters on a single invited event", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Only brunch" }));
    expect(partyNames()).toHaveLength(1);
    expect(partyNames()[0]).toContain("Nayla & Paul");
  });

  it("combines the search with a column filter rather than replacing it", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "nayla" } });
    expect(partyNames()).toHaveLength(1);
    expect(partyNames()[0]).toContain("Nayla & Paul");
  });
});

const manyRows = Array.from({ length: 150 }, (_, index) =>
  party(
    {
      displayName: `Guest ${String(index).padStart(3, "0")}`,
      surname: `Family ${String(index).padStart(3, "0")}`,
      who: index % 2 === 0 ? "laura" : "lucien",
    },
    `p${index}`,
  ),
);

describe("GuestListTable selection", () => {
  it("selects every matching row beyond the rendered window", () => {
    render(<Harness rows={manyRows} />);
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    const all = screen.getByRole("checkbox", { name: "Select all 75 matching parties" });
    fireEvent.click(all);
    expect(screen.getByLabelText("Selected ids").textContent?.split(",")).toHaveLength(75);
    expect(all).toBeChecked();
    expect(partyNames()).toHaveLength(60);
    scrollToEnd();
    expect(screen.getAllByRole("checkbox").every((checkbox) => checkbox.getAttribute("aria-checked") === "true")).toBe(
      true,
    );
  });

  it("retains hidden selections and derives the header state from matching rows only", () => {
    render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Marc Zeidan" }));
    expect(screen.getByRole("checkbox", { name: "Select all 3 matching parties" })).toBePartiallyChecked();
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    const all = screen.getByRole("checkbox", { name: "Select all 2 matching parties" });
    expect(all).not.toBeChecked();
    expect(all).not.toBePartiallyChecked();
    expect(screen.getByLabelText("Selected ids")).toHaveTextContent("p2");
    fireEvent.click(all);
    expect(all).toBeChecked();
    fireEvent.click(all);
    expect(screen.getByLabelText("Selected ids").textContent).toBe("p2");
  });

  /**
   * The only in-flight guard on the table side. While a bulk write is running the
   * boxes must not move, or the toast reports on a selection the couple can no
   * longer see and the next action runs against a different set of rows.
   */
  it("freezes every checkbox while a bulk action is running", () => {
    const { rerender } = render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Marc Zeidan" }));

    rerender(<Harness rows={rows} selectionDisabled />);
    // Base UI renders a span with aria-disabled, not a native disabled input.
    const header = screen.getByRole("checkbox", { name: "Select all 3 matching parties" });
    expect(screen.getAllByRole("checkbox").every((checkbox) => checkbox.getAttribute("aria-disabled") === "true")).toBe(
      true,
    );

    fireEvent.click(header);
    expect(screen.getByLabelText("Selected ids").textContent).toBe("p2");

    rerender(<Harness rows={rows} />);
    expect(header).not.toHaveAttribute("aria-disabled", "true");
  });

  it("keeps selection attached to the party through sorting, searching and refreshed data", () => {
    const { rerender } = render(<Harness rows={rows} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Marc Zeidan" }));
    fireEvent.click(screen.getByRole("button", { name: /Party/ }));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "nayla" } });
    expect(screen.getByLabelText("Selected ids").textContent).toBe("p2");
    rerender(<Harness rows={[...rows].reverse()} />);
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "" } });
    expect(screen.getByRole("checkbox", { name: "Select Marc Zeidan" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Nayla & Paul Bechara" })).not.toBeChecked();
  });
});

describe("GuestListTableSkeleton", () => {
  const widths = (container: HTMLElement) => [...container.querySelectorAll("col")].map((col) => col.style.width);

  /**
   * The point of a skeleton over a spinner: the chrome does not collapse and
   * rebuild. If a column is ever added to the table without the skeleton
   * following, the header would jump sideways when the rows land.
   */
  it("holds the same lanes as the loaded table", () => {
    const skeleton = render(<GuestListTableSkeleton />);
    const skeletonWidths = widths(skeleton.container);
    skeleton.unmount();

    const loaded = render(<Harness rows={rows} />);
    expect(skeletonWidths).toEqual(widths(loaded.container));
    expect(skeletonWidths.length).toBeGreaterThan(0);
  });

  it("keeps the real headers, so only the cells are placeholders", () => {
    render(<GuestListTableSkeleton rows={3} />);
    expect(screen.getByRole("columnheader", { name: "Party" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 1 + 3);
  });

  it("announces itself as busy rather than as an empty table", () => {
    const { container } = render(<GuestListTableSkeleton />);
    expect(container.querySelector("[aria-busy]")).toBeInTheDocument();
    expect(screen.getByText("Loading the guest list")).toBeInTheDocument();
  });
});

describe("GuestListTable infinite scroll", () => {
  it("renders a first chunk rather than all 150 rows", () => {
    render(<Harness rows={manyRows} />);
    expect(partyNames()).toHaveLength(60);
    expect(filteredCount()).toBe(150);
  });

  it("appends a chunk each time the sentinel comes into view", () => {
    render(<Harness rows={manyRows} />);

    scrollToEnd();
    expect(partyNames()).toHaveLength(120);

    scrollToEnd();
    expect(partyNames()).toHaveLength(150);
  });

  it("stops observing once everything is rendered", () => {
    render(<Harness rows={manyRows} />);
    scrollToEnd();
    scrollToEnd();
    expect(partyNames()).toHaveLength(150);

    // No sentinel left to fire, so this is a no-op rather than an overrun.
    scrollToEnd();
    expect(partyNames()).toHaveLength(150);
  });

  it("resets the window when a filter narrows the set", () => {
    render(<Harness rows={manyRows} />);
    scrollToEnd();
    expect(partyNames()).toHaveLength(120);

    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    expect(filteredCount()).toBe(75);
    expect(partyNames()).toHaveLength(60);
  });

  it("resets the window when the sort changes", () => {
    render(<Harness rows={manyRows} />);
    scrollToEnd();
    expect(partyNames()).toHaveLength(120);

    fireEvent.click(screen.getByRole("button", { name: /Party/ }));
    expect(partyNames()).toHaveLength(60);
  });

  it("resets the window when the search changes", () => {
    render(<Harness rows={manyRows} />);
    scrollToEnd();
    expect(partyNames()).toHaveLength(120);

    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "Guest 0" } });
    expect(partyNames()).toHaveLength(60);
  });

  it("keeps the filtered set whole for export even while the window is small", () => {
    render(<Harness rows={manyRows} />);
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));

    // Export reads getFilteredRowModel(), which the render window must not touch.
    expect(partyNames()).toHaveLength(60);
    expect(filteredCount()).toBe(75);
  });
});
