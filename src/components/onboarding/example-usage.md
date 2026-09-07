# Onboarding wizard — usage

Pattern for gating first-time users through a setup flow.

## 1. Add `onboardedAt` to your user table

You can either extend the better-auth `user` schema (advanced — requires CLI
regen) or add a sibling `userProfiles` table:

```ts
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  userProfiles: defineTable({
    userId: v.string(), // matches betterAuth user._id
    onboardedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),
});
```

## 2. Mark onboarded in a mutation

```ts
// convex/userProfile.ts
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authComponent } from "./betterAuth/auth";

export const myProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) return null;
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
  },
});

export const markOnboarded = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { onboardedAt: Date.now() });
    } else {
      await ctx.db.insert("userProfiles", { userId: user._id, onboardedAt: Date.now() });
    }
  },
});
```

## 3. Render the wizard in `_app` layout

```tsx
// src/routes/app.tsx
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";

import { Wizard } from "@/components/onboarding/wizard";
import { useAnalytics, AnalyticsEvent } from "@/lib/analytics";
import { api } from "@/../convex/_generated/api";

function OnboardingGate() {
  const profile = useQuery(api.userProfile.myProfile);
  const markOnboarded = useMutation(api.userProfile.markOnboarded);
  const { capture } = useAnalytics();
  const [open, setOpen] = useState(true);

  if (profile === undefined) return null; // loading
  if (profile?.onboardedAt) return null; // already done

  return (
    <Wizard
      open={open}
      onOpenChange={setOpen}
      onComplete={async () => {
        await markOnboarded();
      }}
      onStepChange={(id, i) => capture(AnalyticsEvent.onboardingStep, { step_id: id, step_index: i })}
      steps={[
        {
          id: "welcome",
          title: "Welcome to MyApp",
          description: "Let's get you set up in 60 seconds.",
          content: <WelcomeStep />,
        },
        {
          id: "connect-source",
          title: "Connect your first source",
          content: <ConnectSourceStep />,
          canContinue: false, // toggled true once user connects
        },
        {
          id: "done",
          title: "All set",
          content: <DoneStep />,
          continueLabel: "Get started",
        },
      ]}
    />
  );
}
```

## 4. (Optional) Track in PostHog

Add to `src/lib/analytics.ts`:

```ts
export const AnalyticsEvent = {
  // …existing
  onboardingStep: "onboarding_step_viewed",
  onboardingCompleted: "onboarding_completed",
} as const;
```

## Tips

- **Don't make every step blocking**. Pre-fill from OAuth data where you can.
- **Allow skip** for non-essential steps (e.g. profile photo).
- **Persist progress** if your flow is >3 steps — write each completed step
  to `userProfiles.completedSteps: string[]` so users can resume.
- **Capture drop-off** via PostHog funnels on `onboarding_step_viewed`.
