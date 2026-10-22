import assert from 'node:assert/strict';
import {apiFor} from './connected-helpers.mjs';

/** Native typed field editors and original histories share the existing authenticated product. */
export async function typedHistoryJourney({page,base,out}) {
 const api=apiFor(page),session=await api('/session');
 const work=await api('/work',{title:'Prepare the Denver meeting room',body:'Install the reviewed screen-sharing setup before Monday.',kind:'incident',deduplicationKey:'synthetic-linen-450'});
 const definitions=[['Office','dropdown',['Austin','Denver'],'Austin','Denver'],['Room capacity','number',[],8,12],['Accessible room','boolean',[],false,true],['Ready on','date',[],'2030-03-01','2030-03-02'],['Facilities checks','multiselect',['Power','Network'],['Power'],['Power','Network']]];
 for(const [name,type,options,before]of definitions){const field=await api('/desk-fields',{name,type,options,kinds:['incident'],requiredOn:[]});await api(`/mcp-fields/${field.id}/classification`,{nonpersonal:true});await api(`/work/${work.id}/fields`,{fieldId:field.id,value:before});}
 await page.goto(base+'/app#/work/'+work.id);await page.getByRole('heading',{level:2,name:work.title??'Prepare the Denver meeting room',exact:true}).waitFor();
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  for(const [name,type,,before,after]of definitions){const form=page.getByRole('form',{name:`Edit ${name}`,exact:true}),input=form.getByLabel(name,{exact:true});
   const current=type==='multiselect'?await input.evaluate(e=>[...e.selectedOptions].map(o=>o.value)):await input.inputValue();
   const desired=width===1440?after:before;
   if(['dropdown','boolean','multiselect'].includes(type))await input.selectOption(type==='multiselect'?desired:String(desired));else await input.fill(String(desired));
   const response=page.waitForResponse(r=>r.url().endsWith(`/work/${work.id}/fields`)&&r.request().method()==='POST');await form.getByRole('button',{name:`Save ${name}`,exact:true}).click();assert.equal((await response).status(),200);await page.getByRole('form',{name:`Edit ${name}`,exact:true}).waitFor();assert.notDeepEqual(current,desired);
  }
  const history=page.getByRole('list',{name:'Ticket activity',exact:true});await history.getByText(/Office: /).first().waitFor();await history.scrollIntoViewIfNeeded();
  assert.ok((await history.innerText()).includes('Denver'));await fitCapture(page,out,'ticket-typed-fields',width);
 }
 const service=await api('/services',{name:'Denver meeting rooms',description:'Displays and room booking',businessImpact:'Meetings need a working room',source:'Facilities reviewed service register',observedAt:new Date().toISOString(),freshnessMs:86400000,visibility:'operators'});
 const problem=await api('/problems',{title:'Meeting room display disconnects',serviceId:service.id,incidentIds:[],symptoms:'HDMI reconnect is needed after sleep',visibility:'operators'});
 await api(`/problems/${problem.id}/known-error`,{revision:problem.revision,cause:'Screen input remains asleep after a laptop wakes',evidenceIds:[]});
 const change=await api('/changes',{title:'Update the room display configuration',risk:'Review the display input before making a change',impact:'One meeting room may be unavailable',services:[service.id],window:{start:new Date(Date.now()+86400000).toISOString(),end:new Date(Date.now()+90000000).toISOString()},cohorts:['denver-room'],canaryCohorts:['denver-room'],implementation:{action:'deployment.canary',target:'meeting-room-display',beneficiaryId:session.principal.userId,payload:{configuration:'reviewed-input'}},compensation:{action:'deployment.compensate',target:'meeting-room-display',beneficiaryId:session.principal.userId,payload:{configuration:'prior-input'}},visibility:'operators'});
 const software=await api('/software-assets',{name:'Meeting room booking licence',serviceId:service.id,assetType:'saas',externalId:'ROOM-BOOKING-1042',source:'Facilities purchase register',currency:'USD',acquisitionCost:240,observedAt:new Date().toISOString(),visibility:'operators'});
 for(const [section,record,label]of [['services',service,'Service activity'],['problems',problem,'Problem activity'],['changes',change,'Change activity'],['software-assets',software,'Software asset activity']]){
  await page.goto(base+'/app#/'+section+'/'+record.id);const disclosure=page.locator('details').filter({has:page.locator(':scope > summary').getByText(label,{exact:true})}).first();await disclosure.locator(':scope > summary').click();const timeline=disclosure.getByRole('list',{name:label,exact:true});await timeline.locator(':scope > li').first().waitFor();
  for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await timeline.scrollIntoViewIfNeeded();await fitCapture(page,out,section+'-original-history',width);}
 }
 const asset=await api('/assets',{serial:'NS-DENVER-A17',source:'Facilities purchase order PO-1042',location:'Denver stockroom'});
 await api(`/assets/${asset.id}/commands`,{command:'assign',personId:session.principal.userId,evidence:'IT desk custody receipt for the meeting room device'});
 await page.goto(base+'/app#/assets');const card=page.locator('.connection-record').filter({has:page.getByRole('heading',{name:'NS-DENVER-A17',exact:true})});await card.getByText('Serial-level custody history',{exact:true}).click();const timeline=card.getByRole('list',{name:'Asset activity',exact:true});await timeline.locator(':scope > li').first().waitFor();
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await timeline.scrollIntoViewIfNeeded();await fitCapture(page,out,'hardware-original-history',width);}
 console.log('PASS native typed history at 1440/390: dropdown/multiselect/number/boolean/date saves and original ticket, service, problem, change, software and hardware activity');
}
async function fitCapture(page,out,name,width){await page.waitForFunction(()=>!document.querySelector('.loading'));await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name} fits ${width}`);await page.screenshot({path:`${out}/DESK-017-${name}-${width}.png`,fullPage:true});}
