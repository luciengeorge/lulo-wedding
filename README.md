# tanstack-starter-template

Private B2C SaaS starter. Auth, billing, AI, observability — all wired. Fork once,
launch projects on top.

## Stack

| Layer           | Pick                                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Framework       | [TanStack Start](https://tanstack.com/start) (Vite + Nitro)                                                               |
| Routing         | TanStack Router (file-based)                                                                                              |
| Backend         | [Convex](https://convex.dev) — DB + scheduled jobs + file storage + websockets                                            |
| Auth            | [better-auth](https://better-auth.com) via [`@convex-dev/better-auth`](https://convex.dev/components/better-auth)         |
| Vector / RAG    | [`@convex-dev/rag`](https://convex.dev/components/rag) + OpenAI `text-embedding-3-small`                                  |
| AI              | [Vercel AI SDK v6](https://sdk.vercel.ai) (`@ai-sdk/openai`, `@ai-sdk/react`)                                             |
| Billing         | [Polar](https://polar.sh) (Merchant of Record — handles UK/EU VAT) via `@convex-dev/polar`. Stripe adapter stub included. |
| Email           | [Resend](https://resend.com) + `@react-email/components`                                                                  |
| UI              | [shadcn/ui](https://ui.shadcn.com) Base UI variant + Tailwind v4 + [hugeicons](https://hugeicons.com)                     |
| Forms           | TanStack Form + Zod                                                                                                       |
| State           | TanStack Query (bridged to Convex via `@convex-dev/react-query`)                                                          |
| Observability   | Sentry + PostHog + Vercel Analytics + Speed Insights                                                                      |
| Tooling         | oxlint + oxfmt + tsgo (no eslint, no prettier, no tsc)                                                                    |
| Package manager | **pnpm** (required — workspace layout assumes it)                                                                         |
| Hosting         | Vercel                                                                                                                    |

## How to use this template

This is a private GitHub **template repository**, not a fork target. Every new
product gets a fresh repo with no shared history. There is **no upstream link**
between projects and this template — back-port improvements manually when you
spot a generally-useful pattern.

### One-time setup (already done)

In GitHub: repo Settings → check **"Template repository"**. Done.

### Bootstrapping a new project

```bash
gh repo create luciengeorge/<new-product> \
  --private \
  --template luciengeorge/tanstack-starter-template \
  --clone

cd <new-product>
pnpm install
cp .env.example .env.local            # fill in secrets — see below
npx convex dev                        # one-time: creates Convex deployment, generates _generated/
pnpm dev                              # http://localhost:3000
```

After `npx convex dev` runs once, typecheck + lint pass cleanly. Until then
`pnpm typecheck` will fail on missing `convex/_generated/` imports — expected.

### Working across multiple projects

Recommended workflow:

1. **Land changes in the template first** when they're general-purpose (auth,
   billing, observability, UI primitives).
2. **Land changes in the product repo** when they're product-specific (schema,
   feature routes, integrations).
3. When a product reveals a generally-useful pattern (e.g. a sync worker
   pattern that should ship in every project), back-port it: copy the relevant
   files into the template, commit, and any _future_ project gets it
   automatically. Existing projects don't.
4. **Don't try to make this template support every product**. Keep it
   opinionated. If a need is product-specific, leave it out.

### Quick start (no template, plain clone)

```bash
git clone git@github.com:luciengeorge/tanstack-starter-template.git my-app
cd my-app
rm -rf .git && git init -b main      # detach from template repo
pnpm install
cp .env.example .env.local
npx convex dev
pnpm dev
```

After the first `convex dev`, typecheck and lint pass cleanly. Until then `pnpm typecheck`
will fail on missing `convex/_generated/` imports — expected for a fresh clone.

### Wiring third-party services

After local boot, set up the external services that the template integrates with.
Keep this checklist handy when bootstrapping a new project from the template:

| Service          | What to do                                                                                                                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Convex**       | `npx convex dev` once → copy deployment URLs into `VITE_CONVEX_URL` and `VITE_CONVEX_SITE_URL`.                                                                                                                                              |
| **Resend**       | Verify a domain → put `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `.env.local`.                                                                                                                                                              |
| **Polar**        | Create products for Starter + Pro → set `POLAR_PRODUCT_STARTER`, `POLAR_PRODUCT_PRO`. Get an org token + webhook secret from Settings → set `POLAR_ACCESS_TOKEN`, `POLAR_WEBHOOK_SECRET`. Add webhook URL `<CONVEX_SITE_URL>/polar/webhook`. |
| **OpenAI**       | Get key from platform.openai.com → `OPENAI_API_KEY`.                                                                                                                                                                                         |
| **Google OAuth** | Create OAuth client in Google Cloud Console → set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `VITE_GOOGLE_OAUTH_ENABLED=1`. Authorized redirect: `<CONVEX_SITE_URL>/api/auth/callback/google`.                                              |
| **Sentry**       | Create a project → set `VITE_SENTRY_DSN`, plus `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source map upload.                                                                                                                      |
| **PostHog**      | Create a project → set `VITE_POSTHOG_KEY` (EU host by default).                                                                                                                                                                              |
| **Vercel**       | `vercel link` → push env vars via `vercel env pull .env.local`.                                                                                                                                                                              |

## Required services

| Service          | Why                                                                     | Account needed                                               |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| **Convex**       | DB, backend, scheduled jobs, vector search, file storage                | [convex.dev](https://convex.dev) — free tier covers dev      |
| **Resend**       | Transactional email (verify, reset, magic link, billing)                | [resend.com](https://resend.com) — verify a domain           |
| **OpenAI**       | Embeddings (`text-embedding-3-small`, $0.02/M tokens) + AI SDK          | [platform.openai.com](https://platform.openai.com)           |
| **Polar**        | Billing as Merchant of Record (handles UK/EU VAT, no MOSS registration) | [polar.sh](https://polar.sh)                                 |
| **Sentry**       | Error tracking + server function instrumentation                        | [sentry.io](https://sentry.io) — optional but recommended    |
| **PostHog**      | Product analytics + feature flags                                       | [posthog.com](https://posthog.com) — EU host by default      |
| **Vercel**       | Hosting                                                                 | [vercel.com](https://vercel.com)                             |
| **Google OAuth** | OAuth provider (V1 includes Google, Apple stubbed for later)            | [console.cloud.google.com](https://console.cloud.google.com) |

## Environment variables

See [`.env.example`](./.env.example) for the full list. Required to boot:

```dotenv
APP_NAME=
SITE_URL=http://localhost:3000
BETTER_AUTH_SECRET=          # openssl rand -hex 32
TOAST_SECRET=                # openssl rand -hex 32, ≥32 chars

VITE_CONVEX_URL=             # from `npx convex dev`
VITE_CONVEX_SITE_URL=        # convex deployment HTTP actions URL

OPENAI_API_KEY=
RESEND_API_KEY=
RESEND_FROM_EMAIL=           # noreply@yourdomain.com (must be verified)

# Optional
VITE_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://eu.i.posthog.com
VITE_GA_MEASUREMENT_ID=
```

## Scripts

```bash
pnpm dev              # start dev server (loads .env.local + instrument.server.mjs)
pnpm build            # production build (copies instrument.server.mjs into output)
pnpm preview          # preview production build
pnpm start            # run production build
pnpm test             # vitest run
pnpm lint             # oxfmt src && oxlint src (autofix)
pnpm lint:check       # CI: format + lint without writing
pnpm format           # oxfmt . (whole repo)
pnpm format:check     # CI: format check without writing
pnpm typecheck        # tsgo --noEmit
pnpm email:dev        # live-preview email templates at http://localhost:3001
pnpm email:export     # build templates to .email-out/ as static HTML
```

## Folder structure

```
.
├── convex/
│   ├── schema.ts                 # app-level tables (auth tables live in betterAuth/)
│   ├── auth.config.ts            # Convex auth config (better-auth provider)
│   ├── http.ts                   # HTTP routes (better-auth + webhook ingress)
│   ├── convex.config.ts          # registers components: betterAuth, polar, rag, action-cache, rate-limiter
│   ├── betterAuth/               # auth component definition + adapter + schema
│   ├── rag.ts                    # generic RAG instance (text-embedding-3-small)
│   └── _generated/               # convex codegen (gitignored — created on first dev sync)
├── src/
│   ├── components/
│   │   ├── ui/                   # shadcn (Base UI variant) — add via `pnpm dlx shadcn@latest add <name>`
│   │   ├── auth/                 # sign-in, sign-up, reset, magic-link forms
│   │   └── billing/              # paywall, upgrade modal, billing portal, usage meter
│   ├── integrations/
│   │   ├── convex/               # ConvexProvider
│   │   ├── posthog/              # lazy init, session sync to authClient
│   │   ├── tanstack-query/       # singleton QueryClient + devtools
│   │   └── google-analytics/     # GA scripts + page view tracking
│   ├── lib/
│   │   ├── auth-client.ts        # createAuthClient() for React
│   │   ├── auth-server.ts        # convexBetterAuthReactStart()
│   │   ├── auth-config.ts        # shared between server fns and convex
│   │   ├── analytics.ts          # useAnalytics() hook + AnalyticsEvent registry
│   │   ├── logger.ts             # structured logger with sensitive-key redaction
│   │   ├── toast.ts              # zod-validated toast schema
│   │   ├── toast-session.server.ts
│   │   ├── utils.ts              # cn() helper
│   │   ├── functions/            # TanStack Start server fns (getSession, etc.)
│   │   └── schemas/              # zod schemas (auth, billing, etc.)
│   └── routes/
│       ├── __root.tsx            # root layout — providers, head, security
│       ├── index.tsx             # generic landing
│       ├── _auth.tsx             # auth layout (centered card)
│       ├── _auth/                # sign-in, sign-up, forgot, reset, magic-link
│       ├── _app/                 # authenticated app shell + settings
│       ├── (legal)/              # privacy, terms, cookies
│       └── api/                  # OAuth callbacks, billing webhooks
├── instrument.server.mjs         # Sentry init (loaded via NODE_OPTIONS)
├── nitro.config.ts               # security headers (CSP, COOP, HSTS, etc.)
├── vite.config.ts                # vite + tanstack-start + react-compiler + sentry
├── components.json               # shadcn config (Base UI, hugeicons)
├── .oxfmtrc.json / .oxlintrc.json
├── AGENTS.md                     # context for AI coding agents (Claude/Cursor/etc.)
└── .cursorrules / .claude/       # editor-specific agent prompts
```

## Adding shadcn components

```bash
pnpm dlx shadcn@latest add card field input spinner sonner
```

This template uses **Base UI**, not Radix. The CLI will pick the correct variant from
`components.json` automatically.

## Swapping billing provider (Polar → Stripe)

Both adapters live behind a common interface in `convex/billing/`. Set
`BILLING_PROVIDER=stripe` in `.env.local` to swap. Polar is the default because it's
a Merchant of Record (handles UK/EU VAT, no quarterly MOSS filings).

## Deploying

```bash
vercel link            # one-time
vercel env pull .env.local   # sync env from Vercel project
vercel deploy          # preview
vercel deploy --prod   # production
```

Convex deployment is independent — push with `npx convex deploy`.

## What works out of the box

- ✅ Email + password sign-up + sign-in
- ✅ Email verification (transactional via Resend + React Email)
- ✅ Forgot password → reset link via email
- ✅ Magic link sign-in (passwordless)
- ✅ Google OAuth (Apple stubbed for V2)
- ✅ Change name + change email (with email-confirmation flow)
- ✅ Change password (revokes other sessions)
- ✅ Account deletion (email-confirmed) + GDPR data export (JSON download)
- ✅ Pluggable billing — Polar adapter active, Stripe stubbed
- ✅ Plan gating helper (`requirePlan(ctx, "pro")`)
- ✅ Paywall component, upgrade modal, billing portal page, usage meter
- ✅ Rate limiter (signup, forgot password, magic link, search, syncSource)
- ✅ Admin route + user list + impersonation banner (better-auth admin plugin)
- ✅ Background sync framework (third-party data ingestion — see `convex/sync/README.md`)
- ✅ File storage + image proxy (`/api/img/<storageId>` w/ 1yr cache)
- ✅ Dynamic OG image generation (`/api/og?title=...`)
- ✅ Webhook signature verification (HMAC + Stripe-style)
- ✅ Onboarding wizard component
- ✅ Email preview server (`pnpm email:dev`)
- ✅ Test setup (vitest + jsdom + jest-dom matchers)
- ✅ Vector search via @convex-dev/rag with OpenAI embeddings
- ✅ Cron registry stub
- ✅ Sentry error tracking + server function instrumentation
- ✅ PostHog product analytics + session sync
- ✅ Vercel Analytics + Speed Insights + Google Analytics
- ✅ Strict CSP, COOP, HSTS, Permissions-Policy
- ✅ Legal pages stubs (Privacy, Terms, Cookies)

## Conventions

See [`AGENTS.md`](./AGENTS.md) for the full conventions document used by AI agents.
TL;DR:

- Routes use `@/` aliases (also `#/` for legacy). Both resolve to `src/`.
- Forms use `FieldGroup` + `Field` (shadcn pattern), never raw `div + space-y-*`.
- Server functions are wrapped with `Sentry.startSpan()` for instrumentation.
- Logger redacts keys matching `pass|secret|token|cookie|authorization|apikey`.
- All env vars go through `import.meta.env.VITE_*` (client) or `process.env.*` (server).
- Don't edit `convex/_generated/` or `src/routeTree.gen.ts`.

## License

UNLICENSED — private template repo.
