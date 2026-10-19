import { useState, type FormEvent } from "react";
import { useRemote, useMutation } from "./state";
import { request, text, type RecordValue } from "./api";
import { Fields, readFields, type Field } from "./forms";
import { ErrorNotice, Notice } from "./primitives";
import type { DomainRecord } from "./decisions";

/** Pins are authored once with the draft. Display/approval never refreshes them. */
export function NewChange({ onSaved }: { onSaved: (r: RecordValue) => void }) {
  const connections = useRemote<RecordValue[]>("/connections"), services = useRemote<{ items: DomainRecord[] }>("/services");
  const mutation = useMutation(), [error, setError] = useState<unknown>(null), [connectionId, setConnectionId] = useState("");
  const deployment = connections.data?.filter(c => c.status === "active" && c.provider === "controlled-deployment") ?? [];
  const verifiers = connections.data?.filter(c => c.status === "active" && c.provider === "workflow-probe") ?? [];
  const selected = deployment.find(c => c.id === connectionId);
  const targets: string[] = selected ? JSON.parse(String(selected.config_json)).targets ?? [] : [];
  const fields: Field[] = [
    { name: "emergency", label: "Emergency change", type: "checkbox", hint: "A current owner must record the reason to schedule inside a freeze. Execution still requires its own grants." },
    { name: "emergencyReason", label: "Emergency reason", type: "textarea" },
    { name: "title", label: "Intended change", required: true },
    { name: "service", label: "Affected service", type: "select", required: true, options: services.data?.items.map(s => ({ value: s.id, label: text(s.data.name) })) },
    { name: "risk", label: "Risk and uncertainty", type: "textarea", required: true },
    { name: "impact", label: "Impact on the business", type: "textarea", required: true },
    { name: "windowStart", label: "Window starts", type: "datetime-local", required: true },
    { name: "windowEnd", label: "Window ends", type: "datetime-local", required: true },
    { name: "cohorts", label: "Affected cohorts", type: "list", required: true },
    { name: "canaryCohorts", label: "Canary cohorts", type: "list", required: true },
    { name: "beneficiary", label: "Service beneficiary scope", required: true, hint: "The exact business scope already used by the service grant, such as a named team." },
    { name: "release", label: "Release to deploy", required: true },
    { name: "compensationRelease", label: "Release to restore if compensation is needed", required: true },
  ];
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null);
    try {
      const f = new FormData(e.currentTarget), v = readFields(e.currentTarget, fields);
      const verifier = verifiers.find(c => c.id === f.get("verifier"));
      if (!selected || !verifier || !targets.includes(String(f.get("target")))) throw Error("Choose active deployment and verifier connections and a permitted target.");
      const fresh = await request<RecordValue[]>("/connections");
      for (const connection of [selected, verifier]) if (!fresh.some(c => c.id === connection.id && c.revision === connection.revision && c.status === "active")) throw Error("A connection changed. Reload and review the draft before saving.");
      const implementation = { connectionId: selected.id, connectionRevision: selected.revision, verifierConnectionId: verifier.id,
        verifierConnectionRevision: verifier.revision, target: f.get("target"), beneficiaryId: v.beneficiary, payload: { release: v.release } };
      const result = await mutation.mutate<RecordValue>("/changes", {
        title: v.title, emergency: v.emergency, emergencyReason: v.emergencyReason, risk: v.risk, impact: v.impact, services: [v.service], cohorts: v.cohorts, canaryCohorts: v.canaryCohorts,
        window: { start: v.windowStart, end: v.windowEnd }, dependencies: [], participants: [], visibility: "operators",
        implementation, compensation: { ...implementation, payload: { release: v.compensationRelease } },
      });
      if (result) onSaved(result);
    } catch (e) { setError(e); }
  }
  return <details className="action-disclosure"><summary>Add change</summary><form className="inline-form" onSubmit={save}>
    <Fields fields={fields} />
    <label>Deployment connection<select required value={connectionId} onChange={e => setConnectionId(e.target.value)}><option value="">Choose a checked connection…</option>{deployment.map(c => <option key={text(c.id)} value={text(c.id)}>{text(c.name)}</option>)}</select></label>
    <label>Deployment target<select name="target" key={connectionId} required><option value="">Choose a permitted target…</option>{targets.map(t => <option key={t}>{t}</option>)}</select></label>
    <label>Workflow verifier<select name="verifier" required><option value="">Choose a checked independent verifier…</option>{verifiers.map(c => <option key={text(c.id)} value={text(c.id)}>{text(c.name)}</option>)}</select></label>
    <Notice>Saving pins these current connection versions in the implementation and compensation draft. Later connection changes require a new implementation review; approval never silently updates a pin.</Notice>
    <ErrorNotice error={error ?? mutation.error ?? connections.error ?? services.error} />
    <button className="action primary" disabled={mutation.pending}>Save change draft</button>
  </form></details>;
}
