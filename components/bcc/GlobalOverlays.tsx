"use client";

import { DataSettingsModal } from "./DataSettingsModal";
import { EditProjectModal } from "./EditProjectModal";
import { LogFollowUpModal } from "./LogFollowUpModal";
import { OutcomeCaptureModal } from "./OutcomeCaptureModal";
import { RecordBidModal } from "./RecordBidModal";
import { ProjectPanel } from "./ProjectPanel";
import { QuickAddModal } from "./QuickAddModal";

/**
 * Every view can open the project panel, the log sheet, or quick add, so they
 * are mounted once at the frame rather than duplicated per page.
 */
export function GlobalOverlays() {
  return (
    <>
      <ProjectPanel />
      <LogFollowUpModal />
      <QuickAddModal />
      <EditProjectModal />
      <DataSettingsModal />
      <OutcomeCaptureModal />
      <RecordBidModal />
    </>
  );
}
