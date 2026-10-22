import assert from 'node:assert/strict';

export async function departmentReportChecks(api,db) {
  const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r.value;};
  const agent={"x-user":"department-report-agent","x-roles":'["operator"]'};
  await db.batch([
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('department-report-agent','department-agent@example.test','Facilities reporting agent','synthetic-linen-12005','2026-10-22'),
    db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a','department-report-agent','["operator"]'),
  ]);
  const facilities=check(await api('/departments',{name:'Facilities reports',kind:'facilities'}),201);
  const finance=check(await api('/departments',{name:'Finance reports',kind:'finance'}),201);
  let membership=check(await api(`/departments/${facilities.id}/members`,{revision:facilities.revision,userId:'department-report-agent',active:true}));
  const tickets=[];
  for(const [department,minutes] of [[facilities,12],[finance,23]]) {
    const work=check(await api('/work',{title:`${department.name} service question`,body:'Reviewed service question',kind:'question',departmentId:department.id,deduplicationKey:`report-${department.id}`}),201);
    const entry=check(await api(`/work/${work.id}/time`,{source:'manual',minutes,deduplicationKey:`effort-${department.id}`,note:'Reviewed department service work'}),201);
    check(await api(`/work/${work.id}/commands`,{revision:work.revision,command:'close',reason:'Question answered and confirmed'}));
    await db.batch([
      db.prepare('UPDATE work_records SET created_at=? WHERE id=?').bind('2098-02-01T00:00:00.000Z',work.id),
      db.prepare('UPDATE work_time_entries SET created_at=? WHERE id=?').bind('2098-02-01T00:00:00.000Z',entry.id),
    ]);
    tickets.push(work);
  }
  const range='from=2098-01-01T00%3A00%3A00.000Z&to=2099-01-01T00%3A00%3A00.000Z';
  const staff=check(await api(`/reports/work?${range}`,undefined,agent));
  assert.equal(staff.resolutions.denominator,1,'Resolution counts exclude other department tickets before aggregation');
  assert.equal(staff.effort.groups.reduce((sum,row)=>sum+row.activeMinutes,0),12);
  assert.equal(staff.effort.byRequestType.reduce((sum,row)=>sum+row.incoming,0),1);
  const owner=check(await api(`/reports/work?${range}`));
  assert.equal(owner.resolutions.denominator,2);
  assert.equal(owner.effort.groups.reduce((sum,row)=>sum+row.activeMinutes,0),35);
  check(await api(`/departments/${facilities.id}/members`,{revision:membership.revision,userId:'department-report-agent',active:false}));
  const revoked=check(await api(`/reports/work?${range}`,undefined,agent));
  assert.equal(revoked.resolutions.denominator,0);
  assert.deepEqual(revoked.effort.groups,[]);
  assert.deepEqual(revoked.effort.byRequestType,[]);
  const own=check(await api('/work',{title:'My Finance service question',body:'Public employee request',kind:'question',departmentId:finance.id,deduplicationKey:'department-public-staff-request'},agent),201);
  check(await api(`/work/${own.id}`,undefined,agent));
  const field=check(await api('/desk-fields',{name:'Department service detail',type:'text',kinds:['question'],requiredOn:[]}),201);
  check(await api(`/work/${own.id}/fields`,{fieldId:field.id,value:'Attempted staff-only field change'},agent),403);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM work_field_values WHERE workspace_id=? AND work_id=?').bind('a',own.id).first()).n,0);
  await db.prepare('UPDATE work_records SET created_at=? WHERE id=?').bind('2098-03-01T00:00:00.000Z',own.id).run();
}
