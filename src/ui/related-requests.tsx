import { Icon } from "./icons";
import { Badge } from "./primitives";
import { usePeopleLabels } from "./people-labels";
import { useQueue } from "./queue";
import { requestFacts, requestFor, requestStatus } from "./request-facts";
import { queueTime } from "./work-queue";
import type { WorkRecord } from "./work";

/** The queue's requests that belong to a space: incident-kind requests in Incidents, software-seat requests in Software. */
const belongs: Record<string, [string, (item: WorkRecord) => boolean]> = {
  incidents: ["Incident requests in your queue", (item) => item.kind === "incident"],
  "software-assets": ["Software requests in your queue", (item) => Boolean(item.services?.some((service) => service.kind === "software"))],
};

export function hasRelatedRequests(section: string, items: WorkRecord[] = []) {
  return Boolean(belongs[section] && items.some(belongs[section][1]));
}

export function RelatedRequests({ section }: { section: string }) {
  const queue = useQueue(),
    personName = usePeopleLabels();
  const rule = belongs[section],
    items = rule ? (queue.data?.items ?? []).filter(rule[1]) : [];
  if (!items.length) return null;
  return (
    <section className="related-requests" aria-labelledby="related-requests-title">
      <h2 id="related-requests-title">{rule[0]}</h2>
      <p className="lead">Each is a person’s own conversation, with its status as it reads in Requests.</p>
      <div className="record-list">
        {items.map((item) => {
          const { team } = requestFacts(item);
          return (
            <a className="record-row" href={`#/work/${item.id}`} key={item.id}>
              <span className="event-icon">
                <Icon name={item.kind === "incident" ? "alert" : "cube"} />
              </span>
              <span>
                <strong>{item.title}</strong>
                <small>
                  For {requestFor(item, personName)}
                  {team ? ` · ${team}` : ""} · Updated {queueTime(item.updated_at ?? item.created_at)}
                  {item.services?.length ? ` · ${item.services.map((service) => service.name).join(", ")}` : ""}
                </small>
              </span>
              <Badge value={requestStatus(item)} />
              <Icon name="arrow" />
            </a>
          );
        })}
      </div>
    </section>
  );
}
