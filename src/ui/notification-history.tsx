import {Facts} from './primitives';
import {date,humanize,type RecordValue} from './api';
const fields=['revision','name','language','subject','body','event','channel','conditions','recipients','mandatory','enabled','logoUrl','primaryColor','textColor','senderDomain'];
function changeFacts(value:unknown):[string,unknown][] {
 if(!value||typeof value!=='object')return [['Configuration','Not previously configured']];
 return Object.entries(value).filter(([key])=>fields.includes(key)).map(([key,val])=>[humanize(key),val&&typeof val==='object'?JSON.stringify(val):val]);
}
export function NotificationHistory({changes}:{changes:RecordValue[]}) {
 return <details className="evidence"><summary>Notification change history</summary>{changes.map((change,i)=><section key={String(change.id??i)} className="history">
  <h4>{humanize(String(change.action))}</h4><p>{date(change.at)} · {String(change.reason??'')}</p>
  <div className="split"><section><h5>Before</h5><Facts entries={changeFacts(change.before)}/></section><section><h5>After</h5><Facts entries={changeFacts(change.after)}/></section></div>
 </section>)}</details>;
}
