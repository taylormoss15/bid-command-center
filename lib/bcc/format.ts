// Formatting helpers. Financial values use tabular figures everywhere, so the
// job here is only to decide precision — never to pad or align.

export function currency(value: number | null | undefined, opts?: { cents?: boolean }): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts?.cents ? 2 : 0,
    maximumFractionDigits: opts?.cents ? 2 : 0,
  });
}

/** $1.4M / $350K / $8.2K — for summary cards and chart labels. */
export function currencyCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) {
    const m = abs / 1_000_000;
    return `${sign}$${m >= 10 ? m.toFixed(1) : m.toFixed(2)}M`.replace(/\.0+M$/, "M");
  }
  if (abs >= 1_000) {
    const k = abs / 1_000;
    return `${sign}$${k >= 100 ? Math.round(k) : k.toFixed(1)}K`.replace(/\.0K$/, "K");
  }
  return `${sign}$${Math.round(abs)}`;
}

export function percent(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function number(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US");
}

/** Today as a local YYYY-MM-DD string. */
export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD (or full ISO) string as a *local* date, never UTC. */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const time = /T(\d{2}):(\d{2})/.exec(value);
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    time ? Number(time[1]) : 0,
    time ? Number(time[2]) : 0,
  );
}

/** Whole days from `from` to `to`. Negative means `to` is in the past. */
export function daysBetween(from: string, to: string | null | undefined): number | null {
  const a = parseDate(from);
  const b = parseDate(to);
  if (!a || !b) return null;
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((db - da) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = parseDate(iso) ?? new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function formatDate(
  value: string | null | undefined,
  style: "short" | "medium" | "long" = "medium",
): string {
  const d = parseDate(value);
  if (!d) return "—";
  if (style === "short") {
    return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  }
  if (style === "long") {
    return d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Includes the time only when one was actually entered (ISO has a T). */
export function formatDateTime(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  const hasTime = typeof value === "string" && value.includes("T");
  const date = formatDate(value);
  if (!hasTime) return date;
  return `${date} · ${d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

export function formatMonth(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/** "in 3 days" / "today" / "4 days ago" — relative to `today`. */
export function relativeDays(today: string, value: string | null | undefined): string {
  const diff = daysBetween(today, value);
  if (diff == null) return "—";
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) return `in ${diff} days`;
  return `${Math.abs(diff)} days ago`;
}

export function formatRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  if (!start && !end) return "—";
  if (start && !end) return `${formatDate(start)} →`;
  if (!start && end) return `→ ${formatDate(end)}`;
  const a = parseDate(start)!;
  const b = parseDate(end)!;
  if (a.getFullYear() === b.getFullYear()) {
    if (a.getMonth() === b.getMonth()) {
      return `${a.toLocaleDateString("en-US", { month: "short", day: "numeric" })}–${b.getDate()}, ${b.getFullYear()}`;
    }
    return `${a.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${b.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${b.getFullYear()}`;
  }
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
