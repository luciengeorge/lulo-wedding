import z from "zod";

import type { EventFlags } from "@/lib/rsvp-rules";

/**
 * Someone the couple name in a party before it replies, from the party form's
 * "People" section. The three event toggles start at the party's own flags.
 */
export const NamedGuestSchema = z
  .object({
    firstName: z.string().trim().min(1, { error: "A first name, please" }).max(100, { error: "That name is too long" }),
    lastName: z.string().trim().max(100, { error: "That name is too long" }),
    preWedding: z.boolean(),
    wedding: z.boolean(),
    brunch: z.boolean(),
  })
  .refine((value) => value.preWedding || value.wedding || value.brunch, {
    error: "Invite them to at least one event",
    path: ["wedding"],
  });

export type NamedGuestValues = z.infer<typeof NamedGuestSchema>;

/**
 * Toggles that match the party are stored as no invite of their own, so the
 * person keeps following the party if its flags change later. Only a real
 * difference is pinned to the person.
 */
export function ownInvite(values: EventFlags, party: EventFlags): EventFlags | null {
  const same =
    values.preWedding === party.preWedding && values.wedding === party.wedding && values.brunch === party.brunch;
  return same ? null : { preWedding: values.preWedding, wedding: values.wedding, brunch: values.brunch };
}
