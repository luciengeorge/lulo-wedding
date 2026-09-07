import { createServerFn } from "@tanstack/react-start";

import { getSession } from "./get-session";

export const requireSession = createServerFn({ method: "GET" }).handler(async () => {
  const session = await getSession();
  if (!session) {
    throw new Error("Unauthorized");
  }
  return session;
});
