import {SandboxRoutingEditor,SandboxRoutingRehearsal,routingFamilies,routingLabel,type RoutingOptions} from './sandbox-routing';
import {CatalogApprovalEditor} from './catalog-approval-editor';
import type {StageDef} from '../features/work/approval-config';
import {SandboxRecurringEditor} from './sandbox-recurring';
import {SandboxLifecycleRehearsal} from './sandbox-lifecycle';
import {LifecycleTemplateEditor, type TemplateTeam, type TemplateValue} from './lifecycle-template-editor';
import type {Template} from '../features/work/lifecycle-templates';
import {SandboxRehearsal} from './sandbox-rehearsal';
import {useState,type FormEvent} from 'react';
import {request} from './api';
import {useRemote,useSession} from './state';
import {ErrorNotice,Hero,Notice,Facts} from './primitives';
import {CatalogFormEditor} from './catalog-form-editor';
import {CatalogTaskPlanEditor} from './catalog-task-plan-editor';
import type {CatalogForm} from '../features/work/catalog-form-schema';
import type {CatalogTask} from '../features/work/catalog-task-plan';
import type {Sla} from '../platform/sandbox-slas';
import {rolePermissions} from '../features/work/department-role-authority';
import {categories} from '../features/work/classification-policy';

type Item={id:string;name:string;revision:number;form:CatalogForm;tasks:CatalogTask[];requiresManager:number;approvals:StageDef[];managerApproval:StageDef|null};
type ConfigRow=Record<string,string|number|null>&{id:string;revision:number};
type Sandbox={id:string;name:string;revision:number;state:string;approvedBy:string|null;items:Item[];slas:Sla[];slaConfiguration:Record<string,ConfigRow[]>;differences:{family?:string;catalogId?:string;slaId?:string;configurationId?:string;field:string;before:unknown;after:unknown}[];limits:string};
type Choice={id:string;name:string};
type Options=RoutingOptions&{requesterGroups:Choice[];calendars:Choice[];departments:Choice[];recipients:Choice[]};
type Run={id:string;catalogId:string;state:string;current:boolean;tasks:(CatalogTask&{state:string})[]};
export function SandboxSpace({selectedId}:{selectedId?:string}) {
 const {session}=useSession(),owner=session.principal.roles.includes('owner'),reviewer=owner||session.principal.roles.includes('sandbox-admin');
 const list=useRemote<{items:Sandbox[]}>(owner?'/sandboxes':null),detail=useRemote<Sandbox>(reviewer&&selectedId?'/sandboxes/'+selectedId:null);
 const [error,setError]=useState<unknown>(),[pending,setPending]=useState(false);
 async function create(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;setError(null);setPending(true);try{const row=await request<Sandbox>('/sandboxes',{method:'POST',csrf:session.csrfToken,body:{name:new FormData(form).get('name')}});location.hash='/sandboxes/'+row.id;}catch(e){setError(e);}finally{setPending(false);}}
 return <section className="sandbox-space" aria-label="Configuration sandboxes"><Hero eyebrow="Settings" title="Configuration sandboxes">Review configuration changes before production.</Hero>
 {!reviewer?<Notice>A current workspace owner is required.</Notice>:<><ErrorNotice error={list.error} retry={list.refresh}/><ErrorNotice error={detail.error} retry={detail.refresh}/><ErrorNotice error={error}/>
 {selectedId?<><a href="#/sandboxes">All sandboxes</a>{detail.data&&<SandboxDetail key={detail.data.id+':'+detail.data.revision} row={detail.data} refresh={()=>{detail.refresh();list.refresh();}}/>}</>:<>
 {owner?<><form className="inline-form" onSubmit={e=>void create(e)}><label>Sandbox name<input name="name" required maxLength={120}/></label><button className="action primary" disabled={pending}>Create configuration sandbox</button></form>
 <Notice>Personal records are excluded by default. Owners can choose fully masked ticket copies inside a draft. Role assignments, grants and credentials are excluded. A separate current owner must review your changes.</Notice>
 </>:<Notice>Open the reviewed package link shared by an owner. Administrator authority permits review and approval only.</Notice>}
 {list.data?.items.map(row=><article className="connection-record" key={row.id}><a href={'#/sandboxes/'+row.id}>{row.name}</a><p>Revision {row.revision} · {row.state}</p></article>)}
 </>}</>}
 </section>;
}
function SandboxDetail({row,refresh}:{row:Sandbox;refresh:()=>void}) {
 const {session}=useSession(),owner=session.principal.roles.includes('owner'),options=useRemote<Options>(owner?'/sandboxes/'+row.id+'/options':null),runs=useRemote<{items:Run[]}>(owner?'/sandboxes/'+row.id+'/runs':null);
 const [error,setError]=useState<unknown>(),[pending,setPending]=useState(false),[tested,setTested]=useState(false),[recurringPreview,setRecurringPreview]=useState<string>();
 const values=useRemote<{items:TemplateValue[]}>(owner?'/catalog-values':null),groups=useRemote<{items:TemplateTeam[]}>(owner?'/work-groups':null);
 const path='/sandboxes/'+row.id;
 async function mutate(door:string,body:unknown={},method='POST') {
  setError(null);setPending(true);try{const value=await request<Sandbox>(path+door,{method,csrf:session.csrfToken,body:{revision:row.revision,...body as object}});if(door==='/rollback-package')location.hash='/sandboxes/'+value.id;else refresh();return value;}catch(e){setError(e);throw e;}finally{setPending(false);}
 }
 const action=(door:string)=>void mutate(door).catch(()=>{});
 return <><h2>{row.name}</h2><Facts entries={[["Revision",String(row.revision)],["State",row.state],["Approval",row.approvedBy?'Separate reviewer approval recorded':'Not approved']]}/><Notice>{row.limits}</Notice>
 {owner&&<MaskedTickets path={path} revision={row.revision} draft={row.state==='draft'}/>}
 <ErrorNotice error={error}/><ErrorNotice error={values.error} retry={values.refresh}/><ErrorNotice error={groups.error} retry={groups.refresh}/><ErrorNotice error={options.error} retry={options.refresh}/><ErrorNotice error={runs.error} retry={runs.refresh}/>
 {owner&&row.state==='draft'&&<>
 {row.items.map(item=><details className="action-disclosure" key={item.id}><summary>Edit {item.name}</summary>
 <CatalogFormEditor item={item} onSaved={()=>{}} saveDraft={async value=>{await mutate('/catalog/'+item.id,{...value,tasks:item.tasks},'PUT');}}/>
 <CatalogTaskPlanEditor item={item} onSaved={()=>{}} saveDraft={async tasks=>{await mutate('/catalog/'+item.id,{name:item.name,form:item.form,tasks},'PUT');}}/>
 <details className="action-disclosure"><summary>Edit sandbox approval workflow</summary><SandboxApprovals item={item} calendars={row.slaConfiguration.calendar.map(calendar=>({id:calendar.id,name:String(calendar.name),timezone:String(calendar.timezone)}))} save={body=>mutate('/catalog/'+item.id+'/approvals',body,'PUT')}/></details>
 <SandboxRehearsal path={path} revision={row.revision} item={item} onRun={runs.refresh}/>
 </details>)}
 {routingFamilies.some(family=>row.slaConfiguration[family]?.length)&&options.data&&<SandboxRoutingRehearsal path={path} revision={row.revision} csrf={session.csrfToken} options={options.data}/>}
 {!!row.slaConfiguration.lifecycle?.length&&<SandboxLifecycleRehearsal path={path} revision={row.revision} csrf={session.csrfToken} values={values.data?.items??[]} calendars={row.slaConfiguration.calendar.map(calendar=>({id:calendar.id,name:String(calendar.name)}))}/>}
 {recurringPreview&&<Notice>Next recurring occurrence: {recurringPreview}. No tickets or duties were created.</Notice>}
 {tested&&<Notice>Validation passed. Answers were not retained. Rehearsals make no external calls.</Notice>}
 {row.slas.map(sla=><details className="action-disclosure" key={sla.id}><summary>Edit SLA: {sla.name}</summary><SlaEditor sla={sla} options={options.data} save={body=>mutate('/slas/'+sla.id,body,'PUT')}/></details>)}
 {Object.entries(row.slaConfiguration).flatMap(([family,rows])=>rows.map(config=><details className="action-disclosure" key={family+config.id}><summary>Edit {family}: {routingFamilies.includes(family)?routingLabel(family,config,options.data):config.name??config.title??config.label??'Waiting rule'}</summary>{routingFamilies.includes(family)?(options.data&&<SandboxRoutingEditor family={family} row={config} options={options.data} calendars={row.slaConfiguration.calendar.map(calendar=>({id:calendar.id,name:String(calendar.name)}))} save={body=>mutate('/sla-configuration/'+family+'/'+config.id,body,'PUT')}/>):family==='recurring'?(options.data&&<SandboxRecurringEditor row={config} people={options.data?.recipients??[]} save={body=>mutate('/sla-configuration/recurring/'+config.id,body,'PUT')}/>):family==='lifecycle'?<LifecycleTemplateEditor template={{id:config.id,name:String(config.name),kind:config.kind as Template['kind'],revision:config.revision,active:config.active===1,match:JSON.parse(String(config.match_json)),tasks:JSON.parse(String(config.tasks_json))}} values={values.data?.items??[]} groups={groups.data?.items??[]} onSaved={()=>{}} saveDraft={body=>mutate('/sla-configuration/lifecycle/'+config.id,{name:body.name,kind:body.kind,active:Number(body.active),match_json:JSON.stringify(body.match),tasks_json:JSON.stringify(body.tasks)},'PUT')}/>:<ConfigurationEditor family={family} row={config} options={options.data} save={body=>mutate('/sla-configuration/'+family+'/'+config.id,body,'PUT')}/>}<button className="action secondary" disabled={pending} onClick={()=>void request(path+'/test-configuration',{method:'POST',csrf:session.csrfToken,body:{revision:row.revision,family,configurationId:config.id}}).then(value=>{setTested(true);const result=value as {nextOccurrence?:{dueAt:string}};setRecurringPreview(result.nextOccurrence?.dueAt);}).catch(setError)}>Test sandbox {family}</button></details>))}
 <button className="action primary" disabled={pending||!row.differences.length} onClick={()=>action('/package')}>Request separate owner review</button>
 </>}
 {runs.data?.items.map(run=><article className="connection-record" key={run.id}><h3>Team rehearsal · {run.state}</h3>{!run.current&&<Notice>Configuration changed. Start a fresh rehearsal.</Notice>}{run.tasks.map(task=><p key={task.key}>{task.title} · {task.state} {row.state==='draft'&&run.current&&task.state==='ready'&&<button className="action secondary" disabled={pending} onClick={()=>void mutate('/runs/'+run.id+'/complete',{taskKey:task.key}).then(()=>runs.refresh()).catch(()=>{})}>Complete {task.title}</button>}</p>)}</article>)}
 <h3>Complete configuration diff</h3>{!row.differences.length&&<p>No configuration changes.</p>}
 {row.differences.map((diff,i)=><details className="action-disclosure" key={i}><summary>{diff.family??'catalog'} · {diff.family&&routingFamilies.includes(diff.family)?routingLabel(diff.family,Object.values(row.slaConfiguration).flat().find(x=>x.id===diff.configurationId)!,options.data):row.items.find(x=>x.id===diff.catalogId)?.name??row.slas.find(x=>x.id===diff.slaId)?.name??Object.values(row.slaConfiguration).flat().find(x=>x.id===diff.configurationId)?.name??Object.values(row.slaConfiguration).flat().find(x=>x.id===diff.configurationId)?.label??(diff.family==='waiting'?'Awaiting requester':diff.configurationId)} · {diff.field.replaceAll('_',' ')}</summary><h4>Before</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(diff.before,null,2)}</pre><h4>After</h4><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(diff.after,null,2)}</pre></details>)}
 {row.state==='review'&&<><Notice>Review every difference above. Approval is refused if you created or edited this package.</Notice><button className="action primary" disabled={pending} onClick={()=>action('/approve')}>Approve reviewed package</button></>}
 {row.state==='approved'&&<><Notice>Promotion rechecks production configuration and the owner and reviewer’s current authority. Existing requests keep their recorded versions.</Notice>{owner&&<button className="action primary" disabled={pending} onClick={()=>action('/promote')}>Promote reviewed configuration</button>}</>}
 {owner&&row.state==='promoted'&&<button className="action secondary" disabled={pending} onClick={()=>action('/rollback-package')}>Request reviewed rollback</button>}
 </>;
}
function SlaEditor({sla,options,save}:{sla:Sla;options:Options|null;save:(body:object)=>Promise<unknown>}) {
 const [error,setError]=useState<unknown>(),[pending,setPending]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const data=new FormData(e.currentTarget),body:Record<string,unknown>={};for(const key of ['name','priority','category','requester_group_id','calendar_id','department_id'])body[key]=data.get(key)||null;for(const key of ['position','first_response_minutes','next_response_minutes','resolution_minutes'])body[key]=Number(data.get(key));body.pauseOn=data.getAll('pauseOn');setPending(true);try{await save(body);}catch(e){setError(e);}finally{setPending(false);}}
 return <form className="inline-form" onSubmit={e=>void submit(e)}><label>SLA name<input name="name" required defaultValue={sla.name}/></label>
 {(['position','first_response_minutes','next_response_minutes','resolution_minutes'] as const).map(field=><label key={field}>{field==='position'?'Policy position':field.replaceAll('_',' ')}<input type="number" name={field} required min="1" max={field==='position'?1000:525600} step="1" defaultValue={sla[field]}/></label>)}
 {(['priority','category'] as const).map(field=><label key={field}>{field}<select name={field} aria-label={field} defaultValue={sla[field]??''}><option value="">Any {field}</option>{(field==='priority'?['P1','P2','P3','P4']:Object.keys(categories)).map(value=><option key={value}>{value}</option>)}</select></label>)}
 {([['requester_group_id','Requester group',options?.requesterGroups],['calendar_id','Business calendar',options?.calendars],['department_id','Department',options?.departments]] as const).map(([field,label,choices])=><label key={field}>{label}<select name={field} aria-label={label} defaultValue={sla[field]??''}><option value="">{field==='calendar_id'?'Calendar hours':field==='department_id'?'Shared desk':'Any requester'}</option>{choices?.map(choice=><option value={choice.id} key={choice.id}>{choice.name}</option>)}</select></label>)}
 {['requester','vendor'].map(value=><label className="checkbox-field" key={value}><input type="checkbox" name="pauseOn" value={value} defaultChecked={JSON.parse(sla.pause_on_json).includes(value)}/>Pause while awaiting {value}</label>)}
 <ErrorNotice error={error}/><button className="action primary" disabled={pending||!options}>Save sandbox SLA</button></form>;
}
function ConfigurationEditor({family,row,options,save}:{family:string;row:ConfigRow;options:Options|null;save:(body:object)=>Promise<unknown>}) {
 const [error,setError]=useState<unknown>(),[pending,setPending]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const data=new FormData(e.currentTarget),body:Record<string,unknown>={};
  for(const [field,value] of Object.entries(row)) {
   if(['id','revision'].includes(field))continue;
   if(field==='department_id'){body[field]=value;continue;}
   const input=String(data.get(field)??'');
   body[field]=typeof value==='number'?Number(input):field==='permissions_json'?JSON.stringify(data.getAll(field)):field.endsWith('_json')?JSON.stringify(field==='weekdays_json'?input.split(',').filter(Boolean).map(Number):input.split(',').map(x=>x.trim()).filter(Boolean)):input||null;
  }
  setPending(true);try{await save(body);}catch(e){setError(e);}finally{setPending(false);}
 }
 const labels:Record<string,string>={active:'Role active',timezone:'Time zone',start_hour:'Business day starts (hour)',end_hour:'Business day ends (hour)',holiday_catalog:'Holiday calendar',offset_minutes:'Minutes before or after due time',remind_business_days:'remind business days',resolve_business_days:'Resolve after business days'};
 return <form className="inline-form" onSubmit={e=>void submit(e)}>
 {Object.entries(row).filter(([field])=>!['id','revision'].includes(field)).map(([field,value])=>
 field==='department_id'?<p key={field}>Department: {options?.departments.find(d=>d.id===value)?.name??'Unavailable department'}. A role stays in its original department.</p>:
 field==='permissions_json'?<fieldset key={field}><legend>Explicit ticket permissions</legend>{rolePermissions.map(permission=><label className="checkbox-field" key={permission.id}><input type="checkbox" name={field} value={permission.id} defaultChecked={JSON.parse(String(value)).includes(permission.id)}/>{permission.label}</label>)}</fieldset>:
 <label key={field}>{labels[field]??field.replaceAll('_json','').replaceAll('_',' ')} {field==='weekdays_json'?'(0 Sunday through 6 Saturday, comma separated)':field==='holidays_json'?'(dates, comma separated)':''}
 {field==='active'?<select name={field} defaultValue={String(value)}><option value="1">Active</option><option value="0">Inactive</option></select>:
 field==='notify'?<select name={field} defaultValue={String(value)}><option value="assignee">Current assignee</option>{options?.recipients.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select>:
 field==='target'?<select name={field} defaultValue={String(value)}><option value="first_response">First response</option><option value="resolution">Resolution</option></select>:
 field==='holiday_catalog'?<select name={field} defaultValue={String(value??'')}><option value="">Explicit holidays only</option><option value="us-federal">US federal holidays</option></select>:
 <input name={field} type={typeof value==='number'?'number':'text'} step="1" defaultValue={field.endsWith('_json')?JSON.parse(String(value)).join(','):String(value??'')}/>}</label>)}
 <ErrorNotice error={error}/><button className="action primary" disabled={pending||!options}>Save sandbox {family}</button></form>;
}

function SandboxApprovals({item,calendars,save}:{item:Item;calendars:{id:string;name:string;timezone:string}[];save:(body:object)=>Promise<unknown>}) {
 const [managerRequired,setManagerRequired]=useState(Boolean(item.requiresManager));
 return <><label className="checkbox-field"><input type="checkbox" checked={managerRequired} onChange={e=>setManagerRequired(e.target.checked)}/>Require manager approval in sandbox</label><CatalogApprovalEditor item={{...item,requires_manager:Number(managerRequired)}} draftCalendars={calendars} onSaved={()=>{}} saveDraft={({revision,...body})=>save({...body,requiresManager:managerRequired})}/></>;
}

function MaskedTickets({path,revision,draft}:{path:string;revision:number;draft:boolean}) {
 const {session}=useSession(),source=useRemote<{items:{id:string;title:string;revision:number}[]}>(draft?'/work':null),copies=useRemote<{items:{id:string;fields:Record<string,string>}[]}>(path+'/masked-records');
 const [error,setError]=useState<unknown>(),[pending,setPending]=useState(false),[selected,setSelected]=useState(''),[consent,setConsent]=useState(false);
 async function copy(e:FormEvent<HTMLFormElement>){e.preventDefault();const row=source.data?.items.find(item=>item.id===selected);if(!row)return;setPending(true);setError(null);try{await request(path+'/masked-records',{method:'POST',csrf:session.csrfToken,body:{revision,consent,records:[{id:row.id,revision:row.revision}]}});setConsent(false);setSelected('');copies.refresh();}catch(e){setError(e);}finally{setPending(false);}}
 return <details className="action-disclosure"><summary>Masked ticket copies</summary>
 <Notice>Personal records are excluded by default. A selected ticket keeps its field structure with every source value replaced. Copies carry no production authority and stay outside configuration packages and archives. Source changes, scope changes and erasure retire copies; the source ticket retention deadline still applies.</Notice>
 <ErrorNotice error={error}/><ErrorNotice error={source.error} retry={source.refresh}/><ErrorNotice error={copies.error} retry={copies.refresh}/>
 {draft&&<form className="inline-form" onSubmit={e=>void copy(e)}><label>Production ticket to mask<select aria-label="Production ticket to mask" required value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Choose a ticket</option>{source.data?.items.map(row=><option value={row.id} key={row.id}>{row.title}</option>)}</select></label>
 <label className="checkbox-field"><input type="checkbox" required checked={consent} onChange={e=>setConsent(e.target.checked)}/>I choose this ticket for a fully masked copy</label><button className="action secondary" disabled={pending||!consent||!selected}>Copy masked ticket</button></form>}
 {copies.data?.items.length===0&&<p>No personal records copied.</p>}
 {copies.data?.items.map((row,i)=><details className="action-disclosure" key={row.id}><summary>Inspect masked ticket {i+1}</summary><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{JSON.stringify(row.fields,null,2)}</pre></details>)}
 </details>;
}
