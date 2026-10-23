import { useState } from 'react';
import { useRemote, useSession, useMutation } from './state';
import { ActionForm } from './forms';
import { ErrorNotice, Facts, Notice } from './primitives';
import type { RecordValue } from './api';
import { humanize } from './api';
interface Config {events:string[];channels:string[];placeholders:string[];rules:RecordValue[];templates:RecordValue[]}
export function NotificationSettings() {
 const {session}=useSession(),owner=session.principal.roles.includes('owner'),config=useRemote<Config>(owner?'/notification-config':null),prefs=useRemote<{items:RecordValue[];language:string;events:string[];channels:string[]}>('/notification-preferences'),inbox=useRemote<{items:RecordValue[]}>('/notification-inbox'),history=useRemote<{templates:RecordValue[];rules:RecordValue[];changes:RecordValue[]}>(owner?'/notification-history':null);
 const branding=useRemote<{branding:RecordValue|null}>(owner?'/notification-branding':null),connections=useRemote<RecordValue[]>(owner?'/connections':null);
 const departments=useRemote<{items:RecordValue[]}>(owner?'/departments/admin':null);
 const members=useRemote<RecordValue[]>(owner?'/members':null),groups=useRemote<{items:RecordValue[]}>(owner?'/work-groups':null),templates=config.data?.templates??[];
 const [templateId,setTemplateId]=useState(''),[recipientType,setRecipientType]=useState('person'),[preview,setPreview]=useState<RecordValue|null>(null),mutation=useMutation();
 const template=templates.find(t=>t.id===templateId);
 const events=(config.data?.events??prefs.data?.events??['ticket.public_update','approval.requested','ticket.waiting_on_you','security.task','leaver.task']).map(value=>({value,label:humanize(value)}));
 function refresh(){config.refresh();history.refresh();prefs.refresh();inbox.refresh();branding.refresh()}
 return <section aria-label="Notification rules and preferences" className="stack">
  <h2>Rules, templates & preferences</h2>
  <Notice>Mandatory approval, waiting-on-you, security and leaver messages remain enabled. Subscribable updates follow each person’s preferences and current record access.</Notice>
  <ErrorNotice error={config.error??prefs.error??inbox.error}/>
  <ActionForm title="Your notification preferences" path="/notification-preferences" fields={[{name:'event',label:'Notification event',type:'select',options:events,required:true},{name:'channel',label:'Notification channel',type:'select',options:[{value:'portal',label:'In Linen'},{value:'email',label:'Email'}],required:true},{name:'enabled',label:'Receive this subscribable update',type:'checkbox',value:true}]} submit="Save preference" onSaved={refresh}/>
  {(prefs.data?.items??[]).map((p,i)=><p key={i}>{humanize(String(p.event))} · {String(p.channel)} · {p.enabled?'Enabled':'Opted out'}</p>)}
  {owner&&<>
   <label><span>Edit an existing template</span><select value={templateId} onChange={e=>setTemplateId(e.target.value)}><option value="">New template</option>{templates.map(t=><option key={String(t.id)} value={String(t.id)}>{String(t.name)} · v{String(t.revision)}</option>)}</select></label>
   <ActionForm key={String(template?.revision??'new')+templateId} title={template?'Edit notification template':'New notification template'} path="/notification-templates" defaults={{id:template?.id,revision:template?.revision??0}} fields={[{name:'name',label:'Template name',required:true,value:String(template?.name??'')},{name:'language',label:'Template language',required:true,value:String(template?.language??'en-US')},{name:'subject',label:'Subject',required:true,value:String(template?.subject??'')},{name:'body',label:'Message text',type:'textarea',required:true,value:String(template?.body??'')},{name:'reason',label:'Reason for this change',required:true}]} explanation={`Available placeholders: ${(config.data?.placeholders??[]).map(p=>'{{'+p+'}}').join(', ')}`} submit="Save notification template" onSaved={r=>{setTemplateId(String(r.id??''));refresh()}}/>
   {template&&<ActionForm title="Preview with a ticket" path={`/notification-templates/${template.id}/preview`} fields={[{name:'workId',label:'Ticket ID',required:true}]} submit="Preview template" onSaved={setPreview} savedNotice="Preview generated. No message sent."/>}
   {preview&&<Notice><strong>{String(preview.subject)}</strong><p>{String(preview.body)}</p>{Boolean(preview.html)&&<iframe title="Branded message preview" sandbox="" srcDoc={String(preview.html)} style={{width:"100%",height:260,border:0}}/>}</Notice>}
   <label><span>Rule recipient type</span><select value={recipientType} onChange={e=>setRecipientType(e.target.value)}>{[['person','Named person'],['role','Workspace role'],['group','Group members'],['group_lead','Group lead'],['field','Ticket role']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   <ActionForm key={recipientType} title="Add a notification rule" path="/notification-rules" defaults={{revision:0}} fields={[
    {name:'name',label:'Rule name',required:true},{name:'event',label:'When this happens',type:'select',required:true,options:events},
    {name:'priority',label:'Priority condition',type:'select',options:[{value:'',label:'Any priority'},...['P1','P2','P3','P4'].map(value=>({value,label:value}))]},
    {name:'departmentId',label:'Department condition',type:'select',options:[{value:'',label:'Any department'},...(departments.data?.items??[]).map(d=>({value:String(d.id),label:String(d.name)}))]},
    {name:'groupId',label:'Group condition',type:'select',options:[{value:'',label:'Any group'},...(groups.data?.items??[]).map(g=>({value:String(g.id),label:String(g.name)}))]},
    {name:'recipient',label:'Send to',type:'select',required:true,options:recipientType==='person'?(members.data??[]).map(m=>({value:String(m.id),label:String(m.name)})):recipientType==='role'?['owner','operator','hr','auditor','approver','employee'].map(value=>({value,label:humanize(value)})):recipientType==='field'?['requester','beneficiary','assignee'].map(value=>({value,label:humanize(value)})):(groups.data?.items??[]).map(g=>({value:String(g.id),label:String(g.name)}))},
    {name:'templateId',label:'Use template',type:'select',required:true,options:templates.map(t=>({value:String(t.id),label:String(t.name)}))},
    {name:'channel',label:'Deliver by',type:'select',required:true,options:[{value:'portal',label:'In Linen'},{value:'email',label:'Email'}]},
    {name:'connectionId',label:'Verified email connection',type:'select',options:[{value:'',label:'Choose for email delivery'},...(connections.data??[]).filter(c=>c.provider==='sendgrid'&&c.status==='active').map(c=>({value:String(c.id),label:String(c.name)}))]},
    {name:'mandatory',label:'Mandatory notification',type:'checkbox'},{name:'enabled',label:'Enable this rule',type:'checkbox',value:true},{name:'consent',label:'I authorize this rule and its recipients',type:'checkbox',required:true},{name:'reason',label:'Reason for this rule',required:true}
   ]} transform={v=>({revision:0,name:v.name,event:v.event,conditions:{...(v.departmentId?{departmentId:v.departmentId}:{}),...(v.priority?{priority:v.priority}:{}),...(v.groupId?{groupId:v.groupId}:{})},recipients:[{type:recipientType,value:v.recipient}],templateId:v.templateId,channel:v.channel,connectionId:v.connectionId||undefined,mandatory:v.mandatory,enabled:v.enabled,consent:v.consent,reason:v.reason})} submit="Save notification rule" onSaved={refresh}/>
   {(config.data?.rules??[]).map(r=><section key={String(r.id)} className="connection-record"><h3>{String(r.name)}</h3><Facts entries={[["Event",r.event],["Version",r.revision],["Channel",r.channel],["Enabled",r.enabled],["Mandatory",r.mandatory]]}/><ActionForm title="Send yourself a test" path={`/notification-rules/${r.id}/test`} defaults={{idempotencyKey:'new-test'}} fields={[{name:'workId',label:'Ticket ID for test',required:true},{name:'consent',label:'Send this test to me',type:'checkbox',required:true},{name:'reason',label:'Reason for test',required:true}]} submit="Send test notification" onSaved={refresh}/><button className="text-button" disabled={mutation.pending} onClick={async()=>{await mutation.mutate('/notification-rules',{...r,revision:r.revision,conditions:r.conditions,recipients:r.recipients,templateId:r.templateId,mandatory:Boolean(r.mandatory),enabled:false,consent:false,reason:'Disabled by owner from notification settings'});refresh()}}>Disable rule</button></section>)}
   <ErrorNotice error={mutation.error}/>
   <ActionForm key={String(branding.data?.branding?.revision??0)} title="Notification branding" path="/notification-branding" defaults={{revision:branding.data?.branding?.revision??0}} fields={[
    {name:'logoUrl',label:'Buyer logo · HTTPS URL',value:String(branding.data?.branding?.logoUrl??'')},
    {name:'primaryColor',label:'Brand color · hex',required:true,value:String(branding.data?.branding?.primaryColor??'#23483B')},
    {name:'textColor',label:'Text color · hex',required:true,value:String(branding.data?.branding?.textColor??'#17251D')},
    {name:'senderConnectionId',label:'Verified sender connection',type:'select',options:[{value:'',label:'No email branding'},...(connections.data??[]).filter(c=>c.provider==='sendgrid'&&c.status==='active').map(c=>({value:String(c.id),label:String(c.name)}))]},
    {name:'consent',label:'I authorize this notification branding',type:'checkbox',required:true},{name:'reason',label:'Reason for branding change',required:true}
   ]} transform={v=>({...v,logoUrl:v.logoUrl||null,senderConnectionId:v.senderConnectionId||null})} submit="Save notification branding" onSaved={refresh}/>
   {Boolean(branding.data?.branding?.senderDomain)&&<p>Verified sender domain: {String(branding.data?.branding?.senderDomain)}</p>}
   <details className="evidence"><summary>Notification change history</summary>{(history.data?.changes??[]).map((h,i)=><section key={i}><h4>{humanize(String(h.action))}</h4><Facts entries={[["When",h.at],["Reason",h.reason]]}/><p>Before: {JSON.stringify(h.before)}</p><p>After: {JSON.stringify(h.after)}</p></section>)}</details>
  </>}
  <section aria-label="Your notification inbox"><h3>Your notifications</h3>{!(inbox.data?.items??[]).length&&<p>No notifications to show.</p>}{(inbox.data?.items??[]).map(n=><article className="connection-record" key={String(n.id)}><h4>{String(n.subject)}</h4><p>{String(n.body)}</p><a href={`#/work/${n.workId}`}>Open ticket</a><p>{String(n.state)}</p></article>)}</section>
 </section>;
}
