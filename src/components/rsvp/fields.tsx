import type { ReactNode } from "react";

/**
 * The form controls, in the wedding's own typography rather than the admin's.
 *
 * Inputs are 46px and text is 15px+ so iOS does not zoom the viewport on focus.
 * Almost every guest arrives on a phone from WhatsApp, and a form that jumps when
 * you tap it reads as broken.
 */
export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  autoComplete,
  invalid,
  disabled,
  id,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "email";
  autoComplete?: string;
  invalid?: boolean;
  disabled?: boolean;
  id: string;
}) {
  return (
    <div className="flex flex-1 basis-0 flex-col gap-1.5">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder ?? label}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => onChange(event.target.value)}
        className={`h-[46px] w-full rounded-[3px] border bg-[#FFFCF7] px-3.5 font-display text-[15px] text-bark outline-none placeholder:text-[#B0A091] focus-visible:border-ink/50 focus-visible:ring-2 focus-visible:ring-ink/15 disabled:opacity-60 ${
          invalid ? "border-ink" : "border-[#E7D9C4]"
        }`}
      />
    </div>
  );
}

/** A labelled field with room for a hint underneath, for the full-width inputs. */
export function LabelledField({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="font-display text-[15px] leading-[18px] text-bark">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="font-display text-[14px] leading-5 text-ink">
          {error}
        </p>
      ) : hint ? (
        <p className="font-display text-[14px] leading-5 text-faded">{hint}</p>
      ) : null}
    </div>
  );
}

export function FieldError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="font-display text-[14px] leading-5 text-ink">
      {children}
    </p>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center rounded-[3px] bg-ink font-display text-[16px] font-semibold tracking-[0.14em] text-paper transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

export function OutlineButton({
  children,
  onClick,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-14 w-full items-center justify-center rounded-[3px] border border-ink font-display text-[15px] font-semibold tracking-[0.14em] text-ink transition-colors hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-45"
    >
      {children}
    </button>
  );
}

/** The quiet way back. Always present, so no screen is a dead end. */
export function QuietLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-display text-[14px] leading-5 text-ink italic underline underline-offset-4"
    >
      {children}
    </button>
  );
}
