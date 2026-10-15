import { upsertPerson } from '../features/work/resources';
import { reviewPersonBinding, personForMember } from '../features/work/person-binding';
import type { WorkContext } from '../features/work/core';

/** Fictional account references, with the same reviewed person links used by fulfilment. */
export async function seedDemoDecisionHolder(ctx: WorkContext, ownerEmail: string, now: Date) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, manager = 'linen-demo-manager', time = now.toISOString();
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?)').bind(manager, 'priya@northstar.example', 'Priya Shah', '!email-link', time),
    db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?,?,1)').bind(w, manager, '["approver"]'),
    db.prepare('UPDATE users SET name=? WHERE id=?').bind('Alex Morgan', ctx.principal.userId),
    db.prepare('UPDATE workspaces SET name=? WHERE id=?').bind('Northstar Studio', w),
  ]);
  if (!await personForMember(ctx, ctx.principal.userId)) {
    const person = await upsertPerson(ctx, {
      source: 'Demo sample · owner directory', sourceId: ownerEmail, name: 'Alex Morgan', managerId: manager,
      observedAt: time, effectiveAt: new Date(now.getTime() - 30 * 86400000).toISOString(),
    }) as { id: string; revision: number };
    await reviewPersonBinding(ctx, person.id, { expectedRevision: person.revision, memberId: ctx.principal.userId, managerId: manager });
  }
}
