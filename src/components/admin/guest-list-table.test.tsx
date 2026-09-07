import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PartyRow } from "./party-row";

import { GuestListTable, useGuestListTable, useRowWindow } from "./guest-list-table";

/**
 * /admin cannot be opened by hand without a signed-in allowlisted account, so
 * the table's behaviour is pinned here instead: the cell rendering rules, and
 * the TanStack search / column-filter / sort wiring the toolbar drives.
 */

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
  rsvp: { state: "awaiting", attending: 0, guestCount: 0 },
};

function party(overrides: Partial<PartyRow>, id: string): PartyRow {
  return { ...base, ...overrides, _id: id as PartyRow["_id"] };
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
function Harness({ rows, onEdit = vi.fn() }: { rows: PartyRow[]; onEdit?: (party: PartyRow) => void }) {
  const table = useGuestListTable(rows, { siteUrl: "https://lauralucien.com", onEdit });
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
      <output aria-label="Filtered count">{table.getFilteredRowModel().rows.length}</output>
      <output aria-label="Rendered count">{rowWindow.visibleCount}</output>
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
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent ?? "");
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
          party({ rsvp: { state: "attending", attending: 3, guestCount: 4 } }, "p1"),
          party({ earlyDecline: true, rsvp: { state: "declined", attending: 0, guestCount: 0 } }, "p2"),
          party({ rsvp: { state: "awaiting", attending: 0, guestCount: 0 } }, "p3"),
          party({ invitedToWedding: false, rsvp: { state: "notInvited", attending: 0, guestCount: 0 } }, "p4"),
        ]}
      />,
    );

    expect(screen.getByText("3 of 4 attending").className).toContain("#166534");
    expect(screen.getByText("Declined").className).toContain("#9F1239");
    expect(screen.getByText("Awaiting reply").className).toContain("#A1A1AA");
    expect(screen.getByText("Not yet invited").className).toContain("#C4C4C8");
  });

  it("offers copy-link and edit on every row, and edit reaches the page", () => {
    const onEdit = vi.fn();
    render(<Harness rows={[base]} onEdit={onEdit} />);

    const row = screen.getAllByRole("row")[1];
    expect(within(row!).getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    fireEvent.click(within(row!).getByRole("button", { name: "Edit" }));
    expect(onEdit).toHaveBeenCalledWith(base);
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
