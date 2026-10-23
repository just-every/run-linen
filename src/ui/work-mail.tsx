import { date, text } from "./api";
import { useRemote } from "./state";
import { Badge } from "./primitives";

interface TicketMail {
  received: { id: string; created_at: string; sender: string; subject: string | null; connection: string; attachments: number }[];
  sent: { id: string; state: string; error: string | null; created_at: string }[];
  watchers: { id: string; name: string }[];
}
/** Staff view of one ticket's email thread: what arrived, what Linen sent back and who watches by CC. Bodies stay in the conversation. */
export function WorkMail({ workId }: { workId: string }) {
  const remote = useRemote<TicketMail>(`/work/${workId}/mail`, 20000);
  const data = remote.data;
  if (!data || (!data.received.length && !data.sent.length)) return null;
  return (
    <section className="panel" aria-label="Email thread">
      <h2>Email thread</h2>
      <ul className="plain-list">
        {data.received.map((m) => (
          <li key={m.id}>Received from {m.sender} on {m.connection} · <time dateTime={m.created_at}>{date(m.created_at)}</time>
            {m.attachments > 0 ? ` · ${m.attachments} attachment${m.attachments === 1 ? "" : "s"} kept on the request` : ""}</li>
        ))}
        {data.sent.map((m) => (
          <li key={m.id}>Reply sent from the mailbox · <time dateTime={m.created_at}>{date(m.created_at)}</time> · <Badge value={m.state} />{m.error ? ` ${text(m.error).replaceAll("_", " ")}` : ""}</li>
        ))}
      </ul>
      <p className="fact-note">Watching by CC: {data.watchers.map((w) => w.name).join(", ") || "none"}. Only colleagues who already read this request can watch; mail never widens access.</p>
    </section>
  );
}
