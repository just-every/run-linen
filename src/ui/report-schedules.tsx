import { useState, type FormEvent } from 'react';
import { date } from './api';
import { useMutation, useRemote } from './state';
import { Badge, ErrorNotice, Facts, Loading, Notice } from './primitives';
import type { ReportMember } from './report-types';

interface Schedule { id: string; recipientId: string; frequency: string; nextAt: string; active: boolean | number; revision: number; }
interface Delivery { id: string; schedule_id: string; state: string; provider_ref: string | null; row_count: number | null; error: string | null; created_at: string; finished_at: string | null; }

export function ReportSchedules({ reportId, members }: { reportId: string; members: ReportMember[] }) {
  const path = `/reports/custom/${encodeURIComponent(reportId)}/schedules`;
  const schedules = useRemote<{ items: Schedule[]; deliveries: Delivery[] }>(path), save = useMutation();
  const [channel, setChannel] = useState('email');
  async function toggle(schedule: Schedule) {
    if (await save.mutate(`/reports/schedules/${encodeURIComponent(schedule.id)}`, { revision: schedule.revision, active: !schedule.active })) schedules.refresh();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, values = new FormData(form);
    const result = await save.mutate(path, { channel, recipientUserId: values.get('recipient'), frequency: values.get('frequency'), consent: values.has('consent') });
    if (result) { form.reset(); schedules.refresh(); }
  }
  return <section aria-label="Report schedules">
    <h4>Scheduled delivery</h4>
    <ErrorNotice error={save.error}/>
    {schedules.loading ? <Loading label="Reading report schedules…"/> : <ErrorNotice error={schedules.error} retry={schedules.refresh}/>}
    {schedules.data && <>
      {schedules.data.items.length ? schedules.data.items.map(schedule => <article key={schedule.id}>
        <p><strong>{schedule.frequency === 'weekly' ? 'Weekly' : 'Nightly'} email</strong> · {members.find(member => member.id === schedule.recipientId)?.name ?? 'Selected report reader'} · {schedule.active ? 'Active' : 'Paused'}</p>
        <p>Next scheduled: {date(schedule.nextAt)}.</p>
        <button className="action secondary small" disabled={save.pending} onClick={() => void toggle(schedule)}>{schedule.active ? 'Pause' : 'Resume'} email schedule</button>
      </article>) : <p>No delivery schedule saved.</p>}
      {schedules.data.deliveries.length ? <details className="evidence"><summary>Email delivery records ({schedules.data.deliveries.length})</summary>
        {schedules.data.deliveries.map(delivery => <article key={delivery.id}>
          <Badge value={delivery.state}/><Facts entries={[["Created", date(delivery.created_at)], ["Finished", date(delivery.finished_at)], ["Rows", delivery.row_count], ["Provider reference", delivery.provider_ref], ["Remaining issue", delivery.error]]}/>
        </article>)}
      </details> : <p>No email delivery recorded. A saved schedule is not a delivery receipt.</p>}
    </>}
    <details className="action-disclosure"><summary>Schedule this report</summary>
      <form className="inline-form" aria-label="Schedule report" onSubmit={submit}>
        <div className="field-grid">
          <label>Delivery channel<select value={channel} onChange={event => setChannel(event.target.value)}><option value="email">Email</option><option value="slack">Slack</option></select></label>
          <label>Delivery frequency<select name="frequency" defaultValue="weekly"><option value="weekly">Weekly</option><option value="nightly">Nightly</option></select></label>
        </div>
        {channel === 'slack' ? <Notice>Slack report delivery is not available in this version. Choose email or download the report.</Notice> : <>
          <label>Email recipient<select name="recipient" required defaultValue=""><option value="">Choose a report reader</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label>
          <p>Reports run at midnight UTC using the recipient's current source permissions. Email delivery needs a configured SendGrid sender; provider acceptance does not confirm inbox delivery.</p>
          <label className="checkbox-field"><input type="checkbox" name="consent" required/><span>I authorize recurring report emails to this recipient.</span></label>
        </>}
        <button className="action primary" disabled={save.pending || channel === 'slack'}>Save delivery schedule</button>
      </form>
    </details>
    {schedules.data && <button className="action secondary small" onClick={schedules.refresh}>Refresh delivery records</button>}
  </section>;
}
