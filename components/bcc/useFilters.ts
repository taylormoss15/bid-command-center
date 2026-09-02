"use client";

import { useEffect, useMemo, useState } from "react";

import { useOrgIndex, useRecipientIndex } from "@/components/providers/DataProvider";
import { followUpHealth } from "@/lib/bcc/calc";
import { parseDate } from "@/lib/bcc/format";
import { stagesForTab } from "@/lib/bcc/stages";
import type { BidRecipient, FollowUpHealth, PipelineTab, Project } from "@/lib/bcc/types";

export interface Filters {
  search: string;
  materials: string[];
  gcIds: string[];
  estimators: string[];
  health: FollowUpHealth[];
  installYear: string;
  minValue: number | null;
  city: string;
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  materials: [],
  gcIds: [],
  estimators: [],
  health: [],
  installYear: "all",
  minValue: null,
  city: "",
};

export function activeFilterCount(f: Filters): number {
  return (
    f.materials.length +
    f.gcIds.length +
    f.estimators.length +
    f.health.length +
    (f.installYear !== "all" ? 1 : 0) +
    (f.minValue != null ? 1 : 0) +
    (f.city ? 1 : 0)
  );
}

export interface SavedView {
  id: string;
  name: string;
  tab: PipelineTab;
  filters: Filters;
}

const STORAGE_KEY = "bcc.savedViews.v1";

/** Saved views live in the browser — a per-user preference, not shared data. */
export function useSavedViews() {
  const [views, setViews] = useState<SavedView[]>([]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setViews(JSON.parse(raw) as SavedView[]);
    } catch {
      // A blocked or corrupt store just means no saved views.
    }
  }, []);

  const persist = (next: SavedView[]) => {
    setViews(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Non-fatal.
    }
  };

  return {
    views,
    save: (view: Omit<SavedView, "id">) =>
      persist([...views, { ...view, id: `view-${Date.now().toString(36)}` }]),
    remove: (id: string) => persist(views.filter((v) => v.id !== id)),
  };
}

export function useFilteredProjects(
  projects: Project[],
  tab: PipelineTab,
  filters: Filters,
  today: string,
): Project[] {
  const recipients = useRecipientIndex();
  const orgs = useOrgIndex();

  return useMemo(() => {
    const stages = stagesForTab(tab);
    const query = filters.search.trim().toLowerCase();

    return projects.filter((p) => {
      if (stages && !stages.includes(p.stage)) return false;

      const recs: BidRecipient[] = recipients.get(p.id) ?? [];

      if (query) {
        const gcNames = recs.map((r) => orgs.get(r.organizationId) ?? "").join(" ");
        const haystack =
          `${p.name} ${p.code} ${p.city} ${p.state} ${p.owner ?? ""} ${p.architect ?? ""} ${p.description ?? ""} ${gcNames}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (filters.materials.length && !filters.materials.some((m) => p.materials.includes(m))) {
        return false;
      }
      if (filters.gcIds.length && !recs.some((r) => filters.gcIds.includes(r.organizationId))) {
        return false;
      }
      if (filters.estimators.length && !filters.estimators.includes(p.estimator)) return false;
      if (filters.health.length) {
        if (!filters.health.includes(followUpHealth(p, recs, today))) return false;
      }
      if (filters.installYear !== "all") {
        const start = parseDate(p.installStart);
        const end = parseDate(p.installEnd);
        const year = Number(filters.installYear);
        const touches =
          (start && start.getFullYear() === year) ||
          (end && end.getFullYear() === year) ||
          (start && end && start.getFullYear() < year && end.getFullYear() > year);
        if (!touches) return false;
      }
      if (filters.minValue != null && p.expectedValue < filters.minValue) return false;
      if (filters.city && !p.city.toLowerCase().includes(filters.city.toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [projects, tab, filters, recipients, orgs, today]);
}
