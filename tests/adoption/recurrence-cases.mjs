import assert from 'node:assert/strict';
export async function attachArchiveRecurrence(ok,auth) {
  const session=await ok('/session','GET',undefined,auth);
  await ok('/recurring-work','POST',{
    title:'Quarterly access review',body:'Review current access and record exceptions.',ownerId:session.principal.userId,
    calendar:{timezone:'America/New_York',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:['2035-01-01']},
    rule:{startDate:'2035-01-01',frequency:'monthly',interval:3,firstBusinessDay:true},
    tasks:[{title:'Review privileged access',ownerId:session.principal.userId}],
  },auth,201);
}
export async function checkArchiveRecurrence(ok,auth) {
  const data=await ok('/recurring-work','GET',undefined,auth),plan=data.items.find(p=>p.title==='Quarterly access review');
  assert.ok(plan,'DESK-013 native archive restores recurring calendar content');
  assert.equal(plan.enabled,0,'DESK-013 imported schedule does not create work automatically');
  assert.equal(plan.rule.interval,3,'DESK-013 recurrence interval survives native export/import');
  assert.equal(plan.calendar.timezone,'America/New_York');
  assert.equal(plan.tasks[0].title,'Review privileged access');
  console.log('PASS DESK-013 native archive restores owned calendar/task plan content with scheduling disabled');
}
