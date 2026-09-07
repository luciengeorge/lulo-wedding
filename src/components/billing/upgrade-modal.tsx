import { useMutation } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Plan = "starter" | "pro";

const PLAN_DETAILS: Record<Plan, { name: string; price: string; features: string[] }> = {
  starter: {
    name: "Starter",
    price: "£4 / month",
    features: ["Core features", "Email support", "Sweet spot for individuals"],
  },
  pro: {
    name: "Pro",
    price: "£9 / month",
    features: ["Everything in Starter", "Higher limits", "Priority support"],
  },
};

type UpgradeModalProps = {
  trigger?: React.ReactElement;
  defaultPlan?: Plan;
  reason?: string;
};

export function UpgradeModal({ trigger, defaultPlan = "pro", reason }: UpgradeModalProps) {
  const createCheckout = useMutation(api.billing.queries.createCheckout);
  const [selected, setSelected] = useState<Plan>(defaultPlan);
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      const successUrl =
        typeof window !== "undefined" ? `${window.location.origin}/app/settings/billing?success=1` : "/";
      const result = await createCheckout({ plan: selected, successUrl });
      window.location.href = result.url;
    } catch (e) {
      toast.error("Checkout failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button>Upgrade</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upgrade your plan</DialogTitle>
          <DialogDescription>{reason ?? "Choose a plan to unlock everything."}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(PLAN_DETAILS) as Plan[]).map((plan) => {
            const detail = PLAN_DETAILS[plan];
            const isSelected = selected === plan;
            return (
              <button
                type="button"
                key={plan}
                onClick={() => setSelected(plan)}
                className={cn(
                  "flex flex-col gap-2 rounded-md border p-4 text-left transition-colors",
                  isSelected ? "border-foreground bg-muted/40" : "hover:border-muted-foreground/50",
                )}
              >
                <span className="text-sm font-semibold">{detail.name}</span>
                <span className="text-xs text-muted-foreground">{detail.price}</span>
                <ul className="mt-1 flex flex-col gap-1 text-xs text-muted-foreground">
                  {detail.features.map((f) => (
                    <li key={f}>• {f}</li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleUpgrade} disabled={isLoading}>
            {isLoading ? <Spinner /> : null}
            {isLoading ? "Redirecting" : `Upgrade to ${PLAN_DETAILS[selected].name}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
