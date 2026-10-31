import { useState, type FormEvent } from 'react';
import { Fields, ActionForm, readFields, type Field } from './forms';
import { ErrorNotice, Notice } from './primitives';
import { useMutation, useSession } from './state';
import { softwareKinds, type SoftwareBinding, type SoftwareContract, type SoftwareKind, type SoftwareLicense, type SoftwareOptions } from './software-licenses-types';

export function softwareContractFields(contract?: SoftwareContract): Field[] {
  return [
    { name: 'seats', label: 'Contract seats', type: 'number', required: true, value: contract?.seats },
    { name: 'renewalAt', label: 'Renewal date', type: 'date', required: true, value: contract?.renewalAt.slice(0, 10) },
    { name: 'annualCostUsd', label: 'Annual contract cost (USD)', type: 'number', required: true, value: contract?.annualCostUsd },
    { name: 'trueUpUnitUsd', label: 'Additional license cost (USD)', type: 'number', required: true, value: contract?.trueUpUnitUsd, hint: 'The contracted unit price used to estimate a true-up.' },
    { name: 'reference', label: 'Contract reference', required: true, value: contract?.reference, hint: 'Your purchase order, agreement or contract document reference.' },
  ];
}
function contractFrom(values: Record<string, unknown>) {
  return { seats: values.seats, currency: 'USD', renewalAt: `${values.renewalAt}T00:00:00.000Z`, annualCostUsd: values.annualCostUsd, trueUpUnitUsd: values.trueUpUnitUsd, reference: values.reference };
}
const policies = ['managed', 'ignored', 'prohibited'].map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

/** Connection credentials stay in the submitted form and the encrypted server-side store. */
export function SoftwareLicenseConnection({ onSaved }: { onSaved: () => void }) {
  const [provider, setProvider] = useState('zoom'), action = useMutation();
  const fields: Field[] = [
    { name: 'name', label: 'Connection name', required: true },
    provider === 'zoom' ? { name: 'accountId', label: 'Zoom account ID', required: true }
      : provider === 'jamf' ? { name: 'origin', label: 'Jamf Cloud origin', required: true, hint: 'Your exact HTTPS origin, such as https://your-company.jamfcloud.com.' }
        : { name: 'tenantId', label: 'Microsoft tenant ID', required: true },
    { name: 'clientId', label: 'Application client ID', required: true },
    { name: 'clientSecret', label: 'Application client secret', type: 'password', required: true },
    { name: 'reason', label: 'Reason for connecting', type: 'textarea', required: true },
    { name: 'consent', label: 'I authorize Linen to read license, activity and installed-application data from this account.', type: 'checkbox', required: true },
  ];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, v = readFields(form, fields);
    const result = await action.mutate('/software-license-connections', {
      provider, name: v.name, config: provider === 'zoom' ? { accountId: v.accountId } : provider === 'jamf' ? { origin: v.origin } : { tenantId: v.tenantId },
      secret: { clientId: v.clientId, clientSecret: v.clientSecret }, consent: v.consent, reason: v.reason,
    });
    if (result) { form.reset(); onSaved(); }
  }
  return <details className="action-disclosure" data-action-path="/software-license-connections">
    <summary>Connect a license source</summary>
    <form className="inline-form" onSubmit={save}>
      <p>Connect your administrator-approved application. Saving stores credentials privately; sync reads the provider. Reclaiming seats or removing an app requires a separate scoped grant.</p>
      <label>Provider<select name="provider" value={provider} onChange={event => setProvider(event.target.value)}>
        <option value="zoom">Zoom</option><option value="jamf">Jamf Pro</option><option value="microsoft-graph">Microsoft Entra & Intune</option>
      </select></label>
      <div className="field-grid" key={provider}><Fields fields={fields} /></div>
      <ErrorNotice error={action.error} />
      <button className="action primary" disabled={action.pending}>{action.pending ? 'Saving privately…' : 'Save license connection'}</button>
    </form>
  </details>;
}

function SourceBinding({ index, options, remove, existing }: { index: number; options: SoftwareOptions; remove: () => void; existing?: SoftwareBinding }) {
  const [kind, setKind] = useState<SoftwareKind>(existing?.kind ?? 'zoom');
  const prefix = `source-${index}-`, matching = options.connections.filter(c => c.provider === softwareKinds.find(k => k.value === kind)?.provider);
  return <fieldset>
    <legend>Source {index + 1}</legend>
    <label>Data to read<select name={`${prefix}kind`} value={kind} onChange={event => setKind(event.target.value as SoftwareKind)}>
      {softwareKinds.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
    </select></label>
    <label>Connection<select name={`${prefix}connectionId`} required key={kind} defaultValue={existing?.connectionId ?? ''}>
      <option value="">Choose a connection…</option>
      {matching.map(c => <option key={c.id} value={c.id}>{c.name} · {c.status}</option>)}
    </select></label>
    {!matching.length && <p className="fact-note">Connect this provider first, or remove this source and save the contract without observations.</p>}
    {kind === 'entra-signins' && <Fields fields={[{ name: `${prefix}appId`, label: 'Entra application ID', required: true, value: existing?.appId }]} />}
    {(kind === 'jamf' || kind === 'intune') && <>
      <Fields fields={[
        { name: `${prefix}title`, label: 'Installed title alias', required: true, value: existing?.aliases?.[0]?.title, hint: 'Exact title as reported by the inventory.' },
        { name: `${prefix}publisher`, label: 'Installed publisher alias', required: true, value: existing?.aliases?.[0]?.publisher },
        { name: `${prefix}productId`, label: 'Installed product identifier', value: existing?.aliases?.[0]?.productId, hint: 'Use the actual bundle or product identifier when inventory has no publisher.' },
      ]} />
      {kind === 'jamf' && <details className="evidence"><summary>App removal configuration</summary>
        <p>Use the exact existing MDM removal target. This configuration grants no execution authority.</p>
        <Fields fields={[
          { name: `${prefix}removalGroupId`, label: 'Jamf static removal group ID', value: existing?.removalGroupId },
          { name: `${prefix}removalPolicyId`, label: 'Jamf removal policy ID', value: existing?.removalPolicyId },
          { name: `${prefix}removalPackageId`, label: 'Jamf removal package ID', value: existing?.removalPackageId, hint: 'All three IDs are required for removal. Use an enabled check-in policy scoped to this static group, with this package set to Uninstall.' },
        ]} />
      </details>}
      {kind === 'intune' && <p className="fact-note">Intune reads installed-application inventory. App removal is currently available through configured Jamf policies.</p>}
    </>}
    <button type="button" className="text-button" onClick={remove}>Remove source {index + 1}</button>
  </fieldset>;
}

function readBindings(form: HTMLFormElement, indexes: number[], originals: SoftwareBinding[] = []) {
  const values = new FormData(form);
  return indexes.map(index => {
    const get = (name: string) => String(values.get(`source-${index}-${name}`) ?? '').trim();
    const binding: SoftwareBinding = { connectionId: get('connectionId'), kind: get('kind') as SoftwareKind };
    for (const name of ['appId', 'removalGroupId', 'removalPolicyId', 'removalPackageId'] as const) if (get(name)) binding[name] = get(name);
    if (get('title')) binding.aliases = [{ title: get('title'), publisher: get('publisher'), ...(get('productId') ? { productId: get('productId') } : {}) }, ...(originals[index]?.aliases?.slice(1) ?? [])];
    return binding;
  });
}

export function SoftwareLicenseSources({ license, options, onChanged }: { license: SoftwareLicense; options: SoftwareOptions; onChanged: () => void }) {
  const action = useMutation(), initial = license.data.sourceBindings;
  const [sources, setSources] = useState(initial.map((_, index) => index)), [nextSource, setNextSource] = useState(initial.length);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await action.mutate(`/software-licenses/${license.id}`, { revision: license.revision, sourceBindings: readBindings(event.currentTarget, sources, initial) }, 'PATCH');
    if (result) onChanged();
  }
  return <details className="action-disclosure" data-action-path={`/software-licenses/${license.id}/source-bindings`}><summary>Edit connected sources</summary>
    <form className="inline-form" onSubmit={save}>
      <p>Changing sources clears prior observations and action authority. Sync the revised sources before relying on usage or compliance.</p>
      <div className="field-grid">{sources.map(index => <SourceBinding key={index} index={index} options={options} existing={initial[index]} remove={() => setSources(current => current.filter(i => i !== index))} />)}</div>
      <button className="text-button" type="button" onClick={() => { setSources(current => [...current, nextSource]); setNextSource(nextSource + 1); }}>Add a connected source</button>
      <ErrorNotice error={action.error} />
      <div className="button-row"><button className="action primary" disabled={action.pending}>{action.pending ? 'Saving…' : 'Save connected sources'}</button></div>
    </form>
  </details>;
}

export function NewSoftwareLicense({ options, onSaved }: { options: SoftwareOptions; onSaved: (id: string) => void }) {
  const { session } = useSession(), action = useMutation();
  const [sources, setSources] = useState<number[]>([]), [nextSource, setNextSource] = useState(0);
  const fields: Field[] = [
    { name: 'name', label: 'Software title', required: true, hint: 'For example, Zoom Workplace or Adobe Acrobat Pro.' },
    { name: 'publisher', label: 'Publisher', required: true },
    { name: 'ownerId', label: 'Title owner', type: 'select', required: true, value: session.user.id, options: options.people.map(p => ({ value: p.id, label: p.name })) },
    { name: 'serviceId', label: 'Related service', type: 'select', required: true, options: options.services.map(s => ({ value: s.id, label: s.name })) },
    { name: 'metric', label: 'License metric', type: 'select', required: true, value: 'per-user', options: [{ value: 'per-user', label: 'Per user' }, { value: 'per-device', label: 'Per device' }, { value: 'concurrent', label: 'Concurrent' }] },
    { name: 'policy', label: 'Title policy', type: 'select', required: true, value: 'managed', options: policies },
    ...softwareContractFields(),
  ];
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const v = readFields(event.currentTarget, fields), sourceBindings = readBindings(event.currentTarget, sources);
    const result = await action.mutate<{ id: string }>('/software-licenses', {
      name: v.name, publisher: v.publisher, ownerId: v.ownerId, serviceId: v.serviceId,
      metric: v.metric, policy: v.policy, contract: contractFrom(v), sourceBindings,
    });
    if (result) onSaved(result.id);
  }
  return <details className="action-disclosure" data-action-path="/software-licenses">
    <summary>Add a software license</summary>
    <form className="inline-form" onSubmit={save}>
      <p>Record the actual agreement in USD. Usage and compliance stay unknown until connected sources are synced.</p>
      {!options.services.length && <Notice>Add a service before recording its licenses. <a href="#/services">Open service ownership</a></Notice>}
      <div className="field-grid"><Fields fields={fields} />
        {sources.map(index => <SourceBinding key={index} index={index} options={options} remove={() => setSources(current => current.filter(i => i !== index))} />)}
      </div>
      <button type="button" className="text-button" onClick={() => { setSources(current => [...current, nextSource]); setNextSource(nextSource + 1); }}>Add a connected source</button>
      <ErrorNotice error={action.error} />
      <div className="button-row"><button className="action primary" disabled={action.pending || !options.services.length}>{action.pending ? 'Recording…' : 'Record software license'}</button></div>
    </form>
  </details>;
}

export function SoftwareLicenseTerms({ license, onChanged }: { license: SoftwareLicense; onChanged: () => void }) {
  return <>
    <ActionForm title="Edit contract terms" path={`/software-licenses/${license.id}`} method="PATCH" submit="Save contract" defaults={{ revision: license.revision }}
      fields={softwareContractFields(license.data.contract)} transform={v => ({ revision: v.revision, contract: contractFrom(v) })} onSaved={onChanged} />
    <ActionForm title="Change title policy" path={`/software-licenses/${license.id}`} method="PATCH" submit="Save title policy" defaults={{ revision: license.revision }}
      explanation="Prohibited or unlicensed installations create follow-up work after sync. Removing software requires its own current grant and inventory readback. Changing terms invalidates affected authority."
      fields={[
        { name: 'policy', label: 'Title policy', type: 'select', required: true, value: license.data.policy, options: policies },
      ]} onSaved={onChanged} />
  </>;
}
