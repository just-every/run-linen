import { useState, type FormEvent } from "react";
import { date, text, type RecordValue } from "./api";
import { useMutation, useRemote } from "./state";
import { ActionForm } from "./forms";
import { Badge, ErrorNotice, Facts, Loading, Notice } from "./primitives";

type Expected = { assetId: string; serial: string; assetTag: string | null; state: string; followUpWorkId?: string | null };
type Audit = RecordValue & { id: string; location: string; state: string; revision: number; expected: Expected[]; found: Expected[]; missing: Expected[]; unexpected: RecordValue[] };
const label = (e: Expected) => e.assetTag ? `${e.assetTag} (${e.serial})` : e.serial;
const outcomeText: Record<string, string> = { found: "Found on the expected list", elsewhere: "Recorded at another location", unknown: "No device has this tag or serial" };

/** ASSET-010: audit a location by scanning tags at phone width; a keyboard-wedge scanner types into the scan field. */
export function AssetAudits({ onChanged }: { onChanged: () => void }) {
  const audits = useRemote<{ items: Audit[] }>("/asset-audits");
  const open = audits.data?.items.filter((a) => a.state === "open") ?? [];
  const recent = audits.data?.items.filter((a) => a.state === "completed").slice(0, 3) ?? [];
  return <section className="connection-record">
    <div className="section-heading"><h2>Physical audits</h2></div>
    <p>Scan each device's asset tag or serial at a location. The expected list is every device recorded there in stock, reserved, returned or retired when the audit starts; devices with a person are not expected on the shelf. Completing the audit opens a follow-up request for each expected device not scanned.</p>
    {audits.loading ? <Loading /> : <ErrorNotice error={audits.error} retry={audits.refresh} />}
    {open.map((audit) => <OpenAudit key={`${audit.id}:${audit.revision}`} audit={audit} onChanged={() => { audits.refresh(); onChanged(); }} />)}
    {recent.map((audit) => <AuditResult key={audit.id} audit={audit} />)}
    <ActionForm title="Start a physical audit" path="/asset-audits" submit="Start audit"
      fields={[{ name: "location", label: "Location to audit", required: true, hint: "Matches each device's recorded location, ignoring case and extra spaces." }]}
      onSaved={audits.refresh} />
  </section>;
}

function OpenAudit({ audit: initial, onChanged }: { audit: Audit; onChanged: () => void }) {
  const scan = useMutation(), complete = useMutation();
  const [audit, setAudit] = useState(initial), [code, setCode] = useState(""), [last, setLast] = useState<RecordValue | null>(null);
  // Each scan answers with the reconciled audit, so the scan field keeps focus for the next tag.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await scan.mutate<RecordValue & { audit: Audit }>(`/asset-audits/${audit.id}/scans`, { code });
    if (result) { setLast(result); setAudit(result.audit); setCode(""); }
  }
  return <article aria-label={`Audit of ${audit.location}`}>
    <h3>Auditing {audit.location} <Badge value={audit.state} /></h3>
    <p role="status">{audit.found.length} of {audit.expected.length} expected devices found</p>
    <form className="inline-form" onSubmit={submit}>
      <label>Scan or type an asset tag<input value={code} onChange={(e) => setCode(e.target.value)} required maxLength={200} autoComplete="off" autoCapitalize="characters" enterKeyHint="go" /></label>
      <button className="action primary" disabled={scan.pending}>Record scan</button>
    </form>
    <ErrorNotice error={scan.error} />
    {last && <Notice>{text(last.code)}: {outcomeText[text(last.outcome)]}{last.recordedLocation ? ` (${text(last.recordedLocation)})` : ""}{last.repeat ? " — already scanned" : ""}</Notice>}
    <details className="evidence"><summary>Not yet scanned ({audit.missing.length})</summary>
      <ul>{audit.missing.map((e) => <li key={e.assetId}>{label(e)}</li>)}</ul>
    </details>
    <ErrorNotice error={complete.error} />
    <button className="action secondary" disabled={complete.pending}
      onClick={async () => { if (await complete.mutate(`/asset-audits/${audit.id}/complete`, { revision: audit.revision })) onChanged(); }}>
      Complete audit
    </button>
  </article>;
}

function AuditResult({ audit }: { audit: Audit }) {
  return <article aria-label={`Completed audit of ${audit.location}`}>
    <h3>{audit.location} audit <Badge value={audit.state} /></h3>
    <Facts entries={[["Expected", audit.expected.length], ["Found", audit.found.length], ["Missing", audit.missing.length],
      ["Other scans", audit.unexpected.length], ["Completed", date(audit.completed_at)]]} />
    {audit.missing.length > 0 && <><h4>Missing devices and their follow-ups</h4>
      <ul>{audit.missing.map((e) => <li key={e.assetId}>{label(e)} — {e.followUpWorkId
        ? <a href={`#/work/${e.followUpWorkId}`}>Follow-up request</a> : "no follow-up"}</li>)}</ul></>}
    {audit.unexpected.length > 0 && <><h4>Scans not on the expected list</h4>
      <ul>{audit.unexpected.map((s) => <li key={text(s.code)}>{text(s.code)}: {outcomeText[text(s.outcome)]}</li>)}</ul></>}
  </article>;
}
