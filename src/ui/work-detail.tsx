import { WorkDepartment } from './work-department';
import { WorkCollaboration } from './work-collaboration';
import { WorkMail } from './work-mail';
import { AskForPerson } from './handoff';
import { WorkActivity } from './work-activity';
import { SponsorReattest } from "./sponsor-reattest";
import { LifecycleTaskReminder } from "./lifecycle-templates";
import { WorkShares } from "./work-shares";
import { RecurringTasks } from './recurring-work';
import { WorkaroundSuggestions } from "./workaround-suggestions";
import { RepairCoverage } from "./asset-contracts";
import { WorkTime } from "./work-time";
import { useEffect, useState, type FormEvent } from "react";
import { date, humanize, text, type RecordValue } from "./api";
import { useMutation, useRemote, useSession } from "./state";
import { Icon } from "./icons";
import { Badge, ErrorNotice, Facts, Loading, Notice } from "./primitives";
import { Composer } from "./work-composer";
import { objectFacts, roleList } from "./labels";
import { WorkOutcome } from "./work-outcome";
import { BundleProgress } from "./bundles";
import { HeldServices } from "./pending-people";
import { WorkClassification } from "./work-classification";
import { WorkSla } from "./work-sla";
import { WorkFields, type DeskSettings } from "./work-fields";
import { WorkGroup } from "./work-groups";
import { WorkScenarios } from "./work-scenarios";
import { useTriage } from "./work-triage";
import { WorkRelationships } from "./work-relationships";
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
  useEffect(() => {
    const revealCitation = () => {
      const messageId = new URLSearchParams(location.hash.split('?')[1]).get('message');
      if (messageId) document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)?.scrollIntoView({ block: 'center' });
    };
    revealCitation();
    window.addEventListener('hashchange', revealCitation);
    return () => window.removeEventListener('hashchange', revealCitation);
  }, [detail.data]);
  function changed() {
    detail.refresh();
    onChanged();
  }
  if (detail.loading) return <Loading />;
  if (detail.error) return <ErrorNotice error={detail.error} retry={detail.refresh} />;
  if (!work) return null;
  const progress = detail.data?.progress ?? [];
  const rights=detail.data?.permissions;
  const taskReminder = (() => {
    try { return (JSON.parse(work.context_json || "{}") as { lifecycleTaskReminder?: RecordValue }).lifecycleTaskReminder; } catch { return undefined; }
  })();
  const sponsorReminder = (() => {
    try { return (JSON.parse(work.context_json || "{}") as { sponsorReminder?: RecordValue }).sponsorReminder; } catch { return undefined; }
  })();
  const access = (work as WorkRecord & { access?: string }).access,
    mine = [work.requester_id, work.beneficiary_id].includes(session.principal.userId);
  // A shared colleague or a manager has no member directory; the shared view names the person it is for.
  const forName = access && work.beneficiary_name ? work.beneficiary_name : requestFor(work, personName);
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
          <dd>{forName}</dd>
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
        {work.department_name&&<div><dt>Service workspace</dt><dd>{work.department_name}</dd></div>}
        <div>
          <dt>Requested by</dt>
          <dd>{work.requester_name ?? personName(work.requester_id)}</dd>
        </div>
        <div>
          <dt>Conversation assignee</dt>
          <dd>{work.assignee_name ?? personName(work.assignee_id)}</dd>
        </div>
        <div>
          <dt>Last changed</dt>
          <dd><time dateTime={work.updated_at ?? work.created_at}>{date(work.updated_at ?? work.created_at)}</time></dd>
        </div>
      </dl>
      {operator && <WorkClassification workId={work.id} onChanged={changed} />}
      {!access && session.principal.roles.some(r => ["owner", "operator"].includes(r)) && <WorkGroup key={`${work.id}:${work.revision}`} work={work} onChanged={changed} />}
      {!access && session.principal.roles.some(r => ["owner", "operator", "hr"].includes(r)) && <WorkScenarios work={work} onChanged={changed} />}
      {session.principal.roles.some(r => ["owner", "operator", "auditor"].includes(r)) && <WorkSla workId={work.id} />}
      {!access && <WorkFields workId={work.id} canEdit={operator} version={`${work.revision}:${work.updated_at ?? ""}`} />}
      {session.principal.roles.some(r => ["owner", "operator", "auditor"].includes(r)) && <WorkRelationships workId={work.id} messages={(detail.data?.messages ?? []) as never} onChanged={changed} />}
      {session.principal.roles.some(r => ["owner","operator"].includes(r)) && <RepairCoverage workId={work.id} />}
      {!access && work.sensitivity === "normal" && (mine || operator) && <WorkShares workId={work.id} canShare={mine} canRevoke />}
      {!mine && session.principal.roles.some(r => ['owner', 'operator'].includes(r)) && <WorkMail workId={work.id} />}
      {!access && work.sensitivity === 'normal' && session.principal.roles.includes('owner') && <WorkCollaboration workId={work.id} onChanged={changed} />}
      {!access && session.principal.roles.includes('owner')&&<WorkDepartment key={`${work.id}:${work.revision}`} work={work} onChanged={changed}/>}
      <WorkaroundSuggestions workId={work.id} />
      <RecurringTasks workId={work.id} />
      <Progress items={progress} exception={exception} operator={operator} />
      <HeldServices person={detail.data?.pendingPerson} services={detail.data?.heldServices} />
      <ErrorNotice error={detail.backgroundError} />
      <section className="agent-strip" aria-label="Linen">
        <h3>
          <Icon name="sparkle" size={20} />
          Linen
        </h3>
        <p className="agent-note">Linen reads each message against your catalog and services. Effects need a standing grant and are verified separately.</p>
        {access === "team"
          ? <Notice>You see this request because the person it is for reports to you. It is read-only: only the people it is shared with can reply.</Notice>
          : rights?.reply===false ? <Notice>Your department role gives read-only access to this conversation.</Notice> : <Composer workId={work.id} onSent={changed} privateReply={rights?.privateReply} attachmentAccess={rights?{public:rights.attachment,private:rights.privateAttachment}:undefined} />}
        {work.requester_id === session.principal.userId && !access && <AskForPerson workId={work.id} onChanged={changed} />}
        {access === "shared" && <Notice>Shared with you. You can read and reply to its public messages.</Notice>}
        <ConversationHistory conversation={detail.data!} />
      </section>
      {!access && (mine || operator) && <WorkOutcome key={work.id} work={work} onChanged={changed} pendingPerson={detail.data?.pendingPerson} />}
      <BundleProgress key={`bundle-${work.id}`} workId={work.id} />
      {sponsorReminder && work.beneficiary_id === session.principal.userId && <SponsorReattest context={sponsorReminder} onChanged={changed} />}
      {taskReminder && work.beneficiary_id === session.principal.userId && <LifecycleTaskReminder context={taskReminder} onChanged={changed} />}
      {operator && <WorkTime workId={work.id} />}
      {!access && rights?.participantTransition!==false && <WorkCommands work={work} onChanged={changed} operator={operator} transition={rights?.transition} />}
      <details className="evidence">
        <summary>Request identity & context</summary>
        <Facts entries={[["Visibility", work.sensitivity === "hr" ? "Restricted HR conversation" : "Request participants and permitted service team"], ["Requested by", work.requester_name ?? personName(work.requester_id)], ["For", forName], ...objectFacts(work.context_json)]} />
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
  const { session } = useSession(),
    cards: [string, string, string, string][] = [];
  // Decisions lists a catalog approval only for its holder, so only the holder is sent there.
  if (item.next.includes("decision holder") && item.ownerId === session.user.id) cards.push(["#/decisions", "approve", "Review catalog approvals", "Approve or decline it in Decisions."]);
  if (operator && item.next.includes("manager in People")) cards.push(["#/lifecycle", "users", "Record the manager", "Set who this person reports to in People."]);
  if (operator && item.next.includes("physical handoff")) cards.push(["#/assets", "laptop", "Devices & custody", "Record the physical handoff and its evidence."]);
  if (operator && /Connections & setup|budget/.test(item.next)) cards.push(["#/connections", "gear", "Connections & setup", "Review the model connection or budget."]);
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
      <WorkActivity conversation={conversation} />
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

function WorkCommands({ work, onChanged, operator, transition }: { work: WorkRecord; onChanged: () => void; operator: boolean; transition?:boolean }) {
  const [command, setCommand] = useState(""),
    mutation = useMutation(),
    members = useRemote<RecordValue[]>(operator ? "/members" : null),
    desk = useRemote<DeskSettings>(operator ? "/desk-settings" : transition ? `/work/${work.id}/command-options` : null),
    assignees = (members.data ?? []).filter((m) => m.active && /"(owner|operator)"/.test(text(m.roles_json))),
    { session } = useSession();
  // DESK-001: a assigns the open ticket to oneself; s opens the status change and c the close.
  useTriage(operator ? work.id : undefined, async (action) => {
    if (action === "status") setCommand(work.state === "paused" ? "resume" : "pause");
    if (action === "close") setCommand("close");
    if (action === "assign-self" && await mutation.mutate(`/work/${work.id}/commands`, { command: "assign", assigneeId: session.principal.userId, reason: "Assigned to self during triage", revision: work.revision }))
      onChanged();
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    if (!values.waitingOn) delete values.waitingOn;
    if (!values.statusId) delete values.statusId;
    if (!values.resolutionCode) delete values.resolutionCode;
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
        {(operator || transition) && (
          <details className="more-actions">
            <summary>Service controls</summary>
            <div className="button-row">
              {[...(operator?["assign"]:[]), work.state === "paused" ? "resume" : "pause", "close"].map((c) => (
                <button className="action secondary small" key={c} onClick={() => setCommand(c)}>
                  {c === "assign" ? "Assign…" : humanize(c)}
                </button>
              ))}
              {operator && <a href="#/operations">Effects, takeover & compensation</a>}
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
            {command === "reopen" ? "What is happening?" : command === "close" ? "Close notes" : "Reason"}
            <textarea name="reason" required rows={3} autoFocus />
          </label>
          {command === "close" && (
            <label>
              Resolution code{work.kind === "incident" ? " (required for an incident)" : ""}
              <select aria-label="Resolution code" name="resolutionCode" defaultValue="">
                <option value="">Choose…</option>
                {(desk.data?.resolutionCodes.codes ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          {command === "pause" && Boolean(desk.data?.statuses.length) && (
            <label>
              Status
              <select aria-label="Status" name="statusId" defaultValue="">
                <option value="">No named status</option>
                {desk.data!.statuses.map((s) => <option key={s.id} value={s.id}>{s.name}{s.waitingOn ? ` · waits on the ${s.waitingOn}` : ""}</option>)}
              </select>
            </label>
          )}
          {command === "pause" && (
            <label>
              Waiting on
              <select aria-label="Waiting on" name="waitingOn" defaultValue="">
                <option value="">Nobody outside the desk (SLA clock keeps running)</option>
                <option value="requester">The requester</option>
                <option value="vendor">A vendor</option>
              </select>
            </label>
          )}
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
