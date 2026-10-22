import { useState, type FormEvent } from "react";
import { useMutation, useRemote, useSession } from "./state";
import { ErrorNotice } from "./primitives";
import type { WorkRecord } from "./work";

export interface AgentGroup { id: string; name: string; departmentId?:string|null; members: { userId: string; name: string; lead: boolean }[] }

/** DESK-001: the workspace's agent groups, read by agents only. */
export function useGroups() {
  const { session } = useSession(),
    agent = session.principal.roles.some((r) => ["owner", "operator", "hr"].includes(r));
  return useRemote<{ items: AgentGroup[] }>(agent ? "/work-groups" : null);
}

/** DESK-001: the ticket's one accountable group and its owner, who must be an agent in that group. */
export function WorkGroup({ work, onChanged }: { work: WorkRecord; onChanged: () => void }) {
  const groups = useGroups(),
    mutation = useMutation(),
    [groupId, setGroupId] = useState(work.group_id ?? ""),
    [assigneeId, setAssigneeId] = useState(work.assignee_id ?? ""),
    items = (groups.data?.items ?? []).filter(g=>(g.departmentId??null)===(work.department_id??null)),
    chosen = items.find((g) => g.id === groupId),
    current = items.find((g) => g.id === work.group_id);
  if (!items.length) return null;
  async function save(e: FormEvent) {
    e.preventDefault();
    const owner = chosen?.members.some((m) => m.userId === assigneeId) ? assigneeId : null;
    if (await mutation.mutate(`/work/${encodeURIComponent(work.id)}/group`, { groupId, assigneeId: owner, revision: work.revision })) onChanged();
  }
  return (
    <section className="work-controls" aria-label="Group and owner">
      <h3>Group and owner</h3>
      <p>{current ? <>Accountable group: <strong>{current.name}</strong></> : "No accountable group yet."}</p>
      <form className="inline-form" onSubmit={save}>
        <label>
          Accountable group
          <select aria-label="Accountable group" value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
            <option value="">Choose…</option>
            {items.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label>
          Owner (an agent in the group)
          <select aria-label="Owner (an agent in the group)" value={chosen?.members.some((m) => m.userId === assigneeId) ? assigneeId : ""} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Unassigned</option>
            {(chosen?.members ?? []).map((m) => <option key={m.userId} value={m.userId}>{m.name}{m.lead ? " · lead" : ""}</option>)}
          </select>
        </label>
        <ErrorNotice error={mutation.error} />
        <button className="action secondary small" disabled={mutation.pending || !groupId}>Save group and owner</button>
      </form>
    </section>
  );
}
