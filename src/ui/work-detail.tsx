import { useState, type FormEvent } from "react";
import { date, humanize, text, type RecordValue } from "./api";
import { useMutation, useRemote, useSession } from "./state";
import { Icon } from "./icons";
import { Badge, ErrorNotice, Facts, Loading, Notice } from "./primitives";
import { Composer } from "./work-composer";
import { objectFacts, roleList } from "./labels";
import { WorkOutcome } from "./work-outcome";
import { usePeopleLabels } from "./people-labels";
import { shortRef } from "./work-queue";
import { useQueue } from "./queue";
import { progressException, requestFacts, requestFor, requestStatus } from "./request-facts";
import type { Conversation, RequestProgress, WorkRecord } from "./work";

/** A date people plan around, as the pick's facts read it: "Mon, Oct 19". */
const day = (value: string) => {
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? value : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(at);
};

const stateLead: Record<string, string> = {
  closed: "This conversation is closed. Closure alone does not verify that your work is restored.",
  cancelled: "Cancellation is recorded. Effects already made or still uncertain remain part of this request.",
  paused: "Work is paused. Your request and its remaining obligations are preserved.",
};

/** The open request on the workbench's right: head, facts, progress readback, the exception, Linen's strip, history. */
export function RequestDetail({ selectedId, onChanged }: { selectedId: string; onChanged: () => void }) {
  const personName = usePeopleLabels(),
    queue = useQueue();
  const detail = useRemote<Conversation>(`/work/${encodeURIComponent(selectedId)}`, 10000);
  const { session } = useSession(),
    operator = session.principal.roles.some((r) => ["owner", "operator", "hr"].includes(r));
  const work = detail.data?.work;
  function changed() {
    detail.refresh();
    onChanged();
  }
  if (detail.loading) return <Loading />;
  if (detail.error) return <ErrorNotice error={detail.error} retry={detail.refresh} />;
  if (!work) return null;
  const progress = detail.data?.progress ?? [];
  const exception = progressException(progress),
    { team, place, neededBy } = requestFacts(work),
    service = queue.data?.items.find((item) => item.id === work.id)?.services?.[0];
  return (
    <article className="request-detail">
      <a className="back-link" href="#/work">
        <Icon name="back" size={18} />
        Requests
      </a>
      <div className="detail-top">
        <span className={`q-kind kind-${work.kind}`}><Icon name={work.kind === "incident" ? "alert" : "file"} size={20} /></span>
        <span className="q-ref">{humanize(work.kind)} {shortRef(work.id)}</span>
        <span className="created">Recorded <time dateTime={work.created_at}>{date(work.created_at)}</time></span>
      </div>
      <div className="detail-title">
        <h2>{work.title}</h2>
        <Badge value={requestStatus(work, progress)} />
      </div>
      {stateLead[work.state] && <p className="lead">{stateLead[work.state]}</p>}
      <dl className="meta-strip">
        <div>
          <Icon name="user" size={24} />
          <dt>For</dt>
          <dd>{requestFor(work, personName)}</dd>
          {team && <dd className="meta-sub">{team}</dd>}
        </div>
        {place && (
          <div>
            <Icon name="building" size={24} />
            <dt>Place</dt>
            <dd>{place}</dd>
          </div>
        )}
        {neededBy && (
          <div>
            <Icon name="calendar" size={24} />
            <dt>Needed by</dt>
            <dd><time dateTime={neededBy}>{day(neededBy)}</time></dd>
          </div>
        )}
        {service && (
          <div>
            <Icon name={service.kind === "device" ? "laptop" : service.kind === "software" ? "cube" : "lock"} size={24} />
            <dt>{service.kind === "device" ? "Device" : "Service"}</dt>
            <dd>{service.name}</dd>
          </div>
        )}
      </dl>
      <dl className="meta-line">
        <div>
          <dt>Requested by</dt>
          <dd>{personName(work.requester_id)}</dd>
        </div>
        <div>
          <dt>Conversation assignee</dt>
          <dd>{personName(work.assignee_id)}</dd>
        </div>
        <div>
          <dt>Last changed</dt>
          <dd><time dateTime={work.updated_at ?? work.created_at}>{date(work.updated_at ?? work.created_at)}</time></dd>
        </div>
      </dl>
      <Progress items={progress} exception={exception} operator={operator} />
      <ErrorNotice error={detail.backgroundError} />
      <section className="agent-strip" aria-label="Linen">
        <h3>
          <Icon name="sparkle" size={20} />
          Linen
        </h3>
        <p className="agent-note">Linen reads each message against your catalog and services. Effects need a standing grant and are verified separately.</p>
        <Composer workId={work.id} onSent={changed} />
        <ConversationHistory conversation={detail.data!} />
      </section>
      <WorkOutcome key={work.id} workId={work.id} onChanged={changed} />
      <WorkCommands work={work} onChanged={changed} operator={operator} />
      <details className="evidence">
        <summary>Request identity & context</summary>
        <Facts entries={[["Visibility", work.sensitivity === "hr" ? "Restricted HR conversation" : "Request participants and permitted service team"], ["Requested by", personName(work.requester_id)], ["For", requestFor(work, personName)], ...objectFacts(work.context_json)]} />
      </details>
    </article>
  );
}

/** Each responsibility read back with its state; the first one that waits on a person opens the red exception. */
function Progress({ items, exception, operator }: { items: RequestProgress[]; exception?: RequestProgress; operator: boolean }) {
  if (!items.length) return null;
  // The count covers the responsibilities listed under it; the assessment is a step of its own, set apart below them.
  const duties = items.filter((item) => item.title),
    assessment = items.filter((item) => !item.title),
    verified = duties.filter((item) => item.state === "verified").length;
  const tone = (state: string) => (state === "verified" ? "ok" : ["blocked", "failed", "needs_configuration", "budget_held"].includes(state) ? "alert" : "wait");
  const row = (item: RequestProgress, index: number) => (
    <li key={index} className="readback-row">
      <span className={`dot tone-${tone(item.state)}`} />
      <span className="readback-what">
        <strong>{item.title ?? "Assessment"}</strong>
        <small>{item === exception ? "Needs attention: the next step is below." : item.happened}</small>
      </span>
      <span className="readback-when">{item.dueAt ? <>Due <time dateTime={item.dueAt}>{date(item.dueAt)}</time></> : item.ownerLabel}</span>
    </li>
  );
  return (
    <section className="progress" aria-label="Request progress" aria-live="polite">
      <div className="panel readback">
        <h3>
          Progress
          {Boolean(duties.length) && <span className={verified === duties.length ? "count-ok" : "count-alert"}>{verified} of {duties.length} verified</span>}
        </h3>
        {Boolean(duties.length) && <ul>{duties.map(row)}</ul>}
        {Boolean(assessment.length) && <ul className="readback-apart">{assessment.map(row)}</ul>}
      </div>
      {exception && (
        <div className="exception" role="status">
          <Icon name="alert" size={22} />
          <div>
            <strong>{exception.happened}</strong>
            <p>{exception.next}</p>
            {exception.dueAt && <p>Due: {date(exception.dueAt)}</p>}
            <p>Next owner: {exception.ownerLabel}</p>
            <Resolutions item={exception} operator={operator} />
          </div>
        </div>
      )}
    </section>
  );
}

/** Where the exception is resolved: the real screens its next step names, as cards. */
function Resolutions({ item, operator }: { item: RequestProgress; operator: boolean }) {
  const cards: [string, string, string, string][] = [];
  if (item.next.includes("decision holder")) cards.push(["#/decisions", "approve", "Review catalog approvals", "The decision holder approves or declines in Decisions."]);
  if (operator && item.next.includes("physical handoff")) cards.push(["#/assets", "laptop", "Devices & custody", "Record the physical handoff and its evidence."]);
  if (operator && item.ownerLabel === "Workspace owner") cards.push(["#/connections", "gear", "Connections & setup", "Review the model connection or budget."]);
  if (operator && item.next.includes("Operations & recovery")) cards.push(["#/operations", "shield", "Operations & recovery", "Check current authority and uncertain effects."]);
  if (!cards.length) return null;
  return (
    <div className="resolutions">
      {cards.map(([href, icon, label, effect], index) => (
        <a key={href} href={href} className={`resolution ${index === 0 ? "primary" : ""}`}>
          <Icon name={icon} size={26} />
          <span>
            <strong>{label}</strong>
            <small>{effect}</small>
          </span>
        </a>
      ))}
    </div>
  );
}

function ConversationHistory({ conversation }: { conversation: Conversation }) {
  return (
    <section className="history">
      <h3>What happened</h3>
      <ol className="events conversation">
        {conversation.messages.map((message) => (
          <li className={`event ${message.visibility === "private" ? "private-message" : ""}`} key={message.id}>
            <span className="event-icon">
              <Icon name={message.visibility === "private" ? "lock" : "user"} size={18} />
            </span>
            <div className="event-copy">
              <div className="message-meta">
                <time dateTime={message.created_at}>{date(message.created_at)}</time>
                {message.visibility === "private" && <span className="private-label">Private service note</span>}
              </div>
              <p className="message-body">{message.body}</p>
            </div>
          </li>
        ))}
      </ol>
      {Boolean(conversation.attachments?.length) && (
        <div className="attachments">
          <h3>Attachments</h3>
          {conversation.attachments!.map((file) => (
            <a key={text(file.id)} href={`/api/v1/attachments/${text(file.id)}`}>
              <Icon name="attachment" />
              {text(file.name)}
              {file.visibility === "private" && " · Private"}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function WorkCommands({ work, onChanged, operator }: { work: WorkRecord; onChanged: () => void; operator: boolean }) {
  const [command, setCommand] = useState(""),
    mutation = useMutation(),
    members = useRemote<RecordValue[]>(operator ? "/members" : null),
    assignees = (members.data ?? []).filter((m) => m.active && /"(owner|operator)"/.test(text(m.roles_json)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const result = await mutation.mutate(`/work/${work.id}/commands`, { ...values, command, revision: work.revision });
    if (result) {
      setCommand("");
      onChanged();
    }
  }
  return (
    <section className="work-controls">
      <div className="button-row">
        <button className="action secondary" onClick={() => setCommand("reopen")}>
          Still not working?
        </button>
        <button className="action secondary" onClick={() => setCommand("cancel")}>
          Cancel this request
        </button>
        {operator && (
          <details className="more-actions">
            <summary>Service controls</summary>
            <div className="button-row">
              {["assign", work.state === "paused" ? "resume" : "pause", "close"].map((c) => (
                <button className="action secondary small" key={c} onClick={() => setCommand(c)}>
                  {c === "assign" ? "Assign…" : humanize(c)}
                </button>
              ))}
              <a href="#/operations">Effects, takeover & compensation</a>
            </div>
          </details>
        )}
      </div>
      {command && (
        <form className="inline-form" onSubmit={submit}>
          <h3>{command === "reopen" ? "Tell us what is still getting in your way." : `${humanize(command)} request`}</h3>
          {command === "cancel" && (
            <Notice>
              This records your cancellation. It does not claim that a provider action has stopped or been reversed. Any existing or uncertain effects must be reconciled.
            </Notice>
          )}
          {command === "close" && <Notice>Closing the conversation is not evidence of recovery. Keep unresolved effects and obligations open.</Notice>}
          <label>
            {command === "reopen" ? "What is happening?" : "Reason"}
            <textarea name="reason" required rows={3} />
          </label>
          {command === "assign" && (
            <label>
              Assign to
              <select name="assigneeId" required defaultValue={work.assignee_id ?? ""}>
                <option value="">Choose…</option>
                {assignees.map((m) => (
                  <option key={text(m.id)} value={text(m.id)}>
                    {text(m.name)} · {roleList(m.roles_json)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ErrorNotice error={mutation.error} />
          <div className="button-row">
            <button className="action primary" disabled={mutation.pending}>
              {mutation.pending ? "Saving…" : "Save to this conversation"}
            </button>
            <button type="button" className="text-button" onClick={() => setCommand("")}>
              Keep working
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
