import assert from 'node:assert/strict';
import { action, fields, createConnection, local } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';
export async function connectedSetup({page,api,base,out,fixture}) {
  await page.goto(base+'/app#/members');
  const employee=await action(page,'Add a workspace member',{name:'Avery Colleague',email:'avery@example.test',password:'Connected-browser-2026',roles:['employee']},'/members','Save',201);
  const graph=await createConnection(page,api,base,'microsoft-graph','Selected fixture directory',{tenantId:'11111111-1111-1111-1111-111111111111',clientId:'fixture-app',clientSecret:'fixture-secret'});
  const card=page.locator('.connection-record').filter({has:page.getByRole('heading',{name:'Selected fixture directory',exact:true})});
  await fixture({directoryUnavailable:true});
  await page.goto(base+'/app#/connections');
  const failed=page.waitForResponse(r=>r.url().endsWith('/connections/'+graph.id+'/test'));
  await card.getByRole('button',{name:'Check again',exact:true}).click();assert.equal((await failed).status(),503);
  await card.getByRole('alert').waitFor();await captureJourney(page,{path:out+'/J1-external-unavailable.png',fullPage:true});
  await fixture({directoryUnavailable:false});
  const recovered=page.waitForResponse(r=>r.url().endsWith('/connections/'+graph.id+'/test'));
  await card.getByRole('button',{name:/Check/}).click();assert.equal((await recovered).status(),200);
  Object.assign(graph,(await api("/connections")).find(c=>c.id===graph.id));
  const grantsBefore=await api('/grants');
  await card.getByRole('button',{name:'Discover available facts'}).click();
  for(let i=0;i<4;i++){
    await page.getByRole('button',{name:'Continue remaining discovery',exact:true}).waitFor();
    const response=page.waitForResponse(r=>r.url().endsWith('/discover'));
    await page.getByRole('button',{name:'Continue remaining discovery',exact:true}).click();assert.equal((await response).status(),200);
  }
  await page.getByRole('button',{name:'Keep selected facts'}).waitFor();
  await page.getByLabel('Avery Colleague', {exact:false}).filter({hasNot:page.locator('select')}).first().check();
  const snapshot=(await api('/connection-discovery')).snapshots.find(s=>s.connectionId===graph.id);
  assert.equal(snapshot.state,'complete');assert.ok(snapshot.gaps.some(g=>g.includes('executor')));
  const apply=page.waitForResponse(r=>r.url().endsWith('/apply'));
  await page.getByRole('button',{name:'Keep selected facts'}).click();assert.equal((await apply).status(),200);
  assert.deepEqual(await api('/grants'),grantsBefore);
  assert.ok((await api('/people')).items.some(p=>p.name==='Avery Colleague'));
  const device=page.locator('label.review-item').filter({hasText:'Avery laptop'}).locator('input');assert.equal(await device.isDisabled(),true,'Directory discovery does not claim physical custody');
  await captureJourney(page,{path:out+'/J1-discovery-review.png',fullPage:true});
  await page.getByText('Review people and service authority',{exact:true}).click();
  await page.locator('select[name=person]').selectOption(employee.id);
  await page.locator('select[name=candidate]').selectOption(snapshot.items.find(i=>i.kind==='users').itemId);
  const mapped=page.waitForResponse(r=>r.url().endsWith('/subject-mappings')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Validate this identity relationship'}).click();assert.equal((await mapped).status(),201);
  const actor=await action(page,'Create Linen’s non-interactive service identity',{name:'Linen fixture service'},'/automation-principals','Save',201);
  const probe=await createConnection(page,api,base,'workflow-probe','Independent fixture workflow',{baseUrl:'https://probe.example.com/observe',allowedHosts:'probe.example.com',token:'test-only-probe'});
  const deployment=await createConnection(page,api,base,'controlled-deployment','Owned fixture release',{baseUrl:'https://deploy.example.com/release',allowedHosts:'deploy.example.com',token:'test-only-release',targets:'orders'});
  const notification=await createConnection(page,api,base,'notification-webhook','Fixture delivery',{baseUrl:'https://notify.example.com/send',allowedHosts:'notify.example.com',token:'test-only-notify'});
  const model=await createConnection(page,api,base,'openai','Fixture reasoning',{model:'fixture-model',apiKey:'test-only-model',inputUsdPerMillion:1,cachedInputUsdPerMillion:1,outputUsdPerMillion:1,maxOutputTokens:1000,maxAttemptUsd:1,limitUsd:10});
  await page.locator('.connection-record').filter({has:page.getByRole('heading',{name:'Fixture reasoning',exact:true})}).getByRole('button',{name:'Use for service reasoning'}).click();
  await page.getByText('Default reasoning connection',{exact:true}).waitFor();
  const settings=await api('/settings');await api('/settings',{revision:settings.revision,settings:{...settings.settings,notificationConnectionId:notification.id}},'PATCH');
  await page.goto(base+'/app#/imports');
  await action(page,'Choose private archive retention',{archiveDays:14},'/adoption/retention');
  assert.equal((await api('/adoption/retention')).archive_days,14);
  const ownedResource=graph.id+':reserved-test-target:provider-colleague';
  const ownership=await action(page,'Choose who runs one action',{resource:ownedResource,action:'group.add'},'/adoption/ownership');
  const conflict=await action(page,'Choose who runs one action',{resource:ownedResource,action:'group.add'},'/adoption/ownership','Save',409);
  assert.equal(conflict.error.code,'ownership_revision_conflict');
  const reconciled=await action(page,'Choose who runs one action',{resource:ownedResource,action:'group.add',expectedRevision:ownership.revision},'/adoption/ownership');
  assert.equal(reconciled.fence,ownership.fence+1);
  const snapshotArchive=await action(page,'Create a portable snapshot',{},'/exports','Start snapshot',201);
  for(let i=0;i<100;i++){
    const snap=await api('/exports/'+snapshotArchive.id);if(snap.state==='ready')break;
    const advanced=page.waitForResponse(r=>r.url().endsWith('/exports/'+snapshotArchive.id+'/advance'));
    await page.getByRole('button',{name:'Continue snapshot',exact:true}).click();await advanced;
  }
  await page.getByRole('button',{name:'Download snapshot summary',exact:true}).waitFor();
  assert.equal((await api('/exports/'+snapshotArchive.id)).state,'ready');
  await captureJourney(page,{path:out+'/J1-executor-conflict-private-retention-recovery.png',fullPage:true});
  return {employee,graph,probe,deployment,notification,model,actor};
}
export async function nativeGrantPair({page,api,base,employee,actor,probe,catalog}) {
  await page.goto(base+'/app#/grants');
  await page.getByLabel('Service identity',{exact:true}).selectOption(actor.id);
  const mapping=(await api('/subject-mappings')).find(m=>m.localUserId===employee.id);
  await page.getByLabel('Colleague and reviewed account').selectOption(mapping.id);
  await page.getByLabel('Catalogue service').selectOption(catalog.id);
  await page.getByLabel('Independent verifier',{exact:true}).selectOption(probe.id);
  await page.getByLabel('Authority begins',{exact:true}).first().fill(local(-60000));
  await page.getByLabel('Requested access expiry').fill(local(3600000));
  await page.getByLabel('Authority ends, after removal').fill(local(7200000));
  await page.getByLabel('Maximum uses per permission').fill('20');
  await page.getByRole('button',{name:'Review these permissions',exact:true}).click();
  await page.getByRole('button',{name:'Issue these two permissions'}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('p')].filter(e=>e.textContent.includes('Recorded · exact reviewed scope')).length===2);
  const pair=(await api('/grants')).filter(g=>g.principal_id===actor.id&&g.target===catalog.target);assert.equal(pair.length,2);return pair;
}
