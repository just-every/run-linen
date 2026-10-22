import { useState, type FormEvent } from "react";
import { date } from "./api";
import { useMutation, useRemote } from "./state";
import { ErrorNotice, Facts } from "./primitives";

interface DeskField { id: string; name: string; type: "text" | "dropdown" | "multiselect" | "number" | "boolean" | "date"; options: string[]; requiredOn: string[]; value: string | string[] | number | boolean | null }
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
      : <Facts key={f.id} entries={[[f.name, display(f.value)]]} />)}
  </section>;
}

function FieldForm({ workId, field, onSaved }: { workId: string; field: DeskField; onSaved: () => void }) {
  const [value, setValue] = useState<string|string[]|number|boolean>(field.value ?? (field.type==='multiselect'?[]:"")), mutation = useMutation(), name = `${field.name}${field.requiredOn.includes("closed") ? " (required to resolve)" : ""}`;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (await mutation.mutate(`/work/${encodeURIComponent(workId)}/fields`, { fieldId: field.id, value:field.type==='number'&&value!==''?Number(value):value })) onSaved();
  }
  return <form className="inline-form" aria-label={`Edit ${field.name}`} onSubmit={save}>
    <label>
      {name}
      {["dropdown","boolean"].includes(field.type)
        ? <select aria-label={name} value={String(value)} onChange={(e) => setValue(field.type==='boolean'&&e.target.value!==''?e.target.value==='true':e.target.value)}>
          <option value="">Not set</option>
          {(field.type==='boolean'?['true','false']:field.options).map((o) => <option key={o} value={o}>{field.type==='boolean'?(o==='true'?'Yes':'No'):o}</option>)}
        </select>
        : field.type==='multiselect'?<select aria-label={name} multiple value={Array.isArray(value)?value:[]} onChange={e=>setValue([...e.target.selectedOptions].map(o=>o.value))}>{field.options.map(o=><option key={o} value={o}>{o}</option>)}</select>
        : <input aria-label={name} type={field.type==='number'?'number':field.type==='date'?'date':'text'} step={field.type==='number'?'any':undefined} value={String(value)} maxLength={2000} onChange={(e) => setValue(e.target.value)} />}
    </label>
    <ErrorNotice error={mutation.error} />
    <button className="action secondary small" disabled={mutation.pending || JSON.stringify(value) === JSON.stringify(field.value ?? (field.type==='multiselect'?[]:""))}>Save {field.name}</button>
  </form>;
}

function display(value:DeskField['value']):string{return value===null?'Not set':Array.isArray(value)?value.join(', '):typeof value==='boolean'?(value?'Yes':'No'):String(value);}
