import { useRef, useState, type FormEvent } from "react";
import { useMutation, useRemote } from "./state";
import { ErrorNotice, Notice } from "./primitives";
import { useTriage } from "./work-triage";
import type { WorkRecord } from "./work";
import { useGroups } from "./work-groups";

export interface Scenario { id: string; name: string; scope: "author" | "group" | "workspace" }
interface ScenarioRun { name: string; errorCode?: string; changes: { step: string; field: string; before: unknown; after: unknown }[] }
const shown = (value: unknown) => (value === null || value === undefined || value === "" ? "none" : String(value));

/** DESK-015: the scenarios offered to this agent (their own, their groups' and the workspace's). */
export function useScenarios(enabled = true) {
  return useRemote<{ items: Scenario[] }>(enabled ? "/work-scenarios" : null);
}

/** DESK-015: run one offered scenario on the open ticket; x focuses the picker during keyboard triage. */
export function WorkScenarios({ work, onChanged }: { work: WorkRecord; onChanged: () => void }) {
  const scenarios = useScenarios(),
    mutation = useMutation(),
    picker = useRef<HTMLSelectElement>(null),
    [scenarioId, setScenarioId] = useState(""),
    // The latest run on this ticket, read back from its audit after each change.
    runs = useRemote<{ items: ScenarioRun[] }>(`/work/${encodeURIComponent(work.id)}/scenario-runs?revision=${work.revision}`),
    run = runs.data?.items.at(-1),
    groups = useGroups().data?.items ?? [],
    named = (field: string, value: unknown) => (field === "group" ? groups.find((g) => g.id === value)?.name ?? value : value),
    items = scenarios.data?.items ?? [],
    planId = run?.changes.find(c => c.field === 'task plan')?.after,
    plan = useRemote<{ project: { name: string } }>(typeof planId === 'string' ? `/projects/${encodeURIComponent(planId)}` : null);
  useTriage(work.id, (action) => { if (action === "scenario") picker.current?.focus(); });
  if (!items.length) return null;
  async function apply(e: FormEvent) {
    e.preventDefault();
    if (await mutation.mutate(`/work/${encodeURIComponent(work.id)}/scenario-runs`, { scenarioId, revision: work.revision })) { setScenarioId(""); onChanged(); }
  }
  return (
    <section className="work-controls" aria-label="Scenarios">
      <h3>Scenarios</h3>
      <form className="inline-form" onSubmit={apply}>
        <label>
          Scenario
          <select ref={picker} value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} required>
            <option value="">Choose…</option>
            {items.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <ErrorNotice error={mutation.error} />
        <button className="action secondary small" disabled={mutation.pending || !scenarioId}>Run scenario</button>
      </form>
      {run && (
        <Notice>
          Last run: {run.name}{run.errorCode && ' · stopped; the changes below were applied'}
          <ul aria-label="Scenario changes">
            {run.changes.map((c, i) => <li key={i}>{c.field}: {shown(named(c.field, c.before))} → {c.field === 'task plan' && typeof c.after === 'string' ? <a href={`#/projects/${encodeURIComponent(c.after)}`}>{plan.data?.project.name ?? 'Open task plan'}</a> : shown(named(c.field, c.after))}</li>)}
          </ul>
        </Notice>
      )}
    </section>
  );
}
