import { humanize } from "./api";
import { ActionForm } from "./forms";
import { useRemote, useSession } from "./state";
import { ErrorNotice } from "./primitives";
import { shortRef } from "./work-queue";

interface Ref { id: string; title: string; state: string }
interface Relationships {
  mergedInto: Ref | null; splitFrom: Ref | null; parent: Ref | null;
  mergedDuplicates: Ref[]; splitInto: Ref[]; children: Ref[];
  participants: { user_id: string; name: string | null }[];
  links: { kind: string; target_id: string; label: string | null }[];
}
const ticket = (w: Ref) => <a key={w.id} href={`#/work/${encodeURIComponent(w.id)}`}>{shortRef(w.id)} · {w.title}</a>;
const recordHref: Record<string, string> = { asset: "#/assets/", problem: "#/problems/", change: "#/changes/", release: "#/releases/" };

/** DESK-006: merges, splits, parent/child and record links on a ticket, for agents and auditors. */
export function WorkRelationships({ workId, messages, onChanged }: { workId: string; messages: { id: string; body: string; visibility: string }[]; onChanged: () => void }) {
  const { session } = useSession(), agent = session.principal.roles.some((r) => ["owner", "operator"].includes(r));
  const remote = useRemote<Relationships>(`/work/${encodeURIComponent(workId)}/relationships`), data = remote.data;
  const changed = () => { remote.refresh(); onChanged(); };
  return <details className="evidence"><summary>Related tickets and records</summary>
    <ErrorNotice error={remote.error} retry={remote.refresh} />
    {data && <ul>
      {data.mergedInto && <li>Merged into {ticket(data.mergedInto)}</li>}
      {data.splitFrom && <li>Split from {ticket(data.splitFrom)}</li>}
      {data.parent && <li>Child of {ticket(data.parent)}</li>}
      {data.mergedDuplicates.map((w) => <li key={w.id}>Merged duplicate {ticket(w)}</li>)}
      {data.splitInto.map((w) => <li key={w.id}>Split into {ticket(w)}</li>)}
      {data.children.map((w) => <li key={w.id}>Parent of {ticket(w)}</li>)}
      {data.participants.map((p) => <li key={p.user_id}>{p.name ?? p.user_id} follows this ticket's public updates</li>)}
      {data.links.map((l) => <li key={l.kind + l.target_id}>{humanize(l.kind)}: {l.kind === "engineering_issue"
        ? <a href={l.target_id} rel="noreferrer" target="_blank">{l.target_id}</a> : <a href={recordHref[l.kind] + encodeURIComponent(l.target_id)}>{l.label ?? l.target_id}</a>}</li>)}
    </ul>}
    {agent && <>
      <ActionForm title="Merge this ticket into another" path={`/work/${workId}/merge`} onSaved={changed} submit="Merge duplicate"
        explanation="This ticket closes with a pointer. Its requester follows the surviving ticket's public messages; private notes stay private."
        fields={[{ name: "intoId", label: "Surviving ticket ID", required: true }, { name: "reason", label: "Why they are duplicates", type: "textarea", required: true }]} />
      <ActionForm title="Split messages into a new ticket" path={`/work/${workId}/split`} onSaved={changed} submit="Split"
        fields={[{ name: "title", label: "New ticket title", required: true },
          { name: "messageIds", label: "Messages to move", type: "checkboxes", required: true, options: messages.filter((m) => m.visibility === "public").map((m, i) => ({ value: m.id, label: `Message ${i + 1}: ${m.body.slice(0, 80)}` })) },
          { name: "reason", label: "Why this is a separate ask", type: "textarea", required: true }]} />
      <ActionForm title="Link a record" path={`/work/${workId}/links`} onSaved={changed} submit="Link"
        fields={[{ name: "kind", label: "Record type", type: "select", required: true, options: ["asset", "problem", "change", "release", "engineering_issue"].map((k) => ({ value: k, label: humanize(k) })) },
          { name: "targetId", label: "Record ID, or the engineering issue's https URL", required: true }]} />
      <ActionForm title="Set a parent ticket" path={`/work/${workId}/parent`} onSaved={changed} submit="Set parent"
        fields={[{ name: "parentId", label: "Parent ticket ID", required: true }]} />
    </>}
  </details>;
}

/** The tickets linked to an asset, problem or change that this reader can already see. */
export function LinkedTickets({ kind, targetId }: { kind: string; targetId: string }) {
  const remote = useRemote<{ items: Ref[] }>(`/work-links?kind=${kind}&targetId=${encodeURIComponent(targetId)}`);
  if (remote.error) return <ErrorNotice error={remote.error} retry={remote.refresh} />;
  if (!remote.data?.items.length) return null;
  return <section aria-label="Linked tickets"><h3>Linked tickets</h3><ul>{remote.data.items.map((w) => <li key={w.id}>{ticket(w)} · {humanize(w.state)}</li>)}</ul></section>;
}
