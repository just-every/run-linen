import {useEffect} from 'react';
import {useRemote} from './state';
import {ErrorNotice,Loading} from './primitives';
import {ActivityTimeline} from './work-activity';
import type {ActivityEntry} from '../features/work/activity';
/** Server projection supplies original values after live record authority and erasure. */
export function RecordHistory({path,label,version}:{path:string;label:string;version:string}) {
 const remote=useRemote<{items:ActivityEntry[]}>(path,10000);
 useEffect(()=>remote.refresh(),[version]);
 return <details className="evidence"><summary>{label}</summary>
  {remote.loading?<Loading/>:remote.error?<ErrorNotice error={remote.error} retry={remote.refresh}/>:<ActivityTimeline entries={remote.data?.items??[]} label={label}/>}
 </details>;
}
