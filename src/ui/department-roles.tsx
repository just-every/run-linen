import { useState, type FormEvent } from 'react';
import { useMutation, useRemote } from './state';
import { ErrorNotice, Facts, Loading } from './primitives';

interface RoleMember {
  userId: string;
  name: string;
  active: boolean;
  roleRevision: number;
  revision: number;
}
interface DepartmentRole {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  permissions: string[];
  revision: number;
  active: boolean;
  members: RoleMember[];
}
interface RoleAdmin {
  items: DepartmentRole[];
  people: { id: string; name: string; email: string; roles: string[] }[];
  departments: { id: string; name: string; kind: string }[];
  permissions: { id: string; label: string }[];
}

export function DepartmentRoles() {
  const remote = useRemote<RoleAdmin>('/department-roles');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  function remember(id: string, open: boolean) {
    setExpanded(previous => {
      if (previous.has(id) === open) return previous;
      const next = new Set(previous);
      if (open) next.add(id); else next.delete(id);
      return next;
    });
  }
  const data = remote.data;
  return <section className="history" aria-label="Custom roles">
    <h2>Custom roles</h2>
    <details className="action-disclosure"><summary>How custom access works</summary>
      <p>Each role grants selected ticket capabilities in one department. Existing roles still apply independently. Editing a role withdraws its assignments; grant the updated role to each person again.</p>
    </details>
    <ErrorNotice error={remote.error} retry={remote.refresh} />
    {remote.loading && <Loading />}
    {data && <>
      <details className="action-disclosure" open={!data.items.length || expanded.has('create')} onToggle={event => remember('create', event.currentTarget.open)}>
        <summary>Create custom role</summary>
        <RoleDefinition admin={data} onSaved={remote.refresh} />
      </details>
      {data.items.map(role => <details className="action-disclosure" key={role.id} open={expanded.has(role.id)} onToggle={event => remember(role.id, event.currentTarget.open)}>
        <summary>{role.name} · {role.departmentName}{role.active ? '' : ' · Inactive'}</summary>
        <Facts entries={[
          ['Department', role.departmentName],
          ['Capabilities', role.permissions.map(id => data.permissions.find(p => p.id === id)?.label ?? id).join(', ')],
          ['Assigned people', role.members.filter(m => m.active && m.roleRevision === role.revision).map(m => m.name).join(', ') || 'No active assignments'],
        ]} />
        <details className="action-disclosure"><summary>Edit custom role</summary>
          <RoleDefinition key={role.revision} admin={data} role={role} onSaved={remote.refresh} />
        </details>
        <RoleAssignment key={`${role.id}:${role.revision}`} role={role} people={data.people} onSaved={remote.refresh} />
      </details>)}
    </>}
  </section>;
}

function RoleDefinition({ admin, role, onSaved }: { admin: RoleAdmin; role?: DepartmentRole; onSaved: () => void }) {
  const mutation = useMutation();
  const [permissions, setPermissions] = useState<string[]>(role?.permissions ?? ['ticket.read']);
  function capability(id: string, checked: boolean) {
    setPermissions(previous => {
      const next = new Set(previous);
      if (checked) next.add(id); else next.delete(id);
      next.add('ticket.read');
      if (id === 'ticket.private.reply' && checked) {
        next.add('ticket.private.read');
        next.add('ticket.reply');
      }
      if (!checked && ['ticket.private.read', 'ticket.reply'].includes(id)) next.delete('ticket.private.reply');
      return [...next];
    });
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body = { name: String(fields.get('name')).trim(), permissions, ...(role
      ? { revision: role.revision, active: fields.has('active') }
      : { departmentId: fields.get('departmentId') }) };
    if (await mutation.mutate(role ? `/department-roles/${role.id}` : '/department-roles', body)) onSaved();
  }
  return <form className="inline-form" aria-label={role ? `Edit ${role.name}` : 'Create custom role'} onSubmit={save}>
    <div className="field-grid">
      <label>Role name<input name="name" required defaultValue={role?.name ?? ''} /></label>
      {role ? <p>Department: {role.departmentName}</p> : <label>Department<select name="departmentId" required defaultValue="">
        <option value="">Choose…</option>
        {admin.departments.filter(d => d.kind !== 'hr').map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
      </select></label>}
    </div>
    <fieldset className="checkbox-group"><legend>Ticket capabilities</legend>
      {admin.permissions.map(permission => <label className="checkbox-field" key={permission.id}>
        <input type="checkbox" name="permissions" value={permission.id} checked={permissions.includes(permission.id)} disabled={permission.id === 'ticket.read'} onChange={event => capability(permission.id, event.target.checked)} />
        <span>{permission.label}{permission.id === 'ticket.read' ? ' (required)' : ''}</span>
      </label>)}
    </fieldset>
    <details className="action-disclosure"><summary>{role ? 'Before changing this role' : 'About these capabilities'}</summary>
      <p>Private replies also require reading private notes and replying publicly. {role ? 'Saving any change withdraws all current assignments. Review the new capabilities before granting access again.' : 'A new role has no assignments. Choose the people who may use it after creation.'}</p>
    </details>
    {role && <label className="checkbox-field"><input type="checkbox" name="active" defaultChecked={role.active} /><span>Role is active</span></label>}
    <ErrorNotice error={mutation.error} />
    <button className="action primary" disabled={mutation.pending || (!role && !admin.departments.some(d => d.kind !== 'hr'))}>{mutation.pending ? 'Saving…' : role ? 'Save role changes' : 'Create role'}</button>
  </form>;
}

function RoleAssignment({ role, people, onSaved }: { role: DepartmentRole; people: RoleAdmin['people']; onSaved: () => void }) {
  const mutation = useMutation();
  const [operation, setOperation] = useState('grant');
  const available = people.filter(person => !person.roles.includes('integration')).filter(person => {
    const current = role.members.some(member => member.userId === person.id && member.active && member.roleRevision === role.revision);
    return operation === 'grant' ? !current : current;
  });
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const userId = String(new FormData(event.currentTarget).get('userId'));
    const member = role.members.find(m => m.userId === userId);
    if (await mutation.mutate(`/department-roles/${role.id}/members`, {
      roleRevision: role.revision, userId, active: operation === 'grant', revision: member?.revision ?? 0,
    })) onSaved();
  }
  return <details className="action-disclosure"><summary>Manage role assignments</summary>
    <form className="inline-form" aria-label={`${role.name} assignments`} onSubmit={save}>
      <label>Assignment action<select value={operation} onChange={event => setOperation(event.target.value)}><option value="grant">Grant role</option><option value="withdraw">Withdraw role</option></select></label>
      <label>Person<select key={operation} name="userId" required defaultValue=""><option value="">Choose…</option>{available.map(person => <option key={person.id} value={person.id}>{person.name} · {person.email}</option>)}</select></label>
      {!role.active && <p>This role is inactive. Activate it before granting access.</p>}
      <ErrorNotice error={mutation.error} />
      <button className="action secondary" disabled={mutation.pending || !available.length || (!role.active && operation === 'grant')}>{mutation.pending ? 'Saving…' : operation === 'grant' ? 'Grant role' : 'Withdraw role'}</button>
    </form>
  </details>;
}
