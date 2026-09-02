"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { IconChevronDown, IconChevronRight, IconSort } from "@/components/ui/Icons";
import {
  Button,
  Chip,
  HealthChip,
  ProbabilityMeter,
  StageChip,
  TrelloLink,
  cx,
} from "@/components/ui/primitives";
import {
  HEALTH_RANK,
  estimatedMargin,
  followUpHealth,
  isProbabilityOverridden,
  nextFollowUp,
  probabilityOf,
  weightedValue,
} from "@/lib/bcc/calc";
import {
  currency,
  currencyCompact,
  formatDate,
  formatDateTime,
  formatRange,
  percent,
} from "@/lib/bcc/format";
import { STAGE_MAP, STAGE_ORDER } from "@/lib/bcc/stages";
import { materialAbbr } from "@/lib/bcc/taxonomy";
import type { BidRecipient, Project } from "@/lib/bcc/types";

interface Ctx {
  recipients: Map<string, BidRecipient[]>;
  orgs: Map<string, string>;
  today: string;
}

interface Column {
  id: string;
  label: string;
  width: number;
  align?: "right";
  defaultOn: boolean;
  /** Comparable value for sorting. Strings sort lexically, numbers numerically. */
  sortKey?: (p: Project, ctx: Ctx) => string | number;
  render: (p: Project, ctx: Ctx) => ReactNode;
}

const COLUMNS: Column[] = [
  {
    id: "name",
    label: "Project",
    width: 260,
    defaultOn: true,
    sortKey: (p) => p.name.toLowerCase(),
    render: (p) => (
      <span className="block max-w-[248px]">
        <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
        <span className="block truncate text-[11px] text-ink-faint">{p.code}</span>
      </span>
    ),
  },
  {
    id: "stage",
    label: "Stage",
    width: 128,
    defaultOn: true,
    sortKey: (p) => STAGE_ORDER.indexOf(p.stage),
    render: (p) => <StageChip stage={p.stage} short />,
  },
  {
    id: "bidDue",
    label: "Bid due",
    width: 150,
    defaultOn: true,
    sortKey: (p) => p.bidDueDate ?? "9999",
    render: (p) => (
      <span className="tnum text-[12.5px] text-ink-soft">{formatDateTime(p.bidDueDate)}</span>
    ),
  },
  {
    id: "install",
    label: "Install window",
    width: 168,
    defaultOn: true,
    sortKey: (p) => p.installStart ?? "9999",
    render: (p) => (
      <span className="tnum text-[12.5px] text-ink-soft">
        {formatRange(p.installStart, p.installEnd)}
        {p.installStart && (p.dateConfidence === "rough" || p.dateConfidence === "unknown") ? (
          <span className="ml-1 text-ink-faint" title="Install dates are not firm">~</span>
        ) : null}
      </span>
    ),
  },
  {
    id: "location",
    label: "Location",
    width: 130,
    defaultOn: true,
    sortKey: (p) => `${p.city}`.toLowerCase(),
    render: (p) => (
      <span className="truncate text-[12.5px] text-ink-soft">
        {p.city}
        {p.state ? `, ${p.state}` : ""}
      </span>
    ),
  },
  {
    id: "materials",
    label: "Materials",
    width: 150,
    defaultOn: true,
    render: (p) => (
      <span className="flex gap-1 overflow-hidden">
        {p.materials.slice(0, 3).map((m) => (
          <span
            key={m}
            className="rounded bg-sunken px-1 py-0.5 text-[9.5px] font-semibold tracking-[0.04em] text-ink-muted"
          >
            {materialAbbr(m)}
          </span>
        ))}
        {p.materials.length > 3 ? (
          <span className="text-[9.5px] font-semibold text-ink-faint">
            +{p.materials.length - 3}
          </span>
        ) : null}
      </span>
    ),
  },
  {
    id: "expectedValue",
    label: "Expected value",
    width: 124,
    align: "right",
    defaultOn: true,
    sortKey: (p) => p.expectedValue,
    render: (p) => (
      <span className="tnum text-[13px] font-medium text-ink">{currency(p.expectedValue)}</span>
    ),
  },
  {
    id: "submitted",
    label: "Submitted bid",
    width: 124,
    align: "right",
    defaultOn: true,
    sortKey: (p, ctx) =>
      (ctx.recipients.get(p.id) ?? []).reduce((m, r) => Math.max(m, r.submittedAmount ?? 0), 0),
    render: (p, ctx) => {
      const amount = (ctx.recipients.get(p.id) ?? []).reduce(
        (m, r) => Math.max(m, r.submittedAmount ?? 0),
        0,
      );
      return (
        <span className="tnum text-[12.5px] text-ink-soft">
          {amount ? currency(amount) : "—"}
        </span>
      );
    },
  },
  {
    id: "probability",
    label: "Win %",
    width: 108,
    defaultOn: true,
    sortKey: (p) => probabilityOf(p),
    render: (p) => (
      <ProbabilityMeter value={probabilityOf(p)} overridden={isProbabilityOverridden(p)} />
    ),
  },
  {
    id: "margin",
    label: "Est. GM",
    width: 84,
    align: "right",
    defaultOn: true,
    sortKey: (p) => estimatedMargin(p) ?? -1,
    render: (p) => (
      <span className="tnum text-[12.5px] text-ink-soft">{percent(estimatedMargin(p), 1)}</span>
    ),
  },
  {
    id: "weighted",
    label: "Weighted",
    width: 112,
    align: "right",
    defaultOn: true,
    sortKey: (p) => weightedValue(p),
    render: (p) => (
      <span className="tnum text-[12.5px] text-ink-soft">
        {currency(Math.round(weightedValue(p)))}
      </span>
    ),
  },
  {
    id: "nextFollowUp",
    label: "Next follow-up",
    width: 124,
    defaultOn: true,
    sortKey: (p, ctx) => nextFollowUp(ctx.recipients.get(p.id) ?? [])?.date ?? "9999",
    render: (p, ctx) => {
      const next = nextFollowUp(ctx.recipients.get(p.id) ?? []);
      return (
        <span className="tnum text-[12.5px] text-ink-soft">
          {next ? formatDate(next.date) : "—"}
        </span>
      );
    },
  },
  {
    id: "health",
    label: "Health",
    width: 108,
    defaultOn: true,
    sortKey: (p, ctx) => HEALTH_RANK[followUpHealth(p, ctx.recipients.get(p.id) ?? [], ctx.today)],
    render: (p, ctx) => (
      <HealthChip health={followUpHealth(p, ctx.recipients.get(p.id) ?? [], ctx.today)} />
    ),
  },
  {
    id: "gc",
    label: "GC / client",
    width: 168,
    defaultOn: true,
    sortKey: (p, ctx) => {
      const recs = ctx.recipients.get(p.id) ?? [];
      return recs.length === 1 ? (ctx.orgs.get(recs[0].organizationId) ?? "").toLowerCase() : String(recs.length);
    },
    render: (p, ctx) => {
      const recs = ctx.recipients.get(p.id) ?? [];
      if (recs.length === 0) return <span className="text-[12.5px] text-ink-faint">—</span>;
      if (recs.length === 1) {
        return (
          <span className="truncate text-[12.5px] text-ink-soft">
            {ctx.orgs.get(recs[0].organizationId)}
          </span>
        );
      }
      return <Chip tone="neutral">{recs.length} GCs</Chip>;
    },
  },
  {
    id: "pm",
    label: "Project manager",
    width: 148,
    defaultOn: false,
    sortKey: (p) => (p.projectManager ?? "").toLowerCase(),
    render: (p) => (
      <span className="truncate text-[12.5px] text-ink-soft">{p.projectManager ?? "—"}</span>
    ),
  },
  {
    id: "estimator",
    label: "Estimator",
    width: 130,
    defaultOn: false,
    sortKey: (p) => p.estimator.toLowerCase(),
    render: (p) => <span className="truncate text-[12.5px] text-ink-soft">{p.estimator}</span>,
  },
  {
    id: "owner",
    label: "Owner",
    width: 160,
    defaultOn: false,
    sortKey: (p) => (p.owner ?? "").toLowerCase(),
    render: (p) => <span className="truncate text-[12.5px] text-ink-soft">{p.owner ?? "—"}</span>,
  },
  {
    id: "area",
    label: "Roof area",
    width: 104,
    align: "right",
    defaultOn: false,
    sortKey: (p) => p.roofAreaSqFt ?? 0,
    render: (p) => (
      <span className="tnum text-[12.5px] text-ink-soft">
        {p.roofAreaSqFt ? `${p.roofAreaSqFt.toLocaleString()} SF` : "—"}
      </span>
    ),
  },
  {
    id: "trello",
    label: "Trello",
    width: 72,
    defaultOn: true,
    render: (p) => <TrelloLink url={p.trelloUrl} compact placeholder />,
  },
];

type SortDir = "asc" | "desc";
interface Sort {
  id: string;
  dir: SortDir;
}

const COLUMN_STORAGE = "bcc.tableColumns.v1";

export function ProjectsTable({ projects }: { projects: Project[] }) {
  const { today, openProject, openLog } = useData();
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();

  const [visible, setVisible] = useState<string[]>(() =>
    COLUMNS.filter((c) => c.defaultOn).map((c) => c.id),
  );
  const [sorts, setSorts] = useState<Sort[]>([{ id: "nextFollowUp", dir: "asc" }]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLUMN_STORAGE);
      if (raw) setVisible(JSON.parse(raw) as string[]);
    } catch {
      // Default columns are fine.
    }
  }, []);

  const setColumns = (next: string[]) => {
    setVisible(next);
    try {
      window.localStorage.setItem(COLUMN_STORAGE, JSON.stringify(next));
    } catch {
      // Non-fatal.
    }
  };

  const ctx: Ctx = useMemo(() => ({ recipients, orgs, today }), [recipients, orgs, today]);
  const columns = useMemo(
    () => COLUMNS.filter((c) => visible.includes(c.id)),
    [visible],
  );

  /** Multi-sort: click to sort, shift-click to add a tiebreaker. */
  const sorted = useMemo(() => {
    const list = [...projects];
    if (sorts.length === 0) return list;
    return list.sort((a, b) => {
      for (const s of sorts) {
        const col = COLUMNS.find((c) => c.id === s.id);
        if (!col?.sortKey) continue;
        const av = col.sortKey(a, ctx);
        const bv = col.sortKey(b, ctx);
        if (av === bv) continue;
        const cmp = typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
        return s.dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [projects, sorts, ctx]);

  const onHeaderClick = (id: string, additive: boolean) => {
    const col = COLUMNS.find((c) => c.id === id);
    if (!col?.sortKey) return;
    setSorts((current) => {
      const existing = current.find((s) => s.id === id);
      if (!additive) {
        if (existing) {
          return existing.dir === "asc" ? [{ id, dir: "desc" }] : [];
        }
        return [{ id, dir: "asc" }];
      }
      if (existing) {
        return current.map((s) =>
          s.id === id ? { ...s, dir: s.dir === "asc" ? "desc" : "asc" } : s,
        );
      }
      return [...current, { id, dir: "asc" }];
    });
  };

  const totals = useMemo(
    () => ({
      expected: sorted.reduce((s, p) => s + p.expectedValue, 0),
      weighted: sorted.reduce((s, p) => s + weightedValue(p), 0),
    }),
    [sorted],
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <p className="text-[12px] text-ink-muted">
          Sorted by{" "}
          {sorts.length === 0
            ? "nothing"
            : sorts
                .map((s) => `${COLUMNS.find((c) => c.id === s.id)?.label} ${s.dir}`)
                .join(", then ")}
          <span className="ml-2 text-ink-faint">shift-click a header to add a tiebreaker</span>
        </p>
        <div className="relative ml-auto">
          <Button size="xs" onClick={() => setPicker((p) => !p)}>
            <IconSort size={12} />
            Columns
            <span className="tnum text-ink-faint">{visible.length}</span>
          </Button>
          {picker ? (
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-line bg-paper p-1.5 shadow-pop animate-pop-in">
              {COLUMNS.map((c) => {
                const on = visible.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      setColumns(
                        on ? visible.filter((v) => v !== c.id) : [...visible, c.id],
                      )
                    }
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] text-ink-soft transition hover:bg-canvas"
                  >
                    <span
                      className={cx(
                        "h-3.5 w-3.5 shrink-0 rounded border",
                        on ? "border-ink bg-ink" : "border-line-strong",
                      )}
                    />
                    {c.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-h-[calc(100vh-15rem)] overflow-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10">
            <tr className="bg-canvas">
              <th className="w-8 border-b border-line px-1 py-2" />
              {columns.map((c) => {
                const sort = sorts.find((s) => s.id === c.id);
                const order = sorts.findIndex((s) => s.id === c.id);
                return (
                  <th
                    key={c.id}
                    style={{ minWidth: c.width }}
                    className={cx(
                      "select-none border-b border-line px-2.5 py-2 text-[11px] font-medium uppercase tracking-[0.05em] text-ink-muted",
                      c.align === "right" && "text-right",
                      c.sortKey && "cursor-pointer hover:text-ink",
                    )}
                    onClick={(e) => onHeaderClick(c.id, e.shiftKey)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {c.label}
                      {sort ? (
                        <span className="text-ink">
                          {sort.dir === "asc" ? "↑" : "↓"}
                          {sorts.length > 1 ? (
                            <span className="tnum ml-0.5 text-[9px] text-ink-faint">
                              {order + 1}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => {
              const recs = recipients.get(p.id) ?? [];
              const isOpen = expanded === p.id;
              return (
                <Fragment key={p.id}>
                  <tr
                    onClick={() => openProject(p.id)}
                    className="group cursor-pointer border-b border-line-faint transition hover:bg-canvas"
                  >
                    <td className="px-1 py-2 align-middle">
                      {recs.length > 1 ? (
                        <button
                          type="button"
                          aria-label={isOpen ? "Collapse GCs" : "Expand GCs"}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpanded(isOpen ? null : p.id);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-ink-faint transition hover:bg-sunken hover:text-ink"
                        >
                          {isOpen ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
                        </button>
                      ) : null}
                    </td>
                    {columns.map((c) => (
                      <td
                        key={c.id}
                        className={cx(
                          "whitespace-nowrap px-2.5 py-2 align-middle",
                          c.align === "right" && "text-right",
                        )}
                      >
                        {c.render(p, ctx)}
                      </td>
                    ))}
                  </tr>
                  {isOpen
                    ? recs.map((r) => (
                        <tr key={r.id} className="border-b border-line-faint bg-canvas/60">
                          <td />
                          <td colSpan={columns.length} className="px-2.5 py-1.5">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-4 text-[12px]">
                              <span className="font-medium text-ink">
                                {orgs.get(r.organizationId)}
                              </span>
                              <span className="text-ink-muted">{r.contactName ?? "No contact"}</span>
                              <span className="tnum text-ink-soft">
                                {r.submittedAmount ? currency(r.submittedAmount) : "Not submitted"}
                              </span>
                              <span className="text-ink-muted">
                                {r.nextFollowUpDate
                                  ? `Next ${formatDate(r.nextFollowUpDate)}`
                                  : r.waitingOn
                                    ? `Waiting: ${r.waitingOn}`
                                    : "No next action"}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openLog({ projectId: p.id, recipientId: r.id });
                                }}
                                className="ml-auto rounded-md border border-line bg-paper px-2 py-0.5 text-[11.5px] text-ink-soft transition hover:border-ink hover:text-ink"
                              >
                                Log follow-up
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    : null}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="bg-canvas">
              <td />
              {columns.map((c) => (
                <td
                  key={c.id}
                  className={cx(
                    "tnum border-t border-line px-2.5 py-2 text-[12px] font-medium text-ink",
                    c.align === "right" && "text-right",
                  )}
                >
                  {c.id === "name"
                    ? `${sorted.length} projects`
                    : c.id === "expectedValue"
                      ? currencyCompact(totals.expected)
                      : c.id === "weighted"
                        ? currencyCompact(totals.weighted)
                        : null}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {sorted.length === 0 ? (
        <p className="px-4 py-12 text-center text-[13px] text-ink-muted">
          No projects match these filters.
        </p>
      ) : null}
    </div>
  );
}
