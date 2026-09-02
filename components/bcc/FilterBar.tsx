"use client";

import { useMemo, useRef, useState } from "react";

import { useData } from "@/components/providers/DataProvider";
import { Input, Select } from "@/components/ui/Field";
import { IconDownload, IconFilter, IconSearch, IconX } from "@/components/ui/Icons";
import { Button, Chip, cx } from "@/components/ui/primitives";
import { HEALTH_LABEL } from "@/lib/bcc/calc";
import { ESTIMATORS, MATERIALS } from "@/lib/bcc/taxonomy";
import type { FollowUpHealth, PipelineTab } from "@/lib/bcc/types";

import {
  EMPTY_FILTERS,
  activeFilterCount,
  useSavedViews,
  type Filters,
} from "./useFilters";

const HEALTHS: FollowUpHealth[] = [
  "overdue",
  "due_today",
  "due_soon",
  "scheduled",
  "unscheduled",
  "waiting",
];

export function FilterBar({
  filters,
  onChange,
  tab,
  onApplyView,
  resultCount,
  children,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  tab: PipelineTab;
  onApplyView: (tab: PipelineTab, filters: Filters) => void;
  resultCount: number;
  children?: React.ReactNode;
}) {
  const { db } = useData();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState(false);
  const [viewName, setViewName] = useState("");
  const { views, save, remove } = useSavedViews();
  const searchRef = useRef<HTMLInputElement>(null);

  const count = activeFilterCount(filters);

  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of db?.projects ?? []) {
      for (const d of [p.installStart, p.installEnd]) {
        if (d) set.add(Number(d.slice(0, 4)));
      }
    }
    return Array.from(set).sort();
  }, [db?.projects]);

  const gcs = useMemo(
    () => (db?.organizations ?? []).filter((o) => o.type === "gc"),
    [db?.organizations],
  );

  const toggle = <K extends keyof Filters>(key: K, value: string) => {
    const list = filters[key] as unknown as string[];
    onChange({
      ...filters,
      [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    } as Filters);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1 sm:max-w-xs">
          <IconSearch
            size={14}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            ref={searchRef}
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Search projects, GCs, cities…"
            className="field h-8 py-1 pl-8 pr-7 text-[13px]"
          />
          {filters.search ? (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onChange({ ...filters, search: "" });
                searchRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink"
            >
              <IconX size={12} />
            </button>
          ) : null}
        </div>

        <Button
          onClick={() => setOpen((o) => !o)}
          className={cx(count > 0 && "border-ink bg-ink text-white hover:bg-ink/90")}
        >
          <IconFilter size={13} />
          Filters
          {count > 0 ? (
            <span className="tnum ml-0.5 rounded bg-volt px-1 text-[10px] font-bold text-ink">
              {count}
            </span>
          ) : null}
        </Button>

        {views.length > 0 ? (
          <div className="flex items-center gap-1">
            {views.map((v) => (
              <span
                key={v.id}
                className="group inline-flex items-center rounded-lg border border-line bg-paper pl-2 pr-1 text-[12.5px] text-ink-soft"
              >
                <button
                  type="button"
                  onClick={() => onApplyView(v.tab, v.filters)}
                  className="py-1 transition hover:text-ink"
                >
                  {v.name}
                </button>
                <button
                  type="button"
                  aria-label={`Delete view ${v.name}`}
                  onClick={() => remove(v.id)}
                  className="ml-1 rounded p-1 text-ink-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
                >
                  <IconX size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          <span className="tnum text-[12px] text-ink-muted">
            {resultCount} {resultCount === 1 ? "project" : "projects"}
          </span>
          {children}
          <a
            href="/api/bcc/export?entity=projects"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-medium text-ink transition hover:border-line-strong hover:bg-canvas"
          >
            <IconDownload size={13} />
            <span className="hidden sm:inline">Export</span>
          </a>
        </div>
      </div>

      {open ? (
        <div className="card space-y-3 p-3.5 animate-pop-in">
          <FilterGroup label="Follow-up health">
            {HEALTHS.map((h) => (
              <FilterChip
                key={h}
                active={filters.health.includes(h)}
                onClick={() => toggle("health", h)}
              >
                {HEALTH_LABEL[h]}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Roofing system">
            {MATERIALS.map((m) => (
              <FilterChip
                key={m.id}
                active={filters.materials.includes(m.id)}
                onClick={() => toggle("materials", m.id)}
              >
                {m.label}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="GC / client">
            {gcs.map((o) => (
              <FilterChip
                key={o.id}
                active={filters.gcIds.includes(o.id)}
                onClick={() => toggle("gcIds", o.id)}
              >
                {o.name}
              </FilterChip>
            ))}
          </FilterGroup>

          <FilterGroup label="Estimator">
            {ESTIMATORS.map((e) => (
              <FilterChip
                key={e}
                active={filters.estimators.includes(e)}
                onClick={() => toggle("estimators", e)}
              >
                {e}
              </FilterChip>
            ))}
          </FilterGroup>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">Install year</span>
              <Select
                value={filters.installYear}
                onChange={(e) => onChange({ ...filters, installYear: e.target.value })}
                className="h-8 py-1 text-[12.5px]"
              >
                <option value="all">Any year</option>
                {years.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="label">Minimum value</span>
              <Select
                value={filters.minValue == null ? "" : String(filters.minValue)}
                onChange={(e) =>
                  onChange({
                    ...filters,
                    minValue: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="h-8 py-1 text-[12.5px]"
              >
                <option value="">Any value</option>
                <option value="100000">$100K+</option>
                <option value="250000">$250K+</option>
                <option value="500000">$500K+</option>
                <option value="1000000">$1M+</option>
                <option value="2000000">$2M+</option>
              </Select>
            </label>
            <label className="block">
              <span className="label">City</span>
              <Input
                value={filters.city}
                onChange={(e) => onChange({ ...filters, city: e.target.value })}
                placeholder="Lehi"
                className="h-8 py-1 text-[12.5px]"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button size="xs" variant="ghost" onClick={() => onChange({ ...EMPTY_FILTERS })}>
              Clear all
            </Button>
            {naming ? (
              <div className="flex items-center gap-1.5">
                <Input
                  autoFocus
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  placeholder="View name"
                  className="h-7 w-40 py-1 text-[12.5px]"
                />
                <Button
                  size="xs"
                  variant="primary"
                  disabled={!viewName.trim()}
                  onClick={() => {
                    save({ name: viewName.trim(), tab, filters });
                    setViewName("");
                    setNaming(false);
                  }}
                >
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setNaming(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button size="xs" onClick={() => setNaming(true)} disabled={count === 0}>
                Save this view
              </Button>
            )}
            <Button size="xs" variant="ghost" className="ml-auto" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      ) : count > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.health.map((h) => (
            <Chip key={h} tone="ink">
              {HEALTH_LABEL[h]}
            </Chip>
          ))}
          {filters.materials.map((m) => (
            <Chip key={m}>{MATERIALS.find((x) => x.id === m)?.label ?? m}</Chip>
          ))}
          {filters.gcIds.map((g) => (
            <Chip key={g}>{gcs.find((x) => x.id === g)?.name ?? g}</Chip>
          ))}
          {filters.estimators.map((e) => (
            <Chip key={e}>{e}</Chip>
          ))}
          {filters.installYear !== "all" ? <Chip>Installs {filters.installYear}</Chip> : null}
          {filters.minValue != null ? (
            <Chip>{`$${(filters.minValue / 1000).toFixed(0)}K+`}</Chip>
          ) : null}
          {filters.city ? <Chip>{filters.city}</Chip> : null}
          <button
            type="button"
            onClick={() => onChange({ ...EMPTY_FILTERS, search: filters.search })}
            className="text-[11.5px] text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-md border px-2 py-1 text-[12px] transition",
        active
          ? "border-ink bg-ink text-white"
          : "border-line bg-paper text-ink-soft hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
