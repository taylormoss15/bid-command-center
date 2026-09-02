"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { IconArrowRight } from "@/components/ui/Icons";

export function LoginForm({ showDefaultHint }: { showDefaultHint: boolean }) {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/bcc/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Incorrect passcode");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-5">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-ink text-[13px] font-black tracking-tight text-volt">
            ER
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
              Bid Command Center
            </p>
            <p className="text-[12px] text-ink-muted">Elite Roofing</p>
          </div>
        </div>

        <form onSubmit={submit} className="card p-5">
          <label htmlFor="passcode" className="label">
            Passcode
          </label>
          <input
            id="passcode"
            type="password"
            autoFocus
            autoComplete="current-password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            className="field"
            placeholder="••••••••"
          />
          {error ? (
            <p role="alert" className="mt-2 text-[12px] text-danger">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy || passcode.length === 0}
            className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-ink text-[13px] font-medium text-white transition hover:bg-ink/90 active:scale-[0.99] disabled:opacity-40"
          >
            {busy ? "Checking…" : "Enter"}
            {busy ? null : <IconArrowRight size={14} className="text-volt" />}
          </button>

          {showDefaultHint ? (
            <p className="mt-4 rounded-lg border border-warn/20 bg-warn-tint px-3 py-2 text-[11.5px] leading-relaxed text-warn-ink">
              No <code className="font-mono">BCC_PASSCODE</code> is set, so the built-in
              default <code className="font-mono">elite</code> is active. Set the
              environment variable before putting real pipeline data behind this.
            </p>
          ) : null}
        </form>

        <p className="mt-4 text-center text-[11.5px] text-ink-faint">
          Pipeline, follow-ups, and install forecast — one screen.
        </p>
      </div>
    </div>
  );
}
