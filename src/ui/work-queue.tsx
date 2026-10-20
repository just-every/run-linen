import { useState } from "react";
import { useRemote } from "./state";
import { useGroups } from "./work-groups";
import { SaveView, useViews } from "./work-views";
import { BulkUpdate } from "./work-bulk";
import { TriageShortcuts } from "./work-triage";
import { useSession } from "./state";
import { Icon } from "./icons";
import { Badge, Empty, ErrorNotice, Loading } from "./primitives";
import { usePeopleLabels } from "./people-labels";
import { isOpen, useQueue } from "./queue";
import type { WorkRecord } from "./work";
import { progressException, requestFacts, requestFor, requestStatus } from "./request-facts";

/** A short, stable reference for a request: the start of its real id. */
export const shortRef = (id: string) => id.replace(/-/g, "").slice(0, 6).toUpperCase();
/** "9:14 AM" today, "Oct 17" earlier this year, as the queue's time column reads. */
export function queueTime(value: string) {
  const at = new Date(value), now = new Date();
  if (Number.isNaN(at.getTime())) return value;
  const sameDay = at.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat("en-US", sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", ...(at.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) }).format(at);
}

type Filter = [key: string, label: string, test: (item: WorkRecord) => boolean];

/** The queue of the Requests workbench: counted filter chips over a dense table of conversations, the open one highlighted. */
export function Queue({ selectedId }: { selectedId?: string }) {
  const queue = useQueue(),
    personName = usePeopleLabels(),
    { session } = useSession(),
    operator = session.principal.roles.some((r) => ["owner", "operator", "hr"].includes(r)),
    [filter, setFilter] = useState("all"),
    [source, setSource] = useState(""),
    groups = useGroups();
  const me = session.user.id;
  // DESK-001: a lead reads their group's view (its non-restricted tickets) in place of the whole queue.
  const leadOf = (groups.data?.items ?? []).filter((g) => g.members.some((m) => m.userId === me && m.lead)),
    views = useViews(operator),
    lead = useRemote<{ items: WorkRecord[] }>(source ? (source.startsWith("lead:") ? `/work-groups/${encodeURIComponent(source.slice(5))}/queue` : `/work-views/${encodeURIComponent(source.slice(5))}/work`) : null),
    remote = source ? lead : queue;
  const filters: Filter[] = operator
    ? [
        ["all", "All", () => true],
        ["mine", "Mine", (item) => item.assignee_id === me && isOpen(item)],
        ["unassigned", "Unassigned", (item) => !item.assignee_id && isOpen(item)],
        // The responsibilities waiting on this person, and every request with an exception: counted and
        // filtered here, so the queue itself stays on the first screen.
        ["you", "Needs you", (item) => Boolean(item.attention?.length)],
        ["attention", "Needs attention", (item) => Boolean(progressException(item.progress))],
      ]
    : [
        ["all", "All", () => true],
        ["open", "Open", isOpen],
        ["closed", "Closed", (item) => !isOpen(item)],
      ];
  const items = remote.data?.items ?? [],
    active = filters.find(([key]) => key === filter) ?? filters[0],
    shown = items.filter(active[2]);
  return (
    <section className="queue" aria-label="Request queue">
      {operator && (
        <div className="queue-view">
          <label>
            Queue view
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">All requests I can read</option>
              {leadOf.map((g) => <option key={g.id} value={`lead:${g.id}`}>Lead view · {g.name}</option>)}
              {(views.data?.items ?? []).map((v) => <option key={v.id} value={`view:${v.id}`}>{v.name}{v.shared ? " · shared" : ""}</option>)}
            </select>
          </label>
          <SaveView groups={groups.data?.items ?? []} onSaved={(v) => { views.refresh(); setSource(`view:${v.id}`); }} />
          <BulkUpdate items={shown} onDone={() => { remote.refresh(); queue.refresh(); }} />
          <TriageShortcuts ids={shown.map((item) => item.id)} selectedId={selectedId} />
        </div>
      )}
      <div className="chips" role="group" aria-label="Show requests">
        {filters.map(([key, label, test]) => (
          <button
            key={key}
            type="button"
            className={`chip-filter ${key === "attention" ? "danger" : ""}`}
            aria-pressed={active[0] === key}
            onClick={() => setFilter(key)}
          >
            {label}
            <span className="chip-count">{items.filter(test).length}</span>
          </button>
        ))}
        <button className="chip-refresh" type="button" onClick={remote.refresh} aria-label="Refresh conversations">
          <Icon name="refresh" size={18} />
        </button>
      </div>
      {remote.loading ? (
        <Loading />
      ) : remote.error ? (
        <ErrorNotice error={remote.error} retry={remote.refresh} />
      ) : shown.length ? (
        <div className="queue-table" role="table" aria-label="Your conversations">
          <div className="queue-row queue-header" role="row">
            <span role="columnheader" className="q-kind"><span className="visually-hidden">Kind</span></span>
            <span role="columnheader">ID</span>
            <span role="columnheader">For</span>
            <span role="columnheader">Subject</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader">Status</span>
          </div>
          {shown.map((item) => {
            const attention = Boolean(progressException(item.progress)),
              { team, place } = requestFacts(item);
            return (
              <a
                className={`queue-row ${item.id === selectedId ? "selected" : ""}`}
                href={`#/work/${item.id}`}
                key={item.id}
                role="row"
                aria-current={item.id === selectedId ? "true" : undefined}
              >
                <span role="cell" className={`q-kind kind-${item.kind}`}>
                  <Icon name={item.kind === "incident" ? "alert" : "file"} size={20} />
                </span>
                <span role="cell" className="q-ref">{shortRef(item.id)}</span>
                <span role="cell" className="q-person">
                  <strong>{requestFor(item, personName)}</strong>
                  <small>{[team, place, item.group_name, item.priority].filter(Boolean).join(" · ") || (item.kind === "incident" ? "Incident" : "Request")}</small>
                </span>
                <span role="cell" className="q-subject" title={item.title}>
                  <strong>{item.title}</strong>
                </span>
                <span role="cell" className={`q-time ${attention ? "late" : ""}`}>
                  <Icon name="clock" size={15} />
                  <time dateTime={item.updated_at ?? item.created_at}>{queueTime(item.updated_at ?? item.created_at)}</time>
                </span>
                <span role="cell" className="q-status">
                  <Badge value={requestStatus(item)} />
                </span>
                <Icon name="chevron-right" size={18} className="q-go" />
              </a>
            );
          })}
        </div>
      ) : items.length ? (
        <Empty title="Nothing in this view.">No conversation matches {active[1].toLowerCase()}. Choose another view above.</Empty>
      ) : (
        <Empty title="A fresh start.">Your first request will appear here. Nothing is running or verified yet.</Empty>
      )}
    </section>
  );
}
