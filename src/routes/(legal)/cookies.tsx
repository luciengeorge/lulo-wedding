import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(legal)/cookies")({
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <article className="prose max-w-none dark:prose-invert">
      <h1>Cookie Policy</h1>
      <p className="text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <p>This is placeholder copy. Replace with your real Cookie Policy before launch.</p>
      <h2>Essential cookies</h2>
      <ul>
        <li>
          <code>better-auth.session_token</code> — keeps you signed in.
        </li>
        <li>
          <code>toast</code> — server-side flash messages between page loads.
        </li>
      </ul>
      <h2>Analytics cookies</h2>
      <p>We use PostHog for product analytics. PostHog uses cookies to identify returning users.</p>
      <h2>Marketing cookies</h2>
      <p>We do not use marketing cookies.</p>
    </article>
  );
}
