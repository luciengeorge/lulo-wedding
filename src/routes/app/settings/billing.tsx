import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect } from "react";
import { toast } from "sonner";
import z from "zod";

import { api } from "@/../convex/_generated/api";
import { UpgradeModal } from "@/components/billing/upgrade-modal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const BillingSearchSchema = z.object({
  success: z.string().optional(),
});

export const Route = createFileRoute("/app/settings/billing")({
  validateSearch: BillingSearchSchema,
  component: BillingPage,
});

function BillingPage() {
  const { success } = Route.useSearch();
  const sub = useQuery(api.billing.queries.mySubscription);

  useEffect(() => {
    if (success) {
      toast.success("Subscription active", { description: "Welcome aboard." });
    }
  }, [success]);

  if (sub === undefined) {
    return (
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading…</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const plan = sub?.plan ?? "free";
  const isPaid = plan !== "free";

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>
            You're on the <span className="font-medium text-foreground capitalize">{plan}</span> plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {isPaid ? (
            <>
              {/* TODO: point to real Polar customer portal URL once polar.createCustomerPortal() lands. */}
              <Button variant="outline" render={<Link to="/app/settings/billing" />}>
                Manage billing
              </Button>
              <UpgradeModal
                trigger={<Button variant="outline">Change plan</Button>}
                defaultPlan={plan === "pro" ? "starter" : "pro"}
              />
            </>
          ) : (
            <UpgradeModal trigger={<Button>Upgrade</Button>} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plans</CardTitle>
          <CardDescription>Compare plans side by side.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {(["free", "starter", "pro"] as const).map((p) => (
              <div key={p} className="rounded-md border p-4">
                <p className="text-sm font-semibold capitalize">{p}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {p === "free" && "£0 / month"}
                  {p === "starter" && "£4 / month"}
                  {p === "pro" && "£9 / month"}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
