import {captureArchiveAliasStatements,captureKnownArchiveAliasStatements} from '../../src/features/history/archive-identities.mjs'
import {fileRecords} from '@runeditrun/rer/modules/portability/files'
import {mailEdge} from './mail-edge.mjs'
// Public rer archive/reset/import flow on disposable actual D1/R2 state.
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {cp,mkdtemp,symlink,rm,writeFile,readFile,mkdir,readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {createServer} from 'node:net'
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
import {getPlatformProxy} from 'wrangler'
const require=createRequire(await import.meta.resolve('wrangler/package.json'))
const {build}=require('esbuild'),{Miniflare,convertV4MiniflareOptions}=require('miniflare')
const source=process.cwd(),dir=await mkdtemp(join(tmpdir(),'linen-transfer-')),root=join(dir,'seed'),archive=join(dir,'before.rer'),later=join(root,'exports','after.rer')
const commandEnvironment={...process.env,WRANGLER_SEND_METRICS:'false',CI:'true'}
// The scratch checkout owns its own state; the verifier's lease belongs to source.
delete commandEnvironment.RER_LOCAL_OPERATION
let proxy,mf
async function run(args,expected=0){let output='';const child=spawn('pnpm',args,{cwd:root,env:commandEnvironment,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',c=>output+=c);const code=await new Promise(r=>child.once('exit',r));assert.equal(code,expected,args.slice(0,3).join(' ')+'\n'+output.slice(-8000));console.log('PASS command '+args.slice(0,3).join(' '));return output}
async function open(){proxy=await getPlatformProxy({configPath:join(root,'wrangler.jsonc'),persist:{path:join(root,'.wrangler/state/v3')},remoteBindings:false});return {...proxy.env,ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}}
async function close(){await proxy?.dispose();proxy=null}
try{
 await cp(source,root,{recursive:true,filter:p=>{const rel=p.slice(source.length+1);return !rel||!['.git','node_modules','.wrangler','.rer','.seed','dist','exports','.dev.vars','.dev.vars.previous'].some(x=>rel===x||rel.startsWith(x+'/'))}})
 await symlink(resolve('node_modules'),join(root,'node_modules'),'dir')
 await writeFile(join(root,'.dev.vars'),'ENCRYPTION_KEY='+Buffer.alloc(32,7).toString('base64')+'\n')
 // API-003 restore compatibility: produce an actual pre-MCP archive through rer,
 // then apply the additive migration and import it without inventing credentials.
 await mkdir(join(root,'pre-mcp-migrations'));
 for(const name of (await readdir(join(root,'migrations'))).filter(name=>name.endsWith('.sql')&&name<'0769_mcp_credentials.sql'))await cp(join(root,'migrations',name),join(root,'pre-mcp-migrations',name));
 const priorConfig=JSON.parse(await readFile(join(root,'wrangler.jsonc'),'utf8'));
 priorConfig.d1_databases[0].migrations_dir='pre-mcp-migrations';
 await writeFile(join(root,'pre-mcp-wrangler.json'),JSON.stringify(priorConfig));
 await run(['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to','.wrangler/state','--config','pre-mcp-wrangler.json']);
 const oldEnv=await open();
 await oldEnv.DB.batch([
  oldEnv.DB.prepare("INSERT INTO workspaces VALUES('pre-mcp','Prior','2026')"),
  oldEnv.DB.prepare("INSERT INTO users VALUES('pre-owner','pre-owner@example.test','Prior owner','unused','2026')"),
  oldEnv.DB.prepare("INSERT INTO memberships VALUES('pre-mcp','pre-owner','[\"owner\"]',1)"),
  oldEnv.DB.prepare("INSERT INTO workspace_settings(workspace_id) VALUES('pre-mcp')"),
  oldEnv.DB.prepare("INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,created_at,updated_at,dedup_key) VALUES('pre-work','pre-mcp','pre-owner','pre-owner','request','Pre-MCP retained ticket','2026','2026','pre-mcp')"),
 ]);await close();
 const preMcpArchive=join(dir,'pre-mcp.rer');
 await run(['exec','rer','export','--output',preMcpArchive]);
 await run(['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc'])
 await run(['exec','rer','reset','--yes']);
 await run(['exec','rer','import','--input',preMcpArchive,'--yes']);
 const upgraded=await open();
 assert.equal((await upgraded.DB.prepare("SELECT title FROM work_records WHERE id='pre-work'").first()).title,'Pre-MCP retained ticket','API-003 pre-MCP archive still restores after additive migration');
 assert.equal((await upgraded.DB.prepare('SELECT count(*) n FROM mcp_credentials').first()).n,0,'API-003 old archive introduces no credential authority');
 await close();await run(['exec','rer','reset','--yes']);
 await rm(join(root,'pre-mcp-migrations'),{recursive:true,force:true});await rm(join(root,'pre-mcp-wrangler.json'));
 await run(['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to','.wrangler/state','--config','wrangler.jsonc']);

 let env=await open();const stamp=new Date().toISOString()
 const retainedHrDepartment={id:'synthetic-linen-12005',workspace_id:'workspace',name:'synthetic-linen-12006',kind:'hr',active:1,revision:1,created_at:stamp,updated_at:stamp};
 const retainedRole={id:'synthetic-linen-12014',workspace_id:'workspace',department_id:'retained-facilities',name:'synthetic-linen-12015',permissions_json:JSON.stringify(['ticket.read','ticket.reply']),revision:3,active:1,created_by:'owner',created_at:stamp,updated_at:stamp};
 const retainedRoleMember={workspace_id:'workspace',role_id:retainedRole.id,user_id:'retained-staff',role_revision:3,revision:2,active:1,granted_by:'owner',created_at:stamp,updated_at:stamp};
 const protectedHistory={id:'synthetic-linen-12007',body:'synthetic-linen-12008',source:'synthetic-linen-12009'};
 const catalogForm={fields:[{id:'mount',label:'Monitor mounting',type:'select',required:true,options:['Desk','Wall']}],costCents:30000,deliveryHours:72};
 const taskPlan=[{key:'mount',title:'Mount the monitor',groupId:'retained-team',after:[],dueHours:24}];
 const catalogSnapshot={catalogId:'catalog-monitor',revision:1,name:'Monitor for training',form:{...catalogForm,costCents:25000,deliveryHours:48},answers:{mount:'Wall'}};

 await env.DB.batch([
  env.DB.prepare('INSERT INTO bootstrap_lock VALUES(1)'),
  env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind('workspace','Transfer',stamp),
  env.DB.prepare('INSERT INTO workspaces VALUES(?,?,?)').bind('older-workspace','Retained separate workspace','2000-01-01T00:00:00.000Z'),
  env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('other','other@example.test','Other member','synthetic-password-hash',stamp),
  env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('older-workspace','other','["employee"]'),
  env.DB.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind('older-workspace'),
  env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('owner','owner@example.test','Owner','synthetic-password-hash',stamp),
  env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('workspace','owner','["owner"]'),
  env.DB.prepare('INSERT INTO workspace_settings(workspace_id) VALUES(?)').bind('workspace'),
  env.DB.prepare('INSERT INTO platform_first_run VALUES(1,?,?)').bind('owner',Date.now()),
  env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('desk-bot','urn:linen:automation:desk-bot','Desk bot','!non-interactive-automation',stamp),
  env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('workspace','desk-bot','["integration"]'),
  env.DB.prepare('INSERT INTO execution_automation_principals VALUES(?,?,?,?,?,NULL)').bind('workspace','desk-bot','Desk bot','API-003-transfer',stamp),
  env.DB.prepare('INSERT INTO work_groups(id,workspace_id,name,created_by,created_at) VALUES(?,?,?,?,?)').bind('hardware','workspace','Hardware','owner',stamp),
  env.DB.prepare("INSERT INTO mcp_credentials(id,workspace_id,principal_id,name,scopes_json,tools_json,expires_at,secret_hash,state,created_by,created_at,queue_groups_json,grant_version,grant_updated_by) VALUES(?,?,?,?,?,?,?,?, 'active',?,?,?,1,?)").bind('mcp-grant','workspace','desk-bot','Desk bot','["work.read"]','["work.list"]',new Date(Date.now()+30*86400000).toISOString(),createHash('sha256').update('linen_mcp_'+('1'.repeat(36))+('2'.repeat(36))).digest('hex'),'owner',stamp,'["hardware"]','owner'),
  env.DB.prepare("INSERT INTO rest_credentials(id,workspace_id,principal_id,name,scopes_json,expires_at,secret_hash,state,created_by,created_at) VALUES('synthetic-linen-5110','workspace','desk-bot','Ticket filer','[\"work.create\"]',?,?,'active','owner',?)").bind(new Date(Date.now()+30*86400000).toISOString(),createHash('sha256').update('synthetic-linen-5111').digest('hex'),stamp),
  env.DB.prepare('INSERT INTO intelligence_engineering_grants VALUES(?,?,?,?,?,?,?,?,?)').bind('grant','workspace',1,'owner','synthetic-bearer','{}','2099-01-01',null,stamp),
  env.DB.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind('connection','workspace','sendgrid','Fixture','{}','synthetic-encrypted-secret','verified',stamp,stamp),
  env.DB.prepare('INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,created_at,updated_at,dedup_key) VALUES(?,?,?,?,?,?,?,?,?)').bind('work','workspace','owner','owner','request','Retained real record',stamp,stamp,'transfer'),
  env.DB.prepare('INSERT INTO work_catalog(id,workspace_id,name,kind,target,owner_id,revision,form_json) VALUES(?,?,?,?,?,?,?,?)').bind('catalog-monitor','workspace','Monitor for training','device','training-monitor','owner',2,JSON.stringify(catalogForm)),
  env.DB.prepare('INSERT INTO work_fulfilments(id,workspace_id,work_id,catalog_id,beneficiary_id,purpose,revision,catalog_snapshot_json) VALUES(?,?,?,?,?,?,?,?)').bind('catalog-request','workspace','work','catalog-monitor','owner','Training room display',1,JSON.stringify(catalogSnapshot)),

  env.DB.prepare('INSERT INTO execution_plans(id,workspace_id,work_id,work_revision,actor_id,steps_json,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?)').bind('plan','workspace','work',1,'owner','[]','transfer',stamp),
  env.DB.prepare('INSERT INTO execution_operations(id,workspace_id,plan_id,step_json,state,resource,actor_id,created_at) VALUES(?,?,?,?,?,?,?,?)').bind('operation','workspace','plan','{}','unknown','retained-resource','owner',stamp),
 ])
 await env.DB.batch([
 env.DB.prepare('INSERT INTO work_people(id,workspace_id,source,source_id,name,manager_id,observed_at,effective_at,member_id,binding_id) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('owner-person','workspace','reviewed-hr','owner-source','Owner','owner',stamp,stamp,'owner','reviewed-transfer-binding'),
 env.DB.prepare('INSERT INTO work_messages VALUES(?,?,?,?,?,?,?,?)').bind('message','workspace','work','owner','public','Retained notification','transfer',stamp),
 env.DB.prepare('INSERT INTO execution_outbox VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind('delivery','workspace','work','message','owner','connection','owner','queued',null,'transfer',stamp,stamp),
 ])
 await env.DB.batch([
  env.DB.prepare('INSERT INTO work_catalog_values(id,workspace_id,dimension,label) VALUES(?,?,?,?)').bind('dept-sales','workspace','department','Sales'),
  env.DB.prepare('UPDATE work_people SET attributes_json=? WHERE id=?').bind(JSON.stringify({department:'dept-sales'}),'owner-person'),
  env.DB.prepare('UPDATE work_catalog SET audience_json=?,tasks_json=? WHERE id=?').bind(JSON.stringify({department:['dept-sales'],location:[],employmentType:[]}),JSON.stringify(taskPlan),'catalog-monitor'),
  env.DB.prepare("INSERT INTO work_obligations(id,workspace_id,work_id,kind,target,beneficiary_id,due_at,state,owner_id,title,group_id,catalog_id,after_json,completed_by,completed_at) VALUES('task-obligation','workspace','work','task.manual','mount','owner',?,'done','owner','Mount the monitor','retained-team','catalog-monitor','[]','owner',?)").bind(stamp,stamp),
 ]);
 await env.DB.batch([
  env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('retained-staff','staff@example.test','Facilities agent','synthetic-linen-12004',stamp),
  env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('workspace','retained-staff','["operator"]'),
  env.DB.prepare('INSERT INTO work_departments(id,workspace_id,name,kind,created_at,updated_at) VALUES(?,?,?,?,?,?)').bind('retained-facilities','workspace','Facilities service','facilities',stamp,stamp),
  env.DB.prepare('INSERT INTO work_departments(id,workspace_id,name,kind,active,revision,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(...Object.values(retainedHrDepartment)),
  env.DB.prepare('INSERT INTO work_department_members(workspace_id,department_id,user_id,active,updated_by,updated_at) VALUES(?,?,?,?,?,?)').bind('workspace','retained-facilities','retained-staff',1,'owner',stamp),
  env.DB.prepare('INSERT INTO work_department_members(workspace_id,department_id,user_id,active,updated_by,updated_at) VALUES(?,?,?,?,?,?)').bind('workspace',retainedHrDepartment.id,'retained-staff',1,'owner',stamp),
  env.DB.prepare('INSERT INTO work_department_roles(id,workspace_id,department_id,name,permissions_json,revision,active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(...Object.values(retainedRole)),
  env.DB.prepare('INSERT INTO work_department_role_members(workspace_id,role_id,user_id,role_revision,revision,active,granted_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(...Object.values(retainedRoleMember)),
  env.DB.prepare('INSERT INTO work_records(id,workspace_id,requester_id,beneficiary_id,kind,title,department_id,created_at,updated_at,dedup_key) VALUES(?,?,?,?,?,?,?,?,?,?)').bind('synthetic-linen-12016','workspace','owner','owner','request','synthetic-linen-12017','retained-facilities',stamp,stamp,'synthetic-linen-12018'),
  env.DB.prepare('UPDATE work_records SET department_id=?,protected_departments_json=? WHERE id=?').bind('retained-facilities',JSON.stringify([retainedHrDepartment.id]),'work'),
  env.DB.prepare('INSERT INTO work_messages VALUES(?,?,?,?,?,?,?,?)').bind(protectedHistory.id,'workspace','work','owner','private',protectedHistory.body,protectedHistory.source,stamp),
  env.DB.prepare('UPDATE work_catalog SET department_id=? WHERE id=?').bind('retained-facilities','catalog-monitor'),
  env.DB.prepare('UPDATE work_groups SET department_id=? WHERE id=?').bind('retained-facilities','hardware'),
 ]);
 await env.DB.prepare('INSERT INTO work_access_policies(id,workspace_id,name,match_json,grants_json,active,revision,created_at,updated_at) VALUES(?,?,?,?,?,1,3,?,?)').bind('synthetic-linen-12010','workspace','Sales app baseline','{"department":["dept-sales"]}','[{"kind":"group","target":"synthetic-linen-12011"}]',stamp,stamp).run();
 const releaseData={title:'Retained release',plan:'Reviewed release candidate',state:'go',changeIds:['retained-change'],services:['retained-ci'],problemIds:[],affectedGroupIds:['retained-cohort'],approverIds:['owner'],phases:{build:{outcome:'passed',reference:'Build 1',recordedBy:'owner'},test:{outcome:'passed',reference:'Test 1',recordedBy:'owner'}},decisions:[{id:'retained-decision',actor:'owner',decision:'go',reason:'Reviewed',revisions:{'retained-change':1},at:stamp}],priorDecisions:[]};
 await env.DB.prepare('INSERT INTO work_requester_groups(id,workspace_id,name,members_json,created_at) VALUES(?,?,?,?,?)').bind('retained-cohort','workspace','Release pilot','["owner"]',stamp).run();
 const retainedChange={title:'Retained member',state:'draft',services:['retained-ci'],window:{start:stamp,end:new Date(Date.now()+3600000).toISOString()},implementationRevision:1,invocations:[]};
 for(const [recordId,kind,data]of [['retained-ci','service',{name:'Retained CI'}],['retained-change','change',retainedChange]])
  await env.DB.prepare('INSERT INTO svc_records VALUES(?,?,?,?,?,?,?,1,?,?)').bind(recordId,'workspace',kind,'owner','operators','[]',JSON.stringify(data),stamp,stamp).run();
 await env.DB.prepare('INSERT INTO svc_records VALUES(?,?,?,?,?,?,?,1,?,?)').bind('retained-release','workspace','release','owner','operators','[]',JSON.stringify(releaseData),stamp,stamp).run();
 const approvalDefinition={key:'synthetic_linen_230',name:'synthetic-linen-230',mode:'any',approvers:[{type:'member',userId:'synthetic-linen-231'}],aboveCents:null,costField:null,remindHours:8,slaHours:24,calendar:{timezone:'Australia/Brisbane',weekdays:[1,2,3,4,5],startHour:9,endHour:17,holidays:[]}};
 await env.DB.batch([
  env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,?)').bind('synthetic-linen-231','synthetic-linen-231@example.test','synthetic-linen-231','unused',stamp),
  env.DB.prepare('INSERT INTO memberships VALUES(?,?,?,1)').bind('workspace','synthetic-linen-231','["employee"]'),
  env.DB.prepare('UPDATE work_catalog SET approvals_json=? WHERE id=?').bind(JSON.stringify([approvalDefinition]),'catalog-monitor'),
  env.DB.prepare('INSERT INTO work_approval_stages(workspace_id,fulfilment_id,work_id,ordinal,stage_key,definition_json,applies,active_at,remind_at,sla_at) VALUES(?,?,?,?,?,?,1,?,?,?)').bind('workspace','catalog-request','work',0,approvalDefinition.key,JSON.stringify(approvalDefinition),stamp,stamp,stamp),
  env.DB.prepare(`INSERT INTO work_approval_decisions(id,workspace_id,work_id,fulfilment_id,stage_key,approver_id,decision,comment,channel,work_revision,fulfilment_revision,catalog_revision,event_key,created_at) SELECT 'synthetic-linen-232','workspace','work','catalog-request',?,'synthetic-linen-231','approved','synthetic-linen-233','portal',w.revision,1,c.revision,'synthetic-linen-234',? FROM work_records w,work_catalog c WHERE w.id='work' AND c.id='catalog-monitor'`).bind(approvalDefinition.key,stamp),
  env.DB.prepare(`INSERT INTO work_approval_tokens(id,workspace_id,work_id,fulfilment_id,stage_key,approver_id,token_hash,work_revision,fulfilment_revision,catalog_revision,sent_to,state,config_revision,expires_at,created_at) VALUES('synthetic-linen-235','workspace','work','catalog-request',?,'synthetic-linen-231','synthetic-linen-236',1,1,1,'synthetic-linen-231@example.test','issued',1,'2099-01-01',?)`).bind(approvalDefinition.key,stamp),
  env.DB.prepare('INSERT INTO work_approval_mail_config VALUES(?,1,?,1,?,?,?,?,?,?)').bind('workspace','owner','synthetic-linen-237','synthetic-linen-238@example.test','synthetic-linen-239','synthetic-linen-240','synthetic-linen-241',stamp),
  env.DB.prepare('INSERT INTO work_approval_mail_subscriptions VALUES(?,1,?,?)').bind('workspace','synthetic-linen-242','2099-01-01'),
 ]);
 await env.ATTACHMENTS.put('workspace/private-file','Private retained attachment')
 const erasedArchivePerson='synthetic-linen-13001',erasedArchiveEvent='synthetic-linen-13002';
 const originalArchiveHistory={schema:'linen.history',version:1,action:'work.assigned',record:{kind:'ticket',id:'work'},actor:{kind:'person',id:erasedArchivePerson,name:'synthetic-linen-13003'},subjects:[],protection:'normal',changes:[{field:'assigneeId',before:erasedArchivePerson,after:'owner'}]};
 const redactedArchiveHistory={...originalArchiveHistory,actor:{kind:'person',id:'[erased]',name:'Erased person'},changes:[{field:'assigneeId',before:{redacted:'erasure',person:true},after:'owner'}],redacted:'erasure',redactedAt:stamp};
 const aliasCapture=await captureArchiveAliasStatements({env,principal:{workspaceId:'workspace'}},{eventId:erasedArchiveEvent,store:'audit',payload:originalArchiveHistory,redactedPayload:redactedArchiveHistory,identities:[erasedArchivePerson,'synthetic-linen-13003'],canonicalPersonKey:erasedArchivePerson,personFields:['assigneeId'],at:stamp});
 await env.DB.batch([...aliasCapture,
  env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(erasedArchiveEvent,'workspace','[erased]','work.assigned','work',JSON.stringify(redactedArchiveHistory),stamp),
  env.DB.prepare('INSERT INTO history_redactions VALUES(?,?,?,?,?,?,?)').bind('workspace','audit:'+erasedArchiveEvent,erasedArchiveEvent,'audit',stamp,JSON.stringify(redactedArchiveHistory),'{}'),
 ]);
 const erasedInitiatorEvent='synthetic-linen-13004',retainedRule='synthetic-linen-13005';
 const originalRuleHistory={schema:'linen.history',version:1,action:'work.routed',record:{kind:'ticket',id:'work'},actor:{kind:'rule',id:retainedRule,name:'synthetic-linen-13006',initiatedBy:erasedArchivePerson},subjects:[],protection:'normal',changes:[{field:'priority',before:'P3',after:'P2'}]};
 const redactedRuleHistory={...originalRuleHistory,actor:{...originalRuleHistory.actor,initiatedBy:'[erased]'},redacted:'erasure',redactedAt:stamp};
 const knownCapture=await captureKnownArchiveAliasStatements({env,principal:{workspaceId:'workspace'}},{eventId:erasedInitiatorEvent,store:'audit',payload:originalRuleHistory,redactedPayload:redactedRuleHistory,actorId:erasedArchivePerson,redactedActorId:'[erased]',personFields:[],at:stamp});
 await env.DB.batch([...knownCapture,
  env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(erasedInitiatorEvent,'workspace','[erased]','work.routed','work',JSON.stringify(redactedRuleHistory),stamp),
  env.DB.prepare('INSERT INTO history_redactions VALUES(?,?,?,?,?,?,?)').bind('workspace','audit:'+erasedInitiatorEvent,erasedInitiatorEvent,'audit',stamp,JSON.stringify(redactedRuleHistory),'{}'),
 ]);

 await env.DB.prepare("INSERT INTO configuration_sandboxes(id,workspace_id,name,created_by,contributors_json,baseline_json,draft_json,state,approved_by,created_at) VALUES('synthetic-linen-430','workspace','Synthetic sandbox','owner','[\"owner\"]','[]','[]','approved','other',?)").bind(stamp).run();
 await env.DB.prepare("UPDATE configuration_sandboxes SET runs_json=? WHERE id='synthetic-linen-430'").bind(JSON.stringify([{id:'synthetic-linen-431',configurationRevision:1,tasks:[],completed:[]}])).run();
 await env.DB.prepare("INSERT INTO configuration_masked_records(id,sandbox_id,workspace_id,masked_json) VALUES('synthetic-linen-608','synthetic-linen-430','workspace','{\"title\":\"[masked]\"}')").run();
 await close()
 await run(['exec','rer','export','--output',archive])
 const restRows=[],mcpRows=[],roleRows=[],roleMemberRows=[];
 let sandboxRows=0,maskedRows=0;
 for await(const record of fileRecords(archive))if(record.kind==='part')for(const item of record.items)if(item.kind==='row'){
  if(item.table==='configuration_sandboxes')sandboxRows++;
  if(item.table==='configuration_masked_records')maskedRows++;
  if(item.table==='rest_credentials')restRows.push(item.row);
  if(item.table==='mcp_credentials')mcpRows.push(item.row);
  if(item.table==='work_department_roles')roleRows.push(item.row);
  if(item.table==='work_department_role_members')roleMemberRows.push(item.row);
 }
 assert.equal(maskedRows,0,'Actual rer export excludes every masked ticket copy');
 assert.equal(sandboxRows,0,'Sandbox drafts and approvals are not portable execution authority');
 assert.deepEqual(roleRows,[{...retainedRole,active:0}],'ROLE-001 actual rer export retains scoped permissions and revision without active role authority');
 assert.deepEqual(roleMemberRows,[{...retainedRoleMember,active:0,granted_by:null}],'ROLE-001 actual rer export retains inactive versioned assignment metadata');
 let archivedIdentityHistory;
 for await(const record of fileRecords(archive))if(record.kind==='part')for(const item of record.items)if(item.kind==='row'&&item.table==='audit_events'&&item.row.id===erasedArchiveEvent)archivedIdentityHistory=item.row;
 assert.ok(archivedIdentityHistory);
 const archivedIdentityPayload=JSON.parse(archivedIdentityHistory.detail_json),archiveAlias=archivedIdentityPayload.actor.id;
 assert.match(archiveAlias,/^erased-a1-[a-f0-9]{64}$/);
 assert.equal(archivedIdentityHistory.actor_id,archiveAlias);
 assert.equal(archivedIdentityPayload.changes[0].before.alias,archiveAlias,'A6 actor and person value retain one opaque archive identity');
 let archivedRuleHistory;
 for await(const record of fileRecords(archive))if(record.kind==='part')for(const item of record.items)if(item.kind==='row'&&item.table==='audit_events'&&item.row.id===erasedInitiatorEvent)archivedRuleHistory=item.row;
 const archivedRulePayload=JSON.parse(archivedRuleHistory.detail_json);
 assert.equal(archivedRulePayload.actor.id,retainedRule,'DESK-017 erasing a human initiator preserves the actual routing rule');
 assert.equal(archivedRuleHistory.actor_id,archiveAlias);
 assert.equal(archivedRulePayload.actor.initiatedBy,archiveAlias,'A6 post-erasure events reuse the existing keyed person association before values are cleared');
 assert.deepEqual(archivedRulePayload.changes,originalRuleHistory.changes);

 assert.ok(!(await readFile(archive,'utf8')).includes(erasedArchivePerson),'A6 archive has no original erased person reference');

 assert.equal(restRows.length,1);assert.equal(restRows[0].secret_hash,null);assert.equal(restRows[0].state,'revoked','REST actual export is inert');
 assert.equal(mcpRows.length,1,'API-003 actual archive carries credential metadata');
 assert.deepEqual(JSON.parse(mcpRows[0].queue_groups_json),['hardware'],'API-003 export retains the explicit credential queue grant');
 assert.equal(mcpRows[0].grant_version,1);
 assert.equal(mcpRows[0].name,'Desk bot');assert.equal(mcpRows[0].secret_hash,null,'API-003 no hash is exported');assert.equal(mcpRows[0].state,'revoked');

 let archivedAccessPolicy;for await(const record of fileRecords(archive))if(record.kind==='part')for(const item of record.items)if(item.kind==='row'&&item.table==='work_access_policies'&&item.row.id==='synthetic-linen-12010')archivedAccessPolicy=item.row;
 assert.ok(archivedAccessPolicy);assert.equal(archivedAccessPolicy.active,0,'LIFE-003 public rer export carries no active baseline authority');
 await run(['exec','rer','reset','--yes'])
 await run(['exec','rer','import','--input',archive,'--yes'])
 env=await open()
 assert.equal((await env.DB.prepare('SELECT title FROM work_records WHERE id=?').bind('work').first()).title,'Retained real record')
 assert.equal(await(await env.ATTACHMENTS.get('workspace/private-file')).text(),'Private retained attachment')
 assert.equal(JSON.parse((await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id="workspace"').first()).settings_json).executionHeld,true)
 assert.equal((await env.DB.prepare('SELECT password_hash FROM users WHERE id="owner"').first()).password_hash,'!restored-email-link')
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM configuration_masked_records').first()).n,0,'Actual rer restore never revives masked copies');
 assert.equal((await env.DB.prepare('SELECT count(*) n FROM configuration_sandboxes').first()).n,0,'Restoring an installation cannot revive sandbox approval');
 assert.equal((await env.DB.prepare('SELECT secret_ciphertext FROM connections').first()).secret_ciphertext,null)
 assert.ok((await env.DB.prepare('SELECT revoked_at FROM intelligence_engineering_grants').first()).revoked_at)
 assert.deepEqual(await env.DB.prepare("SELECT state,secret_hash FROM rest_credentials WHERE id='synthetic-linen-5110'").first(),{state:'revoked',secret_hash:null},'REST actual native restore carries no credential authority');
 const restoredMcp=await env.DB.prepare('SELECT name,secret_hash,state,invalidated_at,queue_groups_json,grant_version FROM mcp_credentials WHERE id="mcp-grant"').first();
 assert.deepEqual(JSON.parse(restoredMcp.queue_groups_json),['hardware'],'API-003 restore retains inert queue metadata');
 assert.equal(restoredMcp.grant_version,1);
 assert.equal(restoredMcp.name,'Desk bot','API-003 archive retains metadata');assert.equal(restoredMcp.secret_hash,null,'API-003 archive excludes credential hash');assert.equal(restoredMcp.state,'revoked');assert.ok(restoredMcp.invalidated_at,'API-003 restore leaves credential revoked and inert');
 assert.deepEqual(JSON.parse((await env.DB.prepare("SELECT catalog_snapshot_json FROM work_fulfilments WHERE id='catalog-request'").first()).catalog_snapshot_json),catalogSnapshot,'CATALOG-001 actual rer archive retains submitted questions, answers, original cost/delivery and old item revision');
 assert.deepEqual(JSON.parse((await env.DB.prepare("SELECT form_json FROM work_catalog WHERE id='catalog-monitor'").first()).form_json),catalogForm,'CATALOG-001 actual rer archive separately retains current catalog metadata');

 assert.equal((await env.DB.prepare("SELECT label FROM work_catalog_values WHERE id='dept-sales'").first()).label,'Sales','CATALOG-001 native archive retains stable audience values');
 assert.deepEqual(JSON.parse((await env.DB.prepare("SELECT attributes_json FROM work_people WHERE id='owner-person'").first()).attributes_json),{department:'dept-sales'},'CATALOG-001 native archive retains reviewed attributes with the unbound person');
 assert.deepEqual(JSON.parse((await env.DB.prepare("SELECT audience_json FROM work_catalog WHERE id='catalog-monitor'").first()).audience_json),{department:['dept-sales'],location:[],employmentType:[]},'CATALOG-001 native archive retains versioned audience references');
 assert.deepEqual(JSON.parse((await env.DB.prepare("SELECT tasks_json FROM work_catalog WHERE id='catalog-monitor'").first()).tasks_json),taskPlan,'CATALOG-003 native archive retains the item task plan');
 const restoredApproval=await env.DB.prepare("SELECT inert,decision,comment FROM work_approval_decisions WHERE id='synthetic-linen-232'").first();
 assert.deepEqual(restoredApproval,{inert:1,decision:'approved',comment:'synthetic-linen-233'},'CATALOG-002 native archive preserves inert decision history');
 assert.deepEqual(await env.DB.prepare("SELECT state,token_hash,sent_to FROM work_approval_tokens WHERE id='synthetic-linen-235'").first(),{state:'expired',token_hash:'synthetic-linen-235',sent_to:''});
 assert.equal((await env.DB.prepare("SELECT enabled FROM work_approval_mail_config WHERE workspace_id='workspace'").first()).enabled,0);
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM work_approval_mail_subscriptions').first()).n,0);
 assert.deepEqual(await env.DB.prepare("SELECT active_at,remind_at,sla_at FROM work_approval_stages WHERE fulfilment_id='catalog-request'").first(),{active_at:null,remind_at:null,sla_at:null});
 assert.equal((await env.DB.prepare("SELECT department_id FROM work_records WHERE id='work'").first()).department_id,'retained-facilities','Department handoff and ticket history retain the workspace reference');
 assert.equal((await env.DB.prepare("SELECT department_id FROM work_catalog WHERE id='catalog-monitor'").first()).department_id,'retained-facilities');
 assert.equal((await env.DB.prepare("SELECT active FROM work_department_members WHERE department_id='retained-facilities' AND user_id='retained-staff'").first()).active,0,'Archived staff membership is retained as inert metadata');
 assert.deepEqual(await env.DB.prepare('SELECT * FROM work_departments WHERE id=?').bind(retainedHrDepartment.id).first(),retainedHrDepartment,'Actual rer transfer preserves typed retained-HR workspace metadata');
 assert.deepEqual(JSON.parse((await env.DB.prepare("SELECT protected_departments_json FROM work_records WHERE id='work'").first()).protected_departments_json),[retainedHrDepartment.id],'Actual rer transfer retains the prior HR readership boundary');
 assert.deepEqual((await env.DB.prepare("SELECT department_id,user_id,active,updated_by FROM work_department_members WHERE user_id='retained-staff' ORDER BY department_id").all()).results,['retained-facilities',retainedHrDepartment.id].sort().map(department_id=>({department_id,user_id:'retained-staff',active:0,updated_by:null})),'Every restored current and retained department membership is inert');
 assert.deepEqual(await env.DB.prepare('SELECT * FROM work_department_roles WHERE id=?').bind(retainedRole.id).first(),{...retainedRole,active:0},'ROLE-001 actual rer import restores the scoped definition inactive');
 assert.deepEqual(await env.DB.prepare('SELECT * FROM work_department_role_members WHERE workspace_id=? AND role_id=? AND user_id=?').bind('workspace',retainedRole.id,retainedRoleMember.user_id).first(),{...retainedRoleMember,active:0,granted_by:null},'ROLE-001 actual rer import retains the assignment revision without restoring access');
 const restoredAccessPolicy=await env.DB.prepare("SELECT name,match_json,grants_json,active,revision FROM work_access_policies WHERE id='synthetic-linen-12010'").first();
 assert.equal(restoredAccessPolicy.active,0,'LIFE-003 actual rer archive retains access policies as inactive history');
 assert.equal(restoredAccessPolicy.name,'Sales app baseline');assert.equal(restoredAccessPolicy.revision,3);
 assert.deepEqual(JSON.parse(restoredAccessPolicy.grants_json),[{kind:'group',target:'synthetic-linen-12011'}]);
 const restoredRelease=JSON.parse((await env.DB.prepare("SELECT data_json FROM svc_records WHERE id='retained-release'").first()).data_json);
 assert.equal(restoredRelease.state,'imported-review','CHANGE-007 actual rer archive puts releases into review');
 assert.deepEqual(restoredRelease.decisions,[],'CHANGE-007 no live go decision survives native restore');
 assert.equal(restoredRelease.priorDecisions[0].decision,'go');assert.equal(restoredRelease.priorDecisions[0].inert,true,'CHANGE-007 decisions remain inert history');
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM sessions').first()).n,0)
 const person=await env.DB.prepare("SELECT member_id,binding_id,manager_id FROM work_people WHERE id='owner-person'").first()
 assert.deepEqual(person,{member_id:null,binding_id:null,manager_id:null},'Native restore retains the person but requires fresh binding and manager review')
 const held=(await env.DB.prepare('SELECT id FROM adoption_holds WHERE workspace_id="workspace"').all()).results;assert.equal(held.length,1)
 // Simulate a restart between imported data and finished native bookkeeping.
 await env.DB.batch([env.DB.prepare("UPDATE platform_archive_recovery SET state='pending'"),env.DB.prepare("UPDATE adoption_imports SET state='reconciling'")])
 await close();await run(['exec','rer','import','--input',archive,'--yes']);env=await open()
 assert.equal((await env.DB.prepare('SELECT COUNT(*) n FROM adoption_holds WHERE workspace_id="workspace"').first()).n,1,'Retry reuses durable recovery hold')
 assert.equal((await env.DB.prepare('SELECT state FROM platform_archive_recovery').first()).state,'complete')
 await close()
 const entry=join(dir,'worker.ts'),output=join(dir,'worker.mjs')
 await writeFile(entry,`${mailEdge}import {createApplication} from ${JSON.stringify(join(root,'src/application.ts'))};import {baseAuthResponse} from ${JSON.stringify(join(root,'src/platform/base-auth/http.ts'))};const app=createApplication();export default {async fetch(r,e,c){return mailFixture(r)??await baseAuthResponse(r,e)??app.fetch(r,e,c)}};`)
 await build({entryPoints:[entry],bundle:true,format:'esm',platform:'browser',external:['node:*'],target:'es2022',outfile:output})
 const listener=createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));const origin='http://127.0.0.1:'+port
 mf=new Miniflare({...convertV4MiniflareOptions({port,host:'127.0.0.1',modules:true,script:await readFile(output,'utf8'),compatibilityDate:'2026-09-08',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'local-linen'},r2Buckets:{ATTACHMENTS:'linen-attachments'},bindings:{AUTH_ORIGIN:origin,AUTH_LOCAL:'true',MAIL_PROVIDER:'resend',MAIL_API_KEY:'synthetic-provider-key',MAIL_FROM:'auth@localhost.test',OWNER_EMAIL:'owner@example.test',RER_DEV_KEY:'synthetic-development-entry-key-long-enough',SESSION_SECRET:'synthetic-session-secret-long-enough',ENCRYPTION_KEY:Buffer.alloc(32,7).toString('base64')}}),resourcePersistencePath:join(root,'.wrangler/state/v3'),isolatedResourcePersistencePath:join(dir,'isolated')})
 await mf.ready
 const request=(path,{body,cookie,headers={}}={})=>fetch(origin+path,{redirect:'manual',method:body?'POST':'GET',headers:{Host:new URL(origin).host,Origin:origin,...(body?{'content-type':'application/json'}:{}),...(cookie?{Cookie:cookie}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})})
 assert.equal((await request('/api/mcp',{body:{jsonrpc:'2.0',id:1,method:'tools/list'},headers:{Authorization:'Bearer linen_mcp_'+('1'.repeat(36))+('2'.repeat(36))}})).status,401,'API-003 credential is refused after actual rer export/reset/import');
 assert.equal((await request('/auth/magic-link',{body:{email:'owner@example.test',returnTo:'/app'}})).status,202)
 const detail=await(await request('/fixtures/mail')).text()
 const proof=/[?&](?:amp;)?token=([^"&<>\s]+)/.exec(detail)?.[1];assert.ok(proof)
 const confirmation=await request('/auth/confirm',{body:{token:decodeURIComponent(proof)}});assert.equal(confirmation.status,303)
 const cookie=confirmation.headers.get('set-cookie').split(';')[0]
 const session=await(await request('/api/v1/session',{cookie})).json();assert.equal(session.user.email,'owner@example.test')
 const sandboxes=await request('/api/v1/sandboxes',{cookie});assert.equal(sandboxes.status,200);assert.deepEqual((await sandboxes.json()).items,[],'No pre-restore sandbox is readable');
 for(const action of ['package','approve','promote']){
  const stale=await request('/api/v1/sandboxes/synthetic-linen-430/'+action,{cookie,body:{revision:1},headers:{'X-Linen-CSRF':session.csrfToken}});
  assert.equal(stale.status,404,'Pre-restore package refused on '+action);
 }
 const freshSandbox=await request('/api/v1/sandboxes',{cookie,body:{name:'Fresh after restore'},headers:{'X-Linen-CSRF':session.csrfToken}});
 assert.equal(freshSandbox.status,201,await freshSandbox.clone().text());
 const freshDraft=await freshSandbox.json();assert.notEqual(freshDraft.id,'synthetic-linen-430');assert.equal(freshDraft.state,'draft');assert.equal(freshDraft.approvedBy,null);
 const policyView=await(await request('/api/v1/access-policies',{cookie})).json();
 const policy=policyView.items.find(p=>p.id==='synthetic-linen-12010');assert.ok(policy);assert.equal(policy.active,false,'LIFE-003 the current owner reads an archived baseline as inactive');
 const policyJoin=await request('/api/v1/lifecycle',{cookie,headers:{'X-Linen-CSRF':session.csrfToken},body:{personId:'owner-person',kind:'join',source:'synthetic-linen-12012',sourceRevision:1,effectiveAt:stamp,timezone:'UTC',ownerId:'owner',identityTarget:'synthetic-linen-12013',retained:[],added:[],removed:[],deviceIds:[],baseline:{to:{department:'dept-sales'}}}});
 assert.equal(policyJoin.status,201,await policyJoin.clone().text());
 const policyRecord=await policyJoin.json(),policyDuties=await(await request('/api/v1/lifecycle/'+policyRecord.lifecycleId,{cookie})).json();
 assert.deepEqual(policyDuties.obligations.filter(o=>o.kind.startsWith('access.')),[],'LIFE-003 restored policies grant no access to a newly admitted join');
 const restoredApprovalView=await(await request('/api/v1/work/work/approvals/catalog-monitor',{cookie})).json();
 assert.equal(restoredApprovalView.satisfied,false,'CATALOG-002 restored approved decision cannot satisfy a current chain even with retained approver membership');
 assert.equal(restoredApprovalView.stages[0].state,'pending');assert.deepEqual(restoredApprovalView.stages[0].decisions,[]);
 const restoredMailConfig=await(await request('/api/v1/approval-mail/config',{cookie})).json();assert.equal(restoredMailConfig.enabled,0);assert.equal(restoredMailConfig.confirmationUrl,null);
 const delivery=await request('/api/v1/notifications/process',{cookie,body:{},headers:{'X-Linen-CSRF':session.csrfToken}})
 assert.equal(delivery.status,200);assert.deepEqual(await delivery.json(),[{id:'delivery',state:'blocked'}],'Restored queued notification cannot resume an external effect')
 const db=await mf.getD1Database('DB');assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_provider_attempts').first()).n,0)
 const holds=await(await request('/api/v1/adoption/holds',{cookie})).json();assert.equal(holds.length,1)
 const hold=holds[0],records=await(await request('/api/v1/imports/'+hold.import_id+'/records',{cookie})).json()
 assert.equal(records.data.length,1);assert.equal(JSON.parse(records.data[0].row_json).state,'unknown')
 const restoredTask=(await(await request('/api/v1/work/work/obligations',{cookie})).json()).items.find(o=>o.kind==='task.manual');
 assert.deepEqual([restoredTask.title,restoredTask.state,restoredTask.completed_by,restoredTask.can_complete],['Mount the monitor','done','owner',false],'CATALOG-003 restored owner reads the completed team task through the native route');
 const restoredForms=await(await request('/api/v1/work/work/catalog-requests',{cookie})).json();
 assert.deepEqual(restoredForms.items[0].catalogSnapshot,catalogSnapshot,'CATALOG-001 restored owner reads the same original submitted form through the native route');
 const restoredDepartment=(await(await request('/api/v1/departments/admin',{cookie})).json()).items.find(item=>item.id==='retained-facilities');
 assert.equal(restoredDepartment.name,'Facilities service');
 assert.equal(restoredDepartment.members.find(member=>member.userId==='retained-staff').active,false,'Native owner sees that restored staff authority requires fresh confirmation');
 const ownerDepartmentResponse=await request('/api/v1/work/work',{cookie});assert.equal(ownerDepartmentResponse.status,200);
 const ownerDepartmentWork=await ownerDepartmentResponse.json();
 assert.equal(ownerDepartmentWork.work.department_id,'retained-facilities','Native owner reads the same departmental ticket after actual export/reset/import');
 assert.deepEqual(JSON.parse(ownerDepartmentWork.work.protected_departments_json),[retainedHrDepartment.id]);
 assert.ok(ownerDepartmentWork.messages.some(message=>message.id===protectedHistory.id&&message.body===protectedHistory.body&&message.visibility==='private'),'Fresh native owner session reads retained protected history');
 assert.equal((await request('/auth/magic-link',{body:{email:'staff@example.test',returnTo:'/app'}})).status,202);
 const staffMail=await(await request('/fixtures/mail')).text();
 const staffProof=/[?&](?:amp;)?token=([^"&<>\s]+)/.exec(staffMail)?.[1];assert.ok(staffProof);
 const staffConfirmation=await request('/auth/confirm',{body:{token:decodeURIComponent(staffProof)}});assert.equal(staffConfirmation.status,303);
 const staffCookie=staffConfirmation.headers.get('set-cookie').split(';')[0];
 const staffSessionResponse=await request('/api/v1/session',{cookie:staffCookie});assert.equal(staffSessionResponse.status,200);
 const staffSession=await staffSessionResponse.json();assert.equal(staffSession.principal.userId,'retained-staff');assert.equal(staffSession.principal.workspaceId,'workspace');assert.deepEqual(staffSession.principal.roles,['operator']);
 assert.equal((await request('/api/v1/work/work',{cookie:staffCookie})).status,404,'Fresh Base staff sign-in cannot revive archived department or retained-HR authority');
 assert.equal((await request('/api/v1/work/synthetic-linen-12016',{cookie:staffCookie})).status,404,'ROLE-001 fresh Base sign-in cannot revive the archived custom role on ordinary Facilities work');
 const authHeaders={'X-Linen-CSRF':session.csrfToken}
 assert.equal((await request('/api/v1/adoption/holds/'+hold.id+'/release',{cookie,body:{revision:hold.revision},headers:authHeaders})).status,409,'Unreconciled retained operation blocks ordinary release')
 assert.equal((await request('/api/v1/adoption/holds/'+hold.id+'/reconcile',{cookie,body:{historyId:records.data[0].id,evidence:'Fixture owner reviewed retained unknown operation before explicitly releasing execution'},headers:authHeaders})).status,200)
 assert.equal((await request('/api/v1/adoption/holds/'+hold.id+'/release',{cookie,body:{revision:hold.revision},headers:authHeaders})).status,200)
 assert.equal(JSON.parse((await db.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id="workspace"').first()).settings_json).executionHeld,false,'Only explicit native reconciliation and release clears hold')
 const releaseView=await(await request('/api/v1/releases/retained-release',{cookie})).json();
 assert.equal(releaseView.data.state,'imported-review','CHANGE-007 native owner reads the restored release as inert history');
 const restoredGo=await request('/api/v1/releases/retained-release/decisions',{cookie,headers:authHeaders,body:{revision:releaseView.revision,decision:'go',reason:'Attempt to reuse archived authority'}});
 assert.equal(restoredGo.status,409);assert.equal((await restoredGo.json()).error.code,'release_closed','CHANGE-007 even after the global recovery hold is released, an archived release cannot mint live go authority');
 assert.equal((await db.prepare('SELECT COUNT(*) n FROM execution_provider_attempts').first()).n,0)
 await mf.dispose();mf=null
 env=await open()
 await env.DB.prepare('INSERT INTO adoption_tombstones VALUES(?,?,?)').bind('workspace',createHash('sha256').update('erased@example.test').digest('hex'),stamp).run()
 await close()
 const refused=await run(['exec','rer','import','--input',archive,'--yes'],1);assert.match(refused,/erasure_epoch/)
 await run(['exec','rer','export','--output',later])
 let repeatedIdentityHistory;
 for await(const record of fileRecords(later))if(record.kind==='part')for(const item of record.items)if(item.kind==='row'&&item.table==='audit_events'&&item.row.id===erasedArchiveEvent)repeatedIdentityHistory=item.row;
 assert.equal(JSON.parse(repeatedIdentityHistory.detail_json).actor.id,archiveAlias,'A6 aliases remain stable after native restore and re-export');

 await run(['exec','rer','reset','--yes'])
 const checkpoint=await run(['exec','rer','import','--input',archive,'--journal','exports/after.rer','--yes'],1);assert.match(checkpoint,/erasure_epoch/)
 await run(['exec','rer','import','--input',later,'--yes'])
 // Build the deploy artifact without provider credentials; retained resources stay protected.
 for (const key of Object.keys(commandEnvironment)) if (key.startsWith('LINEN_') || key.startsWith('CLOUDFLARE_')) delete commandEnvironment[key]
 await run(['exec','rer','build'])
 const artifact=JSON.parse(await readFile(join(root,'dist/server/wrangler.json'),'utf8'))
 assert.ok((await readFile(resolve(root,'dist/server',artifact.main))).length,'The deploy artifact contains its Worker entry')
 assert.ok(artifact.d1_databases.some(binding=>binding.binding==='DB'))
 assert.ok(artifact.r2_buckets.some(binding=>binding.binding==='ATTACHMENTS'))
 // Base #275 requires target reads even for a dry run; building needs no credentials.
 commandEnvironment.MAIL_API_KEY='synthetic-dry-run-mail-key'
 const missingCredentials=await run(['exec','rer','deploy','--dry-run','--owner-name','synthetic-linen-4'],3)
 for (const name of ['CLOUDFLARE_ACCOUNT_ID','CLOUDFLARE_API_TOKEN']) assert.ok(missingCredentials.includes(name),missingCredentials)
 await assert.rejects(readFile(join(root,'.rer/deploy/production.json')),{code:'ENOENT'})
 const configPath=join(root,'wrangler.jsonc'),config=JSON.parse(await readFile(configPath,'utf8'))
 config.d1_databases[0].database_id='retained-remote-database'
 await writeFile(configPath,JSON.stringify(config))
 assert.match(await run(['exec','rer','deploy','--dry-run'],4),/must retain Worker linen/)
 config.d1_databases[0].database_id='local-linen'
 await writeFile(configPath,JSON.stringify(config))
 commandEnvironment.CLOUDFLARE_ACCOUNT_ID='a'.repeat(32)
 commandEnvironment.CLOUDFLARE_API_TOKEN='synthetic-cloudflare-token'
 const statePath=join(root,'.rer','deploy','production.json')
 await mkdir(join(root,'.rer','deploy'),{recursive:true})
 await writeFile(statePath,JSON.stringify({kind:'rer-deploy-owner-state',project:'runeditrun/linen',environment:'production',accountId:commandEnvironment.CLOUDFLARE_ACCOUNT_ID,worker:'linen'}))
 assert.match(await run(['exec','rer','deploy','--dry-run'],4),/must retain Worker linen/)
 await rm(statePath)
 // Only the paid/network edge is faked. The actual rer command must stop on
 // verified live legacy bindings before any build, upload or provider mutation.
 commandEnvironment.NODE_OPTIONS=`${commandEnvironment.NODE_OPTIONS??''} --import ${pathToFileURL(join(root,'tests/platform/deploy-edge.mjs'))}`.trim()
 assert.match(await run(['exec','rer','deploy','--non-interactive'],4),/must retain Worker linen/)
 console.log('PASS actual rer export/reset/import: native records and R2 bytes retained, credentials revoked, restored effects held with resumable native reconciliation/release, same-store and later-journal stale-erasure restore refused; deploy artifact builds without provider access, credential-free deploy dry run refuses with named credentials, and retained deployment identity changes remain refused')
}finally{await mf?.dispose();await close();await rm(dir,{recursive:true,force:true})}
