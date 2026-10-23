import { date, humanize } from './api';
import { ActionForm } from './forms';
import { Badge, Facts, Notice } from './primitives';
import { useSession } from './state';
import { SoftwareLicenseEffect } from './software-licenses-effects';
import type { SoftwareLicense, SoftwareOptions } from './software-licenses-types';

export function SoftwareLicenseAuthority({ license, options, onChanged, onEffectSettled }: { license: SoftwareLicense; options: SoftwareOptions; onChanged: () => void; onEffectSettled: (error?: unknown) => void }) {
  const { session } = useSession(), data = license.data, grant = data.grant;
  const owner = session.principal.roles.includes('owner') && data.titleOwnerId === session.principal.userId;
  const canExecute = session.principal.roles.some(role => ['owner', 'operator'].includes(role));
  const users = data.observation?.users.filter(user => user.licensed && !user.active) ?? [];
  const installations = data.observation?.installations ?? [];
  const removable = installations.filter(installation => installation.userId && data.complianceWork.some(work => work.installationId === installation.id)
    && data.sourceBindings.some(binding => binding.connectionId === installation.connectionId && binding.kind === 'jamf' && binding.removalGroupId && binding.removalPolicyId && binding.removalPackageId));
  const executors = options.people.filter(person => person.id === data.titleOwnerId || person.roles?.includes('owner'));
  const person = (id: string) => options.people.find(p => p.id === id)?.name ?? id;
  const targetLabel = (id: string) => data.observation?.users.find(user => user.id === id)?.email
    ?? installations.find(installation => installation.id === id)?.serial ?? id;
  const openEffects = license.effects?.filter(effect => ['unknown', 'submitted', 'sending'].includes(effect.state)) ?? [];
  const liveGrant = grant && !grant.revokedAt && Date.parse(grant.expiresAt) > Date.now();
  const matchingObservation = Boolean(grant && grant.observationAt === data.observation?.observedAt);
  const canUseGrant = Boolean(liveGrant && matchingObservation && data.policy !== 'ignored' && grant?.principalId === session.principal.userId && license.summary.fresh && !openEffects.length);
  return <section className="connection-record" aria-label="License action authority">
    <h2>Reclaim & remove</h2>
    <p>Only the title owner can grant an exact set of targets to a named operator. Linen checks the current grant and source revisions at the provider action, then reads the result back.</p>
    {!license.summary.fresh && <Notice>Sync current provider observations before granting or taking action. Unknown usage is never treated as inactivity.</Notice>}
    {grant ? <>
      <h3>Grant version {grant.version} <Badge value={grant.revokedAt ? 'revoked' : liveGrant ? 'active' : 'expired'} /></h3>
      <Facts entries={[
        ['Action', grant.action === 'reclaim' ? 'Reclaim unused Zoom seats' : 'Remove installed application'],
        ['Granted operator', person(grant.principalId)], ['Issued by', person(grant.issuerId)],
        ['Expires', date(grant.expiresAt)], ['Reason', grant.reason], ['Exact targets', grant.targets.map(targetLabel).join('; ')],
      ]} />
      {liveGrant && !matchingObservation && <Notice>Provider observations changed after this grant. The title owner must review the new scope and issue a current grant before another action.</Notice>}
      {owner && !grant.revokedAt && <ActionForm title="Revoke this grant" path={`/software-licenses/${license.id}/revoke-grant`} submit="Revoke grant"
        fields={[]} defaults={{ revision: license.revision }} onSaved={onChanged} />}
    </> : <p className="muted">No action authority has been granted for this title.</p>}
    {owner && license.summary.fresh && data.policy !== 'ignored' && <>
      {users.length > 0 && <ActionForm title="Authorize seat reclamation" path={`/software-licenses/${license.id}/grants`} submit="Grant seat reclamation"
        explanation="Selected people will lose their paid Zoom license when the named operator uses this grant. Their provider account is not deleted. Only licensed people with observed inactivity are offered."
        defaults={{ revision: license.revision, action: 'reclaim' }} onSaved={onChanged}
        fields={[
          { name: 'principalId', label: 'Operator allowed to reclaim', type: 'select', required: true, options: executors.map(p => ({ value: p.id, label: p.name })) },
          { name: 'targets', label: 'People whose seats may be reclaimed', type: 'checkboxes', required: true, options: users.map(user => ({ value: user.id, label: user.email })) },
          { name: 'expiresAt', label: 'Grant expires', type: 'datetime-local', required: true, hint: 'Choose a future expiry within seven days.' },
          { name: 'reason', label: 'Reason for reclamation', type: 'textarea', required: true },
          { name: 'confirmed', label: 'I authorize removal of the selected paid licenses within this grant.', type: 'checkbox', required: true },
        ]} />}
      {removable.length > 0 && <ActionForm title="Authorize app removal" path={`/software-licenses/${license.id}/grants`} submit="Grant app removal"
        explanation="The selected installations may be removed through their configured MDM. A submitted command stays unverified until a later inventory shows the app absent."
        defaults={{ revision: license.revision, action: 'remove-app' }} onSaved={onChanged}
        fields={[
          { name: 'principalId', label: 'Operator allowed to remove', type: 'select', required: true, options: executors.map(p => ({ value: p.id, label: p.name })) },
          { name: 'targets', label: 'Installations that may be removed', type: 'checkboxes', required: true, options: removable.map(i => ({ value: i.id, label: `${i.serial} · ${i.title} · ${i.publisher}` })) },
          { name: 'expiresAt', label: 'Grant expires', type: 'datetime-local', required: true, hint: 'Choose a future expiry within seven days.' },
          { name: 'reason', label: 'Reason for removal', type: 'textarea', required: true },
          { name: 'confirmed', label: 'I authorize app removal from the selected devices within this grant.', type: 'checkbox', required: true },
        ]} />}
    </>}
    {!owner && <p className="fact-note">Ask {person(data.titleOwnerId)}, the current title owner, for a grant or a change to its scope.</p>}
    {installations.length > removable.length && <p className="fact-note">App removal requires a Jamf installation with a mapped current user, an open compliance follow-up, and a configured static group, enabled check-in policy and uninstall package. Edit connected sources to supply those exact targets. Intune inventory is read-only here.</p>}
    {canExecute && canUseGrant && grant?.action === 'reclaim' && <SoftwareLicenseEffect title="Use seat reclamation grant" path={`/software-licenses/${license.id}/reclaim`} submit="Reclaim selected seats"
      explanation={`Use grant version ${grant.version}. Provider readback determines the actual result.`}
      defaults={{ revision: license.revision, grantVersion: grant.version }} onSettled={onEffectSettled}
      fields={[{ name: 'userIds', label: 'Granted seats to reclaim now', type: 'checkboxes', required: true, options: users.filter(u => grant.targets.includes(u.id)).map(u => ({ value: u.id, label: u.email })) }]} />}
    {canExecute && canUseGrant && grant?.action === 'remove-app' && <SoftwareLicenseEffect title="Use app removal grant" path={`/software-licenses/${license.id}/removals`} submit="Remove selected app"
      explanation={`Use grant version ${grant.version}. The next inventory must show this installation absent before removal verifies.`}
      defaults={{ revision: license.revision, grantVersion: grant.version }} onSettled={onEffectSettled}
      fields={[{ name: 'installationId', label: 'Granted installation to remove now', type: 'select', required: true, options: installations.filter(i => grant.targets.includes(i.id)).map(i => ({ value: i.id, label: `${i.serial} · ${i.title}` })) }]} />}
    {openEffects.length > 0 && <Notice>An earlier action still needs readback. Reconcile it before taking another action.</Notice>}
    {!!license.effects?.length && <details className="evidence" open={openEffects.length > 0 || undefined}>
      <summary>Provider actions & readback</summary>
      {license.effects.map(effect => <article key={effect.id} aria-label={`License action ${effect.id}`}>
        <h3>{humanize(effect.action)} <Badge value={effect.state} /></h3>
        <p>{effect.state === 'verified' ? 'Provider readback verified this action.' : effect.state === 'submitted' ? 'Provider request submitted. Readback is still required.' : effect.state === 'sending' || effect.state === 'unknown' ? 'The provider outcome is unknown. Reconcile before another action.' : 'The provider action is not verified.'}</p>
        <Facts entries={[
          ['Target', targetLabel(data.effectTargets?.find(target => target.operationId === effect.id)?.targetId ?? 'Target unavailable')],
          ['Operation', effect.id], ['Grant version', effect.grant_version], ['Attempted', date(effect.attempted_at)],
        ]} />
        {canExecute && openEffects.some(e => e.id === effect.id) && <SoftwareLicenseEffect title="Read back this action" path={`/software-licenses/${license.id}/effects/${effect.id}/reconcile`}
          submit="Reconcile provider outcome" defaults={{ revision: license.revision }} onSettled={onEffectSettled}
          explanation="Read the provider under this operation identity. This does not repeat the removal or reclamation." />}
      </article>)}
    </details>}
  </section>;
}
