"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

import { useData } from "@/components/providers/DataProvider";

/**
 * Opens the project named in `?project=…`, so a link in the morning digest
 * lands on the record it is about rather than the dashboard.
 */
export function DeepLink() {
  const params = useSearchParams();
  const { db, openProject } = useData();
  const handled = useRef<string | null>(null);

  const requested = params.get("project");

  useEffect(() => {
    if (!requested || !db || handled.current === requested) return;
    if (db.projects.some((p) => p.id === requested)) {
      handled.current = requested;
      openProject(requested);
      // Drop the parameter so a refresh does not reopen a panel you closed.
      const url = new URL(window.location.href);
      url.searchParams.delete("project");
      window.history.replaceState({}, "", url.toString());
    }
  }, [requested, db, openProject]);

  return null;
}
