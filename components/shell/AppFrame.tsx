"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { DataProvider } from "@/components/providers/DataProvider";
import { GlobalOverlays } from "@/components/bcc/GlobalOverlays";
import { Toaster } from "@/components/ui/Toaster";

import { AppShell } from "./AppShell";
import { CommandBar } from "./CommandBar";

export function AppFrame({ children }: { children: ReactNode }) {
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <DataProvider>
      <AppShell onOpenCommandBar={() => setCommandOpen(true)}>{children}</AppShell>
      <CommandBar open={commandOpen} onClose={() => setCommandOpen(false)} />
      <GlobalOverlays />
      <Toaster />
    </DataProvider>
  );
}
