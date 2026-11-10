import { z } from "zod";

/** The guest list's `?view=`. Absent or unknown means the table. */
export const AdminSearchSchema = z.object({ view: z.enum(["table", "board"]).optional().catch(undefined) });

export type AdminView = NonNullable<z.infer<typeof AdminSearchSchema>["view"]>;
