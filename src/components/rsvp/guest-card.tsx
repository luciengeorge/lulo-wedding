import { useId, useState } from "react";

import type { EventFlags } from "@/lib/rsvp-rules";

import { RSVP_EVENTS } from "@/lib/rsvp-rules";

import { EventChips } from "./event-chips";
import { FieldError, TextField } from "./fields";
import { CardLabel, RsvpCard } from "./rsvp-shell";

export type GuestDraft = {
  guestId?: string;
  firstName: string;
  lastName: string;
  email: string;
  /** Set by the "no email address" tick. Children have names but no inbox. */
  noEmail: boolean;
  dietaryNotes: string;
  isPlusOne: boolean;
  attending: Partial<Record<keyof EventFlags, boolean>>;
  /** Which events this one person is asked about. A card never shows any other. */
  invitedTo: EventFlags;
  /** Named by the couple: the card stays, and can only be marked not coming. */
  addedByCouple: boolean;
  /** Set by the "cannot make it" tick on a couple-named card. */
  notComing: boolean;
};

/** A seat the couple did not name, asked about the party's own events. */
export function emptyGuest(invitedTo: EventFlags, isPlusOne = false): GuestDraft {
  return {
    firstName: "",
    lastName: "",
    email: "",
    noEmail: false,
    dietaryNotes: "",
    isPlusOne,
    attending: {},
    invitedTo,
    addedByCouple: false,
    notComing: false,
  };
}

/**
 * One seat on the invitation.
 *
 * The same card serves a named adult, a child with no email, and a plus one, so a
 * family of five is five identical decisions rather than five different forms.
 */
export function GuestCard({
  guest,
  index,
  label,
  errors,
  disabled,
  onChange,
  onRemove,
}: {
  guest: GuestDraft;
  index: number;
  label: string;
  errors: Record<string, string>;
  disabled?: boolean;
  onChange: (next: GuestDraft) => void;
  onRemove?: () => void;
}) {
  const id = useId();
  const [showNote, setShowNote] = useState(guest.dietaryNotes !== "");

  const set = <K extends keyof GuestDraft>(key: K, value: GuestDraft[K]) => onChange({ ...guest, [key]: value });
  const events = RSVP_EVENTS.filter((event) => guest.invitedTo[event.key]).map((event) => event.key);
  const name = guest.firstName.trim() || `Guest ${index + 1}`;

  return (
    <RsvpCard legend={label}>
      <div className="flex items-baseline justify-between">
        <CardLabel>{label}</CardLabel>
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="font-display text-[13px] text-faded underline underline-offset-4"
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="flex gap-2.5">
        <TextField
          id={`${id}-first`}
          label={`First name, guest ${index + 1}`}
          placeholder="First name"
          autoComplete="off"
          value={guest.firstName}
          disabled={disabled}
          invalid={Boolean(errors.firstName)}
          onChange={(value) => set("firstName", value)}
        />
        <TextField
          id={`${id}-last`}
          label={`Last name, guest ${index + 1}`}
          placeholder="Last name"
          autoComplete="off"
          value={guest.lastName}
          disabled={disabled}
          onChange={(value) => set("lastName", value)}
        />
      </div>
      {errors.firstName ? <FieldError>{errors.firstName}</FieldError> : null}

      {guest.addedByCouple ? (
        <label className="flex items-center gap-2 font-display text-[14px] text-faded">
          <input
            type="checkbox"
            checked={guest.notComing}
            disabled={disabled}
            onChange={(event) => set("notComing", event.target.checked)}
            className="size-[15px] accent-[#9B0D17]"
          />
          {name} cannot make it
        </label>
      ) : null}

      {guest.notComing ? null : (
        <GuestDetails
          id={id}
          guest={guest}
          index={index}
          events={events}
          errors={errors}
          disabled={disabled}
          showNote={showNote}
          onShowNote={() => setShowNote(true)}
          onChange={onChange}
        />
      )}
    </RsvpCard>
  );
}

/** Everything below the name, which a guest marked not coming does not need. */
function GuestDetails({
  id,
  guest,
  index,
  events,
  errors,
  disabled,
  showNote,
  onShowNote,
  onChange,
}: {
  id: string;
  guest: GuestDraft;
  index: number;
  events: readonly (keyof EventFlags)[];
  errors: Record<string, string>;
  disabled?: boolean;
  showNote: boolean;
  onShowNote: () => void;
  onChange: (next: GuestDraft) => void;
}) {
  const set = <K extends keyof GuestDraft>(key: K, value: GuestDraft[K]) => onChange({ ...guest, [key]: value });

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <TextField
          id={`${id}-email`}
          type="email"
          label={`Email, guest ${index + 1}`}
          placeholder={guest.noEmail ? "No email address" : "Email"}
          autoComplete="off"
          value={guest.noEmail ? "" : guest.email}
          disabled={disabled || guest.noEmail}
          invalid={Boolean(errors.email)}
          onChange={(value) => set("email", value)}
        />
        <label className="flex items-center gap-2 font-display text-[14px] text-faded">
          <input
            type="checkbox"
            checked={guest.noEmail}
            disabled={disabled}
            onChange={(event) => onChange({ ...guest, noEmail: event.target.checked, email: "" })}
            className="size-[15px] accent-[#9B0D17]"
          />
          No email address
        </label>
        {errors.email ? <FieldError>{errors.email}</FieldError> : null}
      </div>

      <EventChips
        events={events}
        value={guest.attending}
        disabled={disabled}
        invalid={Boolean(errors.attending)}
        legend={`Which days ${guest.firstName.trim() || `guest ${index + 1}`} is coming to`}
        onChange={(event, next) => set("attending", { ...guest.attending, [event]: next })}
      />
      {errors.attending ? <FieldError>{errors.attending}</FieldError> : null}

      {showNote ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-diet`} className="font-display text-[15px] leading-[18px] text-faded">
            Anything we should know
          </label>
          <textarea
            id={`${id}-diet`}
            rows={2}
            value={guest.dietaryNotes}
            disabled={disabled}
            placeholder="Allergies, access, anything at all."
            onChange={(event) => set("dietaryNotes", event.target.value)}
            className="w-full resize-y rounded-[3px] border border-[#E7D9C4] bg-[#FFFCF7] px-3.5 py-2.5 font-display text-[15px] text-bark outline-none placeholder:text-[#B0A091] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15"
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={onShowNote}
          disabled={disabled}
          className="self-start font-display text-[14px] text-ink italic underline underline-offset-4"
        >
          + Add a dietary note
        </button>
      )}
    </>
  );
}
