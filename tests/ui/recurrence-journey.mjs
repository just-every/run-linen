import assert from 'node:assert/strict';
import { action } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';
/** DESK-013: reusable with a real owner session at either release viewport. */
export async function recurrenceJourney({page,api,base,out}) {
  const session=await api('/session');
  await page.goto(base+'/app#/work');
  await page.getByText('Scheduled and recurring work',{exact:true}).click();
  const plan=await action(page,'Schedule recurring work',{
    title:'Monthly patch review',body:'Review the patch calendar and record any exceptions.',ownerId:session.principal.userId,
    taskTitles:'Record patch exceptions',startDate:'2020-01-01',frequency:'monthly',interval:1,firstBusinessDay:true,
    timezone:'America/New_York',startHour:9,weekdays:['1','2','3','4','5'],holidays:'2020-01-01',
  },'/recurring-work','Create recurring plan',201);
  assert.equal(plan.business_date,'2020-01-02');
  await page.getByRole('heading',{name:'Monthly patch review',exact:true}).waitFor();
  await captureJourney(page,{path:out+'/DESK-013-calendar.png',fullPage:true});
  await api('/work/process-due',{});
  const snapshot=await api('/recurring-work'), occurrence=snapshot.occurrences.find(o=>o.plan_id===plan.id&&o.occurrence_index===0);
  assert.ok(occurrence);assert.equal(occurrence.business_date,'2020-01-02');
  await page.goto(base+'/app#/work/'+occurrence.work_id);
  await page.reload();
  await page.getByRole('heading',{name:'Scheduled task plan',exact:true}).waitFor();
  await action(page,'Complete Record patch exceptions',{},'/recurring-tasks/'+(await api(`/work/${occurrence.work_id}/recurring-tasks`)).items[0].id,'Mark duty complete');
  assert.equal((await api(`/work/${occurrence.work_id}/recurring-tasks`)).items[0].state,'completed');
  await captureJourney(page,{path:out+'/DESK-013-ticket-tasks.png',fullPage:true});
  const current=(await api('/recurring-work')).items.find(p=>p.id===plan.id);
  await api('/recurring-work/'+plan.id,{revision:current.revision,enabled:false});
  console.log('PASS DESK-013 browser: owned monthly recurring work skips holiday, creates ticket and completes task plan at desktop/mobile widths');
  return {planId:plan.id,workId:occurrence.work_id};
}
