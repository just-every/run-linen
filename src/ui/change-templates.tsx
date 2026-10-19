import { useRemote, useSession } from './state';
import { ActionForm } from './forms';
import { NewChange } from './setup-change';
import { ErrorNotice, Loading, Notice } from './primitives';
import { text } from './api';
import type { DomainRecord } from './decisions';
export function ChangeTemplates() {
  const templates=useRemote<{items:DomainRecord[]}>('/change-templates'),{session}=useSession(),owner=session.principal.roles.includes('owner');
  return <details className="action-disclosure"><summary>Standard change templates</summary><section aria-label="Standard change templates">
    <p>Owner-preapproved versions let standard changes skip CAB. Every effect still needs its own current execution grant.</p>
    <ErrorNotice error={templates.error}/>{templates.loading?<Loading/>:templates.data?.items.map(r=><article className="connection-record" key={`${r.id}:${r.revision}`}>
      <h3>{text(r.data.title)}</h3><p>Version {r.data.version} · {r.data.active?'active':'inactive'} · {r.data.approval?.version===r.data.version?'preapproved':'needs owner preapproval'}</p>
      {['implementationPlan','testPlan','backoutPlan'].map((name,i)=><section key={name}><h4>{['Implementation plan','Test plan','Backout plan'][i]}</h4><p>{text(r.data[name])}</p></section>)}
      {r.data.approval&&<p>Preapproval reason: {text(r.data.approval.reason)}</p>}
      {owner&&<><NewChange templateMode templateRecord={r} onSaved={templates.refresh}/>
        <ActionForm title={`Preapprove version ${r.data.version} of ${text(r.data.title)}`} path={`/change-templates/${r.id}/approve`}
          defaults={{revision:r.revision,version:r.data.version}} fields={[{name:'reason',label:'Preapproval reason and scope',type:'textarea',required:true}]}
          explanation="Preapproval covers this exact template version and skips CAB. It creates no execution grant. Editing stops new requests using that version. Existing unchanged changes retain their recorded approval until it is explicitly withdrawn." onSaved={templates.refresh}/>
        {[...(r.data.priorApprovals||[]),...(r.data.approval?[r.data.approval]:[])].filter(a=>!a.inert).map((a:any)=>{
          const withdrawal=(r.data.withdrawals||[]).find((w:any)=>w.approvalId===a.id);
          return <section key={a.id}><p>Recorded preapproval for version {a.version}: {text(a.reason)}</p>{withdrawal?<Notice>Approval withdrawn: {text(withdrawal.reason)}</Notice>:<ActionForm
            title={`Withdraw approval for version ${a.version}`} path={`/change-templates/${r.id}/withdraw`} defaults={{revision:r.revision,approvalId:a.id}}
            fields={[{name:'reason',label:'Withdrawal reason',type:'textarea',required:true}]} explanation="This withdraws this exact recorded approval from existing changes too. Provider execution grants remain separate." onSaved={templates.refresh}/>}</section>;
        })}</>}
    </article>)}
    {!templates.loading&&!templates.data?.items.length&&<Notice>No standard change templates are recorded.</Notice>}
    {owner&&<NewChange templateMode onSaved={templates.refresh}/>}
  </section></details>;
}
