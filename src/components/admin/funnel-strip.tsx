import type { FunctionReturnType } from "convex/server";

import type { api } from "@/../convex/_generated/api";

import { Skeleton } from "@/components/ui/skeleton";

export type Funnel = FunctionReturnType<typeof api.admin.funnel>;

/** Whole percent, or nothing when there is no base to divide by. */
export function percentOf(part: number, whole: number): string | undefined {
  return whole === 0 ? undefined : `${Math.round((part / whole) * 100)}%`;
}

/**
 * Shown while no invitation, update or reminder has been emailed, so a row of zeros reads
 * as "nothing sent yet" rather than "nothing landed".
 */
export const NO_EMAIL_INVITES_NOTE = "No invitations emailed yet, so the email numbers are at zero.";

function ofInvited(part: number, invited: number) {
  const percent = percentOf(part, invited);
  return percent ? `${percent} of invited` : undefined;
}

function parties(count: number) {
  return count === 1 ? "party" : "parties";
}

/**
 * Where the invitations have got to, in one line above the guest list.
 *
 * Every number is in parties and says so, the same rule as the stats above it.
 * Percentages are of the parties invited by any channel, so "seen 53%" reads as
 * "half the people we sent it to have opened it", which is the question asked.
 */
export function FunnelStrip({ funnel }: { funnel: Funnel | undefined }) {
  const invited = funnel?.invited.any ?? 0;

  return (
    <section
      aria-label="Invitation funnel"
      className="flex items-center gap-6 overflow-x-auto border-b border-[#E4E4E7] px-4 py-2.5 sm:px-6"
    >
      <Step
        label="Invited"
        value={funnel?.invited.any}
        hint={funnel ? `${funnel.invited.email} by email · ${funnel.invited.whatsapp} on WhatsApp` : undefined}
      />
      <Step
        label="Opened email"
        value={funnel?.email.opened}
        hint={funnel ? `of ${funnel.email.sent} emailed` : undefined}
      />
      <Step label="Seen link" value={funnel?.visited} hint={funnel ? ofInvited(funnel.visited, invited) : undefined} />
      <Step label="Replied" value={funnel?.replied} hint={funnel ? ofInvited(funnel.replied, invited) : undefined} />
      <Step label="Email bounced" value={funnel?.email.bounced} alarm />
      {funnel?.email.sent === 0 ? (
        <span className="shrink-0 text-[12px] whitespace-nowrap text-[#A1A1AA]">{NO_EMAIL_INVITES_NOTE}</span>
      ) : null}
    </section>
  );
}

function Step({
  label,
  value,
  hint,
  alarm = false,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  /** Red when non-zero: a bounce is the one number here that asks for action. */
  alarm?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5 text-[12px] whitespace-nowrap">
      <span className="text-[#71717A]">{label}</span>
      {value === undefined ? (
        <Skeleton className="h-3.5 w-14 self-center" />
      ) : (
        <>
          <span
            className={`text-[14px] font-semibold ${alarm && value > 0 ? "text-[#9F1239]" : value === 0 ? "text-[#A1A1AA]" : "text-[#18181B]"}`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {value}
          </span>
          <span className="text-[#71717A]">{parties(value)}</span>
          {hint ? <span className="text-[#A1A1AA]">· {hint}</span> : null}
        </>
      )}
    </div>
  );
}
