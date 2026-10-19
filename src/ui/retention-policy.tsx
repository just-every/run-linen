import { useState } from 'react';
import { ActionForm } from './forms';
import { useRemote } from './state';
import { ErrorNotice, Notice } from './primitives';
import { date, text, type RecordValue } from './api';

/** RETENTION-001: preview what a ticket/attachment policy deletes, then confirm those exact counts to save it. */
export function RetentionPolicy() {
  const policy = useRemote<RecordValue>('/work/retention');
  const receipts = useRemote<{ receipts: RecordValue[]; skipped: RecordValue[] }>('/work/retention/receipts');
  const [preview, setPreview] = useState<{ values: RecordValue; counts: RecordValue } | null>(null);
  const p = policy.data;
  const kept = (v: unknown) => v === null || v === undefined ? 'Keep (no retention set)' : `${text(v)} days after closing`;
  return <section aria-label="Ticket retention">
    <h3>Ticket and attachment retention</h3>
    <ErrorNotice error={policy.error} />
    {p && <Notice>Closed tickets: {kept(p.closedTicketDays)}. Attachments of closed tickets: {kept(p.attachmentDays)}. Age counts from when the ticket closed; open tickets are never deleted.</Notice>}
    {p && <ActionForm title="Preview ticket retention" path="/work/retention/preview" submit="Preview deletions" savedNotice="Preview only. Nothing is saved or deleted until you confirm below."
      fields={[
        { name: 'closedTicketDays', label: 'Days to keep closed tickets', type: 'number', hint: 'Whole days, 1 to 3650. Leave empty to keep.' },
        { name: 'attachmentDays', label: 'Days to keep attachments of closed tickets', type: 'number', hint: 'Whole days, 1 to 3650. Leave empty to keep.' },
      ]}
      transform={values => { setPreview(null); return values; }}
      onSaved={counts => setPreview({ values: counts, counts })} />}
    {p && preview && <>
      <Notice tone="warning">The next run would delete {text(preview.counts.tickets)} closed tickets and {text(preview.counts.attachments)} attachments. Deleted records keep only a receipt.</Notice>
      <ActionForm title="Confirm and save retention" path="/work/retention" method="PUT" open submit="Confirm deletions and save"
        defaults={{ revision: p.revision, closedTicketDays: preview.counts.closedTicketDays ?? null, attachmentDays: preview.counts.attachmentDays ?? null, confirmDeletions: { tickets: preview.counts.tickets, attachments: preview.counts.attachments } }}
        fields={[]} onSaved={() => { setPreview(null); policy.refresh(); }} />
    </>}
    <ErrorNotice error={receipts.error} />
    {receipts.data && <details className="action-disclosure">
      <summary>Deletion receipts ({receipts.data.receipts.length})</summary>
      <ul>{receipts.data.receipts.map(r => <li key={text(r.id)}>{text(r.kind)} {text(r.record_hash).slice(0, 12)} · closed {date(r.closed_at)} · deleted {date(r.deleted_at)} · {text(r.policy_days)}-day policy revision {text(r.policy_revision)} · {text(r.attachments)} attachments</li>)}</ul>
      {receipts.data.skipped.length > 0 && <p>Held back: {receipts.data.skipped.map(s => `${text(s.ticket_hash).slice(0, 12)} (${text(s.reason)})`).join(', ')}</p>}
    </details>}
  </section>;
}
