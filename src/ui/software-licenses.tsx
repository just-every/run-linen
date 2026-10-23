import { useState } from 'react';
import { date, humanize } from './api';
import { ActionForm } from './forms';
import { Badge, Empty, ErrorNotice, Facts, Hero, Loading, Notice } from './primitives';
import { useRemote, useSession } from './state';
import { SoftwareLicenseAuthority } from './software-licenses-authority';
import { SoftwareLicenseEffect } from './software-licenses-effects';
import { NewSoftwareLicense, SoftwareLicenseConnection, SoftwareLicenseSources, SoftwareLicenseTerms } from './software-licenses-forms';
import { softwareKinds, softwareRenewalDate, softwareUsd, type SoftwareLicense, type SoftwareOptions } from './software-licenses-types';
export { SoftwareLicenseNotices } from './software-licenses-notices';

/** Native ASSET-006 owner surface. It records no sample licenses or provider results. */
export function SoftwareLicenses({ selectedId }: { selectedId?: string }) {
  const list = useRemote<{ items: SoftwareLicense[] }>(selectedId ? null : '/software-licenses');
  const detail = useRemote<SoftwareLicense>(selectedId ? `/software-licenses/${encodeURIComponent(selectedId)}` : null);
  const options = useRemote<SoftwareOptions>('/software-license-options');
  const { session } = useSession(), canEdit = session.principal.roles.includes('owner');
  const [effectError, setEffectError] = useState<unknown>(null);
  const refresh = () => { list.refresh(); detail.refresh(); options.refresh(); };
  const settled = (error?: unknown) => { setEffectError(error ?? null); refresh(); };
  const current = selectedId ? detail : list;
  return <>
    {selectedId && <a className="back-link" href="#/software-licenses">All software licenses</a>}
    <Hero eyebrow="Software & entitlements" title={detail.data?.data.name ?? 'Software licenses'}>
      <p className="lead">Keep paid seats, installed apps and renewal decisions together. Provider observations show what is known; grants control what can change.</p>
    </Hero>
    <ErrorNotice error={options.error} retry={options.refresh} />
    <ErrorNotice error={effectError} />
    {current.loading ? <Loading label="Reading software licenses…" /> : current.error ? <ErrorNotice error={current.error} retry={current.refresh} /> : selectedId
      ? detail.data && options.data && <SoftwareLicenseDetail key={`${detail.data.id}:${detail.data.revision}`} license={detail.data} options={options.data} onChanged={refresh} onEffectSettled={settled} canEdit={canEdit} />
      : <>
        {list.data?.items.length ? <div className="record-stack">{list.data.items.map(license => <article className="connection-record" key={license.id} aria-label={`${license.data.name} license summary`}>
          <div className="section-heading"><h2><a href={`#/software-licenses/${license.id}`}>{license.data.name}</a></h2><Badge value={license.summary.fresh ? license.data.policy : 'unknown'} /></div>
          <p>{license.data.publisher} · {humanize(license.data.metric)}</p>
          <LicenseCounts license={license} compact />
          <p><a href={`#/software-licenses/${license.id}`}>Review {license.data.name}</a> · Renewal {softwareRenewalDate(license.data.contract.renewalAt)}</p>
        </article>)}</div> : <Empty title="No software licenses recorded.">Add your actual contract, title owner and sources. Empty inventory does not establish compliance.</Empty>}
        {canEdit && options.data && <section className="connection-record" aria-label="Record software licensing">
          <h2>Contracts & connected sources</h2>
          <NewSoftwareLicense options={options.data} onSaved={id => { refresh(); location.hash = `/software-licenses/${id}`; }} />
          <SoftwareLicenseConnection onSaved={options.refresh} />
          {!!options.data.connections.length && <details className="evidence"><summary>Available source connections</summary>
            {options.data.connections.map(connection => <p key={connection.id}>{connection.name} · {humanize(connection.provider)} · <Badge value={connection.status} /></p>)}
          </details>}
        </section>}
      </>}
  </>;
}

function LicenseCounts({ license, compact = false }: { license: SoftwareLicense; compact?: boolean }) {
  const s = license.summary, observed = Boolean(license.data.observation);
  const amount = (value: number | null | undefined) => value == null || !observed ? 'Unknown' : value;
  return <Facts entries={[
    ['Contract seats', s.entitled], ['Consumed licenses', amount(s.consumed)],
    ...(compact ? [] : [['Active users', amount(s.activeUsers)] as [string, unknown]]),
    ['Reclaimable seats', amount(s.reclaimable)],
    ...(compact ? [] : [
      ['Over-licensed (above entitlement)', amount(s.overLicensed)] as [string, unknown],
      ['Under-licensed (spare entitlement)', amount(s.underLicensed)] as [string, unknown],
      ['Estimated true-up (USD)', observed ? softwareUsd(s.trueUpUsd) : 'Unknown'] as [string, unknown],
    ]),
  ]} />;
}

function SoftwareLicenseDetail({ license, options, onChanged, onEffectSettled, canEdit }: { license: SoftwareLicense; options: SoftwareOptions; onChanged: () => void; onEffectSettled: (error?: unknown) => void; canEdit: boolean }) {
  const d = license.data, observation = d.observation;
  const name = (id: string) => options.people.find(p => p.id === id)?.name ?? id;
  return <>
    <section className="connection-record" aria-label={`${d.name} license position`}>
      <div className="section-heading"><h2>License position</h2><Badge value={license.summary.fresh ? 'current observations' : 'unknown'} /></div>
      <p>{d.publisher} · {humanize(d.metric)} · {humanize(d.policy)} · Owned by {name(d.titleOwnerId)}</p>
      <LicenseCounts license={license} />
      {license.summary.basis && <p className="fact-note">{license.summary.basis}</p>}
      {!license.summary.fresh && <Notice>Usage and compliance are not confirmed. {observation ? `Last observation: ${date(observation.observedAt)}.` : 'No provider observations have been synced.'}</Notice>}
      {!!license.summary.unknowns.length && <details className="evidence" open><summary>What still needs checking</summary>
        <ul>{license.summary.unknowns.map((unknown, index) => <li key={index}>{humanize(unknown)}</li>)}</ul>
      </details>}
      {canEdit && <SoftwareLicenseEffect title="Sync provider observations" path={`/software-licenses/${license.id}/sync`}
        defaults={{ revision: license.revision }} submit="Sync license sources" onSettled={onEffectSettled}
        explanation="Read the configured provider accounts, license assignments, activity and installed-app inventory. This sync does not reclaim licenses or remove software." />}
    </section>
    <section className="connection-record" aria-label="Contract and renewal">
      <h2>Contract & renewal</h2>
      <Facts entries={[
        ['Title owner', name(d.titleOwnerId)], ['Related service', options.services.find(s => s.id === d.serviceId)?.name ?? d.serviceId],
        ['Annual contract cost', softwareUsd(d.contract.annualCostUsd)], ['Additional license unit cost', softwareUsd(d.contract.trueUpUnitUsd)],
        ['Renewal date', softwareRenewalDate(d.contract.renewalAt)], ['Contract reference', d.contract.reference],
      ]} />
      <p className="fact-note">Renewal reviews are due at 90, 60 and 30 days. A queued notice is separate from delivered notification evidence.</p>
      {d.reminders.map((reminder, index) => <p key={index}>{reminder.days}-day renewal review · Queued {date(reminder.queuedAt)}{reminder.notificationId ? ' · Notification queued; delivery unconfirmed.' : ''}</p>)}
      {canEdit && <ActionForm title="Check due renewal reminders" path={`/software-licenses/${license.id}/renewal-reminders`} fields={[]}
        submit="Queue due renewal reminders" defaults={{ revision: license.revision }} onSaved={onChanged}
        explanation="Explicitly queue any due 90-, 60- or 30-day renewal review for the title owner. This may create an outbound notification; delivery is not established by queuing." />}
      {canEdit && <SoftwareLicenseTerms license={license} onChanged={onChanged} />}
    </section>
    <SoftwareLicenseAuthority license={license} options={options} onChanged={onChanged} onEffectSettled={onEffectSettled} />
    <section className="connection-record" aria-label="License observations">
      <h2>Sources & observations</h2>
      {!d.sourceBindings.length && <p>No source is configured for this title. Contract seats alone cannot establish usage, unused seats or compliance.</p>}
      {d.sourceBindings.map((binding, index) => <div key={index}>
        <h3>{softwareKinds.find(k => k.value === binding.kind)?.label}</h3>
        <Facts entries={[
          ['Connection', options.connections.find(c => c.id === binding.connectionId)?.name ?? binding.connectionId],
          ['Observed', observation ? date(observation.observedAt) : 'Not synced'],
          ['Title aliases', binding.aliases?.map(alias => `${alias.title} · ${alias.publisher}`).join('; ') ?? 'Not applicable'],
        ]} />
      </div>)}
      {canEdit && <>
        <SoftwareLicenseSources license={license} options={options} onChanged={onChanged} />
        <SoftwareLicenseConnection onSaved={onChanged} />
      </>}
      {observation && <>
        {d.metric === 'concurrent' && <>
          {observation.concurrency && <Facts entries={[
            ['Owner-recorded concurrent peak', observation.concurrency.peak], ['Peak source', observation.concurrency.source],
            ['Peak evidence', observation.concurrency.evidence], ['Peak observed', date(observation.concurrency.observedAt)],
          ]} />}
          {canEdit && <ActionForm title="Record a concurrent usage peak" path={`/software-licenses/${license.id}/concurrency-observations`} submit="Record measured peak"
            explanation="Record an actual dated peak and its evidence. This is an owner-recorded measurement; installed apps alone do not establish concurrent usage. Recording a peak invalidates the prior action grant."
            defaults={{ revision: license.revision }} fields={[
              { name: 'peak', label: 'Measured concurrent licenses', type: 'number', required: true },
              { name: 'source', label: 'Measurement source', required: true },
              { name: 'evidence', label: 'Measurement evidence', type: 'textarea', required: true },
              { name: 'observedAt', label: 'Peak observed at', type: 'datetime-local', required: true },
            ]} onSaved={onChanged} />}
        </>}
        <details className="evidence"><summary>People & observed license activity ({observation.users.length})</summary>
          {observation.users.map(user => <article key={user.id}>
            <h3>{user.email}</h3><p>{user.licensed ? 'Paid license assigned' : 'No paid license assigned'} · {user.active ? 'Activity observed' : 'No activity in the observed window'}</p>
          </article>)}
        </details>
        <details className="evidence"><summary>Installed applications ({observation.installations.length})</summary>
          {observation.installations.map(installation => <article key={installation.id}>
            <h3>{installation.serial} · {installation.title}</h3>
            <Facts entries={[
              ['Publisher', installation.publisher], ['Version', installation.version], ['Device', installation.deviceId],
              ['Assigned user', installation.userId ? name(installation.userId) : 'Unmapped user'], ['Observed', date(installation.observedAt)],
            ]} />
          </article>)}
        </details>
      </>}
      {!!d.complianceWork.length && <details className="evidence"><summary>Compliance follow-up work ({d.complianceWork.length})</summary>
        {d.complianceWork.map((work, index) => <p key={index}>
          {work.workId && <a href={`#/work/${work.workId}`}>Open compliance follow-up</a>} · {humanize(work.reason)} · {work.noticeAvailableAt ? `In-app notice available ${date(work.noticeAvailableAt)}; external delivery unconfirmed` : 'User notification not confirmed'}
        </p>)}
      </details>}
    </section>
  </>;
}

/** Quiet contextual entry for an existing assets or service screen. */
export function SoftwareLicenseLink() {
  return <p className="related-note"><a href="#/software-licenses">Software licenses & renewals</a></p>;
}
