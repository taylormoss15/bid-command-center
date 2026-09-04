"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { useData } from "@/components/providers/DataProvider";
import {
  IconBell,
  IconBoard,
  IconBuilding,
  IconChart,
  IconGauge,
  IconMenu,
  IconPlus,
  IconSearch,
  IconTable,
  IconTimeline,
  IconX,
} from "@/components/ui/Icons";
import { cx } from "@/components/ui/primitives";
import { followUpHealth, isActive, recipientsByProject } from "@/lib/bcc/calc";

const NAV = [
  { href: "/", label: "Command Center", icon: IconGauge, inbox: true },
  { href: "/board", label: "Bid Board", icon: IconBoard },
  { href: "/projects", label: "Projects", icon: IconTable },
  { href: "/followups", label: "Follow-ups", icon: IconBell, badge: true, key: "F" },
  { href: "/forecast", label: "Install Forecast", icon: IconTimeline },
  { href: "/clients", label: "Clients & GCs", icon: IconBuilding },
  { href: "/analytics", label: "Analytics", icon: IconChart },
];

export function AppShell({
  children,
  onOpenCommandBar,
}: {
  children: ReactNode;
  onOpenCommandBar: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { db, today, setQuickAddOpen, saveState, storage, workspace, setDataSettingsOpen } =
    useData();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => setNavOpen(false), [pathname]);

  // F for the follow-up queue, N for a new project.
  //
  // A bare letter rather than a modifier: Cmd/Ctrl+N is the browser's own
  // new-window and cannot be intercepted. Bare letters are only safe while
  // nothing is capturing typing, so this stands down inside any field and
  // whenever a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key !== "n" && key !== "f") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const el = e.target as HTMLElement | null;
      if (
        el?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(el?.tagName ?? "")
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;

      e.preventDefault();
      if (key === "f") router.push("/followups");
      else setQuickAddOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setQuickAddOpen, router]);

  /** Forwarded emails waiting to be confirmed — new jobs and new bid paths alike. */
  const inboxCount = useMemo(
    () =>
      (db?.projects ?? []).filter((p) => p.needsReview).length +
      (db?.recipients ?? []).filter((r) => r.needsReview).length,
    [db?.projects, db?.recipients],
  );

  /** Overdue + due-today across active work — the only number worth a badge. */
  const actionCount = useMemo(() => {
    if (!db) return 0;
    const byProject = recipientsByProject(db.recipients);
    return db.projects.filter((p) => {
      if (!isActive(p)) return false;
      const health = followUpHealth(p, byProject.get(p.id) ?? [], today);
      return health === "overdue" || health === "due_today" || health === "unscheduled";
    }).length;
  }, [db, today]);

  const signOut = async () => {
    await fetch("/api/bcc/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/login");
  };

  const nav = (
    <nav className="flex flex-1 flex-col gap-0.5 px-2.5">
      {NAV.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cx(
              "group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
              active
                ? "bg-white/[0.08] font-medium text-white"
                : "text-white/55 hover:bg-white/[0.05] hover:text-white/90",
            )}
          >
            {active ? (
              <span className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-volt" />
            ) : null}
            <Icon size={16} className={active ? "text-volt" : "text-white/40"} />
            <span className="flex-1 truncate">{item.label}</span>
            {item.badge && actionCount > 0 ? (
              <span className="tnum rounded-full bg-volt px-1.5 py-0.5 text-[10px] font-bold leading-none text-ink">
                {actionCount}
              </span>
            ) : null}
            {item.inbox && inboxCount > 0 ? (
              <span
                title={`${inboxCount} forwarded ${inboxCount === 1 ? "email" : "emails"} to review`}
                className="tnum rounded-full border border-volt/50 px-1.5 py-0.5 text-[10px] font-bold leading-none text-volt"
              >
                {inboxCount}
              </span>
            ) : null}
            {item.key ? (
              <kbd className="rounded border border-white/20 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/40 group-hover:text-white/70">
                {item.key}
              </kbd>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link href="/" className="flex items-center gap-2.5 px-4 py-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-volt text-[11px] font-black tracking-tight text-ink">
        ER
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold leading-tight text-white">
          Bid Command Center
        </span>
        <span className="block truncate text-[11px] leading-tight text-white/40">
          {workspace === "demo" ? "Demo pipeline" : "Elite Roofing"}
        </span>
      </span>
    </Link>
  );

  const footer = (
    <div className="border-t border-white/10 px-2.5 py-3">
      <div className="flex items-center justify-between px-1.5 pb-2">
        <span className="text-[11px] text-white/35">Taylor Moss</span>
        <SaveIndicator state={saveState} />
      </div>
      <button
        type="button"
        onClick={signOut}
        className="w-full rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/45 transition hover:bg-white/[0.05] hover:text-white/80"
      >
        Sign out
      </button>
      <button
        type="button"
        onClick={() => setDataSettingsOpen(true)}
        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] text-white/45 transition hover:bg-white/[0.05] hover:text-white/80"
      >
        Data &amp; backup
        {storage === "file" ? (
          <span
            title="Local file storage — not durable on a hosted deployment"
            className="ml-auto h-1.5 w-1.5 rounded-full bg-warn"
          />
        ) : null}
      </button>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[228px] flex-col bg-ink lg:flex">
        {brand}
        {nav}
        {footer}
      </aside>

      {/* Mobile drawer */}
      {navOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink/40 animate-fade-in"
            onClick={() => setNavOpen(false)}
          />
          <aside className="relative flex h-full w-[260px] flex-col bg-ink animate-slide-in-right">
            <div className="flex items-center justify-between pr-2">
              {brand}
              <button
                type="button"
                aria-label="Close navigation"
                onClick={() => setNavOpen(false)}
                className="rounded-md p-2 text-white/50 hover:bg-white/10 hover:text-white"
              >
                <IconX size={16} />
              </button>
            </div>
            {nav}
            {footer}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-[228px]">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-paper/85 px-3 backdrop-blur-md sm:px-5">
          <button
            type="button"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
            className="-ml-1 rounded-lg p-2 text-ink-soft transition hover:bg-sunken lg:hidden"
          >
            <IconMenu size={18} />
          </button>

          <PageTitle pathname={pathname} />

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenCommandBar}
              className="group flex h-8 items-center gap-2 rounded-lg border border-line bg-canvas pl-2.5 pr-2 text-[13px] text-ink-muted transition hover:border-line-strong hover:text-ink sm:w-56"
            >
              <IconSearch size={14} />
              <span className="hidden flex-1 text-left sm:block">Search projects…</span>
              <kbd className="hidden rounded border border-line bg-paper px-1.5 py-0.5 font-sans text-[10px] font-medium text-ink-faint sm:block">
                ⌘K
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setQuickAddOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-2.5 text-[13px] font-medium text-white shadow-card transition hover:bg-ink/90 active:scale-[0.98]"
            >
              <IconPlus size={14} className="text-volt" />
              <span className="hidden sm:inline">New project</span>
              <kbd className="hidden rounded border border-white/25 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/70 sm:block">
                N
              </kbd>
            </button>
          </div>
        </header>

        {workspace === "demo" ? (
          <div className="flex shrink-0 items-center justify-center gap-2 bg-volt px-4 py-1.5 text-center text-[12px] font-medium text-ink">
            <span className="rounded bg-ink px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-volt">
              Demo
            </span>
            <span>
              Generated pipeline for demonstrations — refreshes daily. Nothing here
              touches the live board.
            </span>
          </div>
        ) : null}

        <main className="min-w-0 flex-1">{children}</main>
      </div>

    </div>
  );
}

function PageTitle({ pathname }: { pathname: string }) {
  const item =
    NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href))) ??
    NAV[0];
  return (
    <h1 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
      {item.label}
    </h1>
  );
}

function SaveIndicator({ state }: { state: "idle" | "saving" | "saved" | "error" }) {
  if (state === "idle") return null;
  const copy = {
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed",
  }[state];
  return (
    <span
      className={cx(
        "flex items-center gap-1.5 text-[11px] transition",
        state === "error" ? "text-danger" : "text-white/45",
      )}
    >
      <span
        className={cx(
          "h-1.5 w-1.5 rounded-full",
          state === "saving" ? "animate-pulse bg-white/40" : state === "saved" ? "bg-volt" : "bg-danger",
        )}
      />
      {copy}
    </span>
  );
}
