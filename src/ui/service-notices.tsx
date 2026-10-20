import { useRemote, useSession } from './state';
import { ActionForm } from './forms';
import { Badge, ErrorNotice, Notice } from './primitives';
import { date, text, type RecordValue } from './api';
import type { EmployeeNotice } from '../features/services/employee-notices';
import type { DomainRecord } from './decisions';

/** CHANNEL-008: reuse the installed app's notice and action primitives. */
export function ServiceNotices() {
  const remote = useRemote<{items: RecordValue[]}>('/service-notices', 10000);
  return <section aria-label="Service notices">
    <ErrorNotice error={remote.error ?? remote.backgroundError} retry={remote.refresh} />
    {!(remote.error || remote.backgroundError) && remote.data?.items.map(n => <Notice key={text(n.id)}>
      <strong>{n.state === 'all-clear' ? 'All-clear' : 'Service notice'} · {text(n.cohort)}</strong>
      <p>{text(n.message)}</p>
      {n.state === 'all-clear' ? <small>Recovery recorded by {text(n.verifiedBy)} · {date(n.verifiedAt)}</small>
        : <small>Updated {date(n.updatedAt)} · Next update {date(n.nextUpdateAt)}</small>}
    </Notice>)}
  </section>;
}
export function NoticeControls({ record, section }: { record: DomainRecord; section: string }) {
  const { session } = useSession(), base = `/${section}/${record.id}/notices`;
  const remote = useRemote<{revision:number;items:EmployeeNotice[];groups:{id:string;name:string}[]}>(base, 10000);
  const connections = useRemote<RecordValue[]>('/connections');
  const defaults = { revision: remote.data?.revision ?? record.revision };
  return <section aria-label="Employee service notices">
    <h2>Employee service notices</h2>
    <p>Only current members of the chosen requester group who can read this source and its services receive the notice.</p>
    <ErrorNotice error={remote.error ?? remote.backgroundError} retry={remote.refresh} />
    {remote.data && <>
      <ActionForm title="Publish a service notice" path={base} defaults={defaults} submit="Publish notice" onOpen={remote.refresh} onSaved={remote.refresh}
        explanation="The portal shows the message. Optional email carries only a generic notice and a sign-in link. Slack and Teams delivery are not available."
        fields={[
          {name:'groupId',label:'Requester group',type:'select',required:true,options:remote.data.groups.map(g=>({value:g.id,label:g.name}))},
          {name:'message',label:'Notice for this cohort',type:'textarea',required:true},
          {name:'cadenceMinutes',label:'Update cadence in minutes',type:'number',value:30,required:true},
          {name:'emailConnectionId',label:'Email connection (optional)',type:'select',options:connections.data?.filter(c=>c.provider==='sendgrid'&&c.status==='active').map(c=>({value:text(c.id),label:text(c.name)}))},
        ]} />
      {remote.data.items.map(n=><div className="connection-record" key={n.id}>
        <Badge value={n.state} /><p>{text(n.message)}</p>
        <small>{remote.data!.groups.find(g=>g.id===n.groupId)?.name} · Updated {date(n.updatedAt)}{n.nextUpdateAt ? ` · Next update ${date(n.nextUpdateAt)}` : ''}</small>
        {n.state==='open' && <>
          <ActionForm title="Update this service notice" path={`${base}/${n.id}/update`} defaults={defaults} onSaved={remote.refresh}
            fields={[{name:'message',label:'Updated notice',type:'textarea',value:n.message,required:true}]} />
          <ActionForm title="Record verified recovery and publish all-clear" path={`${base}/${n.id}/all-clear`} defaults={defaults} onSaved={remote.refresh}
            explanation="The source must already have independently verified recovery. This all-clear is retained until you withdraw it."
            fields={[{name:'message',label:'All-clear notice',type:'textarea',required:true},{name:'verification',label:'Recovery verification reference',required:true}]} />
        </>}
        {n.state!=='withdrawn' && (!n.verifiedBy || n.verifiedBy===session.principal.userId) && <ActionForm title="Withdraw this notice" path={`${base}/${n.id}/withdraw`} defaults={defaults} fields={[]} onSaved={remote.refresh} submit="Withdraw notice" />}
      </div>)}
    </>}
  </section>;
}
