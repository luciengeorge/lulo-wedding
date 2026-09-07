import { useForm } from "@tanstack/react-form";
import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/../convex/_generated/api";
import { AdminSelect } from "@/components/admin/admin-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { convexErrorMessage } from "@/lib/convex-error";
import { INVITE_EVENTS, LINK_LABEL, WAVE_LABEL, WHO_LONG_LABEL } from "@/lib/party-labels";
import { EMPTY_PARTY_FORM, type PartyFormValues, PartyFormSchema, toPartyMutationFields } from "@/lib/schemas/party";

import type { PartyRow } from "./party-row";

const WHO_OPTIONS = (Object.keys(WHO_LONG_LABEL) as (keyof typeof WHO_LONG_LABEL)[]).map((value) => ({
  value,
  label: WHO_LONG_LABEL[value],
}));
const WAVE_OPTIONS = (Object.keys(WAVE_LABEL) as (keyof typeof WAVE_LABEL)[]).map((value) => ({
  value,
  label: WAVE_LABEL[value],
}));
const LINK_OPTIONS = (Object.keys(LINK_LABEL) as (keyof typeof LINK_LABEL)[]).map((value) => ({
  value,
  label: LINK_LABEL[value],
}));

function toFormValues(party: PartyRow): PartyFormValues {
  return {
    displayName: party.displayName,
    surname: party.surname,
    headCount: party.headCount,
    plusOneAllowed: party.plusOneAllowed,
    link: party.link,
    whereFrom: party.whereFrom ?? "",
    who: party.who,
    wave: party.wave,
    invitedToPreWedding: party.invitedToPreWedding,
    invitedToWedding: party.invitedToWedding,
    invitedToBrunch: party.invitedToBrunch,
    saveTheDateSent: party.saveTheDateSent,
    note: party.note ?? "",
    contactEmail: party.contactEmail ?? "",
  };
}

export function PartyFormDialog({
  party,
  open,
  onOpenChange,
}: {
  /** `null` opens the dialog in "add a party" mode. */
  party: PartyRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-[560px]">
        {/* Remounting on the target party discards any half-typed edit from the
            previous one, which is cheaper and safer than resetting by hand. */}
        <PartyFormBody key={party?._id ?? "new"} party={party} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PartyFormBody({ party, onDone }: { party: PartyRow | null; onDone: () => void }) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const createParty = useMutation(api.admin.createParty);
  const updateParty = useMutation(api.admin.updateParty);

  const form = useForm({
    defaultValues: party ? toFormValues(party) : EMPTY_PARTY_FORM,
    validators: {
      onSubmit: PartyFormSchema,
      onSubmitAsync: async ({ value }) => {
        // `onSubmit` already ran, so this only re-applies the schema's trimming.
        const fields = toPartyMutationFields(PartyFormSchema.parse(value));

        try {
          if (party) await updateParty({ partyId: party._id, fields });
          else await createParty(fields);
        } catch (error) {
          return { form: convexErrorMessage(error, "Could not save this party") };
        }

        toast.success(party ? "Party updated" : "Party added");
        onDone();
      },
    },
  });

  if (confirmingDelete && party) {
    return <ConfirmDelete party={party} onCancel={() => setConfirmingDelete(false)} onDeleted={onDone} />;
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{party ? "Edit party" : "Add party"}</DialogTitle>
        <DialogDescription>
          {party
            ? "The magic link and the guest sheet's import key are left untouched, so this party keeps working and still matches on the next import."
            : "One row is one invitation. Head count is the named seats, not counting a plus-one."}
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          form.handleSubmit();
        }}
        className="flex flex-col gap-5"
      >
        <div className="grid grid-cols-2 gap-4">
          <form.Field name="displayName">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Name(s)</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Rae and Cherif et famille"
                />
                {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
              </Field>
            )}
          </form.Field>

          <form.Field name="surname">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Surname</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Optional"
                />
                {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
              </Field>
            )}
          </form.Field>

          <form.Field name="headCount">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Seats</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="number"
                  min={1}
                  max={30}
                  value={Number.isNaN(field.state.value) ? "" : field.state.value}
                  onChange={(e) => field.handleChange(e.target.valueAsNumber)}
                  onBlur={field.handleBlur}
                />
                {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
              </Field>
            )}
          </form.Field>

          <form.Field name="plusOneAllowed">
            {(field) => (
              <Field orientation="horizontal" className="self-end pb-2">
                <Checkbox
                  id={field.name}
                  checked={field.state.value}
                  onCheckedChange={(checked) => field.handleChange(checked === true)}
                />
                <FieldLabel htmlFor={field.name} className="font-normal">
                  Allowed a plus-one
                </FieldLabel>
              </Field>
            )}
          </form.Field>

          <form.Field name="who">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Whose</FieldLabel>
                <AdminSelect
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  options={WHO_OPTIONS}
                  className="w-full text-sm"
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="wave">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Wave</FieldLabel>
                <AdminSelect
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  options={WAVE_OPTIONS}
                  className="w-full text-sm"
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="link">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Link</FieldLabel>
                <AdminSelect
                  id={field.name}
                  value={field.state.value}
                  onChange={field.handleChange}
                  options={LINK_OPTIONS}
                  className="w-full text-sm"
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="whereFrom">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>Where from</FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                  placeholder="Childhood"
                />
                {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
              </Field>
            )}
          </form.Field>
        </div>

        <Field>
          <FieldLabel>Invited to</FieldLabel>
          <div className="flex flex-wrap gap-5">
            {INVITE_EVENTS.map((event) => (
              <form.Field key={event.flag} name={event.flag}>
                {(field) => (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={field.name}
                      checked={field.state.value}
                      onCheckedChange={(checked) => field.handleChange(checked === true)}
                    />
                    <FieldLabel htmlFor={field.name} className="font-normal">
                      {event.label}
                    </FieldLabel>
                  </div>
                )}
              </form.Field>
            ))}
          </div>
        </Field>

        <form.Field name="saveTheDateSent">
          {(field) => (
            <Field orientation="horizontal">
              <Checkbox
                id={field.name}
                checked={field.state.value}
                onCheckedChange={(checked) => field.handleChange(checked === true)}
              />
              <FieldLabel htmlFor={field.name} className="font-normal">
                Save-the-date sent
              </FieldLabel>
            </Field>
          )}
        </form.Field>

        <form.Field name="contactEmail">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Email(s)</FieldLabel>
              <Input
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                placeholder="Separate several with commas"
              />
              {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
            </Field>
          )}
        </form.Field>

        <form.Field name="note">
          {(field) => (
            <Field>
              <FieldLabel htmlFor={field.name}>Note</FieldLabel>
              <Textarea
                id={field.name}
                name={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
                rows={2}
              />
              {field.state.meta.isValid ? null : <FieldError errors={field.state.meta.errors} />}
            </Field>
          )}
        </form.Field>

        <form.Subscribe
          selector={(state) => ({
            canSubmit: state.canSubmit,
            isSubmitting: state.isSubmitting,
            errorMap: state.errorMap,
          })}
        >
          {({ canSubmit, isSubmitting, errorMap }) => (
            <div className="flex flex-col gap-3">
              {errorMap.onSubmit?.form ? <FieldError>{String(errorMap.onSubmit.form)}</FieldError> : null}
              <DialogFooter className="sm:justify-between">
                {party ? (
                  <Button type="button" variant="destructive" onClick={() => setConfirmingDelete(true)}>
                    Delete party
                  </Button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={onDone}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!canSubmit || isSubmitting} className="bg-ink hover:bg-ink/90">
                    {isSubmitting ? <Spinner /> : null}
                    {party ? "Save changes" : "Add party"}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </form.Subscribe>
      </form>
    </>
  );
}

function ConfirmDelete({
  party,
  onCancel,
  onDeleted,
}: {
  party: PartyRow;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const deleteParty = useMutation(api.admin.deleteParty);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { deletedGuests } = await deleteParty({ partyId: party._id });
      toast.success(`Deleted ${party.displayName}`, {
        description: deletedGuests > 0 ? `${deletedGuests} guest row(s) went with it.` : undefined,
      });
      onDeleted();
    } catch (error) {
      toast.error("Could not delete this party", {
        description: convexErrorMessage(error),
      });
      setDeleting(false);
    }
  };

  const name = `${party.displayName} ${party.surname}`.trim();

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete {name}?</DialogTitle>
        <DialogDescription>
          {party.rsvp.guestCount > 0
            ? `This party has already replied. Deleting it destroys ${party.rsvp.guestCount} guest row(s) and their RSVPs, and there is no undo.`
            : "This removes the party and invalidates its magic link. There is no undo."}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={deleting}>
          Keep it
        </Button>
        <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
          {deleting ? <Spinner /> : null}
          Delete party
        </Button>
      </DialogFooter>
    </>
  );
}
