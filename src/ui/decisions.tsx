import { ApprovalStageDecisions } from './approval-stage-decisions';
import { FulfilmentDecisions, type FulfilmentQueueStatus } from "./fulfilment-decisions";
import { usePeopleLabels } from "./people-labels";
import { useState, type FormEvent } from "react";
import { date, text, type RecordValue } from "./api";
import { useMutation, useRemote, useSession } from "./state";
import {
  Badge,
  Empty,
  ErrorNotice,
  Evidence,
  Facts,
  Hero,
  Loading,
  Notice,
} from "./primitives";
import { ActionForm } from "./forms";
import { Icon } from "./icons";
export interface DomainRecord {
  id: string;
  kind: string;
  ownerId: string;
  revision: number;
  visibility: string;
  participants: string[];
  createdAt: string;
  updatedAt: string;
  data: Record<string, any>;
}
export function DecisionSpace({ selectedId }: { selectedId?: string }) {
  const personName = usePeopleLabels();
  const [fulfilmentStatus, setFulfilmentStatus] = useState<FulfilmentQueueStatus>("loading");
  const list = useRemote<{ items: DomainRecord[] }>("/decisions"),
    detail = useRemote<DomainRecord>(
      selectedId ? `/decisions/${selectedId}` : null,
    ),
    { session } = useSession();
  const record = detail.data,
    packet = record?.data;
  function refresh() {
    list.refresh();
    detail.refresh();
  }
  return (
    <div className="layout">
      <main>
        {selectedId && (
          <a className="back-link" href="#/decisions">
            <Icon name="back" size={18} />
            Your decisions
          </a>
        )}
        {selectedId ? (
          detail.loading ? (
            <Loading />
          ) : detail.error ? (
            <ErrorNotice error={detail.error} retry={detail.refresh} />
          ) : (
            record &&
            packet && (
              <>
                <Hero eyebrow="A choice that needs you" title={text(packet.title)}>
                  <Badge value={packet.state} />
                  <p className="lead">{text(packet.impact)}</p>
                </Hero>
                <section className="decision-packet">
                  <div className="section-heading">
                    <h2>The recommendation</h2>
                  </div>
                  <p className="detail-prose">
                    {text(
                      packet.options?.find(
                        (option: { id: string }) =>
                          option.id === packet.recommendation,
                      )?.label,
                      "No recommendation recorded",
                    )}
                  </p>
                  <div className="resource-details">
                    <Facts
                      entries={[
                        ["Quote", packet.quote],
                        ["Source", packet.quoteSource],
                        ["Terms", packet.terms],
                        [
                          "People affected",
                          packet.cohorts?.map(personName).join(", "),
                        ],
                        ["Reversibility", packet.reversibility],
                        ["Decision due", date(packet.deadline)],
                      ]}
                    />
                  </div>
                  <Notice tone="warning">
                    <strong>What remains uncertain</strong>
                    <p>{text(packet.uncertainty)}</p>
                  </Notice>
                  <Notice>
                    Your choice settles this business decision. It does not
                    grant permission to act in a provider. Current execution
                    authority is checked separately.
                  </Notice>
                  {packet.holderId === session.principal.userId &&
                  ["needs-decision", "deferred"].includes(packet.state) ? (
                    <DecisionAction record={record} onSaved={refresh} />
                  ) : (
                    <p className="fact-note">
                      {packet.holderId !== session.principal.userId
                        ? "Only the named decision holder can make this choice."
                        : "This decision is recorded. Material changes require an amended packet."}
                    </p>
                  )}
                  <ActionForm
                    title="Amend the decision packet"
                    path={`/decisions/${record.id}/amend`}
                    defaults={{ revision: record.revision }}
                    fields={[
                      {
                        name: "impact",
                        label: "Updated impact",
                        type: "textarea",
                        value: packet.impact,
                      },
                      {
                        name: "uncertainty",
                        label: "What is still uncertain?",
                        type: "textarea",
                        value: packet.uncertainty,
                      },
                      {
                        name: "quote",
                        label: "Updated quote",
                        value: packet.quote,
                      },
                      {
                        name: "quoteSource",
                        label: "Quote source",
                        value: packet.quoteSource,
                      },
                      {
                        name: "terms",
                        label: "Terms",
                        type: "textarea",
                        value: packet.terms,
                      },
                      {
                        name: "reversibility",
                        label: "Reversibility",
                        value: packet.reversibility,
                      },
                    ]}
                    explanation="Changing material facts reopens the decision; prior choices remain in its history."
                    onSaved={refresh}
                  />
                  <Evidence value={packet.history} title="Decision history" />
                </section>
              </>
            )
          )
        ) : (
          <>
            <Hero eyebrow="Needs your decision" title="Decisions">
              <p className="lead">
                Just the choices that need you. A clear recommendation, its consequences, and the facts that
                matter. Routine authorized work carries on.
              </p>
            </Hero>
            <FulfilmentDecisions onQueueStatus={setFulfilmentStatus} /><ApprovalStageDecisions/>
            {list.loading ? (
              <Loading label="Reading decisions…" />
            ) : list.error ? (
              <ErrorNotice error={list.error} retry={list.refresh} />
            ) : list.data?.items.length ? (
              <div className="record-list">
                {list.data.items.map((r) => (
                  <a
                    className="record-row"
                    key={r.id}
                    href={`#/decisions/${r.id}`}
                  >
                    <span className="event-icon">
                      <Icon name="clock" />
                    </span>
                    <span>
                      <strong>{text(r.data.title)}</strong>
                      <small>Due {date(r.data.deadline)}</small>
                    </span>
                    <Badge value={r.data.state} />
                    <Icon name="arrow" />
                  </a>
                ))}
              </div>
            ) : (
              <Empty title={fulfilmentStatus === "items" ? "No additional business choices." : "A little breathing room."}>
                No business choices are recorded for you. Catalog requests are shown separately above. This does not establish that
                connected services are healthy.
              </Empty>
            )}
          </>
        )}
      </main>
      <aside className="context-rail">
        <section className="rail-section">
          <h2>
            {record ? "The decision boundary" : "Your attention matters."}
          </h2>
          <p>
            Silence never counts as approval. Deferring keeps the exposure and a
            next date visible.
          </p>
          {record && (
            <Facts
              entries={[
                ["Decision holder", personName(packet?.holderId)],
                ["Packet revision", record.revision],
                ["Context revision", packet?.contextRevision],
                ["Follow-up", date(packet?.nextDueAt)],
              ]}
            />
          )}
        </section>
        <a href="#/services">Open service context</a>
      </aside>
    </div>
  );
}
function DecisionAction({
  record,
  onSaved,
}: {
  record: DomainRecord;
  onSaved: () => void;
}) {
  const [command, setCommand] = useState("choose"),
    action = useMutation(),
    packet = record.data;
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.nextDueAt)
      values.nextDueAt = new Date(String(values.nextDueAt)).toISOString();
    const result = await action.mutate(`/decisions/${record.id}/${command}`, {
      revision: record.revision,
      ...values,
    });
    if (result) onSaved();
  }
  return (
    <form className="inline-form" onSubmit={send}>
      <h2>Your decision</h2>
      <div className="button-row" role="group" aria-label="Decision action">
        {["choose", "defer", "reject"].map((c) => (
          <button
            key={c}
            type="button"
            className={command === c ? "action secondary" : "text-button"}
            aria-pressed={command === c}
            onClick={() => setCommand(c)}
          >
            {c === "choose"
              ? "Choose an option"
              : c === "defer"
                ? "Defer"
                : "Reject"}
          </button>
        ))}
      </div>
      {command === "choose" && (
        <fieldset>
          <legend>Material alternatives</legend>
          <div className="option-list">
            {packet.options.map(
              (option: { id: string; label: string; consequences: string }) => (
                <label className="option" key={option.id}>
                  <input
                    type="radio"
                    name="optionId"
                    value={option.id}
                    required
                  />
                  <span>
                    <strong>
                      {option.label}
                      {packet.recommendation === option.id
                        ? " · Recommended"
                        : ""}
                    </strong>
                    {option.consequences}
                  </span>
                </label>
              ),
            )}
          </div>
        </fieldset>
      )}
      {command === "defer" && (
        <label>
          When should this return?
          <input type="datetime-local" name="nextDueAt" required />
        </label>
      )}
      <label>
        {command === "defer"
          ? "Reason and ongoing exposure"
          : "Reason for your decision"}
        <textarea name="reason" rows={3} required />
      </label>
      <ErrorNotice error={action.error} />
      <button className="action primary" disabled={action.pending}>
        {action.pending
          ? "Recording…"
          : command === "choose"
            ? "Record my choice"
            : command === "defer"
              ? "Record deferral"
              : "Record rejection"}
        <Icon name="arrow" />
      </button>
    </form>
  );
}
