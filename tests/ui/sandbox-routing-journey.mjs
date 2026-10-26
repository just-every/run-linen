import assert from 'node:assert/strict';
import {captureJourney} from './viewport-evidence.mjs';

export async function seedSandboxRouting({api,owner,team,department,calendar,suffix}) {
 const destination=await api('/work-groups',{name:'Sandbox destination '+suffix,departmentId:department.id});
 const requesterGroup=await api('/requester-groups',{name:'Sandbox requester group '+suffix,memberIds:[owner]});
 const service=await api('/services',{name:'Sandbox service '+suffix,ciType:'business_service',description:'synthetic-linen-510',businessImpact:'synthetic-linen-511',provenance:'observed',source:'synthetic-linen-512',observedAt:new Date().toISOString(),freshnessMs:86400000});
 await api('/work-routing/support-groups/'+service.id,{groupId:team.id});await api('/work-routing/agents/'+owner,{calendarId:calendar.id,skills:['synthetic-linen-513']});
 const position=Math.max(0,...(await api('/work-routing')).rules.map(row=>row.position))+1;
 const rule=await api('/work-routing/rules',{name:'Sandbox routing '+suffix,position,requesterId:owner,groupId:team.id});
 return {destination,requesterGroup,service,rule,owner,department,team,before:await api('/work-routing')};
}
export async function editSandboxRouting({page,api,path,out,suffix,writeClick,routing}) {
 const disclosure=label=>page.locator('details').filter({has:page.locator(':scope > summary',{hasText:label})}).first();
 let editor=disclosure('Edit routing: Sandbox routing '+suffix);await editor.locator(':scope > summary').press('Enter');
 await editor.getByLabel('Routing rule name',{exact:true}).fill('Reviewed routing '+suffix);await editor.getByLabel('Rule position',{exact:true}).fill(String(routing.rule.position+1));await editor.getByLabel('Routing department',{exact:true}).selectOption(routing.department.id);await editor.getByLabel('Routing category',{exact:true}).selectOption('hardware');await editor.getByLabel('Routing requester',{exact:true}).selectOption(routing.owner);await editor.getByLabel('Routing requester group',{exact:true}).selectOption(routing.requesterGroup.id);await editor.getByLabel('Required agent skill',{exact:true}).fill('synthetic-linen-514');await editor.getByLabel('Destination support group',{exact:true}).selectOption(routing.destination.id);
 await captureJourney(page,{path:out+'/SANDBOX-001-routing-editor.png',fullPage:true});await writeClick(editor.getByRole('button',{name:'Save sandbox routing',exact:true}),path+'/sla-configuration/routing/'+routing.rule.id,'PUT');
 editor=disclosure('Edit support: Sandbox service '+suffix);await editor.locator(':scope > summary').press('Enter');await editor.getByLabel('Destination support group',{exact:true}).selectOption(routing.destination.id);await captureJourney(page,{path:out+'/SANDBOX-001-support-editor.png',fullPage:true});await writeClick(editor.getByRole('button',{name:'Save sandbox support',exact:true}),path+'/sla-configuration/support/'+routing.service.id,'PUT');
 const ownerName=(await api('/members')).find(member=>member.id===routing.owner).name;
 editor=disclosure('Edit agent: '+ownerName);await editor.locator(':scope > summary').press('Enter');await editor.getByLabel('Agent shift calendar',{exact:true}).selectOption('');await editor.getByLabel('Agent skills (comma separated)',{exact:true}).fill('synthetic-linen-514');await captureJourney(page,{path:out+'/SANDBOX-001-agent-editor.png',fullPage:true});await writeClick(editor.getByRole('button',{name:'Save sandbox agent',exact:true}),path+'/sla-configuration/agent/'+routing.owner,'PUT');
 editor=disclosure('Edit assignment: Sandbox destination '+suffix);await editor.locator(':scope > summary').press('Enter');await editor.getByLabel('Automatic assignment',{exact:true}).selectOption('load');await editor.getByLabel('Open tickets per agent',{exact:true}).fill('5');await captureJourney(page,{path:out+'/SANDBOX-001-assignment-editor.png',fullPage:true});await writeClick(editor.getByRole('button',{name:'Save sandbox assignment',exact:true}),path+'/sla-configuration/assignment/'+routing.destination.id,'PUT');
 for(const [family,label] of [['routing','Reviewed routing '+suffix],['support','Sandbox service '+suffix],['agent',ownerName],['assignment','Sandbox destination '+suffix]]) {
  editor=disclosure('Edit '+family+': '+label);await editor.locator(':scope > summary').press('Enter');await writeClick(editor.getByRole('button',{name:'Test sandbox '+family,exact:true}),path+'/test-configuration');
 }
 const rehearsal=disclosure('Rehearse sandbox routing');await rehearsal.locator(':scope > summary').press('Enter');await rehearsal.getByLabel('Rehearsal category',{exact:true}).selectOption('hardware');await rehearsal.getByLabel('Rehearsal requester',{exact:true}).selectOption(routing.owner);await rehearsal.getByLabel('Rehearsal department',{exact:true}).selectOption(routing.department.id);
 await writeClick(rehearsal.getByRole('button',{name:'Test routing destination',exact:true}),path+'/test-routing');await rehearsal.getByText('Routing preview: Sandbox destination '+suffix+' · First matching rule · load · Skill: synthetic-linen-514 · Cap: 5',{exact:true}).waitFor();
 await captureJourney(page,{path:out+'/SANDBOX-001-routing-rehearsal.png',fullPage:true});await rehearsal.getByLabel('Rehearsal service',{exact:true}).selectOption(routing.service.id);await writeClick(rehearsal.getByRole('button',{name:'Test routing destination',exact:true}),path+'/test-routing');await rehearsal.getByText('Routing preview: Sandbox destination '+suffix+' · Service support binding · load · Cap: 5',{exact:true}).waitFor();
 assert.deepEqual(await api('/work-routing'),routing.before,'Native edits and rehearsals do not affect production routing');
}
export async function assertSandboxRoutingPromoted(api,routing) {
 const current=await api('/work-routing');assert.equal(current.rules.find(row=>row.id===routing.rule.id).department_id,routing.department.id);assert.equal(current.supportGroups.find(row=>row.itemId===routing.service.id).groupId,routing.destination.id);assert.equal(current.groups.find(row=>row.id===routing.destination.id).mode,'load');assert.deepEqual(current.agents.find(row=>row.userId===routing.owner).skills,['synthetic-linen-514']);
}
