import type { RsvpEventKey } from "@/lib/rsvp-rules";

import { RSVP_EVENTS } from "@/lib/rsvp-rules";

/**
 * Which days this guest is coming to.
 *
 * Only the events the party was actually invited to are rendered. A party never
 * sees a chip for an event they are not asked to, so nobody has to wonder whether
 * a greyed-out "Pre-wedding" means they were left off it.
 *
 * Real checkboxes underneath the styling: this is a multi-select, screen readers
 * should say so, and the whole thing has to work before JavaScript has hydrated.
 */
export function EventChips({
  events,
  value,
  onChange,
  legend,
  disabled,
  invalid,
}: {
  events: readonly RsvpEventKey[];
  value: Partial<Record<RsvpEventKey, boolean>>;
  onChange: (event: RsvpEventKey, next: boolean) => void;
  legend: string;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={disabled}>
      <legend className="font-display text-[15px] leading-[18px] text-faded">Coming to</legend>
      <span className="sr-only">{legend}</span>

      <div className="flex gap-2.5">
        {RSVP_EVENTS.filter((event) => events.includes(event.key)).map((event) => {
          const checked = value[event.key] === true;
          return (
            <label
              key={event.key}
              className={`flex h-10 flex-1 basis-0 cursor-pointer items-center justify-center rounded-[3px] border font-display text-[15px] transition-colors ${
                checked
                  ? "border-ink bg-ink text-paper"
                  : `bg-[#FFFCF7] text-bark hover:border-ink/40 ${invalid ? "border-ink/60" : "border-[#E7D9C4]"}`
              } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/25`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={(e) => onChange(event.key, e.target.checked)}
              />
              {event.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
