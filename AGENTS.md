# Agent Context — tanstack-starter-template

This file is the canonical context for AI coding agents (Claude Code, Cursor, Codex,
etc.) working in this repo. Read it before making changes. Same content applies in
`.cursorrules` and `.claude/`.

## What this repo is

A private B2C SaaS starter template. Forked once per product. Goal: ship a paid SaaS in
days, not weeks, by reusing auth, billing, email, observability, and AI plumbing.

## Stack snapshot

```
Runtime:       Node 22+, pnpm 10+
Framework:     TanStack Start (Vite + Nitro), React 19 + React Compiler
Backend:       Convex (DB, scheduled jobs, file storage, websockets, vector search)
Auth:          better-auth via @convex-dev/better-auth
Billing:       Polar (MoR) via @convex-dev/polar, Stripe adapter stubbed
Email:         Resend + @react-email/components
AI:            Vercel AI SDK v6 (@ai-sdk/openai, @ai-sdk/react, ai)
Embeddings:    OpenAI text-embedding-3-small (1536d) via @convex-dev/rag
UI:            shadcn/ui (Base UI variant), Tailwind v4, hugeicons
Forms:         TanStack Form + Zod
Tooling:       oxlint + oxfmt + tsgo (no eslint/prettier/tsc)
Hosting:       Vercel
```

## Folder layout (don't fight it)

```
convex/                  # Convex backend
  schema.ts              # app-level tables (auth lives in betterAuth/)
  auth.config.ts         # Convex auth provider (better-auth)
  convex.config.ts       # registers all @convex-dev/* components
  http.ts                # HTTP routes — better-auth + OAuth callbacks + billing webhooks
  betterAuth/            # auth component (DO NOT edit schema.ts — generated)
  rag.ts                 # generic RAG instance
  billing/               # provider-agnostic billing (polar.ts default, stripe.ts stub)
  email/                 # React Email templates + Resend wrapper
  oauth/                 # OAuth provider helpers
  crons.ts               # scheduled jobs
  rateLimiter.ts         # @convex-dev/rate-limiter setup
  _generated/            # NEVER edit — convex codegen output

src/
  components/
    ui/                  # shadcn — add via `pnpm dlx shadcn@latest add <name>`
    auth/                # auth forms (sign-in, sign-up, reset, magic-link)
    billing/             # paywall, upgrade modal, portal, usage meter
    landing/             # hero, pricing, footer
  integrations/          # provider components (Convex, PostHog, GA, Query)
  lib/
    auth-*.ts            # better-auth client/server/config
    analytics.ts         # useAnalytics() + AnalyticsEvent registry
    logger.ts            # structured + sensitive-key redacting
    utils.ts             # cn()
    functions/           # createServerFn() helpers (server-only)
    schemas/             # zod schemas
  routes/
    __root.tsx           # providers, head, security
    _auth.tsx            # auth layout
    _auth/               # public auth pages
    _app/                # authenticated app shell + settings
    (legal)/             # privacy, terms, cookies
    api/                 # OAuth callbacks, webhook handlers
  routeTree.gen.ts       # NEVER edit — TanStack Router codegen
```

## Conventions

### Imports

- `@/*` → `src/*` (preferred for app code)
- `#/*` → `src/*` (legacy, kept for compatibility with lucien/)
- Always use aliases. No relative paths past two levels.

### Server functions (TanStack Start)

```ts
import { createServerFn } from "@tanstack/react-start";
import * as Sentry from "@sentry/tanstackstart-react";

export const myServerFn = createServerFn({ method: "GET" }).handler(async () => {
  return Sentry.startSpan({ name: "myServerFn" }, async () => {
    // implementation
  });
});
```

Wrap server functions in `Sentry.startSpan()` for tracing.

### Convex schemas

Use the `v` validator builder. Auto fields `_id` and `_creationTime` are added — do not
declare them. Index any field you query on:

```ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  bookmarks: defineTable({
    userId: v.id("user"),
    source: v.union(v.literal("twitter"), v.literal("github"), v.literal("youtube")),
    url: v.string(),
    title: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_source", ["userId", "source"]),
});
```

Auth tables live in `convex/betterAuth/schema.ts` — that file is auto-generated from
the better-auth **plugin set** (admin → `role`/`banned`, etc.), don't edit by hand.

> **Whenever you add/remove/change a better-auth plugin in `convex/betterAuth/auth.ts`,
> the component schema MUST be regenerated, or `adapter:create` will reject inserts
> ("Failed to create user"). `convex dev` does NOT do this — only the better-auth CLI does.**

To make this hard to forget:

- **`pnpm auth:generate`** — regenerates `convex/betterAuth/schema.ts` from your plugins.
- **`pnpm dev` and `pnpm convex`** auto-run it (via `predev`/`preconvex` hooks), so the
  schema is always fresh when Convex pushes it.
- **`pnpm auth:check`** — CI guard: regenerates and fails if the committed schema is stale.

The CLI reads the `options` export in `auth.ts` to introspect plugins, so keep that export.
It runs via isolated `pnpm dlx` (the published CLI version lags better-auth, so a
local devDep conflicts — an isolated runner sidesteps it).

### Forms

Use shadcn's `FieldGroup` + `Field`. Validation via Zod through TanStack Form. Never
use raw `div + space-y-*`:

```tsx
<form
  onSubmit={(e) => {
    e.preventDefault();
    form.handleSubmit();
  }}
>
  <FieldGroup>
    <form.Field name="email" validators={{ onBlur: EmailSchema }}>
      {(field) => (
        <Field>
          <FieldLabel htmlFor={field.name}>Email</FieldLabel>
          <Input
            id={field.name}
            type="email"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
          />
          {field.state.meta.errors.length ? <FieldError>{field.state.meta.errors.join(", ")}</FieldError> : null}
        </Field>
      )}
    </form.Field>
  </FieldGroup>
</form>
```

### Styling

- Use semantic tokens: `bg-primary`, `text-muted-foreground`. **Never** raw colors.
- Use `gap-*`, never `space-x-*` or `space-y-*`.
- Use `size-*` for square dimensions, never `w-* h-*`.
- Use `cn()` from `@/lib/utils` for conditional classes.
- Tailwind v4 — definitions in `src/styles.css` via `@theme inline`.

### Icons

```tsx
import { SearchIcon } from "@hugeicons/core-free-icons";

<Button>
  <SearchIcon data-icon="inline-start" />
  Search
</Button>;
```

No sizing classes on icons inside components — components handle it.

### Logging

```ts
import { createLogger } from "@/lib/logger";

const logger = createLogger("billing.webhook");

logger.info("checkout completed", { userId, plan });
logger.error("webhook failed", { error, requestId });
```

Logger redacts keys matching `/pass|secret|token|cookie|authorization|apikey|api_key/i`.
Never log raw secrets — even if you think they're safe.

### Analytics

```ts
import { useAnalytics, AnalyticsEvent } from "@/lib/analytics";

const { capture } = useAnalytics();
capture(AnalyticsEvent.userLoggedIn, { login_method: "email" });
```

Add new event names to `AnalyticsEvent` registry — names are typed.

### Auth flows

- Sign-in/sign-up: email + password (better-auth, email verification required by default)
- Magic link: enabled per user (better-auth plugin)
- OAuth: Google active V1, Apple stubbed
- Password reset: via email
- Change name + change email + change password: in `/app/settings/{profile,security}`
- Account deletion + data export: GDPR-compliant, both required for UK
- Admin + impersonation: `ADMIN_USER_IDS` env var grants admin role; admin route at
  `/app/admin` lists users + impersonate buttons; impersonation banner shown
  app-wide while active

Auth state in React: `authClient.useSession()`.
Auth state on server: `getSession()` from `@/lib/functions/get-session`.
Protected route: use `requireSession()` in `beforeLoad`.

### Background sync (third-party data)

For any feature pulling data from third-party APIs on a recurring basis (OAuth-fed
sources like X bookmarks, GitHub stars, Spotify saves, etc.), use the sync
framework in `convex/sync/`. Don't roll your own polling.

1. Add an adapter at `convex/sync/adapters/<name>.ts` implementing `SyncAdapter`
2. Register it in `convex/sync/registry.ts`
3. Call `api.sync.state.scheduleSource({ source })` after the user's OAuth callback
4. The framework handles dispatch every 5 min, retries with exponential backoff,
   pagination, per-user rate limiting, observability spans, and stuck-job reaping

Full guide: `convex/sync/README.md`. Schema lives in `convex/schema.ts.syncJobs`.

### Granting admin access

After signing up the first user:

1. Run `npx convex dashboard` → open the `betterAuth/user` table → copy the
   row's `_id` (e.g. `m97...`).
2. Add it to `ADMIN_USER_IDS` in `.env.local` (comma-separated for multiple).
3. Restart `npx convex dev` so the new env var is picked up.
4. Visit `/app/admin` to see the user list.

### Billing

```ts
import { requirePlan } from "@/lib/billing";

// In a Convex query/mutation:
await requirePlan(ctx, "pro");
```

Plans defined in `convex/lib/plans.ts`. Polar webhook syncs subscription state into
`subscriptions` table. Never trust client-side plan checks for security — always use
`requirePlan` server-side.

### Emails

```tsx
import { sendEmail } from "@/convex/email";
import WelcomeEmail from "@/convex/email/templates/welcome";

await sendEmail({
  to: user.email,
  subject: `Welcome to ${appName}`,
  react: <WelcomeEmail name={user.name} />,
});
```

All transactional emails use `@react-email/components`. Templates live in
`convex/email/templates/`.

## Files you should never edit

- `convex/_generated/**` — Convex codegen
- `src/routeTree.gen.ts` — TanStack Router codegen
- `convex/betterAuth/schema.ts` — better-auth CLI codegen (regenerate, don't edit)
- `pnpm-lock.yaml` — managed by pnpm

## Scripts to know

```bash
pnpm dev              # web dev server (auto-regens better-auth schema via predev)
pnpm convex           # convex dev sync (auto-regens better-auth schema via preconvex)
pnpm auth:generate    # regenerate convex/betterAuth/schema.ts from the plugin set
pnpm auth:check       # CI: fail if the committed better-auth schema is stale
pnpm typecheck        # tsgo --noEmit (fails until `pnpm convex` runs once)
pnpm lint             # oxfmt + oxlint (autofix)
pnpm lint:check       # CI: no writes
pnpm test             # vitest
npx convex deploy     # push to convex prod
pnpm dlx shadcn@latest add <component>   # add a shadcn component
```

## When asked to add a feature

1. Check if there's already a pattern in the repo. Reuse it.
2. Add Convex schema first if the feature needs persistence.
3. Server logic in `convex/` (queries, mutations, actions).
4. UI in `src/routes/_app/<feature>/`.
5. Forms via TanStack Form + Zod schema in `src/lib/schemas/`.
6. Track key user actions via `useAnalytics()`.
7. Wrap server functions in `Sentry.startSpan()`.
8. Run `pnpm lint && pnpm typecheck` before committing.

## When asked to add a third-party integration

1. Provider components go in `src/integrations/<service>/provider.tsx`.
2. Wire in `src/routes/__root.tsx` if it's a Provider component.
3. Add env vars to `.env.example` with comments.
4. Document in `README.md` under "Required services".
5. If it has webhooks, add HTTP route to `convex/http.ts`.

## Anti-patterns — don't

- ❌ Don't add `eslint`, `prettier`, or `tsc` — we use oxc + tsgo.
- ❌ Don't write `space-y-*` / `space-x-*` — use `flex` + `gap-*`.
- ❌ Don't import from `convex/_generated/api` outside Convex — use the queryClient bridge.
- ❌ Don't use `useState` for server-derived state — use Convex queries.
- ❌ Don't bypass `requirePlan()` for paid features — server-side gating only.
- ❌ Don't put secrets in `VITE_*` env vars — those are bundled into the client.
- ❌ Don't edit `betterAuth/schema.ts` by hand — regenerate via better-auth CLI.

## Asking for help

If something is unclear, prefer asking over guessing. Ambiguity in auth, billing, or
email flows is expensive to undo once a user is mid-subscription.
