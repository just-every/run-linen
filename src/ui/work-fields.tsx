import { useState, type FormEvent } from "react";
import { date } from "./api";
import { useMutation, useRemote } from "./state";
import { ErrorNotice, Facts } from "./primitives";

interface DeskField { id: string; name: string; type: "text" | "dropdown"; options: string[]; requiredOn: string[]; value: string | null }
interface WorkDesk {
  fields: DeskField[];
  status: null | { name: string; waitingOn: string | null };
  resolution: null | { code: string | null; closeNotes: string; resolvedAt: string; resolvedBy: string | null };
}
export interface DeskSettings {
  fields: DeskField[];
  statuses: { id: string; name: string; waitingOn: string | null }[];
  resolutionCodes: { codes: string[]; system: string[]; revision: number };
}

/** DESK-010: the ticket's fields for its type, its named status and, once closed, its resolution code and close notes. */
export function WorkFields({ workId, canEdit, version }: { workId: string; canEdit: boolean; version: string }) {
  const remote = useRemote<WorkDesk>(`/work/${encodeURIComponent(workId)}/desk?v=${encodeURIComponent(version)}`), data = remote.data;
  if (remote.error) return <ErrorNotice error={remote.error} retry={remote.refresh} />;
  if (!data || (!data.fields.length && !data.status && !data.resolution)) return null;
  return <section className="work-controls" aria-label="Ticket fields">
    <h3>Ticket fields</h3>
    {data.status && <p>Status: <strong>{data.status.name}</strong>{data.status.waitingOn ? ` · waiting on the ${data.status.waitingOn}` : ""}</p>}
    {data.resolution && <Facts entries={[
      ["Resolution code", data.resolution.code ?? "None recorded"],
      ["Close notes", data.resolution.closeNotes],
      ["Resolved", `${date(data.resolution.resolvedAt)}${data.resolution.resolvedBy ? ` by ${data.resolution.resolvedBy}` : ""}`],
    ]} />}
    {data.fields.map((f) => canEdit
      ? <FieldForm key={`${f.id}:${f.value ?? ""}`} workId={workId} field={f} onSaved={remote.refresh} />
      : <Facts key={f.id} entries={[[f.name, f.value ?? "Not set"]]} />)}
  </section>;
}

function FieldForm({ workId, field, onSaved }: { workId: string; field: DeskField; onSaved: () => void }) {
  const [value, setValue] = useState(field.value ?? ""), mutation = useMutation(), name = `${field.name}${field.requiredOn.includes("closed") ? " (required to resolve)" : ""}`;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (await mutation.mutate(`/work/${encodeURIComponent(workId)}/fields`, { fieldId: field.id, value })) onSaved();
  }
  return <form className="inline-form" onSubmit={save}>
    <label>
      {name}
      {field.type === "dropdown"
        ? <select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Not set</option>
          {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        : <input value={value} maxLength={2000} onChange={(e) => setValue(e.target.value)} />}
    </label>
    <ErrorNotice error={mutation.error} />
    <button className="action secondary small" disabled={mutation.pending || value === (field.value ?? "")}>Save {field.name}</button>
  </form>;
}
