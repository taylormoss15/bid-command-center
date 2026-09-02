"use client";

import { useState } from "react";

import { BidBoard } from "@/components/bcc/BidBoard";
import { FilterBar } from "@/components/bcc/FilterBar";
import { PipelineTabs } from "@/components/bcc/PipelineTabs";
import { EMPTY_FILTERS, useFilteredProjects, type Filters } from "@/components/bcc/useFilters";
import { useData } from "@/components/providers/DataProvider";
import { PageBody } from "@/components/shell/PageBody";
import type { PipelineTab } from "@/lib/bcc/types";

export default function BoardPage() {
  const { db, today } = useData();
  const [tab, setTab] = useState<PipelineTab>("bidding");
  const [filters, setFilters] = useState<Filters>({ ...EMPTY_FILTERS });

  const projects = useFilteredProjects(db?.projects ?? [], tab, filters, today);

  return (
    <PageBody wide className="pb-4">
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
      <BidBoard projects={projects} tab={tab} />
    </PageBody>
  );
}
