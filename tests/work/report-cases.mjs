import assert from 'node:assert/strict';
const check=(r,status=200)=>{assert.equal(r.status,status,JSON.stringify(r));return r.value;};
const auditor={'x-user':'report-reader','x-roles':'["auditor"]'};
export async function reportBuilderChecks(api,db,mf) {
  await db.batch([
    db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('report-reader','report-reader@example.test','Report reader','synthetic-linen-10','2026-10-23'),
    db.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('a','report-reader','["auditor"]'),
  ]);
  const tickets=[];
  for(const [title,location,sensitivity] of [['Reporting Denver','Denver','normal'],['Reporting London','London','normal'],['Reporting HR','Denver','hr'],['Reporting restricted','Denver','restricted']]) {
    tickets.push(check(await api('/work',{title,body:'Synthetic report route evidence',deduplicationKey:title,sensitivity,context:{location}}),201));
  }
  await db.batch(tickets.slice(0,2).map(r=>db.prepare('INSERT INTO work_classifications(workspace_id,work_id,current_json,state,revision,updated_at) VALUES(?,?,?,\'classified\',1,?)').bind('a',r.id,JSON.stringify({priority:'P1'}),'2026-10-23T00:00:00Z')));
  const definition={source:'tickets',columns:['id','title','priority','location'],filters:{priority:'P1'},groupBy:'location'};
  const preview=check(await api('/reports/preview',definition));
  const own=preview.rows.filter(r=>['Denver','London'].includes(r.location));
  assert.equal(own.find(r=>r.location==='Denver').count,1);
  assert.equal(own.find(r=>r.location==='London').count,1);
  const report=check(await api('/reports/custom',{name:'P1 by location',definition,sharedWith:['report-reader']}),201);
  const viewed=check(await api(`/reports/custom/${report.id}`));assert.deepEqual(viewed.rows,preview.rows);
  const csv=check(await api(`/reports/custom/${report.id}/export?format=csv`));
  assert.equal(csv,`"location","count"\r\n${preview.rows.map(r=>`"${r.location??''}","${r.count}"\r\n`).join('')}`);
  const xlsx=await mf.dispatchFetch(`http://localhost/reports/custom/${report.id}/export?format=xlsx`),bytes=Buffer.from(await xlsx.arrayBuffer());
  assert.equal(xlsx.status,200);assert.equal(bytes.readUInt32LE(0),0x04034b50);
  let offset=0,worksheet='';while(bytes.readUInt32LE(offset)===0x04034b50){const size=bytes.readUInt32LE(offset+18),length=bytes.readUInt16LE(offset+26),extra=bytes.readUInt16LE(offset+28),name=bytes.subarray(offset+30,offset+30+length).toString(),start=offset+30+length+extra;if(name==='xl/worksheets/sheet1.xml')worksheet=bytes.subarray(start,start+size).toString();offset=start+size;}
  assert.ok(worksheet.includes('Denver'));assert.ok(worksheet.includes('<v>1</v>'));assert.ok(!worksheet.includes('<f>'));
  assert.deepEqual(check(await api(`/reports/custom/${report.id}`,undefined,auditor)).rows,preview.rows);
  check(await api(`/reports/custom/${report.id}`,undefined,{'x-user':'employee','x-roles':'["employee"]'}),403);
  check(await api('/reports/preview',{source:'tickets',columns:['context_json']}),422);
  check(await api('/reports/preview',{source:'lifecycle',columns:['id']},auditor),403);
  for(const source of ['assets','changes','lifecycle'])assert.ok(Array.isArray(check(await api('/reports/preview',{source,columns:['id']})).rows));
  const audit=await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action IN ('report.saved','report.exported') AND target=?").bind(report.id).first();assert.ok(audit.n>=3);
  return {tickets,report,definition};
}
export async function biReadChecks(api,db,{tickets}) {
  const rows=check(await api('/bi/tickets',undefined,auditor)).rows;
  assert.ok(rows.some(r=>r.id===tickets[0].id));assert.ok(!rows.some(r=>tickets.slice(2).some(t=>t.id===r.id)));
  const hr=check(await api('/departments',{name:'Report retained HR',kind:'hr'}),201);
  let current=check(await api(`/work/${tickets[1].id}`)).work;
  check(await api(`/work/${current.id}/department`,{revision:current.revision,departmentId:hr.id,reason:'Synthetic report privacy route evidence'}));
  current=check(await api(`/work/${current.id}`)).work;
  check(await api(`/work/${current.id}/department`,{revision:current.revision,departmentId:null,reason:'Retain HR restriction after handoff'}));
  assert.ok(!check(await api('/bi/tickets',undefined,auditor)).rows.some(r=>r.id===current.id),'Retained HR is excluded even in legacy workspace');
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='report-reader'").run();
  check(await api('/bi/tickets',undefined,auditor),403);
  await db.prepare("UPDATE memberships SET roles_json='[\"auditor\"]' WHERE workspace_id='a' AND user_id='report-reader'").run();
}
export async function biExportChecks(api,db,{tickets}) {
  const config={name:'Nightly tickets',bucket:'synthetic-linen-1',region:'us-east-1',prefix:'reports',accessKeyId:'synthetic-linen-1',secretAccessKey:'synthetic-linen-2',consent:true};
  check(await api('/bi/exports',{...config,consent:false}),422);
  const job=check(await api('/bi/exports',config),201);assert.ok(!JSON.stringify(job).includes(config.secretAccessKey));
  const first=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(first.state,'delivered');assert.ok(first.row_count>=1);assert.ok(first.provider_ref);
  let calls=check(await api('/test/reporting-provider')).calls;const firstCsv=calls.filter(c=>c.method==='PUT').at(-1).body;
  assert.ok(firstCsv.includes(tickets[0].id));assert.ok(!firstCsv.includes(tickets[1].id));assert.ok(!firstCsv.includes(tickets[2].id));
  const changed=check(await api(`/work/${tickets[0].id}/messages`,{body:'Updated request for the next nightly export',visibility:'public',sourceMessageId:'report-update'}),201);
  assert.ok(changed);
  await db.prepare('UPDATE work_bi_exports SET next_at=? WHERE id=?').bind('2020-01-01T00:00:00Z',job.id).run();
  check(await api('/test/reporting-tick',{}));
  let receipts=check(await api(`/bi/exports/${job.id}`));assert.equal(receipts.runs.length,2);
  const second=receipts.runs.find(r=>r.id!==first.id);assert.equal(second.row_count,1);assert.equal(second.state,'delivered');
  const unchanged=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(unchanged.row_count,0);
  const beforeUnknown=(await db.prepare('SELECT row_sha256 FROM work_bi_checkpoints WHERE export_id=? AND row_id=?').bind(job.id,tickets[0].id).first()).row_sha256;
  check(await api(`/work/${tickets[0].id}/messages`,{body:'Another actual ticket update',visibility:'public',sourceMessageId:'report-update-2'}),201);
  check(await api('/test/reporting-provider',{mode:'unknown'}));
  const unknown=check(await api(`/bi/exports/${job.id}/run`,{}));assert.equal(unknown.state,'unknown');assert.equal(unknown.row_count,1);
  assert.equal((await db.prepare('SELECT row_sha256 FROM work_bi_checkpoints WHERE export_id=? AND row_id=?').bind(job.id,tickets[0].id).first()).row_sha256,beforeUnknown,'Unknown delivery does not advance the checkpoint');
  calls=check(await api('/test/reporting-provider')).calls;const count=calls.length;
  check(await api(`/bi/exports/${job.id}/run`,{}),409);
  assert.equal(check(await api('/test/reporting-provider')).calls.length,count,'No blind retry after lost response');
  await db.prepare('UPDATE work_bi_runs SET created_at=? WHERE id=?').bind('2020-01-01T00:00:00Z',unknown.id).run();
  receipts=check(await api(`/bi/exports/${job.id}/reconcile`,{}));assert.equal(receipts.runs.find(r=>r.id===unknown.id).state,'delivered');
  assert.equal(check(await api('/test/reporting-provider')).calls.at(-1).method,'HEAD');
  check(await api('/test/reporting-provider',{mode:'accepted'}));
  assert.equal(check(await api(`/bi/exports/${job.id}/run`,{})).row_count,0,'Acknowledged readback advances changed-only baseline');
  await db.prepare("UPDATE memberships SET active=0 WHERE workspace_id='a' AND user_id='owner'").run();
  const callsBeforeRevoked=check(await api('/test/reporting-provider')).calls.length;
  check(await api(`/bi/exports/${job.id}/run`,{}),404);
  assert.equal(check(await api('/test/reporting-provider')).calls.length,callsBeforeRevoked);
  await db.prepare("UPDATE memberships SET active=1 WHERE workspace_id='a' AND user_id='owner'").run();
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_events WHERE action='bi.destination_consented' AND target=?").bind(job.id).first()).n,1);
}
export async function reportScheduleChecks(api,db,{report}) {
  check(await api(`/reports/custom/${report.id}/schedules`,{channel:'slack',recipientUserId:'report-reader',frequency:'weekly',consent:true}),422);
  const schedule=check(await api(`/reports/custom/${report.id}/schedules`,{channel:'email',recipientUserId:'report-reader',frequency:'weekly',consent:true}),201);
  const beforeHold=check(await api('/test/side-mail')).calls.length;
  const settings=await db.prepare("SELECT settings_json FROM workspace_settings WHERE workspace_id='a'").first();
  await db.prepare("INSERT INTO workspace_settings(workspace_id,settings_json) VALUES('a','{\"executionHeld\":true}') ON CONFLICT(workspace_id) DO UPDATE SET settings_json=excluded.settings_json").run();
  check(await api(`/reports/schedules/${schedule.id}/run`,{}),409);
  assert.equal(check(await api('/test/side-mail')).calls.length,beforeHold,'Installation restore hold prevents report email');
  if(settings)await db.prepare("UPDATE workspace_settings SET settings_json=? WHERE workspace_id='a'").bind(settings.settings_json).run();else await db.prepare("DELETE FROM workspace_settings WHERE workspace_id='a'").run();
  const run=check(await api(`/reports/schedules/${schedule.id}/run`,{}));assert.equal(run.state,'accepted');assert.ok(run.providerRef);
  const mail=check(await api('/test/side-mail')).calls.at(-1);assert.equal(mail.personalizations[0].to[0].email,'report-reader@example.test');
  assert.ok(Buffer.from(mail.attachments[0].content,'base64').toString().includes('Denver'));
  await db.prepare("UPDATE memberships SET roles_json='[\"employee\"]' WHERE workspace_id='a' AND user_id='report-reader'").run();
  const count=check(await api('/test/side-mail')).calls.length;
  check(await api(`/reports/schedules/${schedule.id}/run`,{}),403);
  assert.equal(check(await api('/test/side-mail')).calls.length,count);
  await db.prepare("UPDATE memberships SET roles_json='[\"auditor\"]' WHERE workspace_id='a' AND user_id='report-reader'").run();
  check(await api('/test/side-mail',{mode:'unknown'}));
  assert.equal(check(await api(`/reports/schedules/${schedule.id}/run`,{})).state,'unknown');
  const unknownCount=check(await api('/test/side-mail')).calls.length;
  check(await api(`/reports/schedules/${schedule.id}/run`,{}),409);
  assert.equal(check(await api('/test/side-mail')).calls.length,unknownCount);
  check(await api('/test/side-mail',{mode:'accepted'}));
}
