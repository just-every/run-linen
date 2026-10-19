import assert from 'node:assert/strict';
/** DESK-012: manual and measured active effort through public work/report doors. */
export async function timeChecks(api,db,workId,taskId) {
  const path=`/work/${workId}/time`, employee={'x-user':'employee','x-roles':'["employee"]'}, stranger={'x-user':'stranger','x-roles':'["employee"]'};
  const manual={source:'manual',minutes:15,note:'Investigated request',deduplicationKey:'manual-time'};
  const first=await api(path,manual);assert.equal(first.status,201,JSON.stringify(first));assert.equal(first.value.active_ms,900000);assert.equal(first.value.actor_id,'owner');
  assert.equal((await api(path,manual)).value.id,first.value.id);
  assert.equal((await api(path,{...manual,minutes:16})).status,409);
  assert.equal((await api(path,{...manual,deduplicationKey:'negative',minutes:-1})).status,422);
  assert.equal((await api(path,{...manual,deduplicationKey:'forged-role',effortRole:'owner'},employee)).status,403);
  assert.equal((await api(path,manual,stranger)).status,404);
  assert.equal((await api(path,manual,{'x-workspace':'b'})).status,404);
  assert.equal((await api(path,{...manual,deduplicationKey:'bad-task',obligationId:'absent-task'})).status,404);
  const task=await api(path,{...manual,minutes:7,deduplicationKey:'task-time',obligationId:taskId,effortRole:'technician'});
  assert.equal(task.status,201,JSON.stringify(task));assert.equal(task.value.obligation_id,taskId);assert.equal(task.value.effort_role,'technician');
  const start=await api(path,{source:'measured',deduplicationKey:'timer'});assert.equal(start.status,201,JSON.stringify(start));
  assert.equal((await api(path,{source:'measured',deduplicationKey:'parallel'})).status,409);
  const timerPath=`${path}/${start.value.id}`;
  assert.equal((await api(timerPath,{command:'heartbeat',sequence:0,activeMs:1},employee)).status,404);
  await new Promise(resolve=>setTimeout(resolve,1100));
  const beat=await api(timerPath,{command:'heartbeat',sequence:0,activeMs:1100});assert.equal(beat.status,200,JSON.stringify(beat));assert.ok(beat.value.active_ms>500&&beat.value.active_ms<=1100);
  assert.equal((await api(timerPath,{command:'heartbeat',sequence:0,activeMs:1100})).status,409);
  // An offline/hidden interval cannot be claimed by a client duration on its return.
  await db.prepare('UPDATE work_time_entries SET last_seen_at=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',start.value.id).run();
  const gap=await api(timerPath,{command:'heartbeat',sequence:1,activeMs:100000000});assert.equal(gap.status,200);assert.equal(gap.value.active_ms,beat.value.active_ms);
  const paused=await api(timerPath,{command:'pause',sequence:2});assert.equal(paused.status,200);assert.equal(paused.value.state,'paused');
  assert.equal((await api(timerPath,{command:'heartbeat',sequence:3,activeMs:1000})).status,409);
  const resumed=await api(timerPath,{command:'resume',sequence:3});assert.equal(resumed.status,200);assert.equal(resumed.value.touches,2);
  const stopped=await api(timerPath,{command:'stop',sequence:4});assert.equal(stopped.status,200);assert.equal(stopped.value.state,'completed');
  assert.equal((await api(timerPath,{command:'resume',sequence:5})).status,409);
  const from='2000-01-01T00:00:00.000Z',to='2100-01-01T00:00:00.000Z';
  await db.prepare("UPDATE work_obligations SET state='failed' WHERE id=?").bind(taskId).run();
  const pending=await api('/work',{title:'Unresolved printer request',body:'Printer still unavailable',deduplicationKey:'effort-pending'},employee);assert.equal(pending.status,201);
  const report=await api(`/reports/work?from=${from}&to=${to}&timezone=UTC`);assert.equal(report.status,200,JSON.stringify(report));
  const effort=report.value.effort;assert.ok(effort.groups.some(row=>row.source==='manual'&&row.role==='owner'&&row.activeMinutes===15));assert.ok(effort.groups.some(row=>row.source==='measured'&&row.activeMinutes>0&&row.touches===2));assert.ok(effort.groups.some(row=>row.role==='technician'&&row.activeMinutes===7));assert.ok(effort.byRequestType.some(row=>row.failed>0));assert.ok(effort.byRequestType.some(row=>row.pending>0));
  assert.equal((await api(`/reports/effort?from=${from}&to=${to}`,undefined,employee)).status,403);
  assert.equal((await api(`/reports/effort?from=${to}&to=${from}`)).status,422);
  const entries=(await api(path)).value.items;assert.equal(entries.length,3);
  const restored={...start.value,id:crypto.randomUUID(),dedup_key:'restored-active',active_ms:beat.value.active_ms};
  const restore=await api('/test/restore',{table:'work_time_entries',row:restored,sourceId:'effort-backup',sourceKey:'timer'});assert.equal(restore.status,200,JSON.stringify(restore));
  const restoredRow=(await api(path)).value.items.find(row=>row.id===restored.id);assert.equal(restoredRow.state,'completed');assert.equal(restoredRow.last_seen_at,null);assert.equal(restoredRow.active_ms,beat.value.active_ms);
  assert.equal((await api(`${path}/${restored.id}`,{command:'resume',sequence:restoredRow.sequence})).status,409);
  // Revocation is checked again, even for an existing timer and report.
  await db.prepare("UPDATE memberships SET active=0 WHERE user_id='owner'").run();
  assert.equal((await api(timerPath,{command:'stop',sequence:5})).status,404);
  assert.equal((await api(`/reports/effort?from=${from}&to=${to}`)).status,404);
  await db.prepare("UPDATE memberships SET active=1 WHERE user_id='owner'").run();
}
