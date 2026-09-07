import { ConvexError } from "convex/values";

/**
 * Pulls a message worth showing out of whatever a Convex call rejected with.
 *
 * Convex redacts the message of a plain `Error` thrown by a function on a
 * production deployment — the client only ever sees "Server Error". Anything the
 * couple is meant to read has to be thrown as a `ConvexError`, and this is the
 * matching half that unwraps it.
 */
export function convexErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : fallback;
  }
  return error instanceof Error && error.message !== "" ? error.message : fallback;
}
