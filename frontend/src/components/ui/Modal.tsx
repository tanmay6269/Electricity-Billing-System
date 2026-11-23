import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import clsx from "clsx";
import { Button } from "./Button";
import { Field, Textarea } from "./Form";

export function Modal({ open, onClose, title, subtitle, children, footer, size = "md" }: {
  open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy-900/50 backdrop-blur-[1px]" onClick={onClose} />
      <div className={clsx("relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-pop sm:rounded-xl", w)}>
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-ink-muted">{subtitle}</p>}
          </div>
          <button aria-label="Close" onClick={onClose} className="rounded-lg p-1 text-ink-muted hover:bg-slate-100 hover:text-ink">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50/60 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Confirmation dialog; optionally asks for a reason (cancel bill, refund...). */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = "Confirm", tone = "danger", reasonLabel, loading }: {
  open: boolean; onClose: () => void; onConfirm: (reason: string) => void | Promise<void>; title: string; message: ReactNode;
  confirmLabel?: string; tone?: "danger" | "primary"; reasonLabel?: string; loading?: boolean;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const needsReason = !!reasonLabel;
  const valid = !needsReason || reason.trim().length >= 5;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Go back</Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} disabled={!valid} loading={loading} onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {tone === "danger" && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-bad-50">
            <AlertTriangle className="h-5 w-5 text-bad-600" />
          </div>
        )}
        <div className="flex-1 text-sm text-ink-soft">{message}</div>
      </div>
      {needsReason && (
        <Field label={reasonLabel} required className="mt-4" hint="At least 5 characters. This is saved in the audit log.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
      )}
    </Modal>
  );
}
