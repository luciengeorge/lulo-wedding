import type { OptimisticUpdate } from "convex/browser";
import type { FunctionArgs } from "convex/server";

import { useMutation, useQuery } from "convex/react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import type { BoardParty } from "@/components/admin/pipeline-card";

import { api } from "@/../convex/_generated/api";
import { EmailComposerDialog } from "@/components/admin/email-composer";
import { PartyTimelineSheet } from "@/components/admin/party-timeline";
import { PipelineBoard, PipelineBoardSkeleton } from "@/components/admin/pipeline-board";
import { partyName } from "@/components/admin/pipeline-card";
import { useNow } from "@/components/admin/relative-time";
import { convexErrorMessage } from "@/lib/convex-error";
import { derivePipeline } from "@/lib/pipeline";

const WIDE = "(min-width: 768px)";

function subscribeWide(notify: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}

/** Lanes side by side. False on the server, so drag switches on once the page hydrates. */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

/**
 * The card moves the moment it is dropped instead of snapping back to Not
 * invited for the round trip. The query's own result replaces this a beat later.
 */
const stampWhatsApp: OptimisticUpdate<FunctionArgs<typeof api.admin.markInvitedOnWhatsApp>> = (store, { partyIds }) => {
  const current = store.getQuery(api.admin.pipeline, {});
  if (current === undefined) return;
  const at = Date.now();
  store.setQuery(
    api.admin.pipeline,
    {},
    current.map((row) =>
      partyIds.includes(row.partyId) && row.invitedVia !== "whatsapp" && row.invitedVia !== "both"
        ? {
            ...row,
            invitedVia: row.invitedVia === "email" ? "both" : "whatsapp",
            firstInvitedAt: row.firstInvitedAt ?? at,
            lastActivityAt: at,
          }
        : row,
    ),
  );
};

/**
 * The guest list as a pipeline board. Which parties show is decided by the
 * page's filters, the same ones the table uses, passed in as ids.
 */
export function PipelineView({ visibleIds }: { visibleIds: ReadonlySet<string> | undefined }) {
  const rows = useQuery(api.admin.pipeline, {});
  const now = useNow();
  const wide = useWide();
  const [open, setOpen] = useState<BoardParty | null>(null);
  const [remindParties, setRemindParties] = useState<BoardParty["partyId"][]>([]);
  const [remindOpen, setRemindOpen] = useState(false);

  const markInvited = useMutation(api.admin.markInvitedOnWhatsApp).withOptimisticUpdate(stampWhatsApp);
  const unmarkInvited = useMutation(api.admin.unmarkInvitedOnWhatsApp);

  const visible: BoardParty[] = (rows ?? [])
    .filter((row) => visibleIds?.has(row.partyId))
    .map((row) => ({ ...row, ...derivePipeline(row, now) }));

  async function undo(party: BoardParty) {
    const name = partyName(party);
    try {
      await unmarkInvited({ partyIds: [party.partyId] });
      toast.success(`Undone: ${name} no longer marked as invited on WhatsApp`);
    } catch (error) {
      toast.error(`Could not undo for ${name}`, { description: convexErrorMessage(error) });
    }
  }

  async function handleMarkInvited(party: BoardParty) {
    const name = partyName(party);
    try {
      const result = await markInvited({ partyIds: [party.partyId] });
      if (result.marked === 0) {
        toast.success(`${name} was already marked as invited on WhatsApp`);
        return;
      }
      toast.success(`Marked ${name} as invited on WhatsApp`, {
        action: { label: "Undo", onClick: () => void undo(party) },
      });
    } catch (error) {
      toast.error(`Could not mark ${name} as invited`, { description: convexErrorMessage(error) });
    }
  }

  return (
    <>
      {rows === undefined || visibleIds === undefined ? (
        <PipelineBoardSkeleton />
      ) : (
        <PipelineBoard
          parties={visible}
          canDrag={wide}
          onOpen={setOpen}
          onMarkInvited={handleMarkInvited}
          onRemind={(lane) => {
            setRemindParties(lane.map((party) => party.partyId));
            setRemindOpen(true);
          }}
        />
      )}

      <EmailComposerDialog
        partyIds={remindParties}
        initialKind="reminder"
        open={remindOpen}
        onOpenChange={setRemindOpen}
      />

      <PartyTimelineSheet
        party={open ? { partyId: open.partyId, displayName: partyName(open) } : null}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
