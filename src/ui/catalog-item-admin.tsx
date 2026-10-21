import { useState, type FormEvent } from 'react';
import { request, type RecordValue } from './api';
import { useRemote, useSession } from './state';
import { ActionForm } from './forms';
import { ErrorNotice, Notice } from './primitives';

const dimensions = [['department', 'Department'], ['location', 'Location'], ['employmentType', 'Employment type']] as const;
type Value = { id: string; dimension: string; label: string; active: number; revision: number };
type Audience = Record<(typeof dimensions)[number][0], string[]>;

/** CATALOG-001: the owner keeps the stable value lists that item audiences and reviewed people refer to. */
export function CatalogValues({ onChanged }: { onChanged: () => void }) {
  const { session } = useSession(), values = useRemote<{ items: Value[] }>('/catalog-values'), [error, setError] = useState<unknown>(null);
  async function toggle(value: Value) {
    setError(null);
    try { await request(`/catalog-values/${value.id}`, { method: 'POST', csrf: session.csrfToken, body: { label: value.label, revision: value.revision, active: !value.active } }); values.refresh(); onChanged(); }
    catch (e) { setError(e); }
  }
  return <details className="action-disclosure"><summary>Manage audience values</summary>
    <ErrorNotice error={values.error ?? error} retry={values.refresh} />
    <ActionForm title="Add a value" path="/catalog-values" onSaved={() => { values.refresh(); onChanged(); }}
      fields={[{ name: 'dimension', label: 'Value list', type: 'select', required: true, options: dimensions.map(([value, label]) => ({ value, label })) }, { name: 'label', label: 'Value name', required: true }]} />
    {dimensions.map(([dimension, label]) => <fieldset key={dimension} aria-label={`${label} values`}><legend>{label}</legend>
      {values.data?.items.filter(v => v.dimension === dimension).map(v => <p key={v.id}>{v.label}{v.active ? '' : ' (retired)'} <button type="button" className="action secondary" onClick={() => void toggle(v)}>{v.active ? 'Retire' : 'Restore'} {v.label}</button></p>)}
    </fieldset>)}
    <Notice>A value an item still uses can be retired, never deleted. Who has which value is recorded by the owner or HR on the person's reviewed record.</Notice>
  </details>;
}

/** CATALOG-001: who may request an item. OR within a list, AND across lists, an empty list is unrestricted. */
export function CatalogAudienceEditor({ item, onSaved }: { item: { id: string; revision: number; audience?: Audience }; onSaved: () => void }) {
  const { session } = useSession(), values = useRemote<{ items: Value[] }>('/catalog-values');
  const [audience, setAudience] = useState<Audience>(item.audience ?? { department: [], location: [], employmentType: [] });
  const [error, setError] = useState<unknown>(null), [saved, setSaved] = useState(false);
  const toggle = (dimension: keyof Audience, id: string, on: boolean) => setAudience({ ...audience, [dimension]: on ? [...audience[dimension], id] : audience[dimension].filter(v => v !== id) });
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(null); setSaved(false);
    try { await request(`/catalog/${item.id}/audience`, { method: 'POST', csrf: session.csrfToken, body: { revision: item.revision, audience } }); setSaved(true); onSaved(); }
    catch (err) { setError(err); }
  }
  return <form className="inline-form" onSubmit={save} aria-label="Item audience">
    {dimensions.map(([dimension, label]) => <fieldset key={dimension} className="checkbox-group"><legend>{label}</legend>
      {values.data?.items.filter(v => v.dimension === dimension && (v.active || audience[dimension].includes(v.id))).map(v =>
        <label key={v.id} className="checkbox-field"><input type="checkbox" checked={audience[dimension].includes(v.id)} onChange={e => toggle(dimension, v.id, e.target.checked)} /><span>{v.label}{v.active ? '' : ' (retired)'}</span></label>)}
      {!values.data?.items.some(v => v.dimension === dimension) && <small>No values yet. Add them under Manage audience values.</small>}
    </fieldset>)}
    <Notice>Leave a list empty for no restriction. Someone must match one value in every list you choose, and unknown facts do not match. The owner has no bypass. Saving makes a new item revision; requests already submitted keep theirs.</Notice>
    <ErrorNotice error={error} />{saved && <Notice>Audience saved.</Notice>}
    <button className="action primary">Save audience</button>
  </form>;
}

/** CATALOG-001: an item of any kind. Account and general-service items are done by their owner as a task; none grants provider authority. */
export function CatalogItemCreate({ members, onSaved }: { members: { id: string; name: string; active: number }[]; onSaved: (result: RecordValue) => void }) {
  return <ActionForm title="Add catalog item" path="/catalog" onSaved={onSaved} submit="Save catalog item"
    explanation="Choose what kind of item this is. Access, software and hardware are provisioned through their reviewed targets; accounts and general services become a task their owner completes."
    fields={[
      { name: 'name', label: 'Item name', required: true },
      { name: 'kind', label: 'Item kind', type: 'select', required: true, options: [['access', 'Access'], ['software', 'Software'], ['device', 'Hardware'], ['account', 'Account'], ['service', 'General service']].map(([value, label]) => ({ value, label })) },
      { name: 'target', label: 'Reviewed target or service name', required: true, hint: 'The exact access, license, device model or service this item delivers.' },
      { name: 'ownerId', label: 'Fulfilment owner', type: 'select', required: true, options: members.filter(m => m.active).map(m => ({ value: m.id, label: m.name })) },
      { name: 'requiresManager', label: 'Require existing manager approval', type: 'checkbox' },
    ]} />;
}
