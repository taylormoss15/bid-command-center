"use client";

import { useId } from "react";
import type { ReactNode } from "react";

import { cx } from "@/components/ui/primitives";
import { currencyCompact } from "@/lib/bcc/format";

// Restrained chart kit — no library, no gradients, no chartjunk. Ink for the
// primary series, volt for the highlighted one, light grey for context.

export function HBar({
  label,
  sublabel,
  value,
  secondary,
  max,
  count,
  onClick,
  highlight,
}: {
  label: string;
  sublabel?: string;
  /** Primary magnitude, e.g. unique project value. */
  value: number;
  /** Optional inner magnitude drawn on the same track, e.g. weighted value. */
  secondary?: number;
  max: number;
  count?: number;
  onClick?: () => void;
  highlight?: boolean;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0;
  const secondaryPct = max > 0 && secondary != null ? (secondary / max) * 100 : null;

  const body = (
    <>
      <span className="flex w-[132px] shrink-0 flex-col text-left">
        <span className="truncate text-[12.5px] text-ink">{label}</span>
        {sublabel ? (
          <span className="truncate text-[11px] text-ink-faint">{sublabel}</span>
        ) : null}
      </span>
      <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-[5px] bg-sunken">
        <span
          className={cx(
            "absolute inset-y-0 left-0 origin-left rounded-[5px] animate-bar-grow",
            highlight ? "bg-volt" : "bg-ink/85",
          )}
          style={{ width: `${pct}%` }}
        />
        {secondaryPct != null ? (
          <span
            className="absolute inset-y-0 left-0 origin-left rounded-[5px] bg-ink animate-bar-grow"
            style={{ width: `${secondaryPct}%` }}
            title="Probability-weighted"
          />
        ) : null}
      </span>
      <span className="flex w-[92px] shrink-0 items-baseline justify-end gap-1.5">
        {count != null ? (
          <span className="tnum text-[11px] text-ink-faint">{count}</span>
        ) : null}
        <span className="tnum text-[12.5px] font-medium text-ink">
          {currencyCompact(value)}
        </span>
      </span>
    </>
  );

  if (!onClick) {
    return <div className="flex items-center gap-3 py-1">{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md py-1 text-left transition hover:bg-canvas"
    >
      {body}
    </button>
  );
}

/** Grouped monthly columns — used for install forecast and analytics. */
export function MonthColumns({
  months,
  series,
  height = 120,
  format = currencyCompact,
}: {
  months: string[];
  series: { key: string; label: string; values: number[]; tone: "ink" | "volt" | "line" | "ok" }[];
  height?: number;
  format?: (value: number) => string;
}) {
  const id = useId();
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.values.map((v) => v)),
  );
  const tones: Record<string, string> = {
    ink: "bg-ink",
    volt: "bg-volt",
    line: "bg-line-strong",
    ok: "bg-ok",
  };

  return (
    <div>
      <div className="flex items-end gap-1" style={{ height }}>
        {months.map((m, i) => (
          <div key={`${id}-${m}`} className="group flex min-w-0 flex-1 flex-col justify-end gap-px">
            <div className="flex items-end justify-center gap-[2px]" style={{ height }}>
              {series.map((s) => {
                const v = s.values[i] ?? 0;
                const h = (v / max) * height;
                return (
                  <div
                    key={s.key}
                    title={`${s.label} · ${m} · ${format(v)}`}
                    className={cx("w-full max-w-[14px] rounded-t-[3px] transition-all", tones[s.tone])}
                    style={{ height: Math.max(v > 0 ? 2 : 0, h) }}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1 border-t border-line pt-1.5">
        {months.map((m) => (
          <div
            key={`${id}-label-${m}`}
            className="min-w-0 flex-1 truncate text-center text-[10px] text-ink-faint"
          >
            {m}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; tone: "ink" | "volt" | "line" | "ok" | "hatch" }[];
}) {
  const tones: Record<string, string> = {
    ink: "bg-ink",
    volt: "bg-volt",
    line: "bg-line-strong",
    ok: "bg-ok",
    hatch: "hatch text-ink-faint",
  };
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span className={cx("h-2.5 w-2.5 rounded-[3px]", tones[i.tone])} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Win-rate style paired bar: won vs total, expressed once. */
export function RateBar({
  label,
  won,
  total,
  valueLabel,
}: {
  label: string;
  won: number;
  total: number;
  valueLabel?: string;
}) {
  const pct = total > 0 ? (won / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-[132px] shrink-0 truncate text-[12.5px] text-ink">{label}</span>
      <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-[5px] bg-sunken">
        <span
          className="absolute inset-y-0 left-0 rounded-[5px] bg-ink animate-bar-grow origin-left"
          style={{ width: `${Math.max(pct > 0 ? 1.5 : 0, pct)}%` }}
        />
      </span>
      <span className="tnum w-[86px] shrink-0 text-right text-[12.5px] font-medium text-ink">
        {total === 0 ? "—" : `${Math.round(pct)}%`}
        <span className="ml-1 text-[11px] font-normal text-ink-faint">
          {valueLabel ?? `${won}/${total}`}
        </span>
      </span>
    </div>
  );
}

export function StatTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "ok" | "warn" | "danger";
}) {
  const tones = {
    default: "text-ink",
    ok: "text-ok-ink",
    warn: "text-warn-ink",
    danger: "text-danger-ink",
  };
  return (
    <div className="rounded-lg border border-line px-3 py-2.5">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-faint">
        {label}
      </p>
      <p className={cx("tnum mt-1 text-[17px] font-semibold tracking-[-0.02em]", tones[tone])}>
        {value}
      </p>
      {sub ? <p className="mt-0.5 text-[11.5px] text-ink-muted">{sub}</p> : null}
    </div>
  );
}
