import { useEffect, useState } from "react";
import { date, text } from "./api";
import { useMutation, useRemote, useSession } from "./state";
import { ErrorNotice } from "./primitives";

interface Current { configured: boolean; handoff: { id: string; state: string; agent: string | null; expected_at: string | null } | null }
/** The requester's "Ask for a person": an available agent may join this same conversation; otherwise it stays a request with a stated reply time. */
export function AskForPerson({ workId, onChanged }: { workId: string; onChanged: () => void }) {
  const current = useRemote<Current>(`/work/${workId}/handoff`, 8000), mutation = useMutation();
  const state = current.data?.handoff?.state;
  if (!current.data?.configured) return null;
  async function ask() { if (await mutation.mutate(`/work/${workId}/handoff`, {})) { current.refresh(); onChanged(); } }
  async function end() { if (await mutation.mutate(`/handoffs/${current.data!.handoff!.id}/end`, {})) { current.refresh(); onChanged(); } }
  return (
    <section className="panel" aria-label="Talk to a person">
      <ErrorNotice error={mutation.error} />
      {state === "requested" && <p role="status">Asking an agent to join this conversation…</p>}
      {state === "live" && <><p role="status">{text(current.data.handoff!.agent, "An agent")} is in this conversation.</p><div className="button-row"><button className="text-button" onClick={end}>End live chat</button></div></>}
      {state === "ticketed" && <p role="status">No agent could join. This conversation stays open as your request{current.data.handoff!.expected_at ? `; expect a reply by ${date(current.data.handoff!.expected_at)}` : ""}.</p>}
      {(!state || state === "ended" || state === "ticketed") && <div className="button-row"><button className="action secondary" disabled={mutation.pending} onClick={ask}>Ask for a person</button></div>}
    </section>
  );
}
/** The agents' side: availability for live chats, and the requests waiting for someone to accept. */
export function HandoffDesk() {
  const { session } = useSession(), staff = session.principal.roles.some((r) => ["owner", "operator"].includes(r));
  const presence = useRemote<{ available: boolean }>(staff ? "/agents/presence" : null), queue = useRemote<{ items: { id: string; work_id: string; state: string; requester: string; title: string }[] }>(staff ? "/handoffs" : null, 5000), mutation = useMutation();
  const [available, setAvailable] = useState(false);
  useEffect(() => { if (presence.data) setAvailable(presence.data.available); }, [presence.data]);
  // Presence expires after five minutes without a signal, so an open page keeps it fresh.
  useEffect(() => {
    if (!available) return;
    const timer = setInterval(() => { void mutation.mutate("/agents/presence", { available: true }); }, 120000);
    return () => clearInterval(timer);
  }, [available]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!staff) return null;
  async function toggle(next: boolean) { setAvailable(next); if (!await mutation.mutate("/agents/presence", { available: next })) setAvailable(!next); }
  async function accept(id: string, workId: string) { if (await mutation.mutate(`/handoffs/${id}/accept`, {})) { queue.refresh(); window.location.hash = `#/work/${encodeURIComponent(workId)}`; } }
  return (
    <section className="panel" aria-label="Live chat requests">
      <label className="checkbox-field"><input type="checkbox" checked={available} onChange={(e) => toggle(e.target.checked)} /> <span>I am available for live chats</span></label>
      <ErrorNotice error={mutation.error} />
      {queue.data?.items.map((h) => (
        <p key={h.id}>{h.requester} asked for a person: {h.title}. {h.state === "requested"
          ? <button className="action primary" disabled={mutation.pending} onClick={() => accept(h.id, h.work_id)}>Accept and join</button>
          : <a href={`#/work/${encodeURIComponent(h.work_id)}`}>Open the chat you hold</a>}</p>
      ))}
    </section>
  );
}
