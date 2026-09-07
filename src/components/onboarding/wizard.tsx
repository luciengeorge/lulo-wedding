import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export interface WizardStep {
  /** Stable id — used to track completion in analytics + persistence. */
  id: string;
  title: string;
  description?: string;
  /** Step body. Receives form state setter via `useWizardState` if you need it. */
  content: ReactNode;
  /** Optional pre-advance hook. Throw or return false to block. */
  onContinue?: () => Promise<boolean | void> | boolean | void;
  /** Disable the Continue button (e.g. while a field is invalid). */
  canContinue?: boolean;
  /** Label override for the Continue button on this step. */
  continueLabel?: string;
}

interface WizardProps {
  steps: WizardStep[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void | Promise<void>;
  /** Allow closing via X / Escape / backdrop. Default false — forces completion. */
  dismissible?: boolean;
  /** Track step changes for analytics. */
  onStepChange?: (stepId: string, index: number) => void;
}

/**
 * Generic multi-step wizard for first-time user onboarding.
 *
 * Typical setup: render in /app layout, gate by a user.onboardedAt timestamp
 * stored in your app schema. Mark onboarded in onComplete.
 *
 * Example:
 *
 *   <Wizard
 *     open={!user.onboardedAt}
 *     onOpenChange={() => {}}
 *     onComplete={() => markOnboarded()}
 *     onStepChange={(id, i) => capture(AnalyticsEvent.onboardingStep, { id, i })}
 *     steps={[
 *       { id: "welcome", title: "Welcome", content: <Welcome /> },
 *       { id: "connect", title: "Connect a source", content: <ConnectSource />, canContinue: hasSource },
 *       { id: "done", title: "You're all set", content: <Done />, continueLabel: "Get started" },
 *     ]}
 *   />
 */
export function Wizard({ steps, open, onOpenChange, onComplete, dismissible = false, onStepChange }: WizardProps) {
  const [index, setIndex] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const step = steps[index];
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  const handleContinue = async () => {
    if (!step) return;
    setIsAdvancing(true);
    try {
      const result = await step.onContinue?.();
      if (result === false) return;

      if (isLast) {
        await onComplete();
        onOpenChange(false);
        return;
      }

      const next = index + 1;
      setIndex(next);
      onStepChange?.(steps[next]!.id, next);
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleBack = () => {
    if (isFirst) return;
    const prev = index - 1;
    setIndex(prev);
    onStepChange?.(steps[prev]!.id, prev);
  };

  if (!step) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissible) return;
        onOpenChange(next);
      }}
    >
      <DialogContent showCloseButton={dismissible}>
        <DialogHeader>
          <DialogTitle>{step.title}</DialogTitle>
          {step.description ? <DialogDescription>{step.description}</DialogDescription> : null}
        </DialogHeader>

        <div className="py-2">{step.content}</div>

        <div className="flex items-center gap-1.5" aria-hidden="true">
          {steps.map((s, i) => (
            <span key={s.id} className={cn("h-1 flex-1 rounded-full", i <= index ? "bg-foreground" : "bg-muted")} />
          ))}
        </div>

        <DialogFooter>
          {!isFirst && (
            <Button variant="ghost" onClick={handleBack} disabled={isAdvancing}>
              Back
            </Button>
          )}
          <Button onClick={handleContinue} disabled={isAdvancing || step.canContinue === false}>
            {isAdvancing ? <Spinner /> : null}
            {isAdvancing ? "…" : (step.continueLabel ?? (isLast ? "Finish" : "Continue"))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
