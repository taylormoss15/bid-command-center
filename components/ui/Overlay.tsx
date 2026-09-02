"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { IconX } from "./Icons";
import { IconButton, cx } from "./primitives";

/** Escape-to-close plus body scroll lock, shared by the modal and the panel. */
function useOverlayBehaviour(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}) {
  useOverlayBehaviour(open, onClose);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = surface.current?.querySelector<HTMLElement>(
      "input:not([type=hidden]), textarea, select, button",
    );
    // Give the animation a frame before stealing focus.
    const t = window.setTimeout(() => first?.focus(), 40);
    return () => window.clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const widths = {
    sm: "max-w-sm",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <div
        ref={surface}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          "relative z-10 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-paper shadow-pop animate-pop-in sm:rounded-2xl",
          widths[width],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[12px] text-ink-muted">{description}</p>
            ) : null}
          </div>
          <IconButton label="Close" onClick={onClose}>
            <IconX size={15} />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-canvas px-5 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/** Wide right-hand panel — the project detail view without leaving the board. */
export function SidePanel({
  open,
  onClose,
  children,
  label,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
}) {
  useOverlayBehaviour(open, onClose);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-[1px] animate-fade-in"
        onClick={onClose}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className="relative z-10 flex h-full w-full max-w-[860px] flex-col border-l border-line bg-paper shadow-panel animate-slide-in-right"
      >
        {children}
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "primary",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  tone?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={body}
      width="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg px-3 text-[13px] font-medium text-ink-soft transition hover:bg-sunken"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={cx(
              "h-8 rounded-lg px-3 text-[13px] font-medium text-white transition active:scale-[0.98]",
              tone === "danger" ? "bg-danger hover:bg-danger-ink" : "bg-ink hover:bg-ink/90",
            )}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      {children ?? <p className="text-[13px] text-ink-soft">This can be changed again later.</p>}
    </Modal>
  );
}
