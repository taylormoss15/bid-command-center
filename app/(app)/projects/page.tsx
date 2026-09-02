"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { FilterBar } from "@/components/bcc/FilterBar";
import { PipelineTabs } from "@/components/bcc/PipelineTabs";
import { ProjectsTable } from "@/components/bcc/ProjectsTable";
import { EMPTY_FILTERS, useFilteredProjects, type Filters } from "@/components/bcc/useFilters";
import { useData } from "@/components/providers/DataProvider";
import { PageBody } from "@/components/shell/PageBody";
import { PIPELINE_TABS } from "@/lib/bcc/stages";
import type { PipelineTab } from "@/lib/bcc/types";

function ProjectsView() {
  const { db, today } = useData();
  const params = useSearchParams();
  const [tab, setTab] = useState<PipelineTab>("all");
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });

  // Summary cards deep-link into a specific slice of the pipeline.
  useEffect(() => {
    const requested = params.get("tab");
    if (requested && PIPELINE_TABS.some((t) => t.id === requested)) {
      setTab(requested as PipelineTab);
    }
  }, [params]);

  const projects = useFilteredProjects(db?.projects ?? [], tab, filters, today);

  return (
    <PageBody wide>
      <div className="mb-3 space-y-3">
        <PipelineTabs value={tab} onChange={setTab} />
        <FilterBar
          filters={filters}
          onChange={setFilters}
          tab={tab}
          onApplyView={(t, f) => {
            setTab(t);
            setFilters(f);
          }}
          resultCount={projects.length}
        />
      </div>
      <ProjectsTable projects={projects} />
    </PageBody>
  );
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<PageBody><div className="card h-96 animate-pulse bg-canvas" /></PageBody>}>
      <ProjectsView />
    </Suspense>
  );
}
