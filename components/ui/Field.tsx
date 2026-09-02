"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { IconCheck, IconChevronDown, IconX } from "./Icons";
import { cx } from "./primitives";

export function Field({
  label,
  hint,
  children,
  className,
  required,
}: {
  label?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cx("min-w-0", className)}>
      {label ? (
        <span className="label">
          {label}
          {required ? <span className="ml-0.5 text-danger">*</span> : null}
        </span>
      ) : null}
      {children}
      {hint ? <p className="mt-1 text-[11px] leading-snug text-ink-muted">{hint}</p> : null}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return <input className={cx("field", className)} {...rest} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className, ...rest } = props;
  return <textarea className={cx("field resize-y leading-relaxed", className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cx("field cursor-pointer appearance-none pr-8", className)}
        {...rest}
      >
        {children}
      </select>
      <IconChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
      />
    </div>
  );
}

/** Currency input that shows a clean number and stores an integer. */
export function MoneyInput({
  value,
  onChange,
  className,
  placeholder = "0",
  ...rest
}: {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  className?: string;
  placeholder?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");

  const display = focused
    ? draft
    : value == null
      ? ""
      : value.toLocaleString("en-US");

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">
        $
      </span>
      <input
        inputMode="numeric"
        className={cx("field pl-6", className)}
        placeholder={placeholder}
        value={display}
        onFocus={() => {
          setDraft(value == null ? "" : String(value));
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          setDraft(raw);
          onChange(raw === "" ? null : Number(raw));
        }}
        {...rest}
      />
    </div>
  );
}

export function PercentInput({
  value,
  onChange,
  className,
}: {
  /** Stored 0–1, edited 0–100. */
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  className?: string;
}) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        className={cx("field pr-7", className)}
        value={value == null ? "" : Math.round(value * 1000) / 10}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^0-9.]/g, "");
          onChange(raw === "" ? null : Math.min(100, Number(raw)) / 100);
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-ink-faint">
        %
      </span>
    </div>
  );
}

/** Chip-style multi-select used for materials and scope flags. */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  columns = 2,
}: {
  options: { id: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  columns?: number;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const id = useId();

  const selected = useMemo(
    () => options.filter((o) => value.includes(o.id)),
    [options, value],
  );

  const toggle = (optionId: string) => {
    onChange(
      value.includes(optionId)
        ? value.filter((v) => v !== optionId)
        : [...value, optionId],
    );
  };

  return (
    <div
      ref={wrapper}
      className="relative"
      onBlur={(e) => {
        if (!wrapper.current?.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="field flex min-h-[38px] flex-wrap items-center gap-1 text-left"
      >
        {selected.length === 0 ? (
          <span className="text-ink-faint">{placeholder}</span>
        ) : (
          selected.map((o) => (
            <span
              key={o.id}
              className="inline-flex items-center gap-1 rounded bg-sunken px-1.5 py-0.5 text-2xs font-medium text-ink-soft"
            >
              {o.label}
              <span
                role="button"
                tabIndex={-1}
                aria-label={`Remove ${o.label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  toggle(o.id);
                }}
                className="text-ink-faint hover:text-ink"
              >
                <IconX size={10} />
              </span>
            </span>
          ))
        )}
        <IconChevronDown
          size={14}
          className="ml-auto shrink-0 self-center text-ink-faint"
        />
      </button>

      {open ? (
        <div
          id={id}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-paper p-1 shadow-pop animate-pop-in"
          style={{ columnCount: columns }}
        >
          {options.map((o) => {
            const active = value.includes(o.id);
            return (
              <button
                key={o.id}
                type="button"
                onClick={() => toggle(o.id)}
                className={cx(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition",
                  active ? "bg-volt-tint text-ink" : "text-ink-soft hover:bg-sunken",
                )}
              >
                <span
                  className={cx(
                    "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
                    active ? "border-ink bg-ink text-white" : "border-line-strong",
                  )}
                >
                  {active ? <IconCheck size={9} strokeWidth={2.6} /> : null}
                </span>
                {o.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/** Tabs / view switch rendered as one connected control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  className,
}: {
  options: { id: T; label: string; count?: number; hint?: string }[];
  value: T;
  onChange: (id: T) => void;
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-sunken p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            title={o.hint}
            onClick={() => onChange(o.id)}
            className={cx(
              "rounded-[6px] font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink",
              size === "xs" ? "px-2 py-1 text-[12px]" : "px-2.5 py-1.5 text-[13px]",
              active
                ? "bg-paper text-ink shadow-card"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {o.label}
            {o.count != null ? (
              <span
                className={cx(
                  "tnum ml-1.5 text-[11px]",
                  active ? "text-ink-muted" : "text-ink-faint",
                )}
              >
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-[13px] text-ink-soft"
    >
      <span
        className={cx(
          "relative h-4 w-7 rounded-full transition-colors",
          checked ? "bg-ink" : "bg-line-strong",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all",
            checked ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      {label}
    </button>
  );
}
