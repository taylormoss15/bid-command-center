import type { ReactNode } from "react";

import { cx } from "@/components/ui/primitives";

export function PageBody({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cx(
        "mx-auto w-full px-4 pb-16 pt-5 sm:px-6",
        wide ? "max-w-none" : "max-w-[1480px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function PageIntro({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-ink">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 max-w-2xl text-[13px] leading-relaxed text-ink-muted">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
