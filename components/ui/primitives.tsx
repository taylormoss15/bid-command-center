"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { HEALTH_LABEL } from "@/lib/bcc/calc";
import { STAGE_MAP } from "@/lib/bcc/stages";
import { SIGNAL_MAP } from "@/lib/bcc/taxonomy";
import type { FollowUpHealth, Signal, StageId } from "@/lib/bcc/types";

import { IconExternal, IconTrello } from "./Icons";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "volt" | "outline" | "ghost" | "danger";
type ButtonSize = "xs" | "sm" | "md";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 " +
  "disabled:pointer-events-none disabled:opacity-40 select-none whitespace-nowrap";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-ink text-white hover:bg-ink/90 active:bg-ink shadow-card active:scale-[0.98]",
  volt:
    "bg-volt text-ink hover:bg-volt-hover active:scale-[0.98] shadow-card font-semibold",
  outline:
    "border border-line bg-paper text-ink hover:border-line-strong hover:bg-canvas active:scale-[0.98]",
  ghost: "text-ink-soft hover:bg-sunken hover:text-ink",
  danger: "text-danger hover:bg-danger-tint",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-[12px]",
  sm: "h-8 px-3 text-[13px]",
  md: "h-9 px-3.5 text-[13px]",
};

export function Button({
  variant = "outline",
  size = "sm",
  className,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...rest}
    />
  );
}

export function IconButton({
  label,
  className,
  ...rest
}: { label: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition",
        "hover:bg-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
        className,
      )}
      {...rest}
    />
  );
}

// ---------------------------------------------------------------------------
// Chips and status
// ---------------------------------------------------------------------------

export function Chip({
  children,
  tone = "neutral",
  className,
  title,
}: {
  children: ReactNode;
  tone?: "neutral" | "ink" | "volt" | "ok" | "warn" | "danger" | "info" | "outline";
  className?: string;
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-sunken text-ink-soft",
    ink: "bg-ink text-white",
    volt: "bg-volt-tint text-volt-deep",
    ok: "bg-ok-tint text-ok-ink",
    warn: "bg-warn-tint text-warn-ink",
    danger: "bg-danger-tint text-danger-ink",
    info: "bg-info-tint text-info-ink",
    outline: "border border-line text-ink-muted",
  };
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs font-medium leading-none",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const STAGE_TONE: Record<string, "neutral" | "volt" | "ok" | "outline"> = {
  bidding: "neutral",
  awarded: "volt",
  contracted: "ok",
  closed: "outline",
};

export function StageChip({
  stage,
  className,
  short,
}: {
  stage: StageId;
  className?: string;
  short?: boolean;
}) {
  const def = STAGE_MAP[stage];
  return (
    <Chip tone={STAGE_TONE[def.tab]} className={className} title={def.definition}>
      {short ? def.short : def.label}
    </Chip>
  );
}

const HEALTH_TONE: Record<FollowUpHealth, Parameters<typeof Chip>[0]["tone"]> = {
  overdue: "danger",
  due_today: "ink",
  due_soon: "warn",
  scheduled: "neutral",
  unscheduled: "danger",
  waiting: "info",
  closed: "outline",
};

export function HealthChip({
  health,
  className,
}: {
  health: FollowUpHealth;
  className?: string;
}) {
  return (
    <Chip
      tone={HEALTH_TONE[health]}
      className={cx(health === "unscheduled" && "border border-dashed border-danger/40", className)}
    >
      {HEALTH_LABEL[health]}
    </Chip>
  );
}

/** Latest directional read from the GC, as a two-glyph mark. */
export function SignalMark({ signal, className }: { signal?: Signal | null; className?: string }) {
  if (!signal) return null;
  const def = SIGNAL_MAP[signal];
  const tone =
    def.tone === "up" ? "text-ok" : def.tone === "down" ? "text-danger" : "text-ink-faint";
  return (
    <span
      title={`Latest signal: ${def.label}`}
      className={cx("font-semibold leading-none tracking-tight", tone, className)}
    >
      {def.short}
    </span>
  );
}

/** Probability rendered as a value plus a 24px meter. */
export function ProbabilityMeter({
  value,
  overridden,
  className,
}: {
  value: number;
  overridden?: boolean;
  className?: string;
}) {
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <span className="tnum text-[13px] font-medium text-ink">
        {Math.round(value * 100)}%
      </span>
      <span className="relative h-1 w-6 overflow-hidden rounded-full bg-line">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-ink"
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      </span>
      {overridden ? (
        <span
          title="Manually overridden — not the stage default"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-volt ring-1 ring-volt-deep/30"
        />
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={cx("card", padded && "p-4", className)}>{children}</section>
  );
}

export function SectionHeader({
  title,
  hint,
  action,
  className,
}: {
  title: string;
  hint?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-[12px] text-ink-muted">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon ? <div className="mb-1 text-ink-faint">{icon}</div> : null}
      <p className="text-[13px] font-medium text-ink">{title}</p>
      {body ? <p className="max-w-sm text-[12px] leading-relaxed text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cx("border-0 border-t border-line", className)} />;
}

// ---------------------------------------------------------------------------
// Links out
// ---------------------------------------------------------------------------

export function TrelloLink({
  url,
  compact,
  placeholder,
  className,
}: {
  url?: string | null;
  compact?: boolean;
  /** Render a dash when there is no card — useful in a table column, not on a card. */
  placeholder?: boolean;
  className?: string;
}) {
  if (!url) {
    return placeholder ? (
      <span className="text-[12px] text-ink-faint" title="No Trello card linked">
        —
      </span>
    ) : null;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Open the Trello card"
      className={cx(
        "inline-flex items-center gap-1 rounded-md text-[12px] font-medium text-ink-muted transition",
        "hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
        compact ? "h-6 w-6 justify-center hover:bg-sunken" : "px-1.5 py-0.5 hover:bg-sunken",
        className,
      )}
    >
      <IconTrello size={14} />
      {compact ? null : <span>Trello</span>}
    </a>
  );
}

export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cx(
        "inline-flex items-center gap-1 text-[13px] text-ink underline decoration-line-strong underline-offset-2 transition hover:decoration-ink",
        className,
      )}
    >
      {children}
      <IconExternal size={12} className="text-ink-faint" />
    </a>
  );
}

export function NavLinkish({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
