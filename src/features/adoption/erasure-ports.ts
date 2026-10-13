import { erasePlatformIdentity } from '../../platform/privacy';
import { erasePerson } from '../work/privacy';
import { eraseServicePerson } from '../services/privacy';
import { eraseExecutionPerson } from '../execution/erasure';
import { eraseIntelligenceIdentity } from '../intelligence/erasure';
import { check, queueDelete, type AdoptionContext } from './core';
export const builtinErasurePorts = [
    { name: 'intelligence', async erase(ctx: AdoptionContext, identity: string) { await eraseIntelligenceIdentity(ctx, identity); } },
    { name: 'work', async erase(ctx: AdoptionContext, identity: string) {
            const row = await ctx.env.DB.prepare("SELECT id,revision FROM work_people WHERE workspace_id=? AND (id=? OR source||':'||source_id=?)").bind(ctx.principal.workspaceId, identity, identity).first<{
                id: string;
                revision: number;
            }>();
            if (!row) {
                const member = await ctx.env.DB.prepare('SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=?').bind(ctx.principal.workspaceId, identity).first();
                if (member) {
                    const blobs = (await ctx.env.DB.prepare('SELECT a.blob_key FROM work_attachments a JOIN work_records w ON w.workspace_id=a.workspace_id AND w.id=a.work_id WHERE w.workspace_id=? AND (w.requester_id=? OR w.beneficiary_id=?)').bind(ctx.principal.workspaceId, identity, identity).all<{
                        blob_key: string;
                    }>()).results;
                    for (const b of blobs)
                        await queueDelete(ctx, b.blob_key);
                    const result = await erasePerson(ctx, { personId: identity, revision: 0, reason: 'Authorized adoption erasure' });
                    for (const key of result.unresolvedBlobKeys || [])
                        await queueDelete(ctx, key);
                    return;
                }
                const linked = await ctx.env.DB.prepare('SELECT 1 FROM work_records WHERE workspace_id=? AND (requester_id=? OR beneficiary_id=?)').bind(ctx.principal.workspaceId, identity, identity).first();
                if (linked) {
                    const result = await erasePerson(ctx, {personId:identity,revision:0,reason:'Authorized historical identity erasure'});
                    for (const key of result.unresolvedBlobKeys || []) await queueDelete(ctx,key);
                }
                return;
            }
            const blobs = (await ctx.env.DB.prepare('SELECT a.blob_key FROM work_attachments a JOIN work_records w ON w.workspace_id=a.workspace_id AND w.id=a.work_id WHERE w.workspace_id=? AND (w.requester_id=? OR w.beneficiary_id=?)').bind(ctx.principal.workspaceId, row.id, row.id).all<{
                blob_key: string;
            }>()).results;
            for (const b of blobs)
                await queueDelete(ctx, b.blob_key);
            const result = await erasePerson(ctx, { personId: row.id, revision: row.revision, reason: 'Authorized adoption erasure' });
            for (const key of result.unresolvedBlobKeys || [])
                await queueDelete(ctx, key);
        } },
    { name: 'services', async erase(ctx: AdoptionContext, identity: string) { const person = await ctx.env.DB.prepare('SELECT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND (u.id=? OR lower(u.email)=lower(?))').bind(ctx.principal.workspaceId, identity, identity).first<{
            id: string;
        }>(); if (person) {
            await eraseServicePerson(ctx, { userId: person.id, reason: 'Authorized adoption erasure' });
            return;
        } const affected = await ctx.env.DB.prepare('SELECT 1 FROM svc_records WHERE workspace_id=? AND (owner_id=? OR instr(participants_json,?)>0 OR instr(data_json,?)>0) UNION ALL SELECT 1 FROM svc_events WHERE workspace_id=? AND (actor_id=? OR instr(data_json,?)>0) UNION ALL SELECT 1 FROM svc_outbox WHERE workspace_id=? AND recipient_id=? LIMIT 1').bind(ctx.principal.workspaceId, identity, identity, identity,ctx.principal.workspaceId,identity,identity,ctx.principal.workspaceId,identity).first(); if(affected)await eraseServicePerson(ctx,{userId:identity,reason:'Authorized historical identity erasure'}); } },
    { name: 'platform', async erase(ctx: AdoptionContext, identity: string) { await erasePlatformIdentity(ctx, identity); } },
    { name: 'execution', async erase(ctx: AdoptionContext, identity: string) { await eraseExecutionPerson(ctx, identity); } }
];
