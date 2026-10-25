import type {Env} from './types';
import {ApiError} from './http';
import {platformAdmissionGuard} from './privacy';

export async function connectionAdmission(db: Env['DB'], workspaceId: string, provider: string, config: Record<string, unknown>) {
    if (provider !== 'github') return {sql:'1',bindings:[] as unknown[]};
    const memberId=config.memberId;
    const user=await db.prepare('SELECT u.email FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND m.active=1')
        .bind(workspaceId,memberId).first<{email:string}>();
    if (!user) throw new ApiError(409,'github_member_inactive','Choose a current member');
    const guard=await platformAdmissionGuard(db,workspaceId,String(memberId),user.email);
    return {sql:'EXISTS(SELECT 1 FROM memberships WHERE workspace_id=? AND user_id=? AND active=1) AND '+guard.sql,
        bindings:[workspaceId,memberId,...guard.bindings]};
}
