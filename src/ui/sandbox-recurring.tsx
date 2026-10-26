import {useState,type FormEvent} from 'react';
import {Fields} from './forms';
import {ErrorNotice} from './primitives';
type Row=Record<string,string|number|null>;
export function SandboxRecurringEditor({row,people,save}:{row:Row;people:{id:string;name:string}[];save:(body:object)=>Promise<unknown>}) {
 const rule=JSON.parse(String(row.rule_json)),calendar=JSON.parse(String(row.calendar_json));
 const [tasks,setTasks]=useState<{title:string;ownerId:string}[]>(JSON.parse(String(row.tasks_json))),[error,setError]=useState<unknown>(),[pending,setPending]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const data=new FormData(e.currentTarget);setError(null);setPending(true);
  try{await save({title:data.get('title'),body:data.get('body'),owner_id:data.get('owner'),enabled:Number(data.has('enabled')),tasks_json:JSON.stringify(tasks),rule_json:JSON.stringify({startDate:data.get('startDate'),frequency:data.get('frequency'),interval:Number(data.get('interval')),firstBusinessDay:data.has('firstBusinessDay')}),calendar_json:JSON.stringify({timezone:data.get('timezone'),startHour:Number(data.get('startHour')),endHour:Number(data.get('endHour')),weekdays:data.getAll('weekdays').map(Number),holidays:String(data.get('holidays')).split(/[\n,]/).map(s=>s.trim()).filter(Boolean)})});}catch(e){setError(e);}finally{setPending(false);}
 }
 const choices=people.map(person=>({value:person.id,label:person.name}));
 return <form className="inline-form" onSubmit={e=>void submit(e)}><Fields fields={[
 {name:'title',label:'Recurring work title',value:String(row.title),required:true},{name:'body',label:'Work to carry out',type:'textarea',value:String(row.body),required:true},
 {name:'owner',label:'Accountable service owner',type:'select',value:String(row.owner_id),options:choices,required:true},{name:'enabled',label:'Recurring plan active',type:'checkbox',value:row.enabled===1},
 {name:'startDate',label:'First period starts',type:'date',value:rule.startDate,required:true},{name:'frequency',label:'Repeat',type:'select',value:rule.frequency,options:['daily','weekly','monthly','annual'].map(value=>({value,label:value})),required:true},
 {name:'interval',label:'Every how many periods',type:'number',value:rule.interval,required:true},{name:'firstBusinessDay',label:'Use the first business day of the month',type:'checkbox',value:rule.firstBusinessDay},
 {name:'timezone',label:'Calendar time zone',value:calendar.timezone,required:true},{name:'startHour',label:'Local creation hour',type:'number',value:calendar.startHour,required:true},{name:'endHour',label:'Business day ends (hour)',type:'number',value:calendar.endHour,required:true},
 {name:'holidays',label:'Holidays, one date per line',type:'textarea',value:calendar.holidays.join('\n')}
 ]}/><fieldset><legend>Business weekdays</legend>{['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((day,index)=><label className="checkbox-field" key={day}><input type="checkbox" name="weekdays" value={index} defaultChecked={calendar.weekdays.includes(index)}/>{day}</label>)}</fieldset>
 {tasks.map((task,index)=><fieldset key={index}><legend>Duty {index+1}</legend><label>Duty title {index+1}<input required maxLength={500} value={task.title} onChange={e=>setTasks(tasks.map((t,i)=>i===index?{...t,title:e.target.value}:t))}/></label><label>Duty owner {index+1}<select required value={task.ownerId} onChange={e=>setTasks(tasks.map((t,i)=>i===index?{...t,ownerId:e.target.value}:t))}>{people.map(person=><option key={person.id} value={person.id}>{person.name}</option>)}</select></label><button type="button" className="action secondary" onClick={()=>setTasks(tasks.filter((_,i)=>i!==index))}>Remove duty {index+1}</button></fieldset>)}
 <button type="button" className="action secondary" disabled={tasks.length>=30} onClick={()=>setTasks([...tasks,{title:'',ownerId:String(row.owner_id)}])}>Add duty</button><ErrorNotice error={error}/><button className="action primary" disabled={pending}>Save sandbox recurring</button></form>;
}
