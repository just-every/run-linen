import { ServiceNotices } from './service-notices';
import { RecurringWork } from './recurring-work';
import { TeamRequests, managerDisclosure } from "./work-shares";
import { Bundles } from "./bundles";
import { useEffect } from "react";
import { useSession } from "./state";
import type { RecordValue } from "./api";
import { Icon } from "./icons";
import { Composer } from "./work-composer";
import { useQueue } from "./queue";
import { Queue } from "./work-queue";
import { RequestDetail } from "./work-detail";
import { progressException } from "./request-facts";
import type { HeldService, PendingPerson } from "./pending-people";
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
  requester_name?: string;
  assignee_name?: string;
  created_at: string;
  updated_at?: string;
  context_json?: string;
  pending_person_id?: string | null;
  beneficiary_name?: string;
  /** The same progress the open request reads; empty when nothing is outstanding. */
  progress?: RequestProgress[];
  /** Catalog services recorded on the request. */
  services?: { name: string; kind: string }[];
  attention?: RequestProgress[];
  /** DESK-001: the accountable group and the classified priority, listed for agents only. */
  group_id?: string | null;
  group_name?: string | null;
  priority?: string | null;
}
export interface RequestProgress { needsAction?: boolean; title?: string; dueAt?: string; state: string; happened: string; next: string; ownerId: string | null; ownerLabel: string; }
export interface Conversation {
  pendingPerson?: PendingPerson | null;
  heldServices?: HeldService[];
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
/** Today as the workbench's title row reads it: "Mon Oct 19, 2026". */
function today() {
  const parts = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).formatToParts(new Date());
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("weekday")} ${part("month")} ${part("day")}, ${part("year")}`;
}

/** The Requests workbench (app pick): the queue on the left, the open request or a new one on the right. */
export function WorkSpace({ selectedId }: { selectedId?: string }) {
  const queue = useQueue(),
    { session } = useSession();
  // Arriving at the app itself (no address within it) on a screen wide enough for both columns, the
  // workbench opens the newest request with an exception, as the queue's first row needing attention.
  useEffect(() => {
    if (selectedId || location.hash || !matchMedia("(min-width: 1241px)").matches) return;
    const first = queue.data?.items.find((item) => progressException(item.progress));
    if (first) location.replace(`#/work/${first.id}`);
  }, [queue.data, selectedId]);
  return (
    <div className={`workbench ${selectedId ? "has-selection" : ""}`}>
      <div className="workbench-head">
        <h1>Requests</h1>
        <time dateTime={new Date().toISOString().slice(0, 10)}>{today()}</time>
        {selectedId && (
          <a className="action primary small new-request-link" href="#/work">
            <Icon name="plus" size={16} />
            New request
          </a>
        )}
      </div>
      <div className="workbench-queue">
        <RecurringWork />
        <Queue selectedId={selectedId} />
        <TeamRequests />
      </div>
      <div className="workbench-detail">
        <ServiceNotices />
        {selectedId ? (
          <RequestDetail key={selectedId} selectedId={selectedId} onChanged={queue.refresh} />
        ) : (
          <>
            <section className="new-request" aria-label="A new request">
              <span className="eyebrow">{session.workspace.name}</span>
              <Composer onSent={queue.refresh} />
              <p className="meta-sub">{managerDisclosure}</p>
            </section>
            <Bundles onRequested={queue.refresh} />
            <section className="decision-card">
              <Icon name="approve" size={24} />
              <div>
                <h2>Needs your decision</h2>
                <p>Real choices and missing authority live here. Silence never counts as approval.</p>
              </div>
              <a className="action secondary small" href="#/decisions">View your decisions</a>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
