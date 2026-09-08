import { useForm } from "@tanstack/react-form";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import type { PartyBulkFields } from "@/../convex/admin";
import type { GuestListTableInstance } from "@/components/admin/guest-list-table";
import type { PartyRow } from "@/components/admin/party-row";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { convexErrorMessage } from "@/lib/convex-error";
import { runBulkChunks } from "@/lib/party-bulk";
import { INVITE_EVENTS, LINK_LABEL, WAVE_LABEL, WHO_LONG_LABEL } from "@/lib/party-labels";
import { cn } from "@/lib/utils";

type PartyId = PartyRow["_id"];
type BulkActionsBarProps = {
  table: GuestListTableInstance;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  updateParties: (args: {
    partyIds: PartyId[];
    fields: PartyBulkFields;
  }) => Promise<{ updated: number; unchanged: number; missing: number }>;
  deleteParties: (args: {
    partyIds: PartyId[];
  }) => Promise<{ deletedParties: number; deletedGuests: number; missing: number }>;
};

const CONTROL_CLASS =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#E4E4E7] bg-[#FFFFFF] px-2.5 text-[12.5px] text-[#52525B] outline-none hover:bg-[#F4F4F5] focus-visible:ring-2 focus-visible:ring-[#A1A1AA] disabled:pointer-events-none disabled:opacity-50";
const DELETE_CLASS = "border-[#FECDD3] text-[#9F1239] hover:bg-[#FFF1F2]";
const MENU_CLASS =
  "w-auto min-w-40 bg-[#FFFFFF] text-[#18181B] ring-[#E4E4E7] **:data-[slot$=-item]:focus:bg-[#F4F4F5] **:data-[slot$=-item]:data-highlighted:bg-[#F4F4F5] **:data-[slot$=-trigger]:focus:bg-[#F4F4F5] **:data-[slot$=-trigger]:aria-expanded:bg-[#F4F4F5]!";
const ITEM_CLASS =
  "h-8 text-[12.5px] focus:bg-[#F4F4F5] focus:text-[#18181B] data-open:bg-[#F4F4F5] data-open:text-[#18181B] data-popup-open:bg-[#F4F4F5] data-popup-open:text-[#18181B]";

type SetOption = { label: string; fields: PartyBulkFields };
const SET_GROUPS: { label: string; options: SetOption[] }[] = [
  {
    label: "Save-the-date",
    options: [
      { label: "Sent", fields: { saveTheDateSent: true } },
      { label: "Not sent", fields: { saveTheDateSent: false } },
    ],
  },
  {
    label: "Wave",
    options: (Object.keys(WAVE_LABEL) as (keyof typeof WAVE_LABEL)[]).map((wave) => ({
      label: WAVE_LABEL[wave],
      fields: { wave },
    })),
  },
  {
    label: "Whose",
    options: (Object.keys(WHO_LONG_LABEL) as (keyof typeof WHO_LONG_LABEL)[]).map((who) => ({
      label: WHO_LONG_LABEL[who],
      fields: { who },
    })),
  },
  {
    label: "Link",
    options: (Object.keys(LINK_LABEL) as (keyof typeof LINK_LABEL)[]).map((link) => ({
      label: LINK_LABEL[link],
      fields: { link },
    })),
  },
  {
    label: "Plus-one",
    options: [
      { label: "Allowed", fields: { plusOneAllowed: true } },
      { label: "Not allowed", fields: { plusOneAllowed: false } },
    ],
  },
  {
    label: "Early decline",
    options: [
      { label: "Yes", fields: { earlyDecline: true } },
      { label: "No", fields: { earlyDecline: false } },
    ],
  },
];

function partyCount(count: number) {
  return `${count} ${count === 1 ? "party" : "parties"}`;
}

export function BulkActionsBar({ table, busy, onBusyChange, updateParties, deleteParties }: BulkActionsBarProps) {
  const running = useRef(false);
  const [deleteTarget, setDeleteTarget] = useState<PartyRow[] | null>(null);
  const selected = table.getSelectedRowModel().rows.map((row) => row.original);
  const hidden = selected.length - table.getFilteredSelectedRowModel().rows.length;

  async function applyUpdate(fields: PartyBulkFields, message: (count: number) => string) {
    if (running.current || selected.length === 0) return;
    running.current = true;
    onBusyChange(true);
    try {
      const result = await runBulkChunks(
        selected.map((party) => party._id),
        (partyIds) => updateParties({ partyIds, fields }),
      );
      const updated = result.results.reduce((sum, chunk) => sum + chunk.updated, 0);
      const unchanged = result.results.reduce((sum, chunk) => sum + chunk.unchanged, 0);
      const missing = result.results.reduce((sum, chunk) => sum + chunk.missing, 0);
      const skipped = [
        // A row already holding the value is left untouched rather than restamped,
        // so say so: "Updated 10" after selecting 400 is otherwise alarming.
        unchanged > 0 ? `${partyCount(unchanged)} already had it.` : "",
        missing > 0 ? `${partyCount(missing)} no longer exist and were skipped.` : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (result.status === "failed") {
        toast.error(`${updated === 0 ? "Nothing was changed" : message(updated)} before the batch failed`, {
          description: [skipped, convexErrorMessage(result.error)].filter(Boolean).join(" "),
        });
      } else {
        toast.success(message(updated), { description: skipped || undefined });
      }
    } finally {
      running.current = false;
      onBusyChange(false);
    }
  }

  async function applyDelete(parties: PartyRow[]) {
    if (running.current) return;
    running.current = true;
    onBusyChange(true);
    try {
      const result = await runBulkChunks(
        parties.map((party) => party._id),
        (partyIds) => deleteParties({ partyIds }),
      );
      const deleted = result.results.reduce((sum, chunk) => sum + chunk.deletedParties, 0);
      const guests = result.results.reduce((sum, chunk) => sum + chunk.deletedGuests, 0);
      const missing = result.results.reduce((sum, chunk) => sum + chunk.missing, 0);
      const message = `Deleted ${partyCount(deleted)} and ${guests} guest ${guests === 1 ? "row" : "rows"}`;
      // The dialog said "Delete 240" and the toast may say 237. Without a reason
      // that gap reads as data loss rather than as rows someone else already removed.
      const skipped = missing > 0 ? `${partyCount(missing)} had already been deleted.` : "";
      if (result.status === "failed") {
        toast.error(`${message} before the batch failed`, {
          description: [skipped, convexErrorMessage(result.error)].filter(Boolean).join(" "),
        });
      } else {
        toast.success(message, { description: skipped || undefined });
        table.resetRowSelection(true);
      }
      setDeleteTarget(null);
    } finally {
      running.current = false;
      onBusyChange(false);
    }
  }

  if (selected.length === 0 && !busy && !deleteTarget) return null;

  return (
    <>
      <div
        aria-label="Bulk actions"
        aria-busy={busy}
        className="flex flex-wrap items-center gap-2 rounded-[9px] border border-[#E4E4E7] bg-[#FAFAFA] px-3 py-2 text-[12.5px]"
      >
        <p className="mr-2 text-[#18181B]" aria-live="polite">
          {selected.length} selected
          {hidden > 0 ? <span className="text-[#71717A]"> · {hidden} not shown by these filters</span> : null}
        </p>

        <DropdownMenu>
          <DropdownMenuTrigger className={CONTROL_CLASS} disabled={busy}>
            Invite to <span aria-hidden>▾</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={MENU_CLASS}>
            {[true, false].map((invited, index) => (
              <DropdownMenuGroup key={String(invited)}>
                {index > 0 ? <DropdownMenuSeparator className="bg-[#E4E4E7]" /> : null}
                <DropdownMenuLabel className="text-[12px] text-[#71717A]">
                  {invited ? "Add" : "Remove"}
                </DropdownMenuLabel>
                {INVITE_EVENTS.map((event) => (
                  <DropdownMenuItem
                    key={event.flag}
                    className={ITEM_CLASS}
                    disabled={busy}
                    onClick={() =>
                      void applyUpdate({ [event.flag]: invited }, (count) =>
                        invited
                          ? `Invited ${partyCount(count)} to the ${event.label.toLowerCase()}`
                          : `Removed ${partyCount(count)} from the ${event.label.toLowerCase()} invitation list`,
                      )
                    }
                  >
                    {event.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger className={CONTROL_CLASS} disabled={busy}>
            Set <span aria-hidden>▾</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent className={MENU_CLASS}>
            {SET_GROUPS.map((group) => (
              <DropdownMenuSub key={group.label}>
                <DropdownMenuSubTrigger className={ITEM_CLASS} disabled={busy}>
                  {group.label}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className={MENU_CLASS}>
                  {group.options.map((option) => (
                    <DropdownMenuItem
                      key={option.label}
                      className={ITEM_CLASS}
                      disabled={busy}
                      onClick={() =>
                        void applyUpdate(
                          option.fields,
                          (count) => `Updated ${partyCount(count)}: ${group.label} set to ${option.label}`,
                        )
                      }
                    >
                      {option.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          className={cn(CONTROL_CLASS, DELETE_CLASS)}
          disabled={busy}
          onClick={() => setDeleteTarget(selected)}
        >
          Delete
        </button>
        {busy ? (
          <span className="flex items-center gap-1.5 text-[#71717A]" role="status">
            <Spinner /> Applying changes
          </span>
        ) : null}
        <button
          type="button"
          className={cn(CONTROL_CLASS, "ml-auto shrink-0 border-transparent bg-transparent")}
          disabled={busy}
          onClick={() => table.resetRowSelection(true)}
        >
          Clear selection
        </button>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !running.current) setDeleteTarget(null);
        }}
      >
        <DialogContent className="bg-[#FFFFFF] text-[13px] text-[#18181B] ring-[#E4E4E7]" showCloseButton={!busy}>
          {deleteTarget ? (
            <ConfirmBulkDelete
              parties={deleteTarget}
              busy={busy}
              onCancel={() => setDeleteTarget(null)}
              onDelete={applyDelete}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ConfirmBulkDelete({
  parties,
  busy,
  onCancel,
  onDelete,
}: {
  parties: PartyRow[];
  busy: boolean;
  onCancel: () => void;
  onDelete: (parties: PartyRow[]) => Promise<void>;
}) {
  const count = parties.length;
  const replied = parties.filter((party) => party.rsvp.guestCount > 0).length;
  const guests = parties.reduce((sum, party) => sum + party.rsvp.guestCount, 0);
  const form = useForm({
    defaultValues: { confirmation: "" },
    validators: { onSubmit: z.object({ confirmation: z.literal(String(count)) }) },
    onSubmit: async () => {
      await onDelete(parties);
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-sans text-[15px]">Delete {partyCount(count)}?</DialogTitle>
        <DialogDescription className="text-[13px] text-[#71717A]">
          This will delete {partyCount(count)} and invalidate their magic links. It cannot be undone. {replied} of these
          parties have already replied. {guests} guest {guests === 1 ? "row" : "rows"} and their RSVPs will be deleted
          too.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
        className="flex flex-col gap-5"
      >
        <FieldGroup>
          <form.Field name="confirmation">
            {(field) => (
              <Field>
                <FieldLabel htmlFor="bulk-delete-count" className="text-[12.5px] text-[#52525B]">
                  Type {count} to confirm
                </FieldLabel>
                <Input
                  id="bulk-delete-count"
                  inputMode="numeric"
                  autoComplete="off"
                  value={field.state.value}
                  onChange={(event) => field.handleChange(event.target.value)}
                  onBlur={field.handleBlur}
                  disabled={busy}
                  className="h-8 border-[#E4E4E7] bg-[#FFFFFF] text-[13px] text-[#18181B] focus-visible:border-[#A1A1AA] focus-visible:ring-[#A1A1AA]/50"
                />
              </Field>
            )}
          </form.Field>
        </FieldGroup>
        <DialogFooter>
          <button type="button" className={CONTROL_CLASS} disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <form.Subscribe
            selector={(state) => ({ confirmation: state.values.confirmation, isSubmitting: state.isSubmitting })}
          >
            {({ confirmation, isSubmitting }) => (
              <button
                type="submit"
                className={cn(CONTROL_CLASS, DELETE_CLASS)}
                disabled={busy || isSubmitting || confirmation !== String(count)}
              >
                Delete {partyCount(count)}
              </button>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </>
  );
}
