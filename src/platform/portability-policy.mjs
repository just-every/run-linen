// Retain accounts, memberships, all domain history, Freshservice custody and R2
// bytes. An archive is data custody, never permission to resume remote effects.
export const portabilityPolicy={
 product:'runeditrun/linen',
 replaceableTables:['platform_auth_policy'],
 excludeTables:['work_approval_mail_subscriptions','platform_archive_recovery','sessions','login_limits','platform_auth_session_proofs','platform_auth_links','platform_auth_steps','platform_auth_limits','platform_auth_guard','execution_secrets'],
 secretColumns:{connections:['secret_ciphertext'],intelligence_engineering_jobs:['claim_token_hash']},
 requiredConfiguration:['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','ENCRYPTION_KEY','MAIL_PROVIDER','MAIL_FROM'],
 buckets:{ATTACHMENTS:{}},
 // Keep the existing archive secret inventory compatible with pre-MCP archives.
 // Export removes the hash below; staged validation refuses any active/hash-bearing
 // credential before native restore can write objects or records.
 async validateStaged({db,tables}){
  const table=tables.mcp_credentials;
  if(table && await db.prepare(`SELECT 1 FROM "${table.replaceAll('"','""')}" WHERE secret_hash IS NOT NULL OR state<>'revoked' LIMIT 1`).first())return false;
  for(const [name,invalid] of [
   ['work_approval_decisions','inert IS NOT 1'],
   ['work_approval_tokens',"state IS NOT 'expired' OR token_hash IS NOT id OR sent_to IS NOT ''"],
   ['work_approval_mail_config','enabled IS NOT 0'],
   ['work_approval_stages','active_at IS NOT NULL OR remind_at IS NOT NULL OR reminded_at IS NOT NULL OR sla_at IS NOT NULL OR breached_at IS NOT NULL'],
  ]){
   const staged=tables[name];
   if(staged && await db.prepare(`SELECT 1 FROM "${staged.replaceAll('"','""')}" WHERE ${invalid} LIMIT 1`).first())return false;
  }
  const services=tables.svc_records;
  if(services && await db.prepare(`SELECT 1 FROM "${services.replaceAll('"','""')}" WHERE kind='release' AND (json_extract(data_json,'$.state') IS NOT 'imported-review' OR json_array_length(data_json,'$.decisions') IS NOT 0) LIMIT 1`).first())return false;
  return true;
 },
 exportRow(table,row){
  if(table==='svc_records' && row.kind==='release'){
   const data=JSON.parse(row.data_json);
   return {...row,data_json:JSON.stringify({...data,importedState:data.importedState||data.state,state:'imported-review',decisions:[],
    priorDecisions:[...(data.priorDecisions||[]),...(data.decisions||[])].map(d=>({...d,inert:true}))})};
  }
  if(table==='work_approval_decisions')return {...row,inert:1}
  if(table==='work_approval_stages')return {...row,active_at:null,remind_at:null,reminded_at:null,sla_at:null,breached_at:null}
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
