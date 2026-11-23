import {
  cloneElement, forwardRef, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Search, X } from "lucide-react";
import clsx from "clsx";

/** Label + control + hint/error. The label is linked to the control (htmlFor/id) and the
 *  hint/error is linked via aria-describedby, so screen readers announce them. */
export function Field({ label, error, hint, required, children, className }: {
  label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string;
}) {
  const auto = useId();
  const child = isValidElement<{ id?: string }>(children) ? children : null;
  const id = child?.props.id ?? `f${auto.replace(/:/g, "")}`;
  const msgId = `${id}-msg`;
  const control = child
    ? cloneElement(child as ReactElement<Record<string, unknown>>, {
        id,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": error || hint ? msgId : undefined,
        "aria-required": required || undefined,
      })
    : children;
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={child ? id : undefined}>
          {label} {required && <span className="text-bad-600" aria-hidden="true">*</span>}
        </label>
      )}
      {control}
      {error ? <p id={msgId} className="mt-1 text-xs text-bad-600">{error}</p> : hint ? <p id={msgId} className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, invalid, ...rest }, ref) {
  return <input ref={ref} className={clsx("input", invalid && "input-error", className)} {...rest} />;
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; options?: { value: string | number; label: string }[]; placeholder?: string };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ className, invalid, options, placeholder, children, ...rest }, ref) {
  return (
    <select ref={ref} className={clsx("input pr-8", invalid && "input-error", className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options?.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean };
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ className, invalid, ...rest }, ref) {
  return <textarea ref={ref} className={clsx("input h-auto min-h-[90px] py-2", invalid && "input-error", className)} {...rest} />;
});

export function SearchInput({ value, onChange, placeholder = "Search...", className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
      <input className="input pl-9 pr-8" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} aria-label={placeholder} />
      {value && (
        <button type="button" aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint hover:text-ink" onClick={() => onChange("")}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Toolbar row for list pages: search + filters on the left, actions on the right. */
export function Toolbar({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center [&>*]:sm:w-auto">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
