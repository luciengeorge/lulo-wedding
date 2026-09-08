import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PartyBulkFields } from "@/../convex/admin";

import type { PartyRow } from "./party-row";

import { BulkActionsBar } from "./bulk-actions-bar";
import { useGuestListTable } from "./guest-list-table";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const rows: PartyRow[] = Array.from({ length: 240 }, (_, index) => ({
  _id: `p${index}` as PartyRow["_id"],
  importKey: `guest ${index}|family`,
  displayName: `Guest ${index}`,
  surname: "Family",
  token: `token${index}`,
  headCount: 2,
  plusOneAllowed: false,
  link: "friends",
  who: index < 4 ? "lucien" : "laura",
  wave: "tier1",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: true,
  earlyDecline: false,
  rsvp: { state: index < 2 ? "attending" : "awaiting", attending: index < 2 ? 2 : 0, guestCount: index < 2 ? 2 : 0 },
}));

const updateParties =
  vi.fn<
    (args: {
      partyIds: PartyRow["_id"][];
      fields: PartyBulkFields;
    }) => Promise<{ updated: number; unchanged: number; missing: number }>
  >();
const deleteParties =
  vi.fn<
    (args: {
      partyIds: PartyRow["_id"][];
    }) => Promise<{ deletedParties: number; deletedGuests: number; missing: number }>
  >();

function Harness({ data = rows }: { data?: PartyRow[] }) {
  const [busy, setBusy] = useState(false);
  const table = useGuestListTable(data, { siteUrl: "", onEdit: vi.fn() });
  return (
    <>
      <button type="button" onClick={() => table.toggleAllRowsSelected(true)}>
        Select rows
      </button>
      <button type="button" onClick={() => table.getColumn("whose")?.setFilterValue(["laura"])}>
        Only Laura
      </button>
      <output aria-label="Selected count">{table.getSelectedRowModel().rows.length}</output>
      <BulkActionsBar
        table={table}
        busy={busy}
        onBusyChange={setBusy}
        updateParties={updateParties}
        deleteParties={deleteParties}
      />
    </>
  );
}

function selectRows(data = rows) {
  render(<Harness data={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Select rows" }));
}

async function inviteToBrunch() {
  fireEvent.click(screen.getByRole("button", { name: "Invite to" }));
  const group = await screen.findByRole("group", { name: "Add" });
  fireEvent.click(within(group).getByRole("menuitem", { name: "Brunch" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  updateParties
    .mockReset()
    .mockImplementation(async ({ partyIds }) => ({ updated: partyIds.length, unchanged: 0, missing: 0 }));
  deleteParties
    .mockReset()
    .mockImplementation(async ({ partyIds }) => ({ deletedParties: partyIds.length, deletedGuests: 0, missing: 0 }));
});

describe("BulkActionsBar", () => {
  it("appears only for a selection, reports hidden selections and clears them", () => {
    render(<Harness data={rows.slice(0, 12)} />);
    expect(screen.queryByLabelText("Bulk actions")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Select rows" }));
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    expect(screen.getByText("12 selected")).toHaveTextContent("4 not shown by these filters");
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.queryByLabelText("Bulk actions")).not.toBeInTheDocument();
  });

  it("updates all selected parties in chunks with one toast and keeps the selection", async () => {
    selectRows();
    fireEvent.click(screen.getByRole("button", { name: "Only Laura" }));
    await inviteToBrunch();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invited 240 parties to the brunch", { description: undefined }),
    );
    expect(updateParties.mock.calls.map(([args]) => args.partyIds.length)).toEqual([100, 100, 40]);
    expect(updateParties.mock.calls.flatMap(([args]) => args.partyIds)).toEqual(rows.map((row) => row._id));
    expect(updateParties.mock.calls.every(([args]) => args.fields.invitedToBrunch === true)).toBe(true);
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Selected count")).toHaveTextContent("240");
  });

  it("reports actual updated totals and missing parties", async () => {
    updateParties
      .mockResolvedValueOnce({ updated: 98, unchanged: 0, missing: 2 })
      .mockResolvedValueOnce({ updated: 99, unchanged: 0, missing: 1 });
    selectRows();
    await inviteToBrunch();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invited 237 parties to the brunch", {
        description: "3 parties no longer exist and were skipped.",
      }),
    );
  });

  /**
   * A row already holding the value is skipped rather than restamped, so "Invited 10"
   * after selecting 240 is the correct answer and needs its reason said out loud.
   */
  it("says how many parties already had the value", async () => {
    updateParties
      .mockResolvedValueOnce({ updated: 6, unchanged: 94, missing: 0 })
      .mockResolvedValueOnce({ updated: 4, unchanged: 96, missing: 0 })
      .mockResolvedValueOnce({ updated: 0, unchanged: 40, missing: 0 });
    selectRows();
    await inviteToBrunch();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Invited 10 parties to the brunch", {
        description: "230 parties already had it.",
      }),
    );
  });

  it("disables controls during a run and reports only commits before a failure", async () => {
    let finish!: (result: { updated: number; unchanged: number; missing: number }) => void;
    updateParties
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      )
      .mockRejectedValueOnce(new Error("Connection lost"));
    selectRows();
    await inviteToBrunch();
    for (const name of ["Invite to", "Set", "Delete", "Clear selection"]) {
      expect(screen.getByRole("button", { name })).toBeDisabled();
    }
    expect(updateParties).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ updated: 98, unchanged: 0, missing: 2 });
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Invited 98 parties to the brunch before the batch failed", {
        description: "2 parties no longer exist and were skipped. Connection lost",
      }),
    );
    expect(updateParties).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Invite to" })).toBeEnabled();
    expect(screen.getByLabelText("Selected count")).toHaveTextContent("240");
  });

  it("offers Add and Remove groups for all three events", async () => {
    selectRows(rows.slice(0, 1));
    fireEvent.click(screen.getByRole("button", { name: "Invite to" }));
    for (const name of ["Add", "Remove"]) {
      const group = await screen.findByRole("group", { name });
      expect(
        within(group)
          .getAllByRole("menuitem")
          .map((item) => item.textContent),
      ).toEqual(["Pre-wedding", "Wedding", "Brunch"]);
    }
    fireEvent.click(within(screen.getByRole("group", { name: "Remove" })).getByRole("menuitem", { name: "Wedding" }));
    await waitFor(() =>
      expect(updateParties).toHaveBeenCalledWith({ partyIds: [rows[0]._id], fields: { invitedToWedding: false } }),
    );
  });

  it.each([
    ["Save-the-date", ["Sent", "Not sent"], { saveTheDateSent: false }],
    ["Wave", ["Tier 1", "Tier 2"], { wave: "tier2" }],
    ["Whose", ["Lucien", "Laura", "Mutual", "Zeina & Michel", "Nayla & Paul"], { who: "nayla" }],
    ["Link", ["Family", "Friends"], { link: "friends" }],
    ["Plus-one", ["Allowed", "Not allowed"], { plusOneAllowed: false }],
    ["Early decline", ["Yes", "No"], { earlyDecline: false }],
  ])("offers the %s submenu and applies its value", async (label, options, fields) => {
    selectRows(rows.slice(0, 1));
    fireEvent.click(screen.getByRole("button", { name: "Set" }));
    const trigger = await screen.findByRole("menuitem", { name: label });
    fireEvent.keyDown(trigger, { key: "ArrowRight" });
    const option = await screen.findByRole("menuitem", { name: options.at(-1)! });
    for (const name of options) expect(screen.getByRole("menuitem", { name })).toBeInTheDocument();
    fireEvent.click(option);
    await waitFor(() => expect(updateParties).toHaveBeenCalledWith({ partyIds: [rows[0]._id], fields }));
  });

  it("requires the exact party count, states reply and guest counts, and clears after deletion", async () => {
    deleteParties.mockResolvedValueOnce({ deletedParties: 3, deletedGuests: 4, missing: 0 });
    selectRows(rows.slice(0, 4));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Delete 4 parties?");
    expect(dialog).toHaveTextContent("cannot be undone");
    expect(dialog).toHaveTextContent("2 of these parties have already replied");
    expect(dialog).toHaveTextContent("4 guest rows and their RSVPs will be deleted too");
    const confirm = within(dialog).getByRole("button", { name: "Delete 4 parties" });
    const input = within(dialog).getByLabelText("Type 4 to confirm");
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: "40" } });
    expect(confirm).toBeDisabled();
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });
    expect(deleteParties).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "4" } });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Deleted 3 parties and 4 guest rows", { description: undefined }),
    );
    expect(deleteParties).toHaveBeenCalledWith({ partyIds: rows.slice(0, 4).map((row) => row._id) });
    expect(screen.getByLabelText("Selected count")).toHaveTextContent("0");
  });

  /**
   * The dialog said "Delete 4" and the toast says 3. Without the reason, that gap
   * reads as data loss rather than as a row someone else had already removed.
   */
  it("explains a delete count that falls short of the confirmed one", async () => {
    deleteParties.mockResolvedValueOnce({ deletedParties: 3, deletedGuests: 4, missing: 1 });
    selectRows(rows.slice(0, 4));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const input = await screen.findByLabelText("Type 4 to confirm");
    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete 4 parties" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Deleted 3 parties and 4 guest rows", {
        description: "1 party had already been deleted.",
      }),
    );
  });

  it("reports actual deletions before a later chunk fails", async () => {
    deleteParties
      .mockResolvedValueOnce({ deletedParties: 99, deletedGuests: 4, missing: 0 })
      .mockRejectedValueOnce(new Error("Batch failed"));
    selectRows();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const input = await screen.findByLabelText("Type 240 to confirm");
    fireEvent.change(input, { target: { value: "240" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete 240 parties" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Deleted 99 parties and 4 guest rows before the batch failed", {
        description: "Batch failed",
      }),
    );
    expect(deleteParties).toHaveBeenCalledTimes(2);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });
});
