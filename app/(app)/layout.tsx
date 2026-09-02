import { redirect } from "next/navigation";

import { AppFrame } from "@/components/shell/AppFrame";
import { isAuthed } from "@/lib/bcc/auth";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isAuthed()) redirect("/login");
  return <AppFrame>{children}</AppFrame>;
}
