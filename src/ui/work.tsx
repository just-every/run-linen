import { usePeopleLabels } from "./people-labels";
import { useRef, useState, type FormEvent } from "react";
import { date, humanize, text, type RecordValue } from "./api";
import { useMutation, useRemote, useSession } from "./state";
import { Icon } from "./icons";
import {
  Badge,
  Empty,
  ErrorNotice,
  Facts,
  Hero,
  Loading,
  Notice,
} from "./primitives";
import { Composer } from "./work-composer";
import { objectFacts, roleList } from "./labels";
import { WorkOutcome } from "./work-outcome";
export interface WorkRecord {
  id: string;
  title: string;
  state: string;
  revision: number;
  kind: string;
  sensitivity: string;
  assignee_id?: string;
  beneficiary_id: string;
  requester_id: string;
  created_at: string;
  updated_at?: string;
  context_json?: string;
  attention?: RequestProgress[];
}
interface RequestProgress { title?: string; dueAt?: string; state: string; happened: string; next: string; ownerId: string | null; ownerLabel: string; }
export interface Conversation {
  progress?: RequestProgress[];
  work: WorkRecord;
  messages: {
    id: string;
    author_id: string;
    visibility: string;
    body: string;
    created_at: string;
  }[];
  attachments?: RecordValue[];
}
export function WorkSpace({ selectedId }: { selectedId?: string }) {
  const personName = usePeopleLabels();
  const list = useRemote<{ items: WorkRecord[] }>("/work");
  const detail = useRemote<Conversation>(
    selectedId ? `/work/${encodeURIComponent(selectedId)}` : null,
    10000,
  );
  const { session } = useSession(),
    operator = session.principal.roles.some((r) =>
      ["owner", "operator", "hr"].includes(r),
    );
  const work = detail.data?.work;
  function changed() {
    detail.refresh();
    list.refresh();
  }
  return (
    <div className={`layout ${selectedId ? "conversation-layout" : ""}`}>
      <main className="work-main">
        <div className="work-content">
          {selectedId ? (
            <>
              <a className="back-link" href="#/work">
                <Icon name="back" size={18} />
                Your work
              </a>
              {detail.loading ? (
                <Loading />
              ) : detail.error ? (
                <ErrorNotice error={detail.error} retry={detail.refresh} />
              ) : (
                work && (
                  <>
                    <Hero eyebrow={humanize(work.kind)} title={work.title} stitch={false}>
                      <Badge value={work.state} />
                      {work.state !== "open" && (
                        <p className="lead">
                          {work.state === "closed"
                            ? "This conversation is closed. Closure alone does not verify that your work is restored."
                            : work.state === "cancelled"
                              ? "Cancellation is recorded. Effects already made or still uncertain remain part of this request."
                              : work.state === "paused"
                                ? "Work is paused. Your request and its remaining obligations are preserved."
                                : "Your request is recorded. Progress, evidence and anything that needs you stay here."}
                        </p>
                      )}
                    </Hero>
                    <section className="progress" aria-label="Request progress" aria-live="polite">
                      {detail.data?.progress?.map((item, index) => <Notice key={index} tone={item.state === "verified" ? undefined : "warning"}>
                        <strong>{item.title ? `${item.title}: ` : ""}{item.happened}</strong><p>{item.next}</p>{item.dueAt && <p>Due: {date(item.dueAt)}</p>}<p>Next owner: {item.ownerLabel}</p>
                        {item.next.includes("decision holder") && <a href="#/decisions">Review catalogue approvals</a>}
                        {operator && item.next.includes("physical handoff") && <a href="#/assets">Devices &amp; custody</a>}
                        {operator && item.ownerLabel === "Workspace owner" && <a href="#/connections">Connections &amp; setup</a>}
                      </Notice>)}
                    </section>
                    <WorkOutcome key={work.id} workId={work.id} />
                    <ErrorNotice error={detail.backgroundError} />
                    <Composer workId={work.id} onSent={changed} />
                    <ConversationHistory conversation={detail.data!} />
                    <WorkCommands
                      work={work}
                      onChanged={changed}
                      operator={operator}
                    />
                  </>
                )
              )}
            </>
          ) : (
            <>
              <Hero
                eyebrow={`Your work · ${session.workspace.name}`}
                title="Make room for good work."
              />
              <Composer onSent={changed} />
              {operator && list.data?.items.some(item => item.attention?.length) && <section className="history attention">
                <h2>Responsibilities needing you</h2>
                <div className="record-list">
                  {list.data.items.filter(item => item.attention?.length).map(item => <div key={item.id} className="record-row attention-row">
                    <span className="event-icon"><Icon name="alert" /></span>
                    <span>
                      <strong><a href={`#/work/${item.id}`}>{item.title}</a></strong>
                      {item.attention!.map((action,index) => <small key={index}>{action.happened} {action.next}</small>)}
                      <small><a href={`#/work/${item.id}`}>Open request and service controls</a> · <a href="#/operations">Operations &amp; recovery</a></small>
                    </span>
                    <Badge value={item.attention![0].state} />
                  </div>)}
                </div>
              </section>}
              <section className="history">
                <div className="section-heading">
                  <h2>Your conversations</h2>
                  <button
                    className="action secondary small"
                    onClick={list.refresh}
                    aria-label="Refresh conversations"
                  >
                    Refresh
                  </button>
                </div>
                {list.loading ? (
                  <Loading />
                ) : list.error ? (
                  <ErrorNotice error={list.error} retry={list.refresh} />
                ) : list.data?.items.length ? (
                  <div className="record-list">
                    {list.data.items.map((item) => (
                      <a
                        className="record-row"
                        href={`#/work/${item.id}`}
                        key={item.id}
                      >
                        <span className="event-icon">
                          <Icon
                            name={item.kind === "incident" ? "alert" : "file"}
                          />
                        </span>
                        <span>
                          <strong>{item.title}</strong>
                          <small>{date(item.created_at)}</small>
                        </span>
                        <Badge value={item.state} />
                        <Icon name="arrow" />
                      </a>
                    ))}
                  </div>
                ) : (
                  <Empty title="A fresh start.">
                    Your first request will appear here. Nothing is running or
                    verified yet.
                  </Empty>
                )}
              </section>
            </>
          )}
        </div>
      </main>
      <aside className="context-rail" aria-label="In context">
          {work ? (
            <>
              <section className="rail-section">
                <span className="eyebrow">Your request</span>
                <h2>Your outcome</h2>
              </section>
              <Facts
                entries={[
                  ["Recorded", date(work.created_at)],
                  ["Conversation assignee", personName(work.assignee_id)],
                  [
                    "Visibility",
                    work.sensitivity === "hr"
                      ? "Restricted HR conversation"
                      : "Request participants and permitted service team",
                  ],
                ]}
              />
              <details className="evidence">
                <summary>Request identity & context</summary>
                <Facts
                  entries={[
                    ["Requested by", personName(work.requester_id)],
                    ["For", personName(work.beneficiary_id)],
                    ...objectFacts(work.context_json),
                  ]}
                />
              </details>
            </>
          ) : (
            <section className="rail-section rail-decision">
              <span className="eyebrow">Only when it needs you</span>
              <h2>Needs your decision</h2>
              <p>
                Real choices and missing authority live here. Silence never
                counts as approval.
              </p>
              <a className="action secondary" href="#/decisions">
                View your decisions
              </a>
            </section>
          )}
          <section className="rail-section contextual-links">
            <h2>A little more context</h2>
            <a href="#/knowledge">
              <span className="event-icon"><Icon name="book" size={20} /></span>
                Find a useful answer
              <Icon name="arrow" />
            </a>
            <a href="#/commitments">
              <span className="event-icon"><Icon name="file" size={20} /></span>
                Service commitments
              <Icon name="arrow" />
            </a>
            {operator && (
              <>
                <a href="#/lifecycle">
                  <span className="event-icon"><Icon name="user" size={20} /></span>
                A person joining, moving or leaving
                  <Icon name="arrow" />
                </a>
                <a href="#/incidents">
                  <span className="event-icon"><Icon name="alert" size={20} /></span>
                Shared service interruptions
                  <Icon name="arrow" />
                </a>
                <a href="#/assets">
                  <span className="event-icon"><Icon name="laptop" size={20} /></span>
                Devices & custody
                  <Icon name="arrow" />
                </a>
                <a href="#/changes">
                  <span className="event-icon"><Icon name="settings" size={20} /></span>
                Changes & releases
                  <Icon name="arrow" />
                </a>
                <a href="#/connections">
                  <span className="event-icon"><Icon name="nodes" size={20} /></span>
                Connections & setup
                  <Icon name="arrow" />
                </a>
              </>
            )}
          </section>
      </aside>
    </div>
  );
}
function ConversationHistory({ conversation }: { conversation: Conversation }) {
  return (
    <section className="history">
      <h2>What happened</h2>
      <ol className="events conversation">
        {conversation.messages.map((message) => (
          <li
            className={`event ${message.visibility === "private" ? "private-message" : ""}`}
            key={message.id}
          >
            <span className="event-icon">
              <Icon name={message.visibility === "private" ? "lock" : "user"} />
            </span>
            <div className="event-copy">
              <div className="message-meta">
                <time dateTime={message.created_at}>
                  {date(message.created_at)}
                </time>
                {message.visibility === "private" && (
                  <span className="private-label">Private service note</span>
                )}
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
            <a
              key={text(file.id)}
              href={`/api/v1/attachments/${text(file.id)}`}
            >
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
function WorkCommands({
  work,
  onChanged,
  operator,
}: {
  work: WorkRecord;
  onChanged: () => void;
  operator: boolean;
}) {
  const [command, setCommand] = useState(""),
    mutation = useMutation(),
    members = useRemote<RecordValue[]>(operator ? "/members" : null),
    assignees = (members.data ?? []).filter(
      (m) => m.active && /"(owner|operator)"/.test(text(m.roles_json)),
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    const result = await mutation.mutate(`/work/${work.id}/commands`, {
      ...values,
      command,
      revision: work.revision,
    });
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
              {[
                "assign",
                work.state === "paused" ? "resume" : "pause",
                "close",
              ].map((c) => (
                <button
                  className="action secondary small"
                  key={c}
                  onClick={() => setCommand(c)}
                >
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
          <h3>
            {command === "reopen"
              ? "Tell us what is still getting in your way."
              : `${humanize(command)} request`}
          </h3>
          {command === "cancel" && (
            <Notice>
              This records your cancellation. It does not claim that a provider
              action has stopped or been reversed. Any existing or uncertain
              effects must be reconciled.
            </Notice>
          )}
          {command === "close" && (
            <Notice>
              Closing the conversation is not evidence of recovery. Keep
              unresolved effects and obligations open.
            </Notice>
          )}
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
            <button
              type="button"
              className="text-button"
              onClick={() => setCommand("")}
            >
              Keep working
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
