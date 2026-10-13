import { ApiError } from '../../platform/http';
import type { WorkContext } from './core';

export interface PrivacyPerson {
  id: string;
  source: string;
  source_id: string;
  revision: number;
  member_id: string | null;
  binding_id: string | null;
}

/** Inactive people/accounts still carry personal data. Former links are audit
 * history, never identity equivalence, and ambiguous current IDs need review. */
export async function privacyPeople(ctx: WorkContext, identity: string) {
  const rows = (await ctx.env.DB.prepare(`SELECT id,source,source_id,revision,member_id,binding_id
    FROM work_people WHERE workspace_id=? AND
    (id=? OR source||':'||source_id=? OR (member_id=? AND binding_id IS NOT NULL))`)
    .bind(ctx.principal.workspaceId, identity, identity, identity).all<PrivacyPerson>()).results;
  if (rows.length > 1)
    throw new ApiError(409, 'ambiguous_person_identity', 'Review conflicting current person identities before erasure');
  return rows;
}

/** Hold the reviewed relationship fixed when erasure tombstones are admitted. */
export function privacyBindingFence(ctx: WorkContext, people: PrivacyPerson[], guard: string, identities: string[]) {
  const predicates = people.map(() => `EXISTS(SELECT 1 FROM work_people WHERE
    workspace_id=? AND id=? AND revision=? AND member_id IS ? AND binding_id IS ?)`);
  const bindings: (string | number | null)[] = people.flatMap(p =>
    [ctx.principal.workspaceId, p.id, p.revision, p.member_id, p.binding_id]);
  if (identities.length) {
    const slots = identities.map(() => '?').join(',');
    predicates.push(`NOT EXISTS(SELECT 1 FROM work_people WHERE workspace_id=? AND
      (id IN (${slots}) OR source||':'||source_id IN (${slots}) OR (binding_id IS NOT NULL AND member_id IN (${slots})))
      ${people.length ? `AND id NOT IN (${people.map(() => '?').join(',')})` : ''})`);
    bindings.push(ctx.principal.workspaceId, ...identities, ...identities, ...identities, ...people.map(p => p.id));
  }
  return ctx.env.DB.prepare(`INSERT INTO work_fulfilment_link_guards VALUES(?,CASE WHEN
    ${predicates.join(' AND ') || '1'} THEN 1 ELSE 0 END)`)
    .bind(guard, ...bindings);
}
