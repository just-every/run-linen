import { prepareHistoryErasure } from '../history/erasure';
import { eraseSoftwareLicenseAliases, erasedSoftwareLicense } from './software-license-privacy';
import { erasedCalendarPolicy } from './calendar-privacy';
import { eraseProblemArticles } from './problem-privacy';
import { eraseKnowledgeDraftPerson } from '../work/knowledge-draft-privacy';
import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { hashToken } from '../../platform/crypto';
import type { RecordRow } from './store';
export async function eraseServicePerson(ctx: {
    env: Env;
    principal: Principal;
}, input: {
    userId: string;
    reason: string;
}) {
    const { env, principal: p } = ctx;
    if (!p.roles.includes('owner') || !input.reason)
        throw new ApiError(403, 'owner', 'Owner and reason required');
    const member = await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, p.userId).first<{
        roles_json: string;
    }>();
    if (!member || !JSON.parse(member.roles_json).includes('owner'))
        throw new ApiError(403, 'owner', 'Active owner required');
    const person = await env.DB.prepare('SELECT u.email,u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.workspace_id=?').bind(input.userId,p.workspaceId).first<{
        email: string;
        name: string;
    }>();
    if(!person&&!await env.DB.prepare('SELECT 1 FROM adoption_tombstones WHERE workspace_id=? AND identity_hash=?').bind(p.workspaceId,await hashToken(input.userId)).first())throw new ApiError(404,'person_not_found','Workspace person or scoped erasure tombstone required');
    const history=await prepareHistoryErasure(ctx,[input.userId],new Date().toISOString());
    await env.DB.batch(history.statements);
    const pseudonym = 'erased-' + (await hashToken(p.workspaceId + ':' + input.userId)).slice(0, 24);
    const tokens = [input.userId, person?.email, person?.name].filter((x): x is string => !!x && x.length > 2);
    await eraseSoftwareLicenseAliases(ctx,input.userId,tokens);
    await eraseKnowledgeDraftPerson(ctx, input.userId, tokens);
    const redact = (value: any): any => {
        if (typeof value === 'string') {
            // A historical nonmember has no dependable current name/email profile.
            // Remove free text from affected records; preserve unrelated opaque UUID links.
            if(!person && value!==input.userId && !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value))return '[erased]';
            let s = value;
            for (const token of tokens)
                s = s.split(token).join(pseudonym);
            return s;
        }
        if (Array.isArray(value))
            return value.map(redact);
        if (value && typeof value === 'object')
            return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, redact(v)]));
        return value;
    };
    const rows = await env.DB.prepare('SELECT * FROM svc_records WHERE workspace_id=?').bind(p.workspaceId).all<RecordRow>();
    let count = 0;
    const affectedRecords = new Set<string>();
    for (const r of rows.results) {
        const participants = JSON.parse(r.participants_json) as string[];
        const affectedProblem = r.owner_id === input.userId || participants.includes(input.userId) || tokens.some(t => r.data_json.includes(t));
        const affectedArticle = await eraseProblemArticles(env.DB, p, r, input.userId, tokens, affectedProblem, redact);
        const affected = affectedProblem || affectedArticle;
        if (!affected)
            continue;
        affectedRecords.add(r.id);
        const original=JSON.parse(r.data_json),redacted=redact(original);
        const data = r.kind==='calendar-window'?erasedCalendarPolicy(original,redacted):erasedSoftwareLicense(original,redacted);
        if(r.kind==='change-template'){data.active=false;data.priorApprovals=[...(data.priorApprovals||[]),...(data.approval?[data.approval]:[])].map((a:any)=>({...a,inert:true}));data.approval=null;}
        if (r.kind === 'change') {
            data.cabBypass=null;
            data.priorAuthorizations = [];
            data.authorizations = [];
            data.state = 'privacy-review';
        }
        if (r.kind === 'release') {
            data.priorDecisions = [];
            data.decisions = [];
            data.state = 'privacy-review';
        }
        if (r.kind === 'decision' && data.holderId === pseudonym) {
            data.state = 'needs-owner';
            data.nextDueAt = null;
        }
        await env.DB.batch([env.DB.prepare('UPDATE svc_records SET owner_id=?,participants_json=?,data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').bind(r.owner_id === input.userId ? pseudonym : r.owner_id, JSON.stringify(participants.filter(x => x !== input.userId)), JSON.stringify(data), now(), p.workspaceId, r.id, r.revision), env.DB.prepare('INSERT INTO svc_events SELECT ?,?,?,?,?,?,? WHERE changes()=1').bind(id(), p.workspaceId, r.id, p.userId, 'person-erased', JSON.stringify({ historyCounts: history.counts }), now())]);
        count++;
    }
    await env.DB.prepare("UPDATE svc_outbox SET payload_json='{}',recipient_id=?,state='erased',error=NULL WHERE workspace_id=? AND recipient_id=?").bind(pseudonym, p.workspaceId, input.userId).run();
    if (!person) for (const recordId of affectedRecords) {
        await env.DB.batch([env.DB.prepare("UPDATE svc_outbox SET payload_json='{}',state='erased',error=NULL WHERE workspace_id=? AND record_id=?").bind(p.workspaceId,recordId),env.DB.prepare("UPDATE svc_commands SET result_json='{}' WHERE workspace_id=? AND record_id=?").bind(p.workspaceId,recordId)]);
    }
    return { erasedRecords: count, subject: pseudonym };
}
