import { redirect } from "next/navigation";

import { LoginForm } from "@/components/shell/LoginForm";
import { isAuthed, usingDefaultPasscode } from "@/lib/bcc/auth";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  if (isAuthed()) redirect("/");
  return <LoginForm showDefaultHint={usingDefaultPasscode()} />;
}
