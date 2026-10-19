import assert from 'node:assert/strict';
/** DESK-013: owned calendar work and local task plans through public API doors. */
export async function recurrenceChecks(api,db) {
  const employee={'x-user':'employee','x-roles':'["employee"]'};
  const calendar={timezone:'America/New_York',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:['2020-01-01']};
  const input={title:'Monthly patch review',body:'Review patches and record exceptions.',ownerId:'owner',calendar,
    rule:{startDate:'2020-01-01',frequency:'monthly',interval:1,firstBusinessDay:true},tasks:[{title:'Record patch exceptions',ownerId:'owner'}]};
  const check=(r,status=200)=>{assert.equal(r.status,status,'DESK-013 '+JSON.stringify(r));return r.value;};
  check(await api('/recurring-work',input,employee),403);
  check(await api('/recurring-work',{...input,ownerId:'unknown-owner'}),422);
  check(await api('/recurring-work',{...input,tasks:[{title:'Unowned duty',ownerId:'unknown-owner'}]}),422);
  check(await api('/recurring-work',{...input,calendar:{...calendar,weekdays:[]}}),422);
  const plan=check(await api('/recurring-work',input),201);
  assert.equal(plan.business_date,'2020-01-02');
  assert.equal(plan.next_due_at,'2020-01-02T14:00:00.000Z');
  // Pause fences materialization; stale edits cannot reactivate a changed plan.
  const paused=check(await api(`/recurring-work/${plan.id}`,{revision:plan.revision,enabled:false}));
  check(await api(`/recurring-work/${plan.id}`,{revision:plan.revision,enabled:true}),409);
  check(await api('/work/process-due',{}));
  assert.ok(!check(await api('/recurring-work')).occurrences.some(o=>o.plan_id===plan.id));
  check(await api(`/recurring-work/${plan.id}`,{revision:paused.revision,enabled:true}));
  (await Promise.all([api('/work/process-due',{}),api('/work/process-due',{})])).forEach(r=>check(r));
  const snapshot=check(await api('/recurring-work'));
  const occurrences=snapshot.occurrences.filter(o=>o.plan_id===plan.id);
  assert.equal(occurrences.filter(o=>o.occurrence_index===0).length,1);
  const first=occurrences.find(o=>o.occurrence_index===0);
  assert.equal(first.business_date,'2020-01-02');
  const work=check(await api(`/work/${first.work_id}`));
  assert.equal(work.work.assignee_id,'owner');
  const tasks=check(await api(`/work/${first.work_id}/recurring-tasks`)).items;
  assert.equal(tasks.length,1);assert.equal(tasks[0].owner_id,'owner');
  check(await api(`/work/${first.work_id}/recurring-tasks/${tasks[0].id}`,{revision:tasks[0].revision},employee),404);
  check(await api(`/work/${first.work_id}/recurring-tasks/${tasks[0].id}`,{revision:tasks[0].revision}));
  assert.equal(check(await api(`/work/${first.work_id}/recurring-tasks`)).items[0].state,'completed');
  check(await api(`/work/${first.work_id}/recurring-tasks/${tasks[0].id}`,{revision:tasks[0].revision}),409);
  check(await api('/recurring-work',undefined,{'x-workspace':'b'}),404);
  // Monthly period arithmetic retains the anchor, handles short months, and observes DST.
  const leap=check(await api('/recurring-work',{...input,title:'Month-end audit',calendar:{...calendar,weekdays:[0,1,2,3,4,5,6],holidays:[]},rule:{startDate:'2020-01-31',frequency:'monthly',interval:1,firstBusinessDay:false},tasks:[]}),201);
  for(let i=0;i<3;i++)check(await api('/work/process-due',{}));
  const ends=check(await api('/recurring-work')).occurrences.filter(o=>o.plan_id===leap.id);
  assert.ok(ends.some(o=>o.business_date==='2020-02-29'));
  assert.ok(ends.some(o=>o.business_date==='2020-03-31'&&o.due_at==='2020-03-31T13:00:00.000Z'));
  for(const [frequency,interval,title] of [['weekly',1,'Weekly review'],['monthly',3,'Quarterly access review'],['annual',1,'Annual refresh'],['daily',1,'Daily review']]) {
    const p=check(await api('/recurring-work',{...input,title,rule:{startDate:'2020-01-01',frequency,interval,firstBusinessDay:['monthly','annual'].includes(frequency)}}),201);
    assert.equal(p.business_date,'2020-01-02','DESK-013 all recurrence frequencies observe configured holidays');
    check(await api(`/recurring-work/${p.id}`,{revision:p.revision,enabled:false}));
  }
  const archive=check(await api('/recurring-work')).items.find(p=>p.id===plan.id);
  const {calendar:calendarView,rule:ruleView,tasks:tasksView,...row}=archive;
  const restoredId=crypto.randomUUID();
  check(await api('/test/restore',{table:'work_recurring_plans',sourceId:'recurring-archive',sourceKey:'monthly-plan',row:{...row,id:restoredId,enabled:1}}));
  assert.equal(check(await api('/recurring-work')).items.find(p=>p.id===restoredId).enabled,0,'DESK-013 restored schedules remain inactive content');
  await db.exec(`INSERT INTO users VALUES('recurring-technician','recurring-tech@test','Taylor Technician','unused','2026-01-01'); INSERT INTO memberships VALUES('a','recurring-technician','["operator"]',1);`);
  const privatePlan=check(await api('/recurring-work',{...input,title:'Taylor scheduled review',ownerId:'recurring-technician',tasks:[{title:'Taylor device review',ownerId:'recurring-technician'}]}),201);
  check(await api('/work/process-due',{}));
  const personalOccurrence=check(await api('/recurring-work')).occurrences.find(o=>o.plan_id===privatePlan.id);
  assert.ok(personalOccurrence,'DESK-013 scheduled work carries a currently active owner');
  check(await api('/people/recurring-technician/erase',{revision:0,reason:'Authorized test erasure'}));
  const erasedPlan=check(await api('/recurring-work')).items.find(p=>p.id===privatePlan.id);
  assert.equal(erasedPlan.enabled,0,'DESK-013 erasure disables future scheduled creation');
  assert.equal(erasedPlan.title,'[erased]');
  assert.deepEqual(erasedPlan.tasks,[]);
  assert.equal(check(await api(`/work/${personalOccurrence.work_id}/recurring-tasks`)).items[0].title,'[erased]','DESK-013 local task personal content follows existing erasure semantics');
  check(await api(`/recurring-work/${privatePlan.id}`,{revision:erasedPlan.revision,enabled:true}),422);
  // Leave historical plans paused, so later unrelated public-door checks do not generate backlog.
  for(const p of check(await api('/recurring-work')).items.filter(p=>[plan.id,leap.id].includes(p.id)))
    check(await api(`/recurring-work/${p.id}`,{revision:p.revision,enabled:false}));
  console.log('PASS DESK-013 public routes: owned recurring tickets/task plans, holiday first business day, daily/weekly/quarterly/annual calendars, pause/resume, concurrent deduplication, DST/month-end and inactive restore');
}
