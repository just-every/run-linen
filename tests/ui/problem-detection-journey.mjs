import assert from 'node:assert/strict';
import { action } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';
export async function problemDetectionJourney({page,api,base,out}) {
  const service=await api('/services',{name:'Denver Wi-Fi',description:'Office wireless network',businessImpact:'Employees cannot work online',source:'Network service register',observedAt:new Date().toISOString()});
  async function ticket(floor,index) {return api('/work',{title:`Wi-Fi disconnects — floor ${floor} desk ${index}`,body:'Wireless connection drops during calls',kind:'incident',context:{serviceId:service.id,cohort:`Denver floor ${floor}`},deduplicationKey:crypto.randomUUID()});}
  const tickets=[];for(let i=1;i<=8;i++)tickets.push(await ticket(4,i));
  await page.goto(base+'/app#/problems');
  await action(page,'Check recurring incidents',{},'/problem-proposals/detect','Check recurrence');
  const card=page.getByRole('article',{name:'Denver Wi-Fi recurrence proposal'}).filter({has:page.getByRole('heading',{name:'Denver Wi-Fi · denver floor 4',exact:true})});
  for(const t of tickets) await card.getByRole('link',{name:t.title,exact:true}).waitFor();
  assert.equal(await card.getByRole('link').count(),8);
  await captureJourney(page,{path:out+'/PROB-002-proposed.png',fullPage:true});
  const proposals=(await api('/problem-proposals')).items,proposal=proposals.find(p=>p.data.cluster.value===service.id&&p.data.cluster.scopeValue==='denver floor 4');
  await action(page,'Reject Denver Wi-Fi proposal',{reason:'These incidents were expected during access point maintenance.'},`/problem-proposals/${proposal.id}/reject`,'Keep rejection');
  await ticket(4,9);
  await action(page,'Check recurring incidents',{},'/problem-proposals/detect','Check recurrence');
  await page.reload();
  await card.getByText('rejected',{exact:true}).waitFor();
  assert.equal((await api('/problem-proposals')).items.filter(p=>p.data.cluster.value===service.id&&p.data.cluster.scopeValue==='denver floor 4').length,1);
  await captureJourney(page,{path:out+'/PROB-002-rejected.png',fullPage:true});
  for(let i=1;i<=3;i++)await ticket(5,i);
  await action(page,'Check recurring incidents',{},'/problem-proposals/detect','Check recurrence');
  const alternative=(await api('/problem-proposals')).items.find(p=>p.data.cluster.value===service.id&&p.data.cluster.scopeValue==='denver floor 5');
  await action(page,'Accept Denver Wi-Fi proposal',{reason:'Investigate repeated wireless failures outside maintenance.'},`/problem-proposals/${alternative.id}/accept`,'Create problem');
  const accepted=await api('/problem-proposals/'+alternative.id);
  await page.goto(base+'/app#/problems/'+accepted.data.problemId);
  await page.getByRole('heading',{name:'Accepted recurrence evidence',exact:true}).waitFor();
  assert.equal((await api('/problems/'+accepted.data.problemId)).data.ticketIds.length,3);
  await captureJourney(page,{path:out+'/PROB-002-accepted-problem.png',fullPage:true});
  console.log('PASS PROB-002 browser: eight floor Wi-Fi tickets listed, rejection retained after ninth and reload, human acceptance opens one linked native problem at 1440/390');
}
