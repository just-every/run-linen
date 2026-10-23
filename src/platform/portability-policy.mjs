import { prepareArchiveIdentityProjection } from '../features/history/archive-identities.mjs';
import { historyExportRow,validateHistoryStaged } from '../features/history/portability.mjs';
// Retain accounts, memberships, all domain history, Freshservice custody and R2
// bytes. An archive is data custody, never permission to resume remote effects.
export const portabilityPolicy={
 product:'runeditrun/linen',
 replaceableTables:['platform_auth_policy'],
 excludeTables:['svc_software_guards','work_bi_checkpoints','history_service_rewrite_permits','history_archive_origin','history_write_guards','work_approval_mail_subscriptions','platform_archive_recovery','sessions','login_limits','platform_auth_session_proofs','platform_auth_links','platform_auth_steps','platform_auth_limits','platform_auth_guard','execution_secrets'],
 secretColumns:{connections:['secret_ciphertext'],intelligence_engineering_jobs:['claim_token_hash']},
 requiredConfiguration:['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','ENCRYPTION_KEY','MAIL_PROVIDER','MAIL_FROM'],
 buckets:{ATTACHMENTS:{}},
 // Keep the existing archive secret inventory compatible with pre-MCP archives.
 // Export removes the hash below; staged validation refuses any active/hash-bearing
 // credential before native restore can write objects or records.
 async validateStaged({db,tables,projectArchiveRow}){
  if(!await validateHistoryStaged(db,tables,projectArchiveRow))return false;
  const table=tables.mcp_credentials;
  if(table && await db.prepare(`SELECT 1 FROM "${table.replaceAll('"','""')}" WHERE secret_hash IS NOT NULL OR state<>'revoked' LIMIT 1`).first())return false;
  for(const [name,invalid] of [
   ['work_reports',"shared_json IS NOT '[]'"],
   ['work_report_schedules','active IS NOT 0'],
   ['work_bi_exports',"active IS NOT 0 OR credential_cipher IS NOT NULL AND credential_cipher IS NOT ''"],
   ['notification_rules','enabled IS NOT 0 OR consented_by IS NOT NULL'],
   ['notification_branding','sender_connection_id IS NOT NULL OR sender_domain IS NOT NULL'],
   ['work_access_policies','active IS NOT 0'],
   ['work_approval_decisions','inert IS NOT 1'],
   ['work_approval_tokens',"state IS NOT 'expired' OR token_hash IS NOT id OR sent_to IS NOT ''"],
   ['work_approval_mail_config','enabled IS NOT 0'],
   ['work_approval_stages','active_at IS NOT NULL OR remind_at IS NOT NULL OR reminded_at IS NOT NULL OR sla_at IS NOT NULL OR breached_at IS NOT NULL'],
  ]){
   const staged=tables[name];
   if(staged && await db.prepare(`SELECT 1 FROM "${staged.replaceAll('"','""')}" WHERE ${invalid} LIMIT 1`).first())return false;
  }
  const departmentMembers=tables.work_department_members;
  if(departmentMembers && await db.prepare(`SELECT 1 FROM "${departmentMembers.replaceAll('"','""')}" WHERE active<>0 LIMIT 1`).first())return false;
  const work=tables.work_records,departments=tables.work_departments;
  if(work){
   const quoted='"'+work.replaceAll('"','""')+'"';
   const columns=await db.prepare(`PRAGMA table_info(${quoted})`).all();
   if(columns.results.some(column=>column.name==='protected_departments_json')){
    if(await db.prepare(`SELECT 1 FROM ${quoted} WHERE NOT json_valid(protected_departments_json) OR json_type(protected_departments_json)<>'array' LIMIT 1`).first())return false;
    if(!departments){if(await db.prepare(`SELECT 1 FROM ${quoted} WHERE json_array_length(protected_departments_json)>0 LIMIT 1`).first())return false;}
    else {
     const departmentTable='"'+departments.replaceAll('"','""')+'"';
     if(await db.prepare(`SELECT 1 FROM ${quoted} w WHERE EXISTS(SELECT 1 FROM json_each(w.protected_departments_json) p LEFT JOIN ${departmentTable} d ON d.id=p.value AND d.workspace_id=w.workspace_id AND d.kind='hr' WHERE p.type<>'text' OR d.id IS NULL) OR json_array_length(w.protected_departments_json)<>(SELECT COUNT(DISTINCT value) FROM json_each(w.protected_departments_json)) LIMIT 1`).first())return false;
    }
   }
  }
  const services=tables.svc_records;
  if(services && await db.prepare(`SELECT 1 FROM "${services.replaceAll('"','""')}" WHERE kind='release' AND (json_extract(data_json,'$.state') IS NOT 'imported-review' OR json_array_length(data_json,'$.decisions') IS NOT 0) LIMIT 1`).first())return false;
  if(services && await db.prepare(`SELECT 1 FROM "${services.replaceAll('"','""')}" WHERE json_extract(data_json,'$.softwareLicense')=1 AND (json_type(data_json,'$.grant') IS NOT 'null' OR json_type(data_json,'$.observation') IS NOT 'null' OR json_array_length(data_json,'$.effectTargets') IS NOT 0 OR json_array_length(data_json,'$.deviceUsers') IS NOT 0 OR json_type(data_json,'$.lastDeviceUserChange') IS NOT 'null') LIMIT 1`).first())return false;
  return true;
 },
 exportRow(table,row){
  row=historyExportRow(table,row);
  if(table==='svc_records' && row.kind==='asset'){
   const data=JSON.parse(row.data_json);
   if(data.softwareLicense)return {...row,data_json:JSON.stringify({...data,observation:null,grant:null,grantVersion:Number(data.grantVersion||0)+1,effectTargets:[],deviceUsers:[],lastDeviceUserChange:null,restoredReview:true})};
  }
  if(table==='svc_software_effects' && ['sending','submitted'].includes(row.state))return {...row,state:'unknown'};
  if(table==='svc_records' && row.kind==='release'){
   const data=JSON.parse(row.data_json);
   return {...row,data_json:JSON.stringify({...data,importedState:data.importedState||data.state,state:'imported-review',decisions:[],
    priorDecisions:[...(data.priorDecisions||[]),...(data.decisions||[])].map(d=>({...d,inert:true}))})};
  }
  if(table==='work_reports')return {...row,shared_json:'[]'}
  if(table==='work_report_schedules')return {...row,active:0}
  if(table==='work_bi_exports')return {...row,active:0,credential_cipher:''}
  if(table==='work_bi_runs')return {...row,state:'restored-inert',snapshot_json:'[]'}
  if(table==='work_report_deliveries')return {...row,state:'restored-inert'}
  if(table==='notification_rules')return {...row,enabled:0,consented_by:null}
  if(table==='notification_branding')return {...row,sender_connection_id:null,sender_connection_revision:null,sender_domain:null}
  if(table==='notification_deliveries')return {...row,state:'restored-inert'}
  if(table==='work_access_policies')return {...row,active:0}
  if(table==='work_approval_decisions')return {...row,inert:1}
  if(table==='work_approval_stages')return {...row,active_at:null,remind_at:null,reminded_at:null,sla_at:null,breached_at:null}
  if(table==='work_department_members')return {...row,active:0,updated_by:null}
  if(table==='work_approval_mail_config')return {...row,enabled:0}
  if(table==='work_approval_tokens')return {...row,state:'expired',token_hash:row.id,sent_to:''}
  if(table==='mcp_credentials')return {...row,secret_hash:null,state:'revoked',invalidated_at:row.invalidated_at||row.created_at}
  if(table==='work_time_entries')return {...row,state:'completed',last_seen_at:null,sequence:Number(row.sequence||0)+1}
  if(table==='work_people')return {...row,member_id:null,binding_id:null,manager_id:null}
  if(table==='work_fulfilment_approvals')return {...row,person_id:null,binding_id:null}
  if(table==='users')return {...row,password_hash:'!restored-email-link'}
  if(table==='intelligence_engineering_grants')return {...row,token_hash:'!restored-credential',revoked_at:row.revoked_at||row.created_at}
  if(table==='connections')return {...row,status:'unverified'}
  if(table==='workspace_settings'){
   const settings=JSON.parse(row.settings_json)
   // Recovery uses the existing adoption gate for every external effect.
   return {...row,settings_json:JSON.stringify({...settings,executionHeld:true})}
  }
  return row
 },
}

/** RER exportRow is synchronous: prepare the private alias lookup in the seed runner. */
export async function createLinenPortabilityPolicy(env){
 const identities=await prepareArchiveIdentityProjection(env);
 return {...portabilityPolicy,
  exportRow(table,row){return identities.project(table,portabilityPolicy.exportRow(table,row));},
  async validateStaged(input){
   return await identities.validateStaged(input) && await portabilityPolicy.validateStaged({...input,projectArchiveRow:identities.project});
  },
 };
}
