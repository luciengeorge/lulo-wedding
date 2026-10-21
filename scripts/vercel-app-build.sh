#!/bin/sh
# The app half of the Vercel build, run by `convex deploy --cmd`, which sets
# VITE_CONVEX_URL to the deployment it just pushed (a preview gets its own).
#
# The HTTP-actions host is that same deployment on .convex.site, so derive it
# here. Vercel's env also holds a fixed VITE_CONVEX_SITE_URL, which names one
# deployment and would point every preview's server at the wrong backend.
set -eu

VITE_CONVEX_SITE_URL="$(printf '%s' "$VITE_CONVEX_URL" | sed 's/\.convex\.cloud$/.convex.site/')"
export VITE_CONVEX_SITE_URL

exec pnpm build
