import type { FunctionReturnType } from "convex/server";

import { useQuery as useTanStackQuery } from "@tanstack/react-query";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import type { Id } from "@/../convex/_generated/dataModel";

import { api } from "@/../convex/_generated/api";
import { AdminSelect } from "@/components/admin/admin-select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { convexErrorMessage } from "@/lib/convex-error";
import { cn } from "@/lib/utils";

export type EmailKind = "invite" | "reminder";
type PartyId = Id<"parties">;
type Prepared = FunctionReturnType<typeof api.admin.prepareCampaign>;
type SkipReason = Prepared["skipped"][number]["reason"];
export type CampaignSummary = FunctionReturnType<typeof api.admin.campaigns>[number];

const KIND_LABEL: Record<EmailKind, string> = { invite: "Invitation", reminder: "Reminder" };
const KIND_NOUN: Record<EmailKind, string> = { invite: "the invitation", reminder: "the reminder" };

const REASON_LABEL: Record<SkipReason, string> = {
  noEmail: "No email address",
  noEvents: "Invited to no events",
  alreadySent: "Already emailed this invitation",
  replied: "Already replied",
  declinedEarly: "Declined on the sheet",
  notInvited: "Not invited yet",
};

/** Resend's free plan. A bigger run is warned about, not refused: the couple may be on a paid plan. */
const FREE_PLAN_DAILY = 100;
/** Matches SEND_SPACING_MS in convex/campaigns.ts, for the "takes about" line. */
const SPACING_MS = 600;

const CONTROL_CLASS =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-[#E4E4E7] bg-[#FFFFFF] px-3 text-[12.5px] text-[#18181B] outline-none hover:bg-[#F4F4F5] focus-visible:ring-2 focus-visible:ring-[#A1A1AA] disabled:pointer-events-none disabled:opacity-50";
const PRIMARY_CLASS =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-ink px-3 text-[12.5px] font-medium text-[#FFFFFF] outline-none hover:bg-ink/90 focus-visible:ring-2 focus-visible:ring-[#A1A1AA] focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50";

export function partyCount(count: number) {
  return `${count} ${count === 1 ? "party" : "parties"}`;
}

function partyName(party: { displayName: string; surname: string }) {
  return `${party.displayName} ${party.surname}`.trim();
}

function duration(count: number) {
  const seconds = Math.max(1, Math.ceil((count * SPACING_MS) / 1000));
  if (seconds < 90) return `about ${seconds} ${seconds === 1 ? "second" : "seconds"}`;
  return `about ${Math.round(seconds / 60)} minutes`;
}

/** One line of progress, the same in the composer and the recent sends panel. */
export function progressText(campaign: CampaignSummary): string {
  const failed = campaign.failed > 0 ? `, ${campaign.failed} failed` : "";
  if (campaign.status === "cancelled") return `Stopped: ${campaign.sent} sent${failed}, ${campaign.cancelled} not sent`;
  if (campaign.status === "done") return `${campaign.sent} sent${failed}`;
  return `${campaign.sent} of ${campaign.total} sent${failed}`;
}

export function EmailComposerDialog({
  partyIds,
  initialKind = "invite",
  open,
  onOpenChange,
}: {
  partyIds: readonly PartyId[];
  initialKind?: EmailKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto bg-[#FFFFFF] p-0 text-[13px] text-[#18181B] ring-[#E4E4E7] sm:max-w-[980px]">
        {/* Mounted only while open, so every opening starts from a clean slate. */}
        {open ? <Composer partyIds={partyIds} initialKind={initialKind} onClose={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Composer({
  partyIds,
  initialKind,
  onClose,
}: {
  partyIds: readonly PartyId[];
  initialKind: EmailKind;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<EmailKind>(initialKind);
  const [includeAlreadySent, setIncludeAlreadySent] = useState(false);
  const [previewId, setPreviewId] = useState<PartyId | null>(null);
  /** Minted when the couple reach the confirm step; the server sends once per id. */
  const [requestId, setRequestId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<Id<"campaigns"> | null>(null);
  const [starting, setStarting] = useState(false);
  const startingRef = useRef(false);

  const prepared = useQuery(api.admin.prepareCampaign, { kind, partyIds: [...partyIds], includeAlreadySent });
  const startCampaign = useMutation(api.admin.startCampaign);

  const everyone = prepared ? [...prepared.recipients, ...prepared.skipped] : [];
  const previewParty = everyone.find((party) => party.partyId === previewId) ?? everyone[0];
  const recipients = prepared?.recipients.length ?? 0;

  async function start() {
    if (startingRef.current || !requestId) return;
    startingRef.current = true;
    setStarting(true);
    try {
      const result = await startCampaign({
        kind,
        partyIds: [...partyIds],
        includeAlreadySent,
        clientRequestId: requestId,
      });
      setCampaignId(result.campaignId);
    } catch (error) {
      toast.error("Could not start sending", { description: convexErrorMessage(error) });
      setRequestId(null);
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  return (
    <>
      <DialogHeader className="border-b border-[#E4E4E7] px-5 py-4 pr-12">
        <DialogTitle className="font-sans text-[15px]">Email {partyCount(partyIds.length)}</DialogTitle>
        <DialogDescription className="text-[12.5px] text-[#71717A]">
          Each party gets its own email, with its own link to reply.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col md:flex-row">
        <div className="flex flex-col gap-5 border-b border-[#E4E4E7] p-5 md:w-[340px] md:shrink-0 md:border-r md:border-b-0">
          {campaignId ? (
            <Progress campaignId={campaignId} kind={kind} onClose={onClose} />
          ) : (
            <>
              <KindPicker
                kind={kind}
                disabled={requestId !== null}
                onChange={(next) => {
                  setKind(next);
                  setIncludeAlreadySent(false);
                }}
              />
              {prepared === undefined ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-4 w-56" />
                </div>
              ) : (
                <Breakdown
                  prepared={prepared}
                  kind={kind}
                  includeAlreadySent={includeAlreadySent}
                  onIncludeAlreadySent={setIncludeAlreadySent}
                  disabled={requestId !== null}
                />
              )}
              {recipients > FREE_PLAN_DAILY ? (
                <p
                  role="note"
                  className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] text-[#92400E]"
                >
                  Resend's free plan sends at most {FREE_PLAN_DAILY} emails a day. If you are on it, the rest of these
                  will fail.
                </p>
              ) : null}

              {requestId ? (
                <Confirm
                  kind={kind}
                  count={recipients}
                  starting={starting}
                  onBack={() => setRequestId(null)}
                  onSend={() => void start()}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={PRIMARY_CLASS}
                    disabled={recipients === 0}
                    onClick={() => setRequestId(crypto.randomUUID())}
                  >
                    Send to {partyCount(recipients)}
                  </button>
                  <TestButton kind={kind} partyId={previewParty?.partyId} />
                </div>
              )}
            </>
          )}
        </div>

        <Preview
          kind={kind}
          parties={everyone}
          party={previewParty}
          onPick={setPreviewId}
          loading={prepared === undefined}
        />
      </div>
    </>
  );
}

function KindPicker({
  kind,
  disabled,
  onChange,
}: {
  kind: EmailKind;
  disabled: boolean;
  onChange: (kind: EmailKind) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Email" className="flex w-fit rounded-lg bg-[#F4F4F5] p-[3px]">
      {(Object.keys(KIND_LABEL) as EmailKind[]).map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={kind === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "h-7 rounded-md px-3 text-[12.5px] text-[#52525B] outline-none focus-visible:ring-2 focus-visible:ring-[#A1A1AA] disabled:opacity-60",
            kind === option && "bg-[#FFFFFF] font-medium text-[#18181B] shadow-[0_1px_2px_rgba(0,0,0,0.06)]",
          )}
        >
          {KIND_LABEL[option]}
        </button>
      ))}
    </div>
  );
}

function Breakdown({
  prepared,
  kind,
  includeAlreadySent,
  onIncludeAlreadySent,
  disabled,
}: {
  prepared: Prepared;
  kind: EmailKind;
  includeAlreadySent: boolean;
  onIncludeAlreadySent: (include: boolean) => void;
  disabled: boolean;
}) {
  const groups = new Map<SkipReason, Prepared["skipped"]>();
  for (const party of prepared.skipped) groups.set(party.reason, [...(groups.get(party.reason) ?? []), party]);
  const alreadySent = groups.get("alreadySent")?.length ?? 0;

  return (
    <section aria-label="Recipients" className="flex flex-col gap-3">
      <p className="text-[13px]">
        <span className="text-[22px] leading-none font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
          {prepared.recipients.length}
        </span>{" "}
        {prepared.recipients.length === 1 ? "party" : "parties"} will get {KIND_NOUN[kind]}
      </p>

      {prepared.skipped.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-[#71717A]">{prepared.skipped.length} skipped</p>
          <ul className="flex flex-col gap-1">
            {[...groups].map(([reason, parties]) => (
              <li key={reason}>
                <details className="group rounded-md border border-[#E4E4E7] px-2.5 py-1.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] text-[#3F3F46] [&::-webkit-details-marker]:hidden">
                    <span>{REASON_LABEL[reason]}</span>
                    <span
                      className="flex items-center gap-1.5 text-[#71717A]"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      {parties.length}
                      <span aria-hidden className="transition-transform group-open:rotate-180">
                        ▾
                      </span>
                    </span>
                  </summary>
                  <ul className="mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-[12px] text-[#52525B]">
                    {parties.map((party) => (
                      <li key={party.partyId}>{partyName(party)}</li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {kind === "invite" && (alreadySent > 0 || includeAlreadySent) ? (
        <label className="flex items-center gap-2 text-[12.5px] text-[#3F3F46]">
          <input
            type="checkbox"
            checked={includeAlreadySent}
            disabled={disabled}
            onChange={(event) => onIncludeAlreadySent(event.target.checked)}
            className="size-3.5 accent-[#18181B]"
          />
          Send again to parties already emailed it
        </label>
      ) : null}

      {prepared.missing > 0 ? (
        <p className="text-[12px] text-[#71717A]">{partyCount(prepared.missing)} no longer exist.</p>
      ) : null}
    </section>
  );
}

function TestButton({ kind, partyId }: { kind: EmailKind; partyId: PartyId | undefined }) {
  const sendTest = useMutation(api.admin.sendTestEmail);
  const [sending, setSending] = useState(false);

  return (
    <button
      type="button"
      className={CONTROL_CLASS}
      disabled={!partyId || sending}
      onClick={async () => {
        if (!partyId) return;
        setSending(true);
        try {
          const { to } = await sendTest({ kind, partyId });
          toast.success(`Test sent to ${to}`, { description: "Only you get it. The party does not." });
        } catch (error) {
          toast.error("Could not send the test", { description: convexErrorMessage(error) });
        } finally {
          setSending(false);
        }
      }}
    >
      {sending ? <Spinner /> : null}
      Send me a test
    </button>
  );
}

function Confirm({
  kind,
  count,
  starting,
  onBack,
  onSend,
}: {
  kind: EmailKind;
  count: number;
  starting: boolean;
  onBack: () => void;
  onSend: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Confirm"
      className="flex flex-col gap-3 rounded-lg border border-[#E4E4E7] bg-[#FAFAFA] p-3"
    >
      <p className="text-[13px] font-medium">
        Send {KIND_NOUN[kind]} to {partyCount(count)}?
      </p>
      <p className="text-[12.5px] text-[#52525B]">
        It starts right away and takes {duration(count)}. You can stop it while it runs.
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={PRIMARY_CLASS} disabled={starting} onClick={onSend}>
          {starting ? <Spinner /> : null}
          Yes, send to {partyCount(count)}
        </button>
        <button type="button" className={CONTROL_CLASS} disabled={starting} onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}

function Progress({
  campaignId,
  kind,
  onClose,
}: {
  campaignId: Id<"campaigns">;
  kind: EmailKind;
  onClose: () => void;
}) {
  const campaigns = useQuery(api.admin.campaigns, {});
  const campaign = campaigns?.find((entry) => entry.campaignId === campaignId);

  if (!campaign) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  const settled = campaign.sent + campaign.failed + campaign.cancelled;
  const title =
    campaign.status === "sending"
      ? `Sending ${KIND_NOUN[kind]}`
      : campaign.status === "cancelled"
        ? "Stopped"
        : "All sent";

  return (
    <section aria-label="Progress" className="flex flex-col gap-3">
      <p className="text-[15px] font-semibold">{title}</p>
      <div
        role="progressbar"
        aria-label="Sent so far"
        aria-valuemin={0}
        aria-valuemax={campaign.total}
        aria-valuenow={settled}
        className="h-1.5 overflow-hidden rounded-full bg-[#F4F4F5]"
      >
        <div
          className="h-full rounded-full bg-[#18181B] transition-[width] duration-300"
          style={{ width: `${campaign.total === 0 ? 100 : (settled / campaign.total) * 100}%` }}
        />
      </div>
      <dl className="grid grid-cols-3 gap-2 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        <Count label="Sent" value={campaign.sent} />
        <Count label="Failed" value={campaign.failed} alarm />
        <Count
          label={campaign.status === "cancelled" ? "Not sent" : "Left"}
          value={campaign.remaining + campaign.cancelled}
        />
      </dl>
      {campaign.status === "sending" ? (
        <StopButton campaignId={campaignId} />
      ) : (
        <p className="text-[12.5px] text-[#52525B]">
          {progressText(campaign)}. Opens and replies show on the pipeline as they come in.
        </p>
      )}
      {campaign.status === "sending" ? (
        <p className="text-[12px] text-[#71717A]">You can close this. Sending carries on, and Recent sends shows it.</p>
      ) : (
        <button type="button" className={cn(CONTROL_CLASS, "w-fit")} onClick={onClose}>
          Close
        </button>
      )}
    </section>
  );
}

function Count({ label, value, alarm = false }: { label: string; value: number; alarm?: boolean }) {
  return (
    <div className="flex flex-col rounded-md border border-[#E4E4E7] px-2.5 py-1.5">
      <dt className="text-[#71717A]">{label}</dt>
      <dd
        className={cn(
          "text-[17px] font-semibold",
          alarm && value > 0 && "text-[#BE123C]",
          value === 0 && "text-[#A1A1AA]",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function StopButton({ campaignId, className }: { campaignId: Id<"campaigns">; className?: string }) {
  const cancel = useMutation(api.admin.cancelCampaign);
  const [stopping, setStopping] = useState(false);
  return (
    <button
      type="button"
      className={cn(CONTROL_CLASS, "w-fit border-[#FECDD3] text-[#9F1239] hover:bg-[#FFF1F2]", className)}
      disabled={stopping}
      onClick={async () => {
        setStopping(true);
        try {
          const { stopped } = await cancel({ campaignId });
          toast.success(
            stopped > 0 ? `Stopped. ${partyCount(stopped)} will not be emailed.` : "Everything had already gone out.",
          );
        } catch (error) {
          toast.error("Could not stop sending", { description: convexErrorMessage(error) });
        } finally {
          setStopping(false);
        }
      }}
    >
      {stopping ? <Spinner /> : null}
      Stop sending
    </button>
  );
}

function Preview({
  kind,
  parties,
  party,
  onPick,
  loading,
}: {
  kind: EmailKind;
  parties: { partyId: PartyId; displayName: string; surname: string }[];
  party: { partyId: PartyId } | undefined;
  onPick: (partyId: PartyId) => void;
  loading: boolean;
}) {
  const render = useAction(api.email.preview.previewEmail);
  const partyId = party?.partyId;
  const preview = useTanStackQuery({
    queryKey: ["email-preview", kind, partyId],
    queryFn: () => render({ kind, partyId: partyId as PartyId }),
    enabled: partyId !== undefined,
    staleTime: 30_000,
  });

  return (
    <section aria-label="Preview" className="flex min-w-0 flex-1 flex-col gap-3 bg-[#FAFAFA] p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-[#71717A]">Preview for</span>
        {parties.length > 0 && partyId ? (
          <AdminSelect
            aria-label="Preview for"
            value={partyId}
            onChange={(value) => onPick(value)}
            options={parties.map((option) => ({ value: option.partyId, label: partyName(option) }))}
            className="h-8 max-w-full min-w-0 bg-[#FFFFFF] sm:max-w-[280px]"
          />
        ) : loading ? (
          <Skeleton className="h-8 w-48" />
        ) : null}
      </div>
      {preview.data ? (
        <p className="truncate text-[12.5px]">
          <span className="text-[#71717A]">Subject </span>
          {preview.data.subject}
        </p>
      ) : (
        <Skeleton className="h-4 w-72 max-w-full" />
      )}
      {preview.error ? (
        <p className="text-[12.5px] text-[#9F1239]">
          Could not render the preview. {convexErrorMessage(preview.error)}
        </p>
      ) : preview.data ? (
        <iframe
          title="Email preview"
          srcDoc={preview.data.html}
          // No scripts. Links open in a new tab, where the party's form opens as a test.
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          className="h-[460px] w-full rounded-md border border-[#E4E4E7] bg-[#F3E9DA] md:h-[580px]"
        />
      ) : (
        <Skeleton className="h-[460px] w-full md:h-[580px]" />
      )}
    </section>
  );
}
