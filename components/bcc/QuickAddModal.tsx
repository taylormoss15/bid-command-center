"use client";

import { useEffect, useMemo, useState } from "react";

import { useData } from "@/components/providers/DataProvider";
import { Field, Input, MoneyInput, MultiSelect, Select, Textarea } from "@/components/ui/Field";
import { Modal } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/primitives";
import { STAGES } from "@/lib/bcc/stages";
import { ESTIMATORS, MATERIALS } from "@/lib/bcc/taxonomy";
import type { StageId } from "@/lib/bcc/types";

/**
 * Eight fields, under a minute. Everything else on a project can wait until
 * there is a reason to know it.
 */
export function QuickAddModal() {
  const { db, quickAddOpen, setQuickAddOpen, createProject, toast, openProject } = useData();

  const [name, setName] = useState("");
  const [gc, setGc] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("UT");
  const [description, setDescription] = useState("");
  const [bidDue, setBidDue] = useState("");
  const [bidTime, setBidTime] = useState("14:00");
  const [value, setValue] = useState<number | null>(null);
  const [materials, setMaterials] = useState<string[]>([]);
  const [stage, setStage] = useState<StageId>("invited");
  const [estimator, setEstimator] = useState(ESTIMATORS[0]);
  const [trello, setTrello] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!quickAddOpen) return;
    setName("");
    setGc("");
    setCity("");
    setState("UT");
    setDescription("");
    setBidDue("");
    setBidTime("14:00");
    setValue(null);
    setMaterials([]);
    setStage("invited");
    setEstimator(ESTIMATORS[0]);
    setTrello("");
  }, [quickAddOpen]);

  /** Recent GCs first — most new bids go to somebody already in the book. */
  const gcSuggestions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of db?.recipients ?? []) {
      counts.set(r.organizationId, (counts.get(r.organizationId) ?? 0) + 1);
    }
    return (db?.organizations ?? [])
      .filter((o) => o.type === "gc")
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0));
  }, [db?.organizations, db?.recipients]);

  if (!quickAddOpen) return null;

  const canSave = name.trim().length > 0;

  const save = async () => {
    setBusy(true);
    try {
      const match = gcSuggestions.find(
        (o) => o.name.toLowerCase() === gc.trim().toLowerCase(),
      );
      const id = await createProject(
        {
          name: name.trim(),
          description: description.trim(),
          city: city.trim(),
          state: state.trim().toUpperCase(),
          stage,
          expectedValue: value ?? 0,
          materials,
          estimator,
          trelloUrl: trello.trim() || null,
          bidDueDate: bidDue ? `${bidDue}T${bidTime}` : null,
          dateConfidence: bidDue ? "probable" : "unknown",
        },
        gc.trim()
          ? {
              organizationId: match?.id,
              organizationName: match ? undefined : gc.trim(),
              status: "Invitation received",
            }
          : undefined,
      );
      setQuickAddOpen(false);
      toast("Project added", {
        detail: id ? "Opened so the rest can be filled in now." : name.trim(),
      });
      // Land straight in the detail panel — the remaining fields are one click away.
      if (id) openProject(id);
    } catch {
      // handled upstream
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => setQuickAddOpen(false)}
      title="New project"
      description="Just enough to track it. The rest can wait."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={() => setQuickAddOpen(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!canSave || busy}>
            {busy ? "Adding…" : "Add project"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Project name" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Riverbend Logistics Center — Phase II"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="GC / client" hint="Add more bid recipients later from the project.">
            <Input
              list="gc-suggestions"
              value={gc}
              onChange={(e) => setGc(e.target.value)}
              placeholder="Okland Construction"
            />
            <datalist id="gc-suggestions">
              {gcSuggestions.map((o) => (
                <option key={o.id} value={o.name} />
              ))}
            </datalist>
          </Field>
          <Field label="Stage">
            <Select value={stage} onChange={(e) => setStage(e.target.value as StageId)}>
              {STAGES.filter((s) => s.tab === "bidding").map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_88px]">
          <Field label="City">
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lehi" />
          </Field>
          <Field label="State">
            <Input
              value={state}
              maxLength={2}
              onChange={(e) => setState(e.target.value.toUpperCase())}
            />
          </Field>
        </div>

        <Field label="Brief description">
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="New 412,000 SF distribution building. Mechanically attached TPO over tapered polyiso."
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-[1fr_100px_1fr]">
          <Field label="Bid due date">
            <Input type="date" value={bidDue} onChange={(e) => setBidDue(e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={bidTime} onChange={(e) => setBidTime(e.target.value)} />
          </Field>
          <Field label="Expected value" hint="Best estimate of likely contract value.">
            <MoneyInput value={value} onChange={setValue} />
          </Field>
        </div>

        <Field label="Materials">
          <MultiSelect
            options={MATERIALS.map((m) => ({ id: m.id, label: m.label }))}
            value={materials}
            onChange={setMaterials}
            placeholder="TPO, tapered insulation…"
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Estimator">
            <Select value={estimator} onChange={(e) => setEstimator(e.target.value)}>
              {ESTIMATORS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Trello link" hint="Optional — the detailed bid workspace.">
            <Input
              value={trello}
              onChange={(e) => setTrello(e.target.value)}
              placeholder="https://trello.com/c/…"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
