import assert from 'node:assert/strict';
import { action, local, later } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';

/** Reusable with any real signed-in owner browser and its CSRF-aware api helper. */
export async function problemJourney({page,api,base,out}) {
  const service=await api('/services',{name:'Claims problem journey',description:'Claims processing',businessImpact:'Cannot file claims',source:'Browser acceptance service register',observedAt:later(0),visibility:'workspace'});
  const incidents=[];
  for(let i=1;i<=3;i++) incidents.push(await api('/incidents',{title:`Claims login loop report ${i}`,serviceId:service.id,impact:'Cannot enter Claims',cohorts:['north'],visibility:'workspace'}));
  const change=await api('/changes',{title:'Prevent Claims session redirects',risk:'Bounded sign-in interruption',impact:'Claims users',services:[service.id],window:{start:later(0),end:later(86400000)},cohorts:['north'],canaryCohorts:['north'],implementation:{target:'claims',payload:{release:'fixed'}},compensation:{target:'claims',payload:{release:'previous'}}});
  await page.goto(base+'/app#/problems');
  const problem=await action(page,'Add problem',{title:'Recurring Claims login loop',serviceId:service.id,symptoms:'A session returns to login repeatedly',incidentIds:incidents.map(r=>r.id),visibility:'operators'},'/problems','Save',201);
  await page.waitForURL(new RegExp('#/problems/'+problem.id+'$'));
  await action(page,'Review the root cause and known error',{cause:'Stale session claim repeats the redirect',evidenceIds:'Claims probe C-12'},'/known-error');
  await page.reload();
  await action(page,'Publish a reviewed workaround',{title:'Start a fresh Claims session',text:'Open a fresh browser session and sign in to Claims.',contraindications:'An upload is still in progress',source:'Claims probe C-12 and reviewed session recovery',symptomTerms:'login loop',cohorts:'north',scope:'employees',expiresAt:local(86400000),review:true},'/workarounds');
  await page.reload();
  await action(page,'Link the preventive change',{changeId:change.id},'/prevention');
  await page.reload();
  await page.getByRole('heading',{name:'Start a fresh Claims session',exact:true}).waitFor();
  await captureJourney(page,{path:out+'/PROB-001-problem.png',fullPage:true});
  const current=await api('/problems/'+problem.id),articleId=current.data.workarounds[0].articleId;
  assert.equal(current.data.incidentIds.length,3);assert.equal(current.data.preventionChangeId,change.id);
  await page.goto(base+'/app#/knowledge?q='+encodeURIComponent('Start a fresh Claims session'));
  await page.getByRole('heading',{name:'Start a fresh Claims session',exact:true}).waitFor();
  await captureJourney(page,{path:out+'/PROB-001-knowledge.png',fullPage:true});
  const work=await api('/work',{title:'Claims has a login loop again',body:'I see a login loop on Claims',deduplicationKey:crypto.randomUUID(),context:{serviceId:service.id,cohorts:['north']}});
  await page.goto(base+'/app#/work/'+work.id);
  const suggestion=page.getByRole('region',{name:'Suggested workarounds'});
  await suggestion.getByRole('heading',{name:'Start a fresh Claims session',exact:true}).waitFor();
  assert.equal((await api('/work/'+work.id+'/workarounds')).items[0].id,articleId);
  assert.equal((await api('/work/'+work.id)).work.state,'open');
  await captureJourney(page,{path:out+'/PROB-001-later-ticket.png',fullPage:true});
  return {problemId:problem.id,articleId,workId:work.id,serviceId:service.id,changeId:change.id};
}
