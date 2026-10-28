import assert from 'node:assert/strict';

/** These records cross the actual rer export/reset/import door in base-auth-transfer.mjs. */
export async function seedReportingNotifications(env,stamp) {
 const db=env.DB,w='workspace';
 await db.batch([
  db.prepare('INSERT INTO billing_plans VALUES(?,1,2500,?,?)').bind(w,'Agreed service plan',stamp),
  db.prepare('INSERT INTO work_reports VALUES(?,?,?,?,?,?,1,?)').bind('synthetic-linen-600',w,'owner','Saved service report',JSON.stringify({source:'tickets',columns:['id','state']}),'["other"]',stamp),
  db.prepare('INSERT INTO work_report_schedules VALUES(?,?,?,?,?,?,?,1,1,?)').bind('synthetic-linen-601',w,'synthetic-linen-600','owner','other','weekly',stamp,stamp),
  db.prepare('INSERT INTO work_report_deliveries VALUES(?,?,?,\'unknown\',NULL,1,NULL,?,NULL)').bind('synthetic-linen-602',w,'synthetic-linen-601',stamp),
  db.prepare('INSERT INTO work_bi_exports VALUES(?,?,?,?,?,?,1,1,?,?)').bind('synthetic-linen-603',w,'owner','Nightly ticket archive',JSON.stringify({provider:'s3',bucket:'synthetic-linen-1',region:'us-east-1',prefix:'tickets'}),'synthetic-linen-604',stamp,stamp),
  db.prepare("INSERT INTO work_bi_runs VALUES(?,?,?,'unknown',?,?,1,?,NULL,NULL,?,NULL)").bind('synthetic-linen-605',w,'synthetic-linen-603','tickets/synthetic-linen-605.csv','synthetic-linen-606','[{"id":"work","sha256":"synthetic-linen-607"}]',stamp),
  db.prepare('INSERT INTO work_bi_checkpoints VALUES(?,?,?,?)').bind(w,'synthetic-linen-603','work','synthetic-linen-607'),
  db.prepare('INSERT INTO notification_templates VALUES(?,?,1,?,?,?,?,?,?)').bind(w,'synthetic-linen-608','Resolved template','en-US','Resolved {{ticket.number}}','Ready for {{requester.first_name}}','owner',stamp),
  db.prepare("INSERT INTO notification_rules VALUES(?,?,1,?,?,'{}',?,?, 'portal',NULL,NULL,0,1,?,?,?)").bind(w,'synthetic-linen-609','Resolved notice','ticket.resolved','[{"type":"field","value":"requester"}]','synthetic-linen-608','owner','owner',stamp),
  db.prepare("INSERT INTO notification_preferences VALUES(?,?,'ticket.public_update','portal',0,'en-US',?)").bind(w,'owner',stamp),
  db.prepare('INSERT INTO notification_branding VALUES(?,1,NULL,?,?,?,?,?,?,?)').bind(w,'#23483b','#17251d','connection',1,'example.test','owner',stamp),
  db.prepare("INSERT INTO notification_deliveries VALUES(?,?,?,1,?,1,?,1,?,'ticket.resolved','portal',?,0,'available',?)").bind('synthetic-linen-610',w,'work','synthetic-linen-609','synthetic-linen-608','owner','synthetic-linen-611',stamp),
 ]);
}
export async function assertRestoredReportingNotifications(env) {
 const db=env.DB;
 assert.equal((await db.prepare("SELECT agent_seat_cents FROM billing_plans WHERE workspace_id='workspace'").first()).agent_seat_cents,2500);
 assert.deepEqual(JSON.parse((await db.prepare("SELECT shared_json FROM work_reports WHERE id='synthetic-linen-600'").first()).shared_json),[],'Report definitions survive without restored sharing authority');
 assert.equal((await db.prepare("SELECT active FROM work_report_schedules WHERE id='synthetic-linen-601'").first()).active,0);
 assert.deepEqual(await db.prepare("SELECT active,credential_cipher FROM work_bi_exports WHERE id='synthetic-linen-603'").first(),{active:0,credential_cipher:''},'Destination metadata survives without credentials or recurring consent');
 assert.equal((await db.prepare('SELECT count(*) n FROM work_bi_checkpoints').first()).n,0);
 assert.deepEqual(await db.prepare("SELECT state,snapshot_json FROM work_bi_runs WHERE id='synthetic-linen-605'").first(),{state:'restored-inert',snapshot_json:'[]'});
 assert.deepEqual(await db.prepare("SELECT enabled,consented_by FROM notification_rules WHERE id='synthetic-linen-609'").first(),{enabled:0,consented_by:null},'Restored notification configuration cannot send');
 assert.equal((await db.prepare("SELECT body FROM notification_templates WHERE id='synthetic-linen-608'").first()).body,'Ready for {{requester.first_name}}');
 assert.equal((await db.prepare("SELECT enabled FROM notification_preferences WHERE user_id='owner'").first()).enabled,0,'Opt-outs survive restore');
 assert.deepEqual(await db.prepare("SELECT sender_connection_id,sender_domain FROM notification_branding WHERE workspace_id='workspace'").first(),{sender_connection_id:null,sender_domain:null});
 assert.equal((await db.prepare("SELECT state FROM notification_deliveries WHERE id='synthetic-linen-610'").first()).state,'restored-inert');
 console.log('PASS actual rer report and notification transfer: retained configuration, absent credentials, disabled destinations/rules/sharing, retained opt-out, inert receipts');
}
