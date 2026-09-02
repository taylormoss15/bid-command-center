"use client";

import { useData } from "@/components/providers/DataProvider";

import { IconAlert, IconCheck, IconX } from "./Icons";
import { cx } from "./primitives";

/** Small, quiet acknowledgements. A logged follow-up should feel finished. */
export function Toaster() {
  const { toasts, dismissToast } = useData();
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2 sm:left-auto sm:right-5 sm:translate-x-0">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex items-start gap-2.5 rounded-xl border border-ink/10 bg-ink px-3.5 py-3 text-white shadow-pop animate-toast-in"
        >
          <span
            className={cx(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
              t.tone === "danger" ? "bg-danger text-white" : "bg-volt text-ink animate-check-pop",
            )}
          >
            {t.tone === "danger" ? <IconAlert size={10} /> : <IconCheck size={10} strokeWidth={3} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium leading-snug">{t.message}</p>
            {t.detail ? (
              <p className="mt-0.5 text-[12px] leading-snug text-white/60">{t.detail}</p>
            ) : null}
          </div>
          {t.undo ? (
            <button
              type="button"
              onClick={() => {
                t.undo?.();
                dismissToast(t.id);
              }}
              className="shrink-0 rounded-md px-2 py-1 text-[12px] font-semibold text-volt transition hover:bg-white/10"
            >
              Undo
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissToast(t.id)}
            className="shrink-0 rounded-md p-1 text-white/40 transition hover:bg-white/10 hover:text-white"
          >
            <IconX size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
