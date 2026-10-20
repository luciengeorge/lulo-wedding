import { convexBetterAuthReactStart } from "@convex-dev/better-auth/react-start";

/**
 * Read from the build, not from process.env. On Vercel, process.env holds the
 * fixed values in the project settings, while the build is made for the
 * deployment `convex deploy` just pushed; on a preview those differ, and the
 * server would ask a different backend than the browser does.
 */
export const { handler, getToken, fetchAuthQuery, fetchAuthMutation, fetchAuthAction } = convexBetterAuthReactStart({
  convexUrl: import.meta.env.VITE_CONVEX_URL,
  convexSiteUrl: import.meta.env.VITE_CONVEX_SITE_URL,
});
