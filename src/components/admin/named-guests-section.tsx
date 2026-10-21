import type { FunctionReturnType } from "convex/server";

import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import type { EventFlags } from "@/lib/rsvp-rules";

import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { convexErrorMessage } from "@/lib/convex-error";
import { INVITE_EVENTS } from "@/lib/party-labels";
import { NamedGuestSchema, type NamedGuestValues, ownInvite } from "@/lib/schemas/named-guest";

import type { PartyRow } from "./party-row";

type NamedGuest = FunctionReturnType<typeof api.admin.namedGuests>[number];

function partyFlags(party: PartyRow): EventFlags {
  return {
    preWedding: party.invitedToPreWedding,
    wedding: party.invitedToWedding,
    brunch: party.invitedToBrunch,
  };
}

function fullName(values: { firstName: string; lastName: string }) {
  return `${values.firstName} ${values.lastName}`.trim();
}

/**
 * The party form's "People" section: someone named ahead of the reply, usually
 * to ask them to a different set of events from the rest of the party.
 *
 * Saves each person straight away rather than with the party's Save button. A
 * person is a row of their own, and folding three mutations into one submit
 * would leave a half-saved party when the second of them failed.
 */
export function NamedGuestsSection({ party }: { party: PartyRow }) {
  const guests = useQuery(api.admin.namedGuests, { partyId: party._id });
  const flags = partyFlags(party);

  return (
    <section aria-labelledby="named-guests-title" className="flex flex-col gap-3 border-t border-[#E4E4E7] pt-5">
      <div className="flex flex-col gap-1">
        <h3 id="named-guests-title" className="text-sm font-medium">
          People
        </h3>
        <p className="text-[12.5px] text-[#71717A]">
          Name someone before the party replies, to invite them to different events from the rest. Changes here save
          straight away. Their card cannot be removed by the party, only marked not coming.
        </p>
      </div>

      {guests === undefined ? (
        <Skeleton className="h-[92px] w-full rounded-lg" />
      ) : (
        guests.map((guest) => <NamedGuestForm key={guest._id} party={party} flags={flags} guest={guest} />)
      )}

      <NamedGuestForm party={party} flags={flags} />
    </section>
  );
}

/** One person, or with no `guest` the blank row that adds one. */
function NamedGuestForm({ party, flags, guest }: { party: PartyRow; flags: EventFlags; guest?: NamedGuest }) {
  const addNamedGuest = useMutation(api.admin.addNamedGuest);
  const updateNamedGuest = useMutation(api.admin.updateNamedGuest);
  const removeNamedGuest = useMutation(api.admin.removeNamedGuest);
  const [removing, setRemoving] = useState(false);

  const defaults: NamedGuestValues = {
    firstName: guest?.firstName ?? "",
    lastName: guest?.lastName ?? "",
    ...(guest?.invitedTo ?? flags),
  };

  const form = useForm({
    defaultValues: defaults,
    validators: {
      onSubmit: NamedGuestSchema,
      onSubmitAsync: async ({ value }) => {
        const parsed = NamedGuestSchema.parse(value);
        const invitedTo = ownInvite(parsed, flags);
        try {
          if (guest) {
            await updateNamedGuest({
              guestId: guest._id,
              firstName: parsed.firstName,
              lastName: parsed.lastName,
              invitedTo,
            });
            toast.success(`Saved ${fullName(parsed)}`);
            // The saved values become the new baseline, so Save goes quiet again.
            form.reset(parsed);
          } else {
            await addNamedGuest({
              partyId: party._id,
              firstName: parsed.firstName,
              lastName: parsed.lastName,
              ...(invitedTo ? { invitedTo } : {}),
            });
            toast.success(`Added ${fullName(parsed)} to ${party.displayName}`);
            form.reset();
          }
        } catch (error) {
          return {
            form: convexErrorMessage(error, guest ? "Could not save this person" : "Could not add this person"),
          };
        }
      },
    },
  });

  const handleRemove = async () => {
    if (!guest) return;
    setRemoving(true);
    try {
      await removeNamedGuest({ guestId: guest._id });
      toast.success(`Removed ${fullName(guest)} from ${party.displayName}`);
    } catch (error) {
      toast.error("Could not remove this person", { description: convexErrorMessage(error) });
      setRemoving(false);
    }
  };

  const idPrefix = guest ? `named-${guest._id}` : "named-new";

  return (
    <form
      aria-label={guest ? fullName(guest) : "Add a person"}
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
      className={`flex flex-col gap-3 rounded-lg border p-3 ${guest ? "border-[#E4E4E7]" : "border-dashed border-[#D4D4D8]"}`}
    >
      <FieldGroup className="grid grid-cols-2 gap-3">
        <form.Field name="firstName">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-first`} className="text-[12.5px]">
                First name
              </FieldLabel>
              <Input
                id={`${idPrefix}-first`}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                className="h-8 text-[13px]"
              />
              {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
            </Field>
          )}
        </form.Field>
        <form.Field name="lastName">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={`${idPrefix}-last`} className="text-[12.5px]">
                Last name
              </FieldLabel>
              <Input
                id={`${idPrefix}-last`}
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                className="h-8 text-[13px]"
              />
              {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
            </Field>
          )}
        </form.Field>
      </FieldGroup>

      <div role="group" aria-label="Invited to" className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {INVITE_EVENTS.map((event) => (
          <form.Field key={event.key} name={event.key}>
            {(field) => (
              <div className="flex items-center gap-2">
                <Checkbox
                  id={`${idPrefix}-${event.key}`}
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <FieldLabel htmlFor={`${idPrefix}-${event.key}`} className="text-[12.5px] font-normal">
                  {event.label}
                </FieldLabel>
              </div>
            )}
          </form.Field>
        ))}
        <form.Subscribe selector={(state) => ownInvite(state.values, flags) === null}>
          {(followsParty) => (
            <span className="text-[11.5px] text-[#A1A1AA]">{followsParty ? "Same as the party" : "Own invite"}</span>
          )}
        </form.Subscribe>
      </div>

      <form.Subscribe
        selector={(state) => ({
          isDirty: state.isDirty,
          isSubmitting: state.isSubmitting,
          formError: state.errorMap.onSubmit?.form,
          eventError: state.fieldMeta.wedding?.errors,
        })}
      >
        {({ isDirty, isSubmitting, formError, eventError }) => (
          <div className="flex flex-col gap-2">
            {eventError && eventError.length > 0 ? <FieldError errors={eventError} /> : null}
            {formError ? <FieldError>{String(formError)}</FieldError> : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {guest?.hasAnswers ? (
                <span className="mr-auto text-[11.5px] text-[#71717A]">Has replied, so their answer stays</span>
              ) : null}
              {guest && !guest.hasAnswers ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="mr-auto text-[#9F1239] hover:bg-[#FFF1F2] hover:text-[#9F1239]"
                  disabled={removing || isSubmitting}
                  onClick={() => void handleRemove()}
                >
                  {removing ? <Spinner /> : null}
                  Remove
                </Button>
              ) : null}
              <Button
                type="submit"
                size="sm"
                variant="outline"
                disabled={isSubmitting || removing || (guest !== undefined && !isDirty)}
              >
                {isSubmitting ? <Spinner /> : null}
                {guest ? "Save person" : "Add person"}
              </Button>
            </div>
          </div>
        )}
      </form.Subscribe>
    </form>
  );
}
