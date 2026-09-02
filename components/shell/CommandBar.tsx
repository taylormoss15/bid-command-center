"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useData, useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import {
  IconArrowRight,
  IconBoard,
  IconDownload,
  IconGauge,
  IconPlus,
  IconSearch,
  IconTable,
  IconTimeline,
} from "@/components/ui/Icons";
import { StageChip, cx } from "@/components/ui/primitives";
import { currencyCompact } from "@/lib/bcc/format";

interface Command {
  id: string;
  label: string;
  sublabel?: string;
  trailing?: string;
  group: "Projects" | "Actions" | "Go to";
  icon?: React.ReactNode;
  run: () => void;
}

/** ⌘K — search every project and reach the common actions without the mouse. */
export function CommandBar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { db, openProject, setQuickAddOpen } = useData();
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const projectCommands: Command[] = (db?.projects ?? []).map((p) => {
      const gcs = (recipients.get(p.id) ?? [])
        .map((r) => orgs.get(r.organizationId) ?? "")
        .filter(Boolean);
      return {
        id: p.id,
        label: p.name,
        sublabel: [p.code, `${p.city}, ${p.state}`, gcs.join(", ")]
          .filter(Boolean)
          .join(" · "),
        trailing: currencyCompact(p.expectedValue),
        group: "Projects",
        icon: <StageChip stage={p.stage} short />,
        run: () => {
          openProject(p.id);
          onClose();
        },
      };
    });

    const actions: Command[] = [
      {
        id: "new",
        label: "New project",
        group: "Actions",
        icon: <IconPlus size={15} />,
        run: () => {
          setQuickAddOpen(true);
          onClose();
        },
      },
      {
        id: "export",
        label: "Export projects to CSV",
        group: "Actions",
        icon: <IconDownload size={15} />,
        run: () => {
          window.location.href = "/api/bcc/export?entity=projects";
          onClose();
        },
      },
    ];

    const goTo: Command[] = [
      { id: "g-home", label: "Command Center", href: "/", icon: <IconGauge size={15} /> },
      { id: "g-board", label: "Bid Board", href: "/board", icon: <IconBoard size={15} /> },
      { id: "g-projects", label: "Projects", href: "/projects", icon: <IconTable size={15} /> },
      { id: "g-follow", label: "Follow-ups", href: "/followups", icon: <IconArrowRight size={15} /> },
      { id: "g-forecast", label: "Install Forecast", href: "/forecast", icon: <IconTimeline size={15} /> },
    ].map((g) => ({
      id: g.id,
      label: g.label,
      group: "Go to" as const,
      icon: g.icon,
      run: () => {
        router.push(g.href);
        onClose();
      },
    }));

    return [...projectCommands, ...actions, ...goTo];
  }, [db?.projects, recipients, orgs, openProject, onClose, setQuickAddOpen, router]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return [
        ...commands.filter((c) => c.group !== "Projects"),
        ...commands.filter((c) => c.group === "Projects").slice(0, 6),
      ];
    }
    return commands
      .map((c) => {
        const haystack = `${c.label} ${c.sublabel ?? ""}`.toLowerCase();
        const index = haystack.indexOf(q);
        if (index === -1) return null;
        // Prefer prefix matches on the name itself.
        const score = (c.label.toLowerCase().startsWith(q) ? 0 : 10) + index;
        return { command: c, score };
      })
      .filter((x): x is { command: Command; score: number } => x !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((x) => x.command);
  }, [commands, query]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, results.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        results[cursor]?.run();
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, results, cursor, onClose]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  let lastGroup = "";

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-ink/25 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div className="relative z-10 w-[min(92vw,600px)] overflow-hidden rounded-2xl border border-line bg-paper shadow-pop animate-pop-in">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <IconSearch size={16} className="shrink-0 text-ink-faint" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search projects, GCs, cities — or jump to a view"
            className="h-12 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-faint">esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-muted">
              Nothing matches “{query}”.
            </p>
          ) : (
            results.map((c, i) => {
              const showGroup = c.group !== lastGroup;
              lastGroup = c.group;
              return (
                <div key={c.id}>
                  {showGroup ? (
                    <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-faint">
                      {c.group}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    data-index={i}
                    onMouseMove={() => setCursor(i)}
                    onClick={c.run}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition",
                      i === cursor ? "bg-sunken" : "hover:bg-canvas",
                    )}
                  >
                    <span className="flex w-16 shrink-0 justify-start text-ink-muted">
                      {c.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">
                        {c.label}
                      </span>
                      {c.sublabel ? (
                        <span className="block truncate text-[11.5px] text-ink-muted">
                          {c.sublabel}
                        </span>
                      ) : null}
                    </span>
                    {c.trailing ? (
                      <span className="tnum shrink-0 text-[12px] font-medium text-ink-soft">
                        {c.trailing}
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
