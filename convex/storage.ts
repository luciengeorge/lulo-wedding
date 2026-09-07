import { v } from "convex/values";

import { internalAction, mutation, query } from "./_generated/server";
import { authComponent } from "./betterAuth/auth";

/**
 * File storage helpers built on top of Convex's built-in `ctx.storage`.
 *
 * Convex storage is included free up to a generous limit and serves files via
 * authenticated URLs that expire on a rolling basis. Use this for: thumbnails,
 * user uploads, generated exports, cached external images, etc.
 *
 * Architecture:
 * - `generateUploadUrl` returns a short-lived signed URL the client POSTs to
 * - `saveUpload` records the storage id alongside whatever metadata you need
 *   (path, mime, owning user) in your app's `uploads` table — TODO: add this
 *   table to convex/schema.ts when first product needs uploads
 * - `getDownloadUrl` returns a signed read URL for a stored file
 * - `deleteFile` removes the blob (e.g. when account is deleted)
 *
 * Auth: every helper checks the caller is signed in. Adjust if a feature
 * needs public uploads (uncommon for B2C SaaS).
 */

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.storage.generateUploadUrl();
  },
});

export const getDownloadUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    return await ctx.storage.getUrl(storageId);
  },
});

export const deleteFile = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) throw new Error("Not authenticated");
    await ctx.storage.delete(storageId);
  },
});

/**
 * Cache an external image into Convex storage. Useful for:
 * - OG thumbnails of bookmarked URLs
 * - User avatars from OAuth providers (avoids broken-link risk if the provider purges)
 * - YouTube thumbnails, Spotify album art, etc.
 *
 * Pair with the /api/img proxy route for client-side `<img src="...">` consumption.
 */
export const cacheExternalImage = internalAction({
  args: { url: v.string() },
  handler: async (ctx, { url }) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
    const blob = await res.blob();
    const storageId = await ctx.storage.store(blob);
    return { storageId };
  },
});
