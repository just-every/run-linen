import type { PeopleAdapter, Person } from '../../modules/agent-door/types';
import { nativeStore, type Person as NativePerson } from '../../platform/base-auth/store';
import { ApiError } from '../../platform/http';
import { assertPlatformAdmission } from '../../platform/privacy';
import type { Env } from '../../platform/types';

/** The confirmed installation owner is an identity anchor, never the next owner by email or role. */
export async function installationOwner(env: Env): Promise<NativePerson | null> {
  const anchor = await env.DB.prepare('SELECT completed_by FROM platform_first_run WHERE singleton=1')
    .first<{ completed_by: string }>();
  if (!anchor) return null;
  const owner = await nativeStore(env).byId(anchor.completed_by);
  if (!owner?.owner || owner.status !== 'active') return null;
  return admitted(env, owner);
}

async function admitted(env: Env, person: NativePerson): Promise<NativePerson | null> {
  if (person.status !== 'active') return null;
  try { await assertPlatformAdmission(env.DB, person.workspaceId, person.id, person.email); }
  catch (error) { if (error instanceof ApiError && error.code === 'identity_erased') return null; throw error; }
  const withheld = await env.DB.prepare(`SELECT 1 FROM work_erasure WHERE workspace_id=? AND person_id=?
    UNION ALL SELECT 1 FROM execution_automation_principals WHERE workspace_id=? AND user_id=? AND revoked_at IS NOT NULL LIMIT 1`)
    .bind(person.workspaceId, person.id, person.workspaceId, person.id).first();
  return withheld ? null : person;
}

type DoorPerson = Person & { doorRole: 'owner' | 'editor' | null };
const project = (person: NativePerson, doorRole: DoorPerson['doorRole'] = null): DoorPerson => ({ id: person.id, email: person.email,
  name: person.displayName, role: person.role, active: true, doorRole });

export function createPeople(env: Env): PeopleAdapter {
  const store = nativeStore(env);
  async function binding() {
    return env.DB.prepare('SELECT owner_id FROM bs_settings WHERE singleton=1 AND stopped=0')
      .first<{ owner_id: string | null }>();
  }
  async function businessMember(person: NativePerson) {
    const [settings, owner] = await Promise.all([binding(), installationOwner(env)]);
    if (!settings || !owner || person.workspaceId !== owner.workspaceId) return null;
    if (settings.owner_id && person.id === owner.id) return { id: settings.owner_id, role: 'owner' as const };
    const member = await env.DB.prepare(`SELECT business_id,business_role FROM bs_team
      WHERE operator_id=? AND state='active' AND business_id IS NOT NULL`).bind(person.id)
      .first<{ business_id: string; business_role: string | null }>();
    return member ? { id: member.business_id, role: member.business_role === 'admin' ? 'editor' as const : null } : null;
  }
  const read = async (id: string, workspaceId?: string) => {
    const person = await store.byId(id, workspaceId);
    const current = person && await admitted(env, person);
    if (!current) return null;
    const paired = Boolean((env as Env & { RER_BUSINESS_TRUST?: string }).RER_BUSINESS_TRUST);
    const role = paired ? (await businessMember(current))?.role ?? null
      : current.owner ? 'owner' : current.role === 'operator' ? 'editor' : null;
    return project(current, role);
  };
  return {
    person: read,
    async session(request) {
      const session = await store.getSession(request, { now: Date.now() });
      return session ? read(session.operator.id, (session.operator as NativePerson).workspaceId) : null;
    },
    async sponsor({ sub }) {
      const [settings, owner] = await Promise.all([binding(), installationOwner(env)]);
      if (!settings || !owner) return null;
      if (settings.owner_id === sub) return read(owner.id, owner.workspaceId);
      const member = await env.DB.prepare("SELECT operator_id FROM bs_team WHERE business_id=? AND state='active'")
        .bind(sub).first<{ operator_id: string | null }>();
      return member?.operator_id ? read(member.operator_id, owner.workspaceId) : null;
    },
    async businessMember(person) {
      const native = await store.byId(person.id);
      return native && await admitted(env, native) ? businessMember(native) : null;
    },
    // Paired roles were resolved from signed bindings; unpaired roles use native sessions.
    businessRole: person => (person as DoorPerson).doorRole ?? null,
  };
}
