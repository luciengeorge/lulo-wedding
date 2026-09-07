import { cn } from "@/lib/utils";

interface UsageMeterProps {
  label: string;
  current: number;
  max: number;
  className?: string;
}

/**
 * Progress bar for "X of Y used" displays. Goes amber at >=80%, red at 100%.
 * Wire to per-plan limits from convex/lib/plans.ts.
 */
export function UsageMeter({ label, current, max, className }: UsageMeterProps) {
  const pct = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
  const tone = pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-foreground";

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {current} / {max}
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full transition-all", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
