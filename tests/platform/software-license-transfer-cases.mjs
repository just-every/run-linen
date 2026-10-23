import assert from 'node:assert/strict';

// Configuration crosses the actual rer export/reset/import command door.
export async function seedSoftwareLicensing(env,stamp) {
 const data={softwareLicense:true,name:'Zoom Workplace',publisher:'Zoom',titleOwnerId:'owner',serviceId:'service',metric:'per-user',policy:'managed',contract:{seats:120,currency:'USD',renewalAt:'2027-01-21T00:00:00Z',annualCostUsd:24000,trueUpUnitUsd:200,reference:'PO-SOFTWARE'},sourceBindings:[],lastDeviceUserChange:{userId:'owner',deviceId:'synthetic-linen-706'},deviceUsers:[{connectionId:'connection',deviceId:'synthetic-linen-706',userId:'owner'}],grantVersion:7,grant:{version:7,principalId:'owner',targets:['synthetic-linen-701']},observation:{users:[{id:'synthetic-linen-701',email:'synthetic-linen-702@example.test'}],installations:[],observedAt:stamp},effectTargets:[{operationId:'synthetic-linen-704',targetId:'synthetic-linen-701'}],reminders:[],complianceWork:[]};
 await env.DB.batch([
  env.DB.prepare("INSERT INTO svc_records VALUES(?,?,'asset',?,'restricted','[]',?,1,?,?)").bind('synthetic-linen-703','workspace','owner',JSON.stringify(data),stamp,stamp),
  env.DB.prepare("INSERT INTO svc_software_effects VALUES(?,?,?,?,?,'reclaim',?,?,?,'sending',?,?)").bind('synthetic-linen-704','workspace','synthetic-linen-703',7,'synthetic-linen-705','connection',1,1,stamp,stamp),
 ]);
}
export async function assertRestoredSoftwareLicensing(env) {
 const row=await env.DB.prepare("SELECT data_json FROM svc_records WHERE id='synthetic-linen-703'").first();
 const data=JSON.parse(row.data_json);
 assert.equal(data.contract.seats,120,'Business contract survives actual archive transfer');
 assert.equal(data.grant,null,'Imported data confers no software execution grant');
 assert.equal(data.observation,null,'Fresh provider observation is required after restore');
 assert.deepEqual(data.effectTargets,[],'Provider identity and effect payloads do not resume from archive');
 assert.deepEqual(data.deviceUsers,[],'Restored inventory does not restore member-binding authority');
 assert.equal(data.lastDeviceUserChange,null);
 assert.equal(data.restoredReview,true);
 assert.equal((await env.DB.prepare("SELECT state FROM svc_software_effects WHERE id='synthetic-linen-704'").first()).state,'unknown','An interrupted effect retains its no-resend fence');
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM svc_software_guards').first()).n,0);
 console.log('PASS actual rer software-license transfer: contract retained, grants and observations absent, interrupted effect held unknown');
}
