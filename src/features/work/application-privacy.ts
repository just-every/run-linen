import { hashToken } from '../../platform/crypto';
import type { WorkContext } from './core';
/** Request metadata retains business costs without keeping erased actors. */
export async function eraseApplicationSnapshots(ctx: WorkContext, identity: string) {
  const w=ctx.principal.workspaceId;
  const person=await ctx.env.DB.prepare('SELECT u.name,u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND u.id=?').bind(w,identity).first<{name:string;email:string}>();
  const tokens=[identity,person?.name,person?.email].filter((s):s is string=>!!s);
  const pseudonym='erased-'+(await hashToken(w+':'+identity)).slice(0,24);
  function redact(value:unknown):unknown {
    if(typeof value==='string') {
      if(tokens.includes(value))return pseudonym;
      let next=value;for(const token of tokens.filter(t=>t.length>2))next=next.split(token).join(pseudonym);return next;
    }
    if(Array.isArray(value))return value.map(redact);
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)]));
    return value;
  }
  const rows=(await ctx.env.DB.prepare('SELECT id,work_id,application_json FROM work_fulfilments WHERE workspace_id=? AND application_json IS NOT NULL').bind(w).all<{id:string;work_id:string;application_json:string}>()).results;
  for(const row of rows) {
    if(JSON.parse(row.application_json).ownerId===identity)await ctx.env.DB.prepare('UPDATE work_obligations SET owner_id=? WHERE workspace_id=? AND work_id=? AND owner_id=?').bind(pseudonym,w,row.work_id,identity).run();
    const redacted=JSON.stringify(redact(JSON.parse(row.application_json)));
    if(redacted!==row.application_json)await ctx.env.DB.prepare('UPDATE work_fulfilments SET application_json=? WHERE workspace_id=? AND id=?').bind(redacted,w,row.id).run();
  }
  const applications=(await ctx.env.DB.prepare("SELECT id,owner_id,data_json FROM svc_records WHERE workspace_id=? AND kind='application'").bind(w).all<{id:string;owner_id:string;data_json:string}>()).results;
  for(const app of applications) {
    const next=JSON.stringify(redact(JSON.parse(app.data_json)));
    if(app.owner_id===identity||next!==app.data_json)await ctx.env.DB.prepare('UPDATE svc_records SET owner_id=?,data_json=?,revision=revision+1 WHERE workspace_id=? AND id=?').bind(app.owner_id===identity?pseudonym:app.owner_id,next,w,app.id).run();
  }

}
