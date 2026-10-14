import { useState } from 'react';
import { ActionForm } from './forms';
import { useRemote } from './state';
import { ErrorNotice, Evidence, Notice } from './primitives';
import type { RecordValue } from './api';

export function AdoptionChoices() {
  const retention = useRemote<RecordValue>('/adoption/retention');
  const [ownership, setOwnership] = useState<RecordValue | null>(null);
  return <section>
    <h2>Choose who runs what, and where backups live</h2>
    <Notice>Reading your existing desk tells Linen what is there. Decide separately who may act, how long private backups are kept, and who holds the recovery files and encryption key.</Notice>
    <ErrorNotice error={retention.error} />
    {retention.data && <ActionForm title="Choose private archive retention" path="/adoption/retention" method="PUT"
      defaults={{revision:retention.data.revision}}
      fields={[{name:'archiveDays',label:'Days to retain private export and import archives',type:'number',required:true,value:Number(retention.data.archive_days ?? retention.data.archiveDays ?? 30)}]}
      explanation="This policy governs private archive copies. It does not erase the service history or establish a provider’s retention policy."
      onSaved={retention.refresh} />}
    <ActionForm title="Choose who runs one action" path="/adoption/ownership"
      fields={[
        {name:'resource',label:'What would change',required:true,hint:'Name the connection, the item and the person the change is for.'},
        {name:'action',label:'Action Linen may take',required:true},
        {name:'sourceId',label:'Existing desk, if it still does this',hint:'Leave empty when Linen is the only desk.'},
        {name:'sourceTicketId',label:'Ticket number in the existing desk',type:'number'},
        {name:'approvalId',label:'Approval group number in the existing desk',type:'number'},
        {name:'incumbentDisabledEvidence',label:'Proof the existing desk no longer does this',type:'textarea'},
        {name:'expectedRevision',label:'Version of the choice you are replacing',type:'number'},
      ]}
      explanation="A brand-new desk has nothing to switch off. When you run beside another desk, Linen reads that desk and its approval and asks for proof it has stopped doing this. A competing choice has to replace the current version. Choosing who runs an action does not give Linen permission to take it."
      onSaved={setOwnership} />
    {ownership && <Evidence title="Recorded choice" value={ownership} />}
    <p>Create a portable snapshot below for whoever keeps your recovery files. Its summary and private files need the encryption key you keep. Restoring history leaves in-progress work on hold until you confirm what really happened.</p>
  </section>;
}
