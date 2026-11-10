import type { FunctionReturnType } from "convex/server";

import type { api } from "@/../convex/_generated/api";

import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type Funnel = FunctionReturnType<typeof api.admin.funnel>;

/** Whole percent, or nothing when there is no base to divide by. */
export function percentOf(part: number, whole: number): string | undefined {
  return whole === 0 ? undefined : `${Math.round((part / whole) * 100)}%`;
}

/** How the invitations went out, and what the emails did. Empty until anything was sent. */
export function invitedDetail(funnel: Funnel): string[] {
  if (funnel.invited.any === 0 && funnel.email.sent === 0) return [];
  const lines = [`${funnel.invited.email} by email, ${funnel.invited.whatsapp} on WhatsApp`];
  if (funnel.email.sent > 0) {
    lines.push(
      `Emails: ${funnel.email.sent} sent, ${funnel.email.opened} opened, ${funnel.email.bounced} bounced` +
        (funnel.email.complained > 0 ? `, ${funnel.email.complained} marked as spam` : ""),
    );
  }
  return lines;
}

/**
 * Where the invitations have got to: three numbers, each out of every party on
 * the list. The channel and email detail sits behind Invited, and the dashboard
 * has the rest.
 */
export function FunnelStrip({ funnel }: { funnel: Funnel | undefined }) {
  const detail = funnel ? invitedDetail(funnel) : [];

  return (
    <section
      aria-label="Invitation funnel"
      className="flex items-center gap-6 overflow-x-auto border-b border-border px-4 py-2.5 sm:gap-8 sm:px-6"
    >
      <Step label="Invited" value={funnel?.invited.any} total={funnel?.parties} detail={detail} />
      <Step label="Seen" value={funnel?.visited} total={funnel?.parties} />
      <Step label="Replied" value={funnel?.replied} total={funnel?.parties} />
    </section>
  );
}

function Step({
  label,
  value,
  total,
  detail = [],
}: {
  label: string;
  value: number | undefined;
  total: number | undefined;
  detail?: string[];
}) {
  const text = (
    <span className={detail.length > 0 ? "underline decoration-dotted underline-offset-4" : undefined}>{label}</span>
  );
  return (
    <div role="group" aria-label={label} className="flex shrink-0 items-baseline gap-1.5 text-[12px] whitespace-nowrap">
      {detail.length > 0 ? (
        <Tooltip>
          <TooltipTrigger className="cursor-help rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            {text}
          </TooltipTrigger>
          <TooltipContent side="bottom" className="flex-col items-start gap-0.5">
            {detail.map((line) => (
              <span key={line}>{line}</span>
            ))}
          </TooltipContent>
        </Tooltip>
      ) : (
        <span className="text-muted-foreground">{text}</span>
      )}
      {value === undefined || total === undefined ? (
        <Skeleton className="h-3.5 w-20 self-center" />
      ) : (
        <>
          <span
            className={`text-[14px] font-semibold ${value === 0 ? "text-muted-foreground/70" : "text-foreground"}`}
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {value}
          </span>
          <span className="text-muted-foreground" style={{ fontVariantNumeric: "tabular-nums" }}>
            of {total} {total === 1 ? "party" : "parties"}
            {total > 0 ? ` · ${percentOf(value, total)}` : ""}
          </span>
        </>
      )}
    </div>
  );
}
