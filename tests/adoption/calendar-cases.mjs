import assert from 'node:assert/strict';
export async function attachArchiveCalendar(ok,request,auth) {
  const service=await ok('/services','POST',{name:'Portable calendar CI',description:'Payroll service',businessImpact:'Payroll blocked',source:'Reviewed register',observedAt:new Date().toISOString()},auth,201);
  await ok('/members','POST',{email:'calendar-owner@test.invalid',name:'Calendar owner',password:'calendar owner secure password',roles:['owner']},auth,201);
  const login=await request('/login','POST',{email:'calendar-owner@test.invalid',password:'calendar owner secure password'});assert.equal(login.status,200);
  const calendarOwner={cookie:login.headers.get('set-cookie').split(';')[0]};calendarOwner.csrf=(await ok('/session','GET',undefined,calendarOwner)).csrfToken;
  await ok('/change-windows','POST',{title:'Portable freeze',kind:'freeze',window:{start:'2030-12-24T00:00:00Z',end:'2031-01-02T00:00:00Z'},services:[service.id],active:true},calendarOwner,201);
}
export async function checkArchiveCalendar(ok,auth) {
  const data=await ok('/change-calendar?from=2030-12-01T00:00:00Z&to=2031-02-01T00:00:00Z&timezone=UTC','GET',undefined,auth);
  const window=data.windows.find(w=>w.data.title==='Portable freeze');assert.ok(window,'CHANGE-004 freeze survives native archive');
  assert.equal(window.data.active,false,'CHANGE-004 native restore never activates calendar policy');
  const service=(await ok('/services','GET',undefined,auth)).items.find(s=>s.data.name==='Portable calendar CI');
  assert.ok(service);assert.deepEqual(window.data.services,[service.id],'CHANGE-004 archived CI references remap');
  const active=await ok('/change-windows/'+window.id,'POST',{...window.data,revision:window.revision,active:true},auth);
  assert.equal(active.data.active,true,'CHANGE-004 current owner explicitly reactivates restored policy');
  console.log('PASS CHANGE-004 native archive: freeze and CI links retained, policy inactive until current owner reactivation');
  return window;
}

export async function checkCalendarHistoricalErasure(ok,request,auth) {
  const path='/change-calendar?from=2030-12-01T00:00:00Z&to=2031-02-01T00:00:00Z&timezone=UTC';
  const window=(await ok(path,'GET',undefined,auth)).windows.find(w=>w.data.title==='Portable freeze');assert.ok(window);
  const session=await ok('/session','GET',undefined,auth);assert.notEqual(window.ownerId,session.principal.userId);
  let erase=await ok('/adoption/erase','POST',{identity:window.ownerId},auth);
  for(let i=0;i<20&&erase.state!=='completed';i++){await ok('/fixtures/sweep','POST',{},auth);erase=await ok('/adoption/erase/'+erase.id+'/resume','POST',{},auth);}
  assert.equal(erase.state,'completed',JSON.stringify(erase));
  const retained=(await ok(path,'GET',undefined,auth)).windows.find(w=>w.id===window.id);
  assert.ok(retained,'CHANGE-004 historical owner erasure keeps the business calendar readable');
  assert.equal(retained.data.active,true,'CHANGE-004 identity erasure does not withdraw an active business freeze');
  assert.deepEqual(retained.data.window,window.data.window);assert.deepEqual(retained.data.services,window.data.services);
  assert.notEqual(retained.ownerId,window.ownerId,'CHANGE-004 original owner identity is scrubbed');
  const proposed={title:'Must respect retained freeze',risk:'Bounded',impact:'Payroll',services:retained.data.services,window:{start:'2030-12-27T01:00:00Z',end:'2030-12-27T02:00:00Z'},cohorts:['Denver'],canaryCohorts:['Denver'],implementation:{release:'reviewed'},compensation:{release:'prior'}};
  assert.equal((await request('/changes','POST',proposed,auth)).status,409,'CHANGE-004 native erasure cannot unlock frozen scheduling');
  console.log('PASS CHANGE-004 historical source-owner erasure: anonymous business freeze retained, scoped calendar readable and scheduling still refused');
}
