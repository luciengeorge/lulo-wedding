import { createFileRoute } from "@tanstack/react-router";

const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Starter Template";

export const Route = createFileRoute("/(legal)/privacy")({
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <article className="prose max-w-none dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <p>
        This is placeholder copy. Replace with your real privacy policy before launch. {APP_NAME} processes personal
        data under UK GDPR and EU GDPR.
      </p>
      <h2>Data we collect</h2>
      <ul>
        <li>Account data: name, email, hashed password.</li>
        <li>Usage data: pages visited, actions taken (via PostHog analytics).</li>
        <li>Billing data: subscription status (held by our payment provider, Polar).</li>
      </ul>
      <h2>Your rights</h2>
      <ul>
        <li>Access — download your data via Settings → Danger zone → Download my data.</li>
        <li>Erasure — delete your account via Settings → Danger zone.</li>
        <li>Rectification — update name and email via Settings → Profile.</li>
      </ul>
      <h2>Contact</h2>
      <p>Questions? Email privacy@example.com.</p>
    </article>
  );
}
