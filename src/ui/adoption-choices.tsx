import { useState } from 'react';
import { ActionForm } from './forms';
import { useRemote } from './state';
import { ErrorNotice, Evidence, Notice } from './primitives';
import type { RecordValue } from './api';

export function AdoptionChoices() {
  const retention = useRemote<RecordValue>('/adoption/retention');
  const [ownership, setOwnership] = useState<RecordValue | null>(null);
  return <section>
    <h2>Choose custody and execution responsibility</h2>
    <Notice>Directory discovery establishes source facts. Decide separately who may execute, how long private archives remain, and who holds the recovery files and encryption key.</Notice>
    <ErrorNotice error={retention.error} />
    {retention.data && <ActionForm title="Choose private archive retention" path="/adoption/retention" method="PUT"
      defaults={{revision:retention.data.revision}}
      fields={[{name:'archiveDays',label:'Days to retain private export and import archives',type:'number',required:true,value:Number(retention.data.archive_days ?? retention.data.archiveDays ?? 30)}]}
      explanation="This policy governs private archive copies. It does not erase the service history or establish a provider’s retention policy."
      onSaved={retention.refresh} />}
    <ActionForm title="Review one execution owner" path="/adoption/ownership"
      fields={[
        {name:'resource',label:'Exact effect resource',required:true,hint:'Use the connection, target and provider beneficiary of the intended effect.'},
        {name:'action',label:'Exact permitted action',required:true},
        {name:'sourceId',label:'Incumbent source identity, when coexisting'},
        {name:'sourceTicketId',label:'Incumbent ticket number',type:'number'},
        {name:'approvalId',label:'Incumbent approval group number',type:'number'},
        {name:'incumbentDisabledEvidence',label:'Evidence that the incumbent executor is disabled',type:'textarea'},
        {name:'expectedRevision',label:'Reviewed existing ownership revision',type:'number'},
      ]}
      explanation="A greenfield resource has no incumbent source. For coexistence, Linen reads the current source and approval and requires actual disablement evidence. A competing claim must reconcile the current revision. Ownership supplies no execution grant."
      onSaved={setOwnership} />
    {ownership && <Evidence title="Recorded ownership fence" value={ownership} />}
    <p>Create a portable snapshot below for the chosen recovery custodian. Its manifest and private chunks need the retained encryption key. Restoring history keeps execution held until current effects are reconciled.</p>
  </section>;
}
