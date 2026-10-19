// Retain accounts, memberships, all domain history, Freshservice custody and R2
// bytes. An archive is data custody, never permission to resume remote effects.
export const portabilityPolicy={
 product:'runeditrun/linen',
 replaceableTables:['platform_auth_policy'],
 excludeTables:['platform_archive_recovery','sessions','login_limits','platform_auth_session_proofs','platform_auth_links','platform_auth_steps','platform_auth_limits','platform_auth_guard','execution_secrets'],
 secretColumns:{connections:['secret_ciphertext'],intelligence_engineering_jobs:['claim_token_hash']},
 requiredConfiguration:['OWNER_EMAIL','SESSION_SECRET','SETUP_TOKEN','AUTH_ORIGIN','ENCRYPTION_KEY','MAIL_PROVIDER','MAIL_FROM'],
 buckets:{ATTACHMENTS:{}},
 exportRow(table,row){
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
