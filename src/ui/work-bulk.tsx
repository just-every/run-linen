import { useState, type FormEvent } from "react";
import { text, type RecordValue } from "./api";
import { useMutation, useRemote } from "./state";
import { ErrorNotice, Notice } from "./primitives";
import { shortRef } from "./work-queue";
import type { DeskSettings } from "./work-fields";
import type { WorkRecord } from "./work";

interface BulkResult { command: string; changed: number; refused: number; items: { workId: string; ok: boolean; error?: { message: string } }[] }

/** DESK-001: the bulk-update screen over the tickets the current view shows. One command goes through POST
 * /work/bulk-commands, which applies it to each chosen ticket under the same rules as one at a time. */
export function BulkUpdate({ items, onDone }: { items: WorkRecord[]; onDone: () => void }) {
  const [open, setOpen] = useState(false),
    [chosen, setChosen] = useState<string[]>([]),
    [command, setCommand] = useState("assign"),
    [result, setResult] = useState<BulkResult | null>(null),
    mutation = useMutation(),
    members = useRemote<RecordValue[]>(open ? "/members" : null),
    desk = useRemote<DeskSettings>(open && command === "close" ? "/desk-settings" : null),
    agents = (members.data ?? []).filter((m) => m.active && /"(owner|operator)"/.test(text(m.roles_json))),
    visible = chosen.filter((id) => items.some((item) => item.id === id));
  async function apply(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const done = await mutation.mutate<BulkResult>("/work/bulk-commands", {
      workIds: visible, command, reason: v.reason,
      ...(command === "assign" ? { assigneeId: v.assigneeId } : {}),
      ...(command === "close" && v.resolutionCode ? { resolutionCode: v.resolutionCode } : {}),
    });
    if (done) {
      setResult(done);
      setChosen([]);
      onDone();
    }
  }
  const title = (id: string) => items.find((item) => item.id === id)?.title ?? shortRef(id);
  return (
    <details className="queue-bulk" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Bulk update</summary>
      <form className="inline-form" onSubmit={apply} aria-label="Bulk update">
        <fieldset className="bulk-tickets">
          <legend>Tickets in this view ({visible.length} chosen)</legend>
          <label className="checkbox-field">
            <input type="checkbox" checked={items.length > 0 && visible.length === items.length}
              onChange={(e) => setChosen(e.target.checked ? items.map((item) => item.id) : [])} />
            <span>Choose every ticket shown</span>
          </label>
          {items.map((item) => (
            <label className="checkbox-field" key={item.id}>
              <input type="checkbox" checked={visible.includes(item.id)}
                onChange={(e) => setChosen((now) => e.target.checked ? [...now, item.id] : now.filter((id) => id !== item.id))} />
              <span>{shortRef(item.id)} · {item.title}</span>
            </label>
          ))}
        </fieldset>
        <label>
          Bulk change
          <select value={command} onChange={(e) => setCommand(e.target.value)}>
            <option value="assign">Assign to an agent</option>
            <option value="pause">Pause</option>
            <option value="resume">Resume</option>
            <option value="close">Close</option>
          </select>
        </label>
        {command === "assign" && (
          <label>
            Bulk assignee
            <select name="assigneeId" required defaultValue="">
              <option value="">Choose…</option>
              {agents.map((m) => <option key={text(m.id)} value={text(m.id)}>{text(m.name)}</option>)}
            </select>
          </label>
        )}
        {command === "close" && (
          <label>
            Bulk resolution code
            <select name="resolutionCode" defaultValue="">
              <option value="">Choose…</option>
              {(desk.data?.resolutionCodes.codes ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        )}
        <label>
          {command === "close" ? "Bulk close notes" : "Bulk update reason"}
          <textarea name="reason" required rows={2} maxLength={2000} />
        </label>
        <ErrorNotice error={mutation.error} />
        <button className="action secondary small" disabled={mutation.pending || !visible.length}>
          {mutation.pending ? "Applying…" : `Apply to ${visible.length} ticket${visible.length === 1 ? "" : "s"}`}
        </button>
      </form>
      {result && (
        <Notice tone={result.refused ? "error" : undefined}>
          {result.changed} changed, {result.refused} refused.
          {result.items.filter((i) => !i.ok).map((i) => <span key={i.workId}> {title(i.workId)}: {i.error?.message}</span>)}
        </Notice>
      )}
    </details>
  );
}
