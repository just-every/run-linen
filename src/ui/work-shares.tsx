import { date, text, type RecordValue } from "./api";
import { useMutation, useRemote } from "./state";
import { ActionForm } from "./forms";
import { ErrorNotice, Notice } from "./primitives";

type Share = { user_id: string; name: string | null; shared_at: string; revoked_at: string | null };

/** CHANNEL-009: the requester or the person it is for shares the public thread with named colleagues and revokes. */
/** ct ruling, 20 October: requesters and beneficiaries are told who else reads their requests. */
export const managerDisclosure = "Your direct and indirect managers can read the public messages of your requests. They never see private service notes, HR requests or restricted requests.";

export function WorkShares({ workId, canShare, canRevoke }: { workId: string; canShare: boolean; canRevoke: boolean }) {
  const shares = useRemote<{ items: Share[] }>(`/work/${encodeURIComponent(workId)}/shares`), revoke = useMutation();
  const current = shares.data?.items.filter((s) => !s.revoked_at) ?? [], revoked = shares.data?.items.filter((s) => s.revoked_at) ?? [];
  return <section className="connection-record" aria-label="Shared with">
    <div className="section-heading"><h3>Shared with</h3></div>
    <p>Colleagues you share with read and reply to the public messages here. They never see private service notes or attachments.</p>
    {canShare && <p className="meta-sub">{managerDisclosure}</p>}
    <ErrorNotice error={shares.error ?? revoke.error} />
    {current.length ? <ul>{current.map((s) => <li key={s.user_id}>{s.name ?? s.user_id} since {date(s.shared_at)}
      {canRevoke && <> <button className="action secondary small" disabled={revoke.pending}
        onClick={async () => { if (await revoke.mutate(`/work/${encodeURIComponent(workId)}/shares/${encodeURIComponent(s.user_id)}/revoke`, {})) shares.refresh(); }}>
        Stop sharing with {s.name ?? s.user_id}</button></>}</li>)}</ul>
      : <Notice>Not shared with anyone.</Notice>}
    {revoked.length > 0 && <details className="evidence"><summary>Earlier shares ({revoked.length})</summary>
      <ul>{revoked.map((s) => <li key={`${s.user_id}:${s.revoked_at}`}>{s.name ?? s.user_id}: shared {date(s.shared_at)}, stopped {date(s.revoked_at)}</li>)}</ul></details>}
    {canShare && <ActionForm title="Share this request" path={`/work/${encodeURIComponent(workId)}/shares`} submit="Share" onSaved={shares.refresh}
      fields={[{ name: "email", label: "Colleague's work email", type: "email", required: true }]} />}
  </section>;
}

/** CHANNEL-009: requests for the reader's direct and indirect reports, by their current manager on record. */
export function TeamRequests() {
  const team = useRemote<{ items: RecordValue[] }>("/team-requests");
  if (!team.data?.items.length) return null;
  return <section className="connection-record" aria-label="My team's requests">
    <div className="section-heading"><h2>My team's requests</h2></div>
    <p>Requests for people who report to you, directly or through their manager. HR and restricted requests are not shown, and private service notes never are.</p>
    <ul>{team.data.items.map((w) => <li key={text(w.id)}><a href={`#/work/${text(w.id)}`}>{text(w.title)}</a> for {text(w.beneficiary_name ?? w.beneficiary_id)} · {text(w.state)}</li>)}</ul>
  </section>;
}
