import { v } from "convex/values";

import { internalQuery } from "../_generated/server";
import { authComponent } from "../betterAuth/auth";

/**
 * Resolves the calling user's Polar identity.
 *
 * The Polar component hands `getUserInfo` a ctx that only promises `runQuery`
 * (`Pick<GenericQueryCtx<GenericDataModel>, "runQuery">`), so it cannot call
 * `authComponent.getAuthUser`, which needs a full `GenericCtx<DataModel>`.
 * Going through a registered query keeps that honest: this handler gets a real
 * QueryCtx, and the caller only uses the capability its type actually grants.
 */
export const getPolarUserInfo = internalQuery({
  args: {},
  returns: v.object({ userId: v.string(), email: v.string() }),
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return { userId: user._id, email: user.email };
  },
});
