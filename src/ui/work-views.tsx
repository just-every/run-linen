import { useState, type FormEvent } from "react";
import { useMutation, useRemote } from "./state";
import { ErrorNotice } from "./primitives";
import type { AgentGroup } from "./work-groups";

export interface SavedView { id: string; name: string; shared: boolean; mine: boolean; sort: string; filters: Record<string, string> }

/** DESK-001: the agent's own saved views and the views other agents share. */
export function useViews(agent: boolean) {
  return useRemote<{ items: SavedView[] }>(agent ? "/work-views" : null);
}

const pick = (label: string, name: string, options: [string, string][]) => (
  <label>
    {label}
    <select name={name} defaultValue="">
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  </label>
);

/** DESK-001: save the filters and sort of a queue view under a name, for oneself or shared with every agent. */
export function SaveView({ groups, onSaved }: { groups: AgentGroup[]; onSaved: (view: SavedView) => void }) {
  const mutation = useMutation(), [open, setOpen] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget, v = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const filters = Object.fromEntries(["state", "assignee", "priority", "kind", "groupId"].filter((k) => v[k]).map((k) => [k, v[k]]));
    const saved = await mutation.mutate<SavedView>("/work-views", { name: v.name, filters, sort: v.sort || "updated", shared: v.shared === "on" });
    if (saved) {
      form.reset();
      setOpen(false);
      onSaved(saved);
    }
  }
  return (
    <details className="queue-save-view" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Save a view</summary>
      <form className="inline-form" onSubmit={save} aria-label="Save a view">
        <label>
          View name
          <input name="name" required maxLength={120} />
        </label>
        {pick("View status", "state", [["", "Any status"], ["open", "Open"], ["closed", "Closed or cancelled"]])}
        {pick("View owner", "assignee", [["", "Anyone or nobody"], ["none", "Unassigned"], ["me", "Assigned to me"]])}
        {pick("View priority", "priority", [["", "Any priority"], ["P1", "P1"], ["P2", "P2"], ["P3", "P3"], ["P4", "P4"]])}
        {pick("View type", "kind", [["", "Any type"], ["incident", "Incident"], ["service_request", "Service request"], ["question", "Question"], ["request", "Request"]])}
        {pick("View group", "groupId", [["", "Any group"], ...groups.map((g): [string, string] => [g.id, g.name])])}
        {pick("View sort", "sort", [["", "Recently updated"], ["oldest", "Oldest first"], ["created", "Newest first"], ["priority", "Priority"]])}
        <label className="check-row">
          <input type="checkbox" name="shared" />
          Share with every agent in this workspace
        </label>
        <ErrorNotice error={mutation.error} />
        <button className="action secondary small" disabled={mutation.pending}>Save view</button>
      </form>
    </details>
  );
}
