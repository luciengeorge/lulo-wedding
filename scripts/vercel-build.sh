#!/bin/sh
# Vercel's build command (vercel.json). Deploys Convex, then builds the app
# against the URL it deployed to.
#
# On preview builds only, `--preview-run smoke:seed` seeds the party the preview
# smoke test replies as (.github/workflows/smoke.yml). The seed refuses to run
# unless the preview deployment captures email (E2E_CAPTURE_EMAILS=1, a Convex
# preview default), so a misconfigured preview fails its build loudly instead of
# seeding a deployment that would send real mail.
set -eu

if [ "${VERCEL_ENV:-}" = "preview" ]; then
  exec npx convex deploy --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL --preview-run smoke:seed
fi

exec npx convex deploy --cmd 'pnpm build' --cmd-url-env-var-name VITE_CONVEX_URL
