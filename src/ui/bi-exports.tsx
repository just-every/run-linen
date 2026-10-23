import {BiDestinationSetup} from './bi-destination-setup';
import { useState, type FormEvent } from 'react';
import { date } from './api';
import { useMutation, useRemote, useSession } from './state';
import { Badge, ErrorNotice, Facts, Loading, Notice } from './primitives';

interface BiExport {
  id: string;
  name: string;
  destination: Record<string,string>;
  active: boolean | number;
  revision: number;
  nextAt: string;
  consentedAt: string;
  frequency: 'nightly';
  format: 'csv'|'rows';
  source: 'tickets';
  limitations: string[];
}
interface BiRun {
  id: string; state: string; object_key: string; payload_sha256: string;
  row_count: number; provider_ref: string | null; error: string | null;
  created_at: string; finished_at: string | null;
}

export function BiExports() {
  const { session } = useSession(), owner = session.principal.roles.includes('owner');
  return <section className="connection-record" aria-label="BI data and exports">
    <div className="section-heading"><h2>BI data and exports</h2></div>
    <p>Read ticket data within your current source permissions. Restricted and HR tickets are excluded.</p>
    <p><a href="/api/v1/bi/tickets" target="_blank" rel="noreferrer">Read ticket data as JSON</a></p>
    {owner && <OwnerBiExports/>}
  </section>;
}

function OwnerBiExports() {
  const exports = useRemote<{ items: BiExport[] }>('/bi/exports'), save = useMutation();
  const [selected, setSelected] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget, values = new FormData(form);
    setSaved(false);
    const result = await save.mutate<BiExport>('/bi/exports', {
      name: values.get('name'), bucket: values.get('bucket'), region: values.get('region'), prefix: values.get('prefix'),
      accessKeyId: values.get('accessKeyId'), secretAccessKey: values.get('secretAccessKey'),
      ...(values.get('sessionToken') ? { sessionToken: values.get('sessionToken') } : {}), consent: values.has('consent'),
    });
    if (result) { form.reset(); setSaved(true); exports.refresh(); setSelected(result.id); }
  }
  return <>
    <h3>Nightly BI exports</h3>
    <p>Each export runs at midnight UTC using the export owner's current ticket scope. The first delivery includes the readable population; later deliveries include changed rows after the last successful checkpoint.</p>
    <Notice>Configure an existing Amazon S3 bucket and authorize this destination. Saving starts the nightly schedule; a delivery is confirmed only by its recorded provider receipt.</Notice>
    {exports.loading ? <Loading label="Reading BI destinations…"/> : <ErrorNotice error={exports.error} retry={exports.refresh}/>}
    {exports.data && (exports.data.items.length ? <label>Saved BI destination<select value={selected ?? ''} onChange={event => setSelected(event.target.value || null)}><option value="">Choose a destination</option>{exports.data.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <p>No S3 export destination saved.</p>)}
    {selected && <BiExportDetail key={selected} id={selected} onChanged={exports.refresh}/>}
    <details className="action-disclosure"><summary>Configure an S3 export</summary>
      <form className="inline-form" aria-label="S3 export setup" onSubmit={submit} autoComplete="off">
        <label>Export name<input name="name" required maxLength={120}/></label>
        <div className="field-grid">
          <label>S3 bucket<input name="bucket" required maxLength={63} placeholder="Existing bucket name" spellCheck={false}/></label>
          <label>AWS region<input name="region" required maxLength={64} placeholder="us-east-1" spellCheck={false}/></label>
        </div>
        <label>Object prefix<input name="prefix" required maxLength={200} placeholder="linen/tickets/" spellCheck={false}/></label>
        <p>Use credentials limited to this bucket and prefix. Credentials are encrypted when saved and never returned in destination details.</p>
        <label>AWS access key ID<input name="accessKeyId" type="password" required autoComplete="off" spellCheck={false}/></label>
        <label>AWS secret access key<input name="secretAccessKey" type="password" required autoComplete="new-password" spellCheck={false}/></label>
        <label>AWS session token (optional)<input name="sessionToken" type="password" autoComplete="off" spellCheck={false}/></label>
        <label className="checkbox-field"><input type="checkbox" name="consent" required/><span>I authorize nightly ticket CSV exports to this bucket and prefix under my current source permissions, using these credentials.</span></label>
        <ErrorNotice error={save.error}/>
        <button className="action primary" disabled={save.pending}>Save S3 export</button>
      </form>
    </details>
    {saved && <Notice>S3 destination and nightly schedule saved. Check delivery records for the actual outcome.</Notice>}
    <BiDestinationSetup onSaved={id=>{exports.refresh();setSelected(id)}}/>
  </>;
}

function BiExportDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const path = `/bi/exports/${encodeURIComponent(id)}`;
  const detail = useRemote<BiExport & { runs: BiRun[] }>(path), command = useMutation();
  async function act(action: 'run' | 'reconcile') {
    await command.mutate(`${path}/${action}`, {});
    detail.refresh(); onChanged();
  }
  async function toggle() {
    if (!detail.data) return;
    if (await command.mutate(path, { revision: detail.data.revision, active: !detail.data.active })) { detail.refresh(); onChanged(); }
  }
  const value = detail.data;
  const unresolved = value?.runs.some(run => ['unknown', 'dispatching'].includes(run.state));
  return <article aria-label="Saved BI export">
    {detail.loading ? <Loading label="Reading export delivery records…"/> : <ErrorNotice error={detail.error} retry={detail.refresh}/>}
    {value && <>
      <h3>{value.name}</h3>
      <Facts entries={[["Destination", value.destination.provider==='s3'||!value.destination.provider?`s3://${value.destination.bucket}/${value.destination.prefix}`:Object.entries(value.destination).map(([key,val])=>`${key}: ${val}`).join(' · ')], ["Format",value.format], ["Schedule", value.active ? 'Nightly · active' : 'Nightly · paused'], ["Next scheduled", date(value.nextAt)], ["Consent recorded", date(value.consentedAt)]]}/>
      {value.limitations?.map(line => <p key={line}>{line}</p>)}
      <h4>Delivery records</h4>
      {value.runs.length ? value.runs.map(run => <article key={run.id} aria-label="BI delivery record">
        <Badge value={run.state}/>
        <Facts entries={[["Started", date(run.created_at)], ["Finished", date(run.finished_at)], ["Object", run.object_key], ["Rows", run.row_count], ["Provider reference", run.provider_ref], ["Remaining issue", run.error]]}/>
        {run.payload_sha256 && <details className="evidence"><summary>Payload evidence</summary><p style={{ overflowWrap: 'anywhere' }}>SHA-256: {run.payload_sha256}</p></details>}
      </article>) : <p>No delivery receipt yet. No export run has been recorded for this destination.</p>}
      {unresolved && <Notice>An export outcome remains unresolved. Reconcile the existing run before starting another.</Notice>}
      <ErrorNotice error={command.error}/>
      <div className="actions">
        <button className="action secondary" disabled={command.pending || unresolved || !value.active} onClick={() => void act('run')}>Run export now</button>
        {unresolved && <button className="action secondary" disabled={command.pending} onClick={() => void act('reconcile')}>Reconcile export</button>}
        <button className="action secondary" disabled={command.pending} onClick={() => void toggle()}>{value.active ? 'Pause' : 'Resume'} nightly export</button>
        <button className="action secondary" disabled={command.pending} onClick={detail.refresh}>Refresh delivery records</button>
      </div>
    </>}
  </article>;
}
