import type { ReactNode } from "react";

import { Monogram } from "@/components/wedding/monogram";

/**
 * The paper every RSVP screen is printed on.
 *
 * The invitation feeling has to survive the form, so this carries the same tile,
 * monogram and painted border as the save-the-date rather than dropping the guest
 * into a plain white page the moment they are asked to do something.
 */
export function RsvpShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh w-full flex-col items-center bg-paper [background-image:url('/art/paper-tile.webp')] bg-[length:560px_428px] bg-repeat pt-10 pb-[78px] text-bark">
      <div className="relative z-10 w-full max-w-[420px] px-6">{children}</div>

      {/* Fixed to the bottom of the page, not the viewport: on a long form it
          should close the page, not follow the reader down it. */}
      <img
        aria-hidden
        alt=""
        src="/art/border-bottom.webp"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-11 w-full object-cover object-[50%_60%]"
      />
    </div>
  );
}

/** Monogram, party name, and a line saying what this screen is for. */
export function RsvpHeader({ title, subtitle, script }: { title: string; subtitle?: string; script?: boolean }) {
  return (
    <header className="flex flex-col items-center text-center">
      <Monogram className="w-[46px] text-ink" />
      {script ? (
        <p className="mt-3.5 font-script text-[30px] leading-9 text-ink">{title}</p>
      ) : (
        <h1 className="mt-3.5 font-script text-[38px] leading-[44px] text-ink">{title}</h1>
      )}
      {subtitle ? <p className="mt-2 font-display text-[15px] leading-[22px] text-faded">{subtitle}</p> : null}
    </header>
  );
}

/**
 * The cream card the guest cards and summaries sit on.
 *
 * Given a `legend` it becomes a real fieldset. A guest card is a group of fields
 * about one person, and without the grouping a screen reader reads eight
 * unrelated inputs in a row with no way to tell whose name is whose.
 */
export function RsvpCard({
  children,
  dashed = false,
  legend,
}: {
  children: ReactNode;
  dashed?: boolean;
  legend?: string;
}) {
  const className = `mt-6 flex flex-col gap-2.5 rounded-[4px] border bg-[#FFFCF7]/60 p-4 ${
    dashed ? "border-dashed border-[#D8C7AE]" : "border-[#E7D9C4]"
  }`;

  if (legend === undefined) return <div className={className}>{children}</div>;

  return (
    <fieldset className={className}>
      <legend className="sr-only">{legend}</legend>
      {children}
    </fieldset>
  );
}

/** Small caps label, the card's own title. */
export function CardLabel({ children }: { children: ReactNode }) {
  return (
    <p className="font-display text-[11px] leading-[14px] font-semibold tracking-caps text-[#A08C77]">{children}</p>
  );
}
