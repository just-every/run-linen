import { ApiError } from '../../platform/http';
import { assertPlatformAdmission } from '../../platform/privacy';
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import type { WorkContext } from './core';
import { reportOwner } from './report-store';

/** The scheduler's constructed principal is never authority: consult current membership and fences. */
export async function biEffectGate(ctx:WorkContext,key:string) {
  await reportOwner(ctx);
  const w=ctx.principal.workspaceId,u=ctx.principal.userId;
  const user=await ctx.env.DB.prepare('SELECT email FROM users WHERE id=?').bind(u).first<{email:string}>();
  if(!user||await ctx.env.DB.prepare('SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?').bind(w,u).first())throw new ApiError(409,'identity_erased','Export owner is unavailable');
  await assertPlatformAdmission(ctx.env.DB,w,u,user.email);
  await assertAdoptionEffectAllowed(ctx,{resource:key,action:'bi.export'});
}
