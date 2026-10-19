import { usePeopleLabels } from './people-labels';
import { date, text, type RecordValue } from './api';
import { useRemote, useSession } from './state';
import { ActionForm } from './forms';
import { ErrorNotice, Facts, Loading } from './primitives';
export function RecurringWork() {
  const {session}=useSession();
  const allowed=session.principal.roles.some(role=>['owner','operator'].includes(role));
  const personName=usePeopleLabels(),members=useRemote<RecordValue[]>(allowed?'/members':null);
  const plans=useRemote<{items:RecordValue[];occurrences:RecordValue[]}>(allowed?'/recurring-work':null,30000);
  if(!allowed)return null;
  return <details className="connection-record"><summary>Scheduled and recurring work</summary>
    <p>Create owned tickets and local task plans on your business calendar. Holidays and weekends move work to the next business day. Pausing stops future creation; existing tickets remain open.</p>
    <ActionForm title="Schedule recurring work" path="/recurring-work" submit="Create recurring plan" onSaved={plans.refresh}
      fields={[
        {name:'title',label:'Recurring work title',required:true},
        {name:'body',label:'Work to carry out',type:'textarea',required:true},
        {name:'ownerId',label:'Accountable service owner',type:'select',value:session.principal.userId,required:true,options:members.data?.filter(m=>m.active && /"(owner|operator)"/.test(text(m.roles_json))).map(m=>({value:text(m.id),label:text(m.name)}))},
        {name:'taskTitles',label:'Task plan duties, one per line',type:'list',hint:'Each duty is assigned to the accountable service owner. Local duties do not grant access or run provider actions.'},
        {name:'startDate',label:'First period starts',type:'date',required:true},
        {name:'frequency',label:'Repeat',type:'select',value:'monthly',required:true,options:[{value:'daily',label:'Daily'},{value:'weekly',label:'Weekly'},{value:'monthly',label:'Monthly'},{value:'annual',label:'Annually'}]},
        {name:'interval',label:'Every how many periods',type:'number',value:1,required:true},
        {name:'firstBusinessDay',label:'Use the first business day of the month (monthly or annual)',type:'checkbox',value:true},
        {name:'timezone',label:'Calendar time zone',value:Intl.DateTimeFormat().resolvedOptions().timeZone,required:true},
        {name:'startHour',label:'Local creation hour (0–23)',type:'number',value:9,required:true},
        {name:'weekdays',label:'Business weekdays',type:'checkboxes',required:true,options:[{value:'1',label:'Monday'},{value:'2',label:'Tuesday'},{value:'3',label:'Wednesday'},{value:'4',label:'Thursday'},{value:'5',label:'Friday'},{value:'6',label:'Saturday'},{value:'0',label:'Sunday'}]},
        {name:'holidays',label:'Holidays, one YYYY-MM-DD date per line',type:'list'},
      ]}
      transform={b=>({title:b.title,body:b.body,ownerId:b.ownerId,tasks:((b.taskTitles||[]) as string[]).map(title=>({title,ownerId:b.ownerId})),
        rule:{startDate:b.startDate,frequency:b.frequency,interval:b.interval,firstBusinessDay:b.firstBusinessDay},
        calendar:{timezone:b.timezone,startHour:b.startHour,endHour:24,weekdays:((b.weekdays||[]) as string[]).map(Number),holidays:b.holidays||[]}})} />
    {plans.loading?<Loading/>:plans.error?<ErrorNotice error={plans.error} retry={plans.refresh}/>:plans.data?.items.map(plan=><article key={text(plan.id)}>
      <h3>{text(plan.title)}</h3>
      <Facts entries={[["Owner",personName(plan.owner_id)],["Next business occurrence",new Intl.DateTimeFormat('en-US',{timeZone:String((plan.calendar as RecordValue).timezone),year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(String(plan.next_due_at)))],["Calendar time zone",text((plan.calendar as RecordValue).timezone)],["State",plan.enabled?'Active':'Paused']]}/>
      <p>{((plan.tasks||[]) as RecordValue[]).map(task=>text(task.title)).join(' · ')}</p>
      <ActionForm title={plan.enabled?'Pause recurring plan':'Resume recurring plan'} path={`/recurring-work/${text(plan.id)}`} fields={[]} defaults={{revision:plan.revision,enabled:!plan.enabled}} submit={plan.enabled?'Pause plan':'Resume plan'} onSaved={plans.refresh}/>
      {plans.data?.occurrences.filter(o=>o.plan_id===plan.id).map(o=><p key={text(o.id)}><a href={`#/work/${text(o.work_id)}`}>{text(o.business_date)} — {text(plan.title)}</a></p>)}
    </article>)}
  </details>;
}
export function RecurringTasks({workId}:{workId:string}) {
  const personName=usePeopleLabels();
  const tasks=useRemote<{items:RecordValue[]}>(`/work/${workId}/recurring-tasks`);
  if(tasks.loading || (!tasks.error && !tasks.data?.items.length))return null;
  if(tasks.error)return <ErrorNotice error={tasks.error} retry={tasks.refresh}/>;
  return <section className="connection-record"><h2>Scheduled task plan</h2>{tasks.data?.items.map(task=><article key={text(task.id)}>
    <h3>{text(task.title)}</h3><p>Owner: {personName(task.owner_id)} · {text(task.state)}</p>
    {task.state==='pending'?<ActionForm title={`Complete ${text(task.title)}`} path={`/work/${workId}/recurring-tasks/${text(task.id)}`} fields={[]} defaults={{revision:task.revision}} submit="Mark duty complete" onSaved={tasks.refresh}/>:<p>Completed {date(task.completed_at)} by {personName(task.completed_by)}</p>}
  </article>)}</section>;
}
