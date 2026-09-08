import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type AdminMultiSelectOption<T extends string> = { value: T; label: string };

/**
 * A multi-select filter pill for the guest-list toolbar.
 *
 * Built on Base UI's `Select` in `multiple` mode rather than a hand-rolled
 * popover of checkboxes. It is not a native `<select>`: the popup is
 * `role="listbox"` with `aria-multiselectable`, each option is `role="option"`
 * with `aria-selected` and a tick, the popup stays open while you toggle, and
 * arrow keys / typeahead / Escape all work without us reimplementing them.
 *
 * The selection is owned by TanStack Table's column filter state, not by this
 * component — see `columnFilterValues` in the page.
 */

/**
 * Selecting this clears the whole dropdown. It rides in as a real option so it
 * inherits the listbox's keyboard handling instead of being a stray button
 * inside a listbox, which nothing would reach with the arrow keys.
 */
const CLEAR_VALUE = "__clear__";

export function AdminMultiSelect<T extends string>({
  value,
  onChange,
  options,
  emptyLabel,
  unitLabel,
  className,
  "aria-label": ariaLabel,
}: {
  value: readonly T[];
  onChange: (value: T[]) => void;
  options: readonly AdminMultiSelectOption<T>[];
  /** Shown when nothing is picked, e.g. "All waves". */
  emptyLabel: string;
  /** Pluralised noun for the count, e.g. "waves" gives "2 waves". */
  unitLabel: string;
  className?: string;
  "aria-label"?: string;
}) {
  // Never a comma-jammed list: three long names would blow the pill's width and
  // push the rest of the toolbar around.
  const label =
    value.length === 0
      ? emptyLabel
      : value.length === 1
        ? (options.find((option) => option.value === value[0])?.label ?? emptyLabel)
        : `${value.length} ${unitLabel}`;

  return (
    <Select
      multiple
      value={value as T[]}
      onValueChange={(next) => {
        const selected: string[] = Array.isArray(next) ? next : [];
        if (selected.includes(CLEAR_VALUE)) {
          onChange([]);
          return;
        }
        onChange(selected.filter((option): option is T => option !== CLEAR_VALUE));
      }}
    >
      {/* 32px, like every other control on this screen: the search box, the action
          buttons and the bulk-actions bar. The default trigger is 36px, which left
          the filter row sitting on two different heights. */}
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn("text-[12.5px]", value.length > 0 && "border-[#A1A1AA] font-medium", className)}
      >
        <SelectValue>{() => label}</SelectValue>
      </SelectTrigger>
      {/* Anchored under the trigger: the default aligns the popup so the selected
          item sits over it, which is meaningless once several are selected. */}
      <SelectContent alignItemWithTrigger={false} align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
        {value.length > 0 ? (
          <>
            <SelectSeparator />
            <SelectItem value={CLEAR_VALUE} className="text-[#71717A]">
              Clear {ariaLabel ? ariaLabel.toLowerCase() : "selection"}
            </SelectItem>
          </>
        ) : null}
      </SelectContent>
    </Select>
  );
}
