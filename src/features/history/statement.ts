import { id, now } from '../../platform/http';
import type { HistoryEnvelope } from './types';
interface Context { env:{DB:D1Database}; principal:{workspaceId:string;userId:string} }
interface EventInput { id?:string;action:string;target:string;envelope:HistoryEnvelope;at?:string;conditional?:boolean;store?:'audit'|'service';storedAction?:string;workId?:string }
/** Place immediately after the fenced mutation. All mutable retention evidence is
 * selected inside the same transaction, never from caller classification flags. */
export function historyEventStatement(ctx:Context,input:EventInput):D1PreparedStatement {
  const w=ctx.principal.workspaceId,e=input.envelope;
  const hasWork=e.record.kind==='ticket'||!!input.workId;
  const group=e.changes.some(c=>['group','groupId','group_id'].includes(c.field));
  const custom=e.changes.some(c=>c.field.startsWith('custom:'));
  const groupEvidence=(side:string)=>`(SELECT json_object('label',g.name,'groupMemberCount',(SELECT COUNT(*) FROM work_group_members m WHERE m.workspace_id=g.workspace_id AND m.group_id=g.id)) FROM work_groups g WHERE g.workspace_id=json_extract(base,'$.workspaceId') AND g.id=json_extract(c.value,'$.${side}'))`;
  const customEvidence=`(SELECT json_object('label',f.name,'type',f.field_type,'classificationRevision',f.privacy_classification_revision,'classifiedAt',f.privacy_classified_at,'nonpersonal',json(CASE WHEN f.privacy_class='nonpersonal' THEN 'true' ELSE 'false' END),'options',json(f.options_json)) FROM work_custom_fields f WHERE f.workspace_id=json_extract(base,'$.workspaceId') AND f.id=substr(json_extract(c.value,'$.field'),8))`;
  const cases=[...(custom?[`WHEN substr(json_extract(c.value,'$.field'),1,7)='custom:' THEN json_set(c.value,'$.evidence',json(COALESCE(${customEvidence},'{}')))`]:[]),...(group?[`WHEN json_extract(c.value,'$.field') IN('group','groupId','group_id') THEN json_set(c.value,'$.beforeEvidence',json(COALESCE(${groupEvidence('before')},'{}')),'$.afterEvidence',json(COALESCE(${groupEvidence('after')},'{}')))`]:[])];
  const change=cases.length?`CASE ${cases.join(' ')} ELSE c.value END`:'c.value';
  const work=hasWork?`, work AS(SELECT r.* FROM work_records r,original WHERE r.workspace_id=json_extract(base,'$.workspaceId') AND r.id=json_extract(base,'$.workId') LIMIT 1)`:'';
  const workSnapshot=hasWork?`'$.subjects',json(COALESCE((SELECT json_array(requester_id,beneficiary_id) FROM work),json_extract(base,'$.subjects'))),'$.protection',CASE WHEN EXISTS(SELECT 1 FROM work WHERE sensitivity IN ('hr','restricted') OR json_array_length(protected_departments_json)>0 OR department_id IN(SELECT id FROM work_departments WHERE workspace_id=json_extract(base,'$.workspaceId') AND kind='hr')) THEN CASE WHEN EXISTS(SELECT 1 FROM work WHERE sensitivity='restricted') THEN 'restricted' ELSE 'hr' END ELSE json_extract(base,'$.protection') END,`:'';
  const snapshot=`WITH original(base) AS(SELECT json_set(?,'$.workspaceId',?,'$.workId',?)) ${work}, captured(payload) AS(SELECT json_remove(json_set(base,${workSnapshot}'$.changes',json(COALESCE((SELECT json_group_array(json(${change})) FROM json_each(base,'$.changes') c),'[]'))),'$.workspaceId','$.workId') FROM original) SELECT ?,?,?,?,?,payload,? FROM captured WHERE json_array_length(payload,'$.changes')>0 ${input.conditional===false?'':'AND changes()=1'}`;
  const table=input.store==='service'?'svc_events':'audit_events';
  return ctx.env.DB.prepare(`INSERT INTO ${table} ${snapshot}`).bind(JSON.stringify(e),w,input.workId??e.record.id,input.id??id(),w,input.store==='service'?input.target:ctx.principal.userId,input.store==='service'?ctx.principal.userId:input.action,input.store==='service'?(input.storedAction??input.action):input.target,input.at??now());
}
