import { upsertPerson } from '../features/work/resources';
import { reviewPersonBinding, personForMember } from '../features/work/person-binding';
import type { WorkContext } from '../features/work/core';

/** The Northstar team: each person's name and team, as their requests record them. */
export const demoPeople: [string, string][] = [['Priya Shah', 'Design'], ['Jordan Lee', 'Sales'], ['Samira Khan', 'Customer Success'], ['Theo Bennett', 'Operations'], ['Maya Chen', 'Marketing'], ['Oliver Brooks', 'Engineering'], ['Amelia Wilson', 'Finance'], ['Noah Patel', 'Product']];

/** Each person's fictional account. */
export const demoAccount = (name: string) => `linen-demo-${name.split(' ')[0].toLowerCase()}`;

/** The workspace and its owner, Alex Morgan (DEMO.md), who heads the team and reports to no one in the demo. */
export async function seedDemoOwner(ctx: WorkContext, ownerEmail: string, now: Date) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, time = now.toISOString();
  await db.batch([
    db.prepare('UPDATE workspaces SET name=? WHERE id=?').bind('Northstar Studio', w),
    // The local demo claims its owner with the default name; the Northstar owner is Alex Morgan.
    db.prepare("UPDATE users SET name='Alex Morgan' WHERE id=? AND name='Owner'").bind(ctx.principal.userId),
  ]);
  if (await personForMember(ctx, ctx.principal.userId)) return;
  const owner = await db.prepare('SELECT name FROM users WHERE id=?').bind(ctx.principal.userId).first<{ name: string }>();
  const person = await upsertPerson(ctx, {
    source: 'Demo sample · owner directory', sourceId: ownerEmail, name: owner!.name,
    observedAt: time, effectiveAt: new Date(now.getTime() - 30 * 86400000).toISOString(),
  }) as { id: string; revision: number };
  await reviewPersonBinding(ctx, person.id, { expectedRevision: person.revision, memberId: ctx.principal.userId, managerId: null });
}

/** Every Northstar person has a directory record reviewed as their own account, reporting to the owner: a request
    recorded for them grants to them, and its catalog approval waits on the owner. */
export async function seedDemoPeople(ctx: WorkContext, now: Date) {
  const db = ctx.env.DB, w = ctx.principal.workspaceId, day = (offset: number) => new Date(now.getTime() + offset * 86400000).toISOString();
  for (const [index, [name]] of demoPeople.entries()) {
    const account = demoAccount(name);
    await db.batch([
      db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?,?,?)').bind(account, `${name.split(' ')[0].toLowerCase()}@northstar.example`, name, '!email-link', now.toISOString()),
      db.prepare('INSERT OR IGNORE INTO memberships VALUES(?,?,?,1)').bind(w, account, '["employee"]'),
    ]);
    if (await personForMember(ctx, account)) continue;
    const person = await db.prepare('SELECT id,revision FROM work_people WHERE workspace_id=? AND source_id=? AND member_id IS NULL')
      .bind(w, `northstar-${index}`).first<{ id: string; revision: number }>()
      ?? await upsertPerson(ctx, { source: 'Northstar team directory · demo sample', sourceId: `northstar-${index}`, name, effectiveAt: day(-30 - index), observedAt: day(-1) }) as { id: string; revision: number };
    await reviewPersonBinding(ctx, person.id, { expectedRevision: person.revision, memberId: account, managerId: ctx.principal.userId });
  }
}
