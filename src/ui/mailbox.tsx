import { useEffect, useState, type FormEvent } from "react";
import { date, text, type RecordValue } from "./api";
import { useMutation, useRemote } from "./state";
import { Badge, Empty, ErrorNotice, Loading, Notice } from "./primitives";

interface MailStatus {
  mailboxes: { id: string; provider: string; name: string; status: string; mailbox: string; mode: string; polledAt: string | null; pollState: string | null; pollError: string | null;
    domainAuthentication: { spf: string; dkim: string; dmarc: string; aligned: boolean } | null }[];
  events: { id: string; connection_id: string; work_id: string | null; sender: string | null; subject: string | null; state: string; error: string | null; created_at: string }[];
  members: { id: string; name: string }[];
}
const stateLabel: Record<string, string> = { accepted: "Added to a request", quarantined: "Held for review", suppressed: "Ignored automatic mail" };
const reasonLabel: Record<string, string> = {
  "auto-submitted": "Automatic reply", precedence: "Bulk or list mail", "auto-subject": "Out-of-office or bounce subject", "auto-response-header": "Automatic reply",
  "mailing-list": "Mailing list", bounce: "Bounce", "own-mailbox": "From a connected support mailbox", "own-message": "Linen's own message", "loop-rate": "Too many messages from one sender",
};
const authLabel = (value: string) => (value === "pass" ? "pass" : value === "missing" ? "not found" : "unknown");

/** Owner view of the Gmail and Exchange Online support mailboxes, their recent mail and the senders waiting for a decision. */
export function MailboxPanel({ revision }: { revision: number }) {
  const remote = useRemote<MailStatus>("/mail/status", 15000), mutation = useMutation(), [mapping, setMapping] = useState<string | null>(null);
  useEffect(() => { if (revision) remote.refresh(); }, [revision]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(path: string, body: RecordValue) {
    if (await mutation.mutate(path, body)) { setMapping(null); remote.refresh(); }
  }
  async function map(event: FormEvent<HTMLFormElement>, row: MailStatus["events"][number]) {
    event.preventDefault();
    await run("/mail/senders", { connectionId: row.connection_id, email: row.sender, userId: String(new FormData(event.currentTarget).get("userId")) });
  }
  if (remote.loading) return <Loading label="Reading mailboxes…" />;
  if (remote.error) return <ErrorNotice error={remote.error} retry={remote.refresh} />;
  const data = remote.data;
  if (!data?.mailboxes.length) return null;
  return (
    <section className="history" aria-label="Support mailboxes">
      <div className="section-heading"><h2>Support mailboxes</h2></div>
      <p className="fact-note">Mail from a mapped colleague whose address passes DMARC becomes or extends a request. Anything else is held here, never trusted, and its content is not opened.</p>
      <ErrorNotice error={mutation.error} />
      {data.mailboxes.map((box) => (
        <article className="connection-record" key={box.id} aria-label={box.mailbox}>
          <div className="section-heading"><h3>{box.mailbox}</h3><Badge value={box.status} /></div>
          <p className="fact-note">
            {box.provider === "gmail" ? "Gmail" : "Exchange Online"} · {box.mode === "oauth" ? "Read by sign-in" : "Fed by a forwarding rule"} ·{" "}
            {box.mode === "oauth" ? (box.pollState === "failed" ? `Last check failed (${text(box.pollError).replaceAll("_", " ")})` : box.polledAt ? `Checked ${date(box.polledAt)}` : "Not checked yet") : "Arrives as it is forwarded"}
          </p>
          {box.domainAuthentication ? (
            <p>Sending domain: SPF {authLabel(box.domainAuthentication.spf)} · DKIM {authLabel(box.domainAuthentication.dkim)} · DMARC {authLabel(box.domainAuthentication.dmarc)}.{" "}
              {box.domainAuthentication.aligned ? "Linen replies from this mailbox." : "Linen will not send from this mailbox until all three are in place."}</p>
          ) : <p>Check the connection to read back its sending-domain authentication.</p>}
          {box.mode === "oauth" && box.status === "active" && (
            <div className="button-row"><button className="action secondary" disabled={mutation.pending} onClick={() => run("/mail/poll", { connectionId: box.id })}>Check mail now</button></div>
          )}
        </article>
      ))}
      <h3>Recent mail</h3>
      {data.events.length === 0 ? <Empty title="No mail yet.">Messages appear here as the mailboxes receive them.</Empty> : (
        <ul className="plain-list" aria-label="Recent mail">
          {data.events.map((row) => (
            <li key={row.id}>
              <p><strong>{text(row.sender, "Unreadable message")}</strong> · {text(row.subject, "(no subject)")} · <time dateTime={row.created_at}>{date(row.created_at)}</time></p>
              <p className="fact-note">
                {stateLabel[row.state] ?? row.state}
                {row.state === "suppressed" && row.error ? ` · ${reasonLabel[row.error] ?? row.error}` : ""}
                {row.state === "quarantined" ? ` · ${text(row.error)}` : ""}
                {row.work_id ? <> · <a href={`#/work/${encodeURIComponent(row.work_id)}`}>Open request</a></> : null}
              </p>
              {row.state === "quarantined" && row.sender && (mapping === row.id ? (
                <form className="inline-form" onSubmit={(event) => map(event, row)}>
                  <label>Colleague this address belongs to
                    <select name="userId" required defaultValue=""><option value="">Choose…</option>{data.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                  </label>
                  <Notice>Mapping trusts this address for this mailbox from its next authenticated message; the held message is not re-read, so ask the sender to resend.</Notice>
                  <div className="button-row"><button className="action primary" disabled={mutation.pending}>Map sender</button><button type="button" className="text-button" onClick={() => setMapping(null)}>Cancel</button></div>
                </form>
              ) : (
                <div className="button-row">
                  <button className="action secondary" onClick={() => setMapping(row.id)}>Map to a colleague</button>
                  <button className="text-button" disabled={mutation.pending} onClick={() => run(`/mail/events/${row.id}/dismiss`, {})}>Dismiss and forget sender</button>
                </div>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
