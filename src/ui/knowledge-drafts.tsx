import { useRemote, useSession } from './state';
import { useEffect, useState } from 'react';
import { ActionForm } from './forms';
import { Badge, ErrorNotice, Facts, Loading } from './primitives';
import { date, request } from './api';

interface Draft {
  id:string;state:string;revision:number;title:string;body:string;articleId:string|null;
  generatedAt:string|null;modelName:string|null;reviewedAt:string|null;rejectionReason:string|null;
  sources:{id:string;type:string;title:string;content:string;citation:string;href:string}[];
}
interface Connection { id:string;name:string;provider:string;status:string; }
export function KnowledgeDrafts({onPublished}:{onPublished:()=>void}) {
  const {session}=useSession();
  const authorized=session.principal.roles.some(r=>['owner','operator'].includes(r));
  return authorized?<DraftReview onPublished={onPublished}/>:null;
}
function DraftReview({onPublished}:{onPublished:()=>void}) {
  const {session}=useSession(),[discoveryError,setDiscoveryError]=useState<unknown>(null);
  const drafts=useRemote<{items:Draft[]}>('/knowledge-drafts'),connections=useRemote<Connection[]>('/connections');
  useEffect(()=>{
    let active=true;
    request('/knowledge-drafts/detect',{method:'POST',csrf:session.csrfToken,body:{}})
      .then(()=>{if(active)drafts.refresh();}).catch(error=>{if(active)setDiscoveryError(error);});
    return()=>{active=false;};
  },[session.csrfToken,drafts.refresh]);
  const models=(connections.data||[]).filter(c=>c.provider==='openai'&&c.status==='active');
  const refresh=()=>{drafts.refresh();onPublished();};
  return <section aria-label="Knowledge drafts">
    <h2>Knowledge drafts</h2>
    <ErrorNotice error={discoveryError}/>
    <p>Resolved tickets with matching recorded context and reviewed known errors can suggest reusable guidance. Check the sources, then choose whether to generate and publish an article.</p>
    <ActionForm title="Find knowledge candidates" path="/knowledge-drafts/detect" fields={[]} submit="Find candidates" onSaved={drafts.refresh}
      explanation="This checks eligible public messages from resolved normal-sensitivity tickets and reviewed known errors. Finding candidates does not call a model. Rejected groups remain rejected."/>
    {drafts.loading?<Loading/>:drafts.error?<ErrorNotice error={drafts.error} retry={drafts.refresh}/>:<>
      {!drafts.data?.items.length&&<p>No current knowledge candidate is available within your source permissions.</p>}
      {drafts.data?.items.map(draft=><article className="connection-record" key={`${draft.id}:${draft.revision}`} aria-label={`${draft.title} knowledge draft`}>
        <h3>{draft.title}</h3><Badge value={draft.state}/>
        <Facts entries={[["Sources",draft.sources.length],["Generated",date(draft.generatedAt)],["Model",draft.modelName||'Not generated'],["Reviewed",date(draft.reviewedAt)]]}/>
        {draft.body&&<p className="detail-prose">{draft.body}</p>}
        <details><summary>Review source evidence</summary><ul>{draft.sources.map(source=><li key={source.citation}>
          <a href={source.href}>{source.title}</a> · {source.type==='ticket'?'Resolved ticket':'Reviewed known error'}
          <p className="detail-prose">{source.content}</p>
        </li>)}</ul></details>
        {draft.state==='candidate'&&<>
          <ErrorNotice error={connections.error}/>
          {!connections.loading&&!models.length&&<p>Configure an active model connection and intelligence budget in Connections before generating.</p>}
          <ActionForm title={`Generate ${draft.title}`} path={`/knowledge-drafts/${draft.id}/generate`} defaults={{revision:draft.revision,generate:true}}
            fields={[{name:'connectionId',label:'Configured model',type:'select',required:true,options:models.map(model=>({value:model.id,label:model.name}))}]}
            submit="Generate draft" onSaved={drafts.refresh} explanation="This explicit action sends only eligible source content to your selected model and uses the configured intelligence budget. The result stays unpublished until reviewed."/>
        </>}
        {draft.state==='generating'&&<p>Generation was requested. Refresh to see its result. No article is published while generation is pending.</p>}
        {draft.state==='draft'&&<ActionForm title={`Review and publish ${draft.title}`} path={`/knowledge-drafts/${draft.id}/publish`} defaults={{revision:draft.revision}}
          fields={[
            {name:'title',label:'Article title',value:draft.title,required:true},
            {name:'body',label:'Reviewed guidance and limitations',type:'textarea',value:draft.body,required:true},
            {name:'scope',label:'Audience',type:'select',required:true,options:[{value:'employees',label:'Employees'},{value:'operators',label:'Service operators'}]},
            {name:'expiresAt',label:'Review expiry',type:'datetime-local',required:true},
            {name:'review',label:'I reviewed the guidance and every linked source',type:'checkbox',required:true},
          ]} submit="Publish reviewed article" onSaved={refresh} explanation="Publication rechecks every source. A reopened, changed, erased or inaccessible source prevents publication."/>}
        {['candidate','draft','generating'].includes(draft.state)&&<ActionForm title={`Reject ${draft.title}`} path={`/knowledge-drafts/${draft.id}/reject`} defaults={{revision:draft.revision}}
          fields={[{name:'reason',label:'Why reject this knowledge candidate?',type:'textarea',required:true}]} submit="Keep rejection" onSaved={drafts.refresh}/>}
        {draft.state==='rejected'&&<p>{draft.rejectionReason}</p>}
        {draft.state==='published'&&<p>Published as reviewed knowledge. Current source permissions and review expiry still apply.</p>}
      </article>)}
    </>}
  </section>;
}
