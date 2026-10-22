import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
/** Actual saved raw Table API incident/sys_audit format through native HTTP and import-kit custody. */
export async function serviceNowImportChecks({ok,request,owner,snapshot,db}) {
 const base='/adoption/servicenow-imports',incidentId='11111111111111111111111111111111',auditId='22222222222222222222222222222222';
 const incident={sys_id:incidentId,number:'INC0010401',short_description:'Studio printer unavailable',description:'synthetic-linen-403 private source diagnostic',caller_id:'33333333333333333333333333333333',state:'2',priority:'2',sys_created_on:'2025-03-12 08:30:00',sys_updated_on:'2025-03-12 09:30:00'};
 const audit={sys_id:auditId,tablename:'incident',documentkey:incidentId,fieldname:'priority',oldvalue:'3',newvalue:'2',user:'synthetic-linen-401',sys_created_on:'2025-03-12 09:15:00',sys_created_by:'synthetic-linen-402'};
 const file=(name,format,rows)=>({name,format,base64:Buffer.from(JSON.stringify({result:rows})).toString('base64')});
 const input={instance:'synthetic-linen-400',files:[file('incidents.json','incidents-json',[incident]),file('sys-audit.json','audits-json',[audit])]};
 const before=await snapshot(),review=await ok(`${base}/dry-run`,'POST',{input},owner,200,{'X-Test-Read-Only':'1'});
 assert.equal(await snapshot(),before);assert.equal(review.counts.input,1);assert.equal(review.counts.effects,1);
 const employee=await ok('/members','POST',{name:'Historical reviewer',email:'synthetic-linen-404@example.test',password:'synthetic-linen-404-password',roles:['employee']},owner,201);
 const signed=await request('/login','POST',{email:'synthetic-linen-404@example.test',password:'synthetic-linen-404-password'}),member={Cookie:signed.headers.get('set-cookie').split(';')[0]};
 member['X-Linen-CSRF']=(await ok('/session','GET',undefined,member)).csrfToken;
 assert.equal((await request(`${base}/dry-run`,'POST',{input},member)).status,403);
 const job=await ok(base,'POST',{input,reviewedFingerprint:review.fingerprint,operationKey:'synthetic-linen-405',acceptOmissions:true},owner,201);
 for(let i=0;i<6;i++){const applied=await ok(`${base}/${job.id}/resume`,'POST',{},owner);if(applied.state==='completed')break;if(i===5)assert.fail(JSON.stringify(applied));}
 const workId=review.records[0].targets[0].id,view=await ok(`/work/${workId}`,'GET',undefined,owner);
 assert.equal(view.work.state,'paused');assert.equal(view.work.sensitivity,'restricted');assert.equal(view.work.assignee_id,null);assert.equal(view.messages[0].visibility,'private');
 assert.equal((await request(`/work/${workId}`,'GET',undefined,member)).status,404);
 const history=await ok(`/work/${workId}/activity`,'GET',undefined,owner),original=history.items.find(e=>e.source?.system==='servicenow');
 assert.ok(original,JSON.stringify(history));assert.equal(original.actor,'synthetic-linen-401');assert.equal(original.at,'2025-03-12T09:15:00.000Z');
 assert.deepEqual(original.changes.map(({field,before,after})=>({field,before,after})),[{field:'priority',before:'P3',after:'P2'}]);
 const imported=(await db.prepare("SELECT id,created_at,detail_json FROM audit_events WHERE target=? AND action='work.imported_field'").bind(workId).all()).results;
 assert.equal(imported.length,1);
 await ok(`${base}/${job.id}/resume`,'POST',{},owner);
 assert.deepEqual((await db.prepare("SELECT id,created_at,detail_json FROM audit_events WHERE target=? AND action='work.imported_field'").bind(workId).all()).results,imported);
 for(let i=0;i<2;i++){const response=await request(`${base}/${job.id}/artifacts/${i}`,'GET',undefined,owner);assert.equal(response.status,200);assert.equal(createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex'),createHash('sha256').update(Buffer.from(input.files[i].base64,'base64')).digest('hex'));}
 const conflict={...input,files:[input.files[0],file('sys-audit.json','audits-json',[{...audit,newvalue:'1'}])]};
 assert.equal((await request(`${base}/dry-run`,'POST',{input:conflict},owner)).status,409);
 const orphan={...input,files:[input.files[0],file('sys-audit.json','audits-json',[{...audit,documentkey:'44444444444444444444444444444444'}])]};
 assert.equal((await request(`${base}/dry-run`,'POST',{input:orphan},owner)).status,422);
 const display={...input,files:[file('incidents.json','incidents-json',[{...incident,caller_id:{value:incident.caller_id,display_value:'Historical reviewer'}}]),input.files[1]]};
 assert.equal((await request(`${base}/dry-run`,'POST',{input:display},owner)).status,422);
 const erased=await ok('/adoption/erase','POST',{identity:audit.user},owner);assert.ok(!erased.pendingDomains.includes('servicenow-import'),JSON.stringify(erased));
 assert.equal((await request(`${base}/${job.id}/artifacts/1`,'GET',undefined,owner)).status,410);
 assert.ok([409,422].includes((await request(`${base}/dry-run`,'POST',{input},owner)).status));
 assert.ok(!await db.prepare('SELECT 1 FROM servicenow_import_items WHERE work_id=?').bind(workId).first());
 assert.ok(employee.id);
 console.log('PASS saved ServiceNow incident/sys_audit native import: SELECT-only review, source actor/time/priority, private owner scope, no inferred accounts/effects, durable replay, exact artifacts, conflicting audit/orphan/display-value refusal, source erasure and replay denial');
}
