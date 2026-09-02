"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { recipientsByProject } from "@/lib/bcc/calc";
import { todayISO } from "@/lib/bcc/format";
import type {
  Activity,
  BidRecipient,
  ContactMethod,
  Database,
  FollowUpType,
  Project,
  Signal,
  StageId,
} from "@/lib/bcc/types";

// ---------------------------------------------------------------------------
// One client-side store for the whole app.
//
// The dataset is small enough to hold entirely in memory, so every view reads
// from the same object and every write returns the new database. Mutations are
// applied optimistically first — dragging a card must feel instant — and then
// reconciled with whatever the server sends back.
// ---------------------------------------------------------------------------

export interface LogFollowUpInput {
  projectId: string;
  recipientId?: string | null;
  at?: string;
  method?: ContactMethod | null;
  contact?: string | null;
  note?: string;
  signal?: Signal | null;
  stage?: StageId;
  probability?: number | null;
  nextFollowUpDate?: string | null;
  nextFollowUpType?: FollowUpType | null;
  waitingOn?: string | null;
  kind?: "touch" | "note";
}

export type SaveState = "idle" | "saving" | "saved" | "error";

interface Toast {
  id: number;
  message: string;
  detail?: string;
  tone: "default" | "success" | "danger";
  /** Restores the database snapshot taken immediately before the change. */
  undo?: () => void;
}

interface DataContextValue {
  db: Database | null;
  loading: boolean;
  error: string | null;
  today: string;
  saveState: SaveState;

  refresh: () => Promise<void>;
  updateProject: (id: string, patch: Partial<Project>, options?: { label?: string }) => Promise<void>;
  /** Resolves with the new project's id so callers can open it straight away. */
  createProject: (
    project: Partial<Project>,
    recipient?: Partial<BidRecipient> & { organizationName?: string },
  ) => Promise<string | null>;
  deleteProject: (id: string) => Promise<void>;
  updateRecipient: (
    id: string,
    patch: Partial<BidRecipient> & {
      newRevision?: { amount: number; date: string; note?: string };
    },
  ) => Promise<void>;
  createRecipient: (
    recipient: Partial<BidRecipient> & { projectId: string; organizationName?: string },
  ) => Promise<void>;
  deleteRecipient: (id: string) => Promise<void>;
  logFollowUp: (input: LogFollowUpInput) => Promise<void>;
  resetDemoData: () => Promise<void>;

  toast: (message: string, options?: { detail?: string; tone?: Toast["tone"]; undo?: () => void }) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;

  // Cross-view UI state — any screen can open the panel or the log sheet.
  openProjectId: string | null;
  openProject: (id: string | null) => void;
  logTarget: { projectId: string; recipientId?: string | null } | null;
  openLog: (target: { projectId: string; recipientId?: string | null } | null) => void;
  quickAddOpen: boolean;
  setQuickAddOpen: (open: boolean) => void;
  editProjectId: string | null;
  setEditProjectId: (id: string | null) => void;
}

const DataContext = createContext<DataContextValue | null>(null);

async function call(path: string, init?: RequestInit): Promise<Database> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Session expired");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as Database;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(todayISO);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [openProjectId, setOpenProjectId] = useState<string | null>(null);
  const [logTarget, setLogTarget] = useState<DataContextValue["logTarget"]>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);

  const toastSeq = useRef(0);
  const savedTimer = useRef<number | null>(null);

  const dismissToast = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<DataContextValue["toast"]>((message, options) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((list) => [
      ...list,
      { id, message, detail: options?.detail, tone: options?.tone ?? "default", undo: options?.undo },
    ]);
    window.setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id));
    }, options?.undo ? 7000 : 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await call("/api/bcc/data");
      setDb(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Keep "today" honest across a tab left open overnight.
  useEffect(() => {
    const check = () => setToday(todayISO());
    window.addEventListener("focus", check);
    const interval = window.setInterval(check, 60_000);
    return () => {
      window.removeEventListener("focus", check);
      window.clearInterval(interval);
    };
  }, []);

  const markSaved = useCallback(() => {
    setSaveState("saved");
    if (savedTimer.current) window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setSaveState("idle"), 2200);
  }, []);

  /** Apply an optimistic local change, then send it. Rolls back on failure. */
  const commit = useCallback(
    async (
      optimistic: ((current: Database) => Database) | null,
      send: () => Promise<Database>,
    ): Promise<Database> => {
      const snapshot = db;
      if (optimistic && snapshot) setDb(optimistic(structuredClone(snapshot)));
      setSaveState("saving");
      try {
        const next = await send();
        setDb(next);
        markSaved();
        return next;
      } catch (err) {
        if (snapshot) setDb(snapshot);
        setSaveState("error");
        toast(err instanceof Error ? err.message : "Save failed", { tone: "danger" });
        throw err;
      }
    },
    [db, markSaved, toast],
  );

  const updateProject = useCallback<DataContextValue["updateProject"]>(
    async (id, patch) => {
      await commit(
        (current) => {
          const project = current.projects.find((p) => p.id === id);
          if (project) Object.assign(project, patch);
          return current;
        },
        () =>
          call(`/api/bcc/projects/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
      );
    },
    [commit],
  );

  const createProject = useCallback<DataContextValue["createProject"]>(
    async (project, recipient) => {
      const before = new Set((db?.projects ?? []).map((p) => p.id));
      const next = await commit(null, () =>
        call("/api/bcc/projects", {
          method: "POST",
          body: JSON.stringify({ project, recipient }),
        }),
      );
      return next.projects.find((p) => !before.has(p.id))?.id ?? null;
    },
    [commit, db?.projects],
  );

  const deleteProject = useCallback<DataContextValue["deleteProject"]>(
    async (id) => {
      await commit(
        (current) => {
          current.projects = current.projects.filter((p) => p.id !== id);
          current.recipients = current.recipients.filter((r) => r.projectId !== id);
          return current;
        },
        () => call(`/api/bcc/projects/${id}`, { method: "DELETE" }),
      );
    },
    [commit],
  );

  const updateRecipient = useCallback<DataContextValue["updateRecipient"]>(
    async (id, patch) => {
      const { newRevision, ...local } = patch;
      await commit(
        newRevision
          ? null
          : (current) => {
              const recipient = current.recipients.find((r) => r.id === id);
              if (recipient) Object.assign(recipient, local);
              return current;
            },
        () =>
          call(`/api/bcc/recipients/${id}`, {
            method: "PATCH",
            body: JSON.stringify(patch),
          }),
      );
    },
    [commit],
  );

  const createRecipient = useCallback<DataContextValue["createRecipient"]>(
    async (recipient) => {
      await commit(null, () =>
        call("/api/bcc/recipients", { method: "POST", body: JSON.stringify(recipient) }),
      );
    },
    [commit],
  );

  const deleteRecipient = useCallback<DataContextValue["deleteRecipient"]>(
    async (id) => {
      await commit(
        (current) => {
          current.recipients = current.recipients.filter((r) => r.id !== id);
          return current;
        },
        () => call(`/api/bcc/recipients/${id}`, { method: "DELETE" }),
      );
    },
    [commit],
  );

  const logFollowUp = useCallback<DataContextValue["logFollowUp"]>(
    async (input) => {
      await commit(null, () =>
        call("/api/bcc/activities", { method: "POST", body: JSON.stringify(input) }),
      );
    },
    [commit],
  );

  const resetDemoData = useCallback(async () => {
    await commit(null, () =>
      call("/api/bcc/data", { method: "POST", body: JSON.stringify({ action: "reset" }) }),
    );
  }, [commit]);

  const value = useMemo<DataContextValue>(
    () => ({
      db,
      loading,
      error,
      today,
      saveState,
      refresh,
      updateProject,
      createProject,
      deleteProject,
      updateRecipient,
      createRecipient,
      deleteRecipient,
      logFollowUp,
      resetDemoData,
      toast,
      toasts,
      dismissToast,
      openProjectId,
      openProject: setOpenProjectId,
      logTarget,
      openLog: setLogTarget,
      quickAddOpen,
      setQuickAddOpen,
      editProjectId,
      setEditProjectId,
    }),
    [
      db, loading, error, today, saveState, refresh, updateProject, createProject,
      deleteProject, updateRecipient, createRecipient, deleteRecipient, logFollowUp,
      resetDemoData, toast, toasts, dismissToast, openProjectId, logTarget,
      quickAddOpen, editProjectId,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData(): DataContextValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used inside <DataProvider>");
  return ctx;
}

/** Convenience selectors so views don't re-derive the same maps. */
export function useProjects() {
  const { db } = useData();
  return db?.projects ?? [];
}

export function useRecipientIndex() {
  const { db } = useData();
  return useMemo(() => recipientsByProject(db?.recipients ?? []), [db?.recipients]);
}

export function useOrgIndex() {
  const { db } = useData();
  return useMemo(() => {
    const map = new Map<string, string>();
    for (const o of db?.organizations ?? []) map.set(o.id, o.name);
    return map;
  }, [db?.organizations]);
}

export function useProjectActivities(projectId: string | null): Activity[] {
  const { db } = useData();
  return useMemo(() => {
    if (!projectId) return [];
    return (db?.activities ?? [])
      .filter((a) => a.projectId === projectId)
      .sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [db?.activities, projectId]);
}
