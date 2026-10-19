import assert from 'node:assert/strict';
import { action } from './connected-helpers.mjs';
import { captureJourney } from './viewport-evidence.mjs';
export async function dependencyJourney({page,api,base,out}) {
  const observedAt=new Date(Date.now()-60000).toISOString().slice(0,16);
  async function item(name,ciType) {
    await page.goto(base+'/app#/services');
    if(name==='Payroll') {await page.getByText('Add service',{exact:true}).click();await captureJourney(page,{path:out+'/ASSET-009-create-item.png',fullPage:true});}
    const r=await action(page,'Add service',{name,ciType,description:`${name} configuration`,businessImpact:'Payroll unavailable',source:'IT configuration register',observedAt,freshnessMs:86400000},'/services','Save',201);
    await page.getByRole('heading',{name,exact:true}).waitFor();return r;
  }
  const payroll=await item('Payroll','business_service'),gusto=await item('Gusto','saas_app'),sso=await item('SSO service','software');
  await page.goto(base+'/app#/services/'+payroll.id);
  const edge={provenance:'asserted',relationship:'depends_on',source:'Reviewed payroll dependency map',sourceRevision:'1',observedAt,effectiveAt:observedAt,freshnessMs:86400000};
  await action(page,'Record a dependency',{...edge,to:gusto.id},'/service-graph/edges','Save',201);
  await action(page,'Record a dependency',{...edge,to:sso.id},'/service-graph/edges','Save',201);
  await page.getByRole('link',{name:'Gusto recorded',exact:true}).waitFor();
  await captureJourney(page,{path:out+'/ASSET-009-dependencies.png',fullPage:true});
  const change=await api('/changes',{title:'Upgrade SSO service',risk:'Sign-in interruption',impact:'Payroll users',services:[sso.id],window:{start:new Date().toISOString(),end:new Date(Date.now()+3600000).toISOString()},cohorts:['staff'],canaryCohorts:['staff'],implementation:{release:'new'},compensation:{release:'prior'}});
  await page.goto(base+'/app#/changes/'+change.id);
  await page.getByRole('link',{name:'Payroll recorded',exact:true}).waitFor();
  assert.ok((await api(`/changes/${change.id}/impact`)).downstream.some(n=>n.id===payroll.id));
  await captureJourney(page,{path:out+'/ASSET-009-change-impact.png',fullPage:true});
  const incident=await api('/incidents',{title:'SSO sign-in interrupted',serviceId:sso.id,impact:'Payroll blocked',cohorts:['staff']});
  await page.goto(base+'/app#/incidents/'+incident.id);
  await page.getByRole('link',{name:'Payroll recorded',exact:true}).waitFor();
  await captureJourney(page,{path:out+'/ASSET-009-incident-impact.png',fullPage:true});
  await api('/service-graph/edges',{from:payroll.id,to:sso.id,...edge,observedAt:'2020-01-01T00:00:00Z',effectiveAt:'2020-01-01T00:00:00Z',freshnessMs:1});
  await page.reload();
  await page.getByText('stale',{exact:true}).waitFor();
  await captureJourney(page,{path:out+'/ASSET-009-stale-relationship.png',fullPage:true});
  console.log('PASS ASSET-009 browser: typed CIs and Payroll dependencies, change/incident impact and marked stale relationship at 1440/390');
}
