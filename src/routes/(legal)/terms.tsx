import { createFileRoute } from "@tanstack/react-router";

const APP_NAME = import.meta.env.VITE_APP_NAME ?? "Starter Template";

export const Route = createFileRoute("/(legal)/terms")({
  component: TermsPage,
});

function TermsPage() {
  return (
    <article className="prose max-w-none dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: {new Date().toISOString().slice(0, 10)}</p>
      <p>This is placeholder copy. Replace with your real Terms before launch.</p>
      <h2>Service</h2>
      <p>{APP_NAME} provides software-as-a-service. Use of the service constitutes acceptance of these Terms.</p>
      <h2>Subscriptions</h2>
      <p>
        Paid plans are billed via Polar (Merchant of Record). Subscriptions auto-renew unless canceled. Cancel any time
        in Settings → Billing.
      </p>
      <h2>Liability</h2>
      <p>The service is provided "as is", without warranty of any kind, to the extent permitted by law.</p>
      <h2>Contact</h2>
      <p>support@example.com</p>
    </article>
  );
}
