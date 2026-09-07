import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AdminSelectOption<T extends string> = { value: T; label: string };

/**
 * The one select used across the guest-list toolbar and the party form.
 *
 * Base UI's `Select.Value` renders whatever the item rendered, so the label has
 * to be resolved from the value; wrapping that once keeps seven call sites from
 * repeating it.
 */
export function AdminSelect<T extends string>({
  value,
  onChange,
  options,
  id,
  className,
  "aria-label": ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly AdminSelectOption<T>[];
  id?: string;
  className?: string;
  "aria-label"?: string;
}) {
  const label = options.find((option) => option.value === value)?.label ?? "";

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (typeof next === "string") onChange(next as T);
      }}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={cn("text-[12.5px]", className)}>
        <SelectValue>{() => label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
