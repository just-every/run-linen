import { useState, type FormEvent } from "react";
import { date, text, type RecordValue } from "./api";
import { ActionForm } from "./forms";
import { useMutation, useRemote, useSession } from "./state";
import { Badge, Empty, ErrorNotice, Hero, Loading, Notice } from "./primitives";

interface Visit { id: string; work_id: string; site: string; state: string; person: string; taken_by: string | null; outcome: string | null; created_at: string; finished_at: string | null }
const waited = (since: string) => { const minutes = Math.max(0, Math.round((Date.now() - Date.parse(since)) / 60000)); return minutes < 1 ? "just now" : `${minutes} min`; };

/** CHANNEL-007: the office IT bar. Staff check people in by name or badge, serve them in order and record how each visit ended. */
export function WalkUpSpace() {
  const { session } = useSession(), owner = session.principal.roles.includes("owner");
  const queue = useRemote<{ items: Visit[] }>("/walkups", 15000), mutation = useMutation(), [resolving, setResolving] = useState<string | null>(null);
  async function run(path: string, body: RecordValue) {
    if (await mutation.mutate(path, body)) { setResolving(null); queue.refresh(); }
  }
  async function finish(event: FormEvent<HTMLFormElement>, visit: Visit) {
    event.preventDefault();
    await run(`/walkups/${visit.id}/finish`, { outcome: String(new FormData(event.currentTarget).get("outcome")) });
  }
  const active = (queue.data?.items ?? []).filter((v) => ["waiting", "serving"].includes(v.state)), recent = (queue.data?.items ?? []).filter((v) => !["waiting", "serving"].includes(v.state));
  return <>
    <Hero eyebrow="IT team" title="Walk-up desk"><p className="lead">People who come to the IT bar, in the order they arrived. Each visit is a request that closes when you record how it ended.</p></Hero>
    <ActionForm title="Check someone in" path="/walkups" open submit="Check in" defaults={{ idempotencyKey: "" }} onSaved={queue.refresh}
      fields={[{ name: "site", label: "Desk", required: true, value: "IT bar" }, { name: "name", label: "Name", hint: "Their full name, exactly as in the directory." }, { name: "badge", label: "Or badge number", hint: "Used instead of the name when it is filled in." }]} />
    <ErrorNotice error={queue.error} retry={queue.refresh} />
    <ErrorNotice error={mutation.error} />
    <section aria-label="Walk-up queue">
      <h2>In the queue</h2>
      {queue.loading && !queue.data ? <Loading /> : !active.length ? <Empty title="Nobody is waiting.">Check someone in when they arrive.</Empty> : (
        <ul className="plain-list">{active.map((v) => (
          <li key={v.id}>
            <p><strong>{v.person}</strong> · {v.site} · <Badge value={v.state} /> · {v.state === "waiting" ? `waiting ${waited(v.created_at)}` : `with ${text(v.taken_by, "an agent")}`} · <a href={`#/work/${encodeURIComponent(v.work_id)}`}>Open request</a></p>
            {v.state === "waiting" && <div className="button-row"><button className="action primary" disabled={mutation.pending} onClick={() => run(`/walkups/${v.id}/start`, {})}>Start visit</button>
              <button className="text-button" disabled={mutation.pending} onClick={() => run(`/walkups/${v.id}/finish`, { left: true, outcome: "Left before being served" })}>Left without being served</button></div>}
            {v.state === "serving" && (resolving === v.id ? (
              <form className="inline-form" onSubmit={(e) => finish(e, v)}>
                <label>How did the visit end?<textarea name="outcome" rows={2} required maxLength={2000} /></label>
                <div className="button-row"><button className="action primary" disabled={mutation.pending}>Resolve visit</button><button type="button" className="text-button" onClick={() => setResolving(null)}>Cancel</button></div>
              </form>
            ) : <div className="button-row"><button className="action secondary" onClick={() => setResolving(v.id)}>Resolve visit</button></div>)}
          </li>))}
        </ul>)}
    </section>
    {recent.length > 0 && <section aria-label="Recent visits"><h2>Finished in the last day</h2>
      <ul className="plain-list">{recent.map((v) => <li key={v.id}>{v.person} · <Badge value={v.state} /> · {text(v.outcome)} · <time dateTime={text(v.finished_at)}>{date(v.finished_at)}</time></li>)}</ul></section>}
    {owner && <ContactPoints />}
  </>;
}

/** Owner mapping of badge numbers and phone numbers to members, and the calls from numbers nobody has claimed. */
function ContactPoints() {
  const points = useRemote<{ items: { kind: string; value: string; user_id: string; name: string }[] }>("/contact-points"), held = useRemote<{ items: { connection_id: string; call_id: string; caller: string; created_at: string }[] }>("/calls/held", 15000);
  const members = useRemote<RecordValue[]>("/members"), mutation = useMutation();
  async function dismiss(connectionId: string, callId: string) { if (await mutation.mutate(`/calls/${encodeURIComponent(connectionId)}/${encodeURIComponent(callId)}/dismiss`, {})) held.refresh(); }
  return <section aria-label="Badges and phone numbers">
    <h2>Badges and phone numbers</h2>
    <Notice>A badge or number is trusted only after you map it to one active colleague. A call from an unmapped number is held here without a ticket or transcript.</Notice>
    <ActionForm title="Map a badge or phone number" path="/contact-points" submit="Map" onSaved={() => { points.refresh(); }}
      fields={[{ name: "kind", label: "Kind", type: "select", required: true, options: [{ value: "badge", label: "Badge number" }, { value: "phone", label: "Phone number" }] }, { name: "value", label: "Badge or number", required: true },
        { name: "userId", label: "Colleague", type: "select", required: true, options: (members.data ?? []).filter((m) => m.active).map((m) => ({ value: text(m.id), label: text(m.name) })) }]} />
    <ul className="plain-list" aria-label="Mapped badges and numbers">{(points.data?.items ?? []).map((p) => <li key={p.kind + p.value}>{p.kind === "badge" ? "Badge" : "Phone"} {p.value} → {p.name}</li>)}</ul>
    <ErrorNotice error={mutation.error} />
    <h3>Calls from unmapped numbers</h3>
    {!held.data?.items.length ? <p className="fact-note">None held.</p> : <ul className="plain-list" aria-label="Held calls">{held.data.items.map((c) => (
      <li key={c.call_id}>{c.caller} · <time dateTime={c.created_at}>{date(c.created_at)}</time> <button className="text-button" onClick={() => dismiss(c.connection_id, c.call_id)}>Dismiss and forget number</button></li>))}</ul>}
  </section>;
}
