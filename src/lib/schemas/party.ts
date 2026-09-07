import z from "zod";

/**
 * The party fields the couple can edit from /admin.
 *
 * `token` and `importKey` are absent on purpose: the token is a live magic link
 * that must survive an edit, and the import key is the guest sheet's natural
 * key — changing it would make the next CSV import create a duplicate party
 * instead of updating this one.
 */

/**
 * The sheet's column is "Email(s)" and several parties carry two addresses, so a
 * single `z.email()` would reject real data. Blank is allowed — most parties are
 * reached over WhatsApp, not email.
 */
export const PartyContactEmailSchema = z
  .string()
  .trim()
  .max(300, { error: "That is too long for an email address" })
  .refine((value) => value === "" || value.split(",").every((part) => z.email().safeParse(part.trim()).success), {
    error: "Enter one email address, or several separated by commas",
  });

export const PartyFormSchema = z.object({
  displayName: z
    .string({ error: "A party needs a name" })
    .trim()
    .min(1, { error: "A party needs a name" })
    .max(120, { error: "Name is too long" }),
  surname: z.string().trim().max(120, { error: "Surname is too long" }),
  headCount: z
    .number({ error: "Seats must be a whole number" })
    .int({ error: "Seats must be a whole number" })
    .min(1, { error: "A party needs at least one seat" })
    .max(30, { error: "That is a lot of seats — check the number" }),
  plusOneAllowed: z.boolean(),
  /** Under 50 on the sheet. A filter dimension the couple sort by, so editable. */
  under50: z.boolean(),
  /**
   * The sheet already recorded five parties as "No". Editable because a
   * declined party can change its mind, and with no control the row reads
   * "Declined" forever with nothing in the UI able to undo it.
   */
  earlyDecline: z.boolean(),
  link: z.enum(["family", "friends"], { error: "Pick family or friends" }),
  whereFrom: z.string().trim().max(120, { error: "Where from is too long" }),
  who: z.enum(["lucien", "laura", "mutual", "zeina", "nayla"], { error: "Pick whose side this party is" }),
  wave: z.enum(["tier1", "tier2"], { error: "Pick a wave" }),
  invitedToPreWedding: z.boolean(),
  invitedToWedding: z.boolean(),
  invitedToBrunch: z.boolean(),
  saveTheDateSent: z.boolean(),
  note: z.string().trim().max(2000, { error: "Note is too long" }),
  contactEmail: PartyContactEmailSchema,
});

export type PartyFormValues = z.infer<typeof PartyFormSchema>;

export const EMPTY_PARTY_FORM: PartyFormValues = {
  displayName: "",
  surname: "",
  headCount: 2,
  plusOneAllowed: false,
  under50: false,
  earlyDecline: false,
  link: "friends",
  whereFrom: "",
  who: "mutual",
  wave: "tier1",
  invitedToPreWedding: false,
  invitedToWedding: true,
  invitedToBrunch: false,
  saveTheDateSent: false,
  note: "",
  contactEmail: "",
};

export type PartyMutationFields = Omit<PartyFormValues, "whereFrom" | "note" | "contactEmail"> & {
  whereFrom?: string;
  note?: string;
  contactEmail?: string;
};

/**
 * Maps validated form values onto the mutation's arguments. The three optional
 * text fields drop out entirely when blank rather than being stored as `""` —
 * Convex removes an optional field when it is patched with `undefined`, and
 * `whereFrom: ""` would otherwise render as a stray "· Family" in the table.
 */
export function toPartyMutationFields(values: PartyFormValues): PartyMutationFields {
  const { whereFrom, note, contactEmail, ...rest } = values;
  return {
    ...rest,
    ...(whereFrom === "" ? {} : { whereFrom }),
    ...(note === "" ? {} : { note }),
    ...(contactEmail === "" ? {} : { contactEmail }),
  };
}
