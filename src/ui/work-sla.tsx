import { humanize } from "./api";
import { useRemote } from "./state";
import { Badge, ErrorNotice } from "./primitives";

interface SlaTarget { target: string; startedAt: string; dueAt: string | null; metAt: string | null; state: string; breachedAt: string | null }
export interface WorkSlaData {
  policy: null | { name: string; hours: string; calendar: null | { timezone: string; location?: string | null; holidayCatalog?: string | null }; pauseOn: string[] };
  firstResponse?: SlaTarget; nextResponses?: SlaTarget[]; resolution?: SlaTarget;
  pauses?: { waiting_on: string | null; paused_at: string; resumed_at: string | null; stopsClock: boolean }[];
}
/** A time in the policy calendar's own zone, so a due time reads as the desk promised it. */
export const slaTime = (value: string | null, zone = "UTC") => value
  ? new Intl.DateTimeFormat("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value))
  : "Clock paused";

export function SlaTargetRow({ value, zone }: { value: SlaTarget; zone: string }) {
  return <tr>
    <th scope="row">{humanize(value.target)}</th>
    <td><Badge value={value.state} /></td>
    <td>{slaTime(value.dueAt, zone)}</td>
    <td>{value.metAt ? slaTime(value.metAt, zone) : "Not yet"}</td>
    <td>{value.breachedAt ? `Breached ${slaTime(value.breachedAt, zone)}` : "No breach"}</td>
  </tr>;
}

/** DESK-004: the ticket's bound policy and each target's due, met and breach times. */
export function WorkSla({ workId }: { workId: string }) {
  const remote = useRemote<WorkSlaData>(`/work/${encodeURIComponent(workId)}/sla`, 30000), data = remote.data;
  if (remote.error) return <ErrorNotice error={remote.error} retry={remote.refresh} />;
  if (!data) return null;
  if (!data.policy) return <section className="work-controls" aria-label="Service level"><h3>Service level</h3><p>No SLA policy matches this ticket's classification.</p></section>;
  const zone = data.policy.calendar?.timezone ?? "UTC", next = data.nextResponses?.at(-1);
  return <section className="work-controls" aria-label="Service level">
    <h3>Service level · {data.policy.name}</h3>
    <p>{data.policy.hours === "business"
      ? `Business hours in ${data.policy.calendar?.location ?? zone} (${zone})${data.policy.calendar?.holidayCatalog === "us-federal" ? ", US federal holidays observed" : ""}.`
      : "Calendar hours: every minute counts."} Clock pauses while awaiting {data.policy.pauseOn.length ? data.policy.pauseOn.join(" or ") : "nobody"}.</p>
    <div style={{ overflowX: "auto" }}><table>
      <thead><tr><th scope="col">Target</th><th scope="col">State</th><th scope="col">Due</th><th scope="col">Met</th><th scope="col">Breach</th></tr></thead>
      <tbody>
        {data.firstResponse && <SlaTargetRow value={data.firstResponse} zone={zone} />}
        {next && <SlaTargetRow value={next} zone={zone} />}
        {data.resolution && <SlaTargetRow value={data.resolution} zone={zone} />}
      </tbody>
    </table></div>
  </section>;
}

const targetLabels: Record<string, string> = { firstResponse: "First response", nextResponse: "Next response", resolution: "Resolution" };
/** DESK-004 report: breaches per target beside the denominator, with each ticket's resolution target. */
export function SlaReport({ value }: { value: { definition: string; denominator: number; counts: Record<string, Record<string, number>>; rows: ({ workId: string; title: string } & WorkSlaData)[] } }) {
  return <section aria-label="Service levels">
    <h2>Service levels</h2>
    <p>{value.definition} Tickets: {value.denominator}.</p>
    <div style={{ overflowX: "auto" }}><table><caption>Targets by state</caption>
      <thead><tr><th scope="col">Target</th>{["met", "breached", "running", "paused"].map(s => <th scope="col" key={s}>{humanize(s)}</th>)}</tr></thead>
      <tbody>{Object.entries(value.counts).map(([target, counts]) => <tr key={target}><th scope="row">{targetLabels[target] ?? humanize(target)}</th>{["met", "breached", "running", "paused"].map(s => <td key={s}>{counts[s] ?? 0}</td>)}</tr>)}</tbody>
    </table></div>
    <div style={{ overflowX: "auto" }}><table><caption>Resolution target per ticket</caption>
      <thead><tr><th scope="col">Ticket</th><th scope="col">Policy</th><th scope="col">State</th><th scope="col">Due</th><th scope="col">Breach</th></tr></thead>
      <tbody>{value.rows.map(row => { const zone = row.policy?.calendar?.timezone ?? "UTC"; return <tr key={row.workId}>
        <th scope="row"><a href={`#/work/${encodeURIComponent(row.workId)}`}>{row.title}</a></th><td>{row.policy?.name}</td>
        <td><Badge value={row.resolution?.state} /></td><td>{slaTime(row.resolution?.dueAt ?? null, zone)}</td>
        <td>{row.resolution?.breachedAt ? slaTime(row.resolution.breachedAt, zone) : "No breach"}</td></tr>; })}</tbody>
    </table></div>
  </section>;
}
