import { cn } from "@/lib/utils";

/**
 * A loading placeholder shaped like the thing it stands in for.
 *
 * Always give it a width and height that match the real content, so nothing
 * shifts underneath the reader when the data lands.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-[#E4E4E7]", className)}
      {...props}
    />
  );
}

export { Skeleton };
