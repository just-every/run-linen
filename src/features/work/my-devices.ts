import type { WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { personForMember } from './person-binding';

/** The signed-in employee's own assigned or loaned devices, through the reviewed link from their account to their directory person. Nothing else about the asset leaves. */
export async function myDevices(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  const person = await personForMember(ctx, ctx.principal.userId);
  if (!person) return { items: [] };
  const rows = await ctx.env.DB.prepare("SELECT id,serial,asset_tag,state,location FROM work_assets WHERE workspace_id=? AND person_id=? AND state IN ('assigned','loaned','received') ORDER BY COALESCE(asset_tag,serial)").bind(ctx.principal.workspaceId, person.id).all();
  return { items: rows.results };
}
