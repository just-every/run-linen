import { useRef, useState, type FormEvent } from "react";
import { useRemote, useSession } from "./state";
import { request, date, humanize, text, type RecordValue } from "./api";
import { ErrorNotice, Notice, Facts, Evidence } from "./primitives";
import { AdvancedGrantForm } from "./setup-advanced-grant";
import { checkReview, recordedGrant, type ReviewedMapping, type ServiceActor, type CatalogChoice, type PermissionReview } from "./setup-permissions";

export function GrantForm({ onSaved }: { onSaved: () => void }) {
  const { session } = useSession();
  const owner = session.principal.roles.includes("owner");
  const mappings = useRemote<ReviewedMapping[]>(owner ? "/subject-mappings" : null);
  const actors = useRemote<ServiceActor[]>(owner ? "/automation-principals" : null);
  const catalog = useRemote<{ items: CatalogChoice[] }>(owner ? "/catalog" : null);
  const connections = useRemote<RecordValue[]>(owner ? "/connections" : null);
  const journalKey = `linen:permission-review:${session.principal.workspaceId}:${session.principal.userId}`;
  const [review, setReview] = useState<PermissionReview | null>(() => {
    try { return typeof window === "undefined" ? null : JSON.parse(sessionStorage.getItem(journalKey) || "null"); } catch { return null; }
  });
  const [error, setError] = useState<unknown>(null), [pending, setPending] = useState(false);
  const [status, setStatus] = useState<Record<string, string>>({});
  const started = useRef(Boolean(review));
  const attempts = useRef(new Set(review?.attemptedIds ?? []));
  const eligible = mappings.data?.filter(m => m.current && m.localUserId !== session.principal.userId) ?? [];
  const machines = actors.data?.filter(a => a.active && a.id !== session.principal.userId) ?? [];
  const services = catalog.data?.items.filter(c => ["access", "software"].includes(c.kind)) ?? [];
  const verifiers = connections.data?.filter(c => c.provider === "workflow-probe" && c.status === "active") ?? [];
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const f = new FormData(event.currentTarget);
      const mapping = eligible.find(m => m.id === f.get("mapping"))!, actor = machines.find(a => a.id === f.get("actor"))!;
      const service = services.find(c => c.id === f.get("catalog"))!, verifier = verifiers.find(c => c.id === f.get("verifier"))!;
      const validFrom = new Date(String(f.get("start"))).toISOString(), validUntil = new Date(String(f.get("end"))).toISOString();
      const expiresAt = new Date(String(f.get("expiry"))).toISOString(), maxUses = Number(f.get("uses"));
      if (!mapping || !actor || !service || !verifier || !(validFrom < expiresAt && expiresAt < validUntil) || Date.parse(validUntil) <= Date.now() || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100000)
        throw Error("Choose current reviewed identities and connections. Permission must begin before access expires and remain valid beyond removal, with a positive whole-number use limit.");
      const common = { principalId: actor.id, beneficiaryId: mapping.providerSubject, localBeneficiaryId: mapping.localUserId,
        connectionId: mapping.connectionId, verifierConnectionId: verifier.id, conditions: { verifierConnectionRevision: verifier.revision },
        target: service.target, actionVersion: 1, validFrom, validUntil, maxUses };
      const action = service.kind === "software" ? "license" : "group";
      setReview({ actor, mapping, catalog: service, verifier, expiresAt,
        grants: ["add", "remove"].map(verb => ({ ...common, id: crypto.randomUUID(), action: `${action}.${verb}` })) });
      started.current = false; attempts.current.clear(); setStatus({}); setError(null);
    } catch (e) { setError(e); }
  }
  async function reconcile(current: PermissionReview) {
    const rows = await request<RecordValue[]>("/grants");
    const next: Record<string, string> = {};
    for (const grant of current.grants) {
      const row = rows.find(r => r.id === grant.id);
      next[String(grant.id)] = row ? recordedGrant(row, grant, current) ? "Recorded · exact reviewed scope" : "Recorded with changed scope · review required" : attempts.current.has(String(grant.id)) ? "Not observed · outcome unconfirmed; do not repeat" : "Not submitted";
    }
    setStatus(next); onSaved(); return next;
  }
  async function issue() {
    if (!review || started.current) return;
    // Preserve exact request identities across reload before any possible write.
    try { sessionStorage.setItem(journalKey, JSON.stringify(review)); }
    catch { setError(new Error("Cannot retain this issuance record in this browser. Nothing was submitted.")); return; }
    started.current = true; setPending(true); setError(null);
    try {
      for (const grant of review.grants) {
        await checkReview(review);
        sessionStorage.setItem(journalKey, JSON.stringify({ ...review, attemptedIds: [...attempts.current, String(grant.id)] }));
        attempts.current.add(String(grant.id));
        try { await request("/grants", { method: "POST", body: grant, csrf: session.csrfToken }); }
        catch (e) { setError(e); }
        const result = await reconcile(review);
        // An uncertain first write is reconciled, never resubmitted. Continue only on exact persisted evidence.
        if (result[String(grant.id)] !== "Recorded · exact reviewed scope") break;
        setError(null);
      }
    } catch (e) { setError(e); }
    finally { try { await reconcile(review); } catch (e) { setError(e); } setPending(false); }
  }
  if (!owner) return <Notice>An owner must issue standing permissions. Delegated authority retains its separate server checks.</Notice>;
  return <section className="connection-record">
    <h2>Review a standing permission</h2>
    <p>Let a named service identity provide one colleague’s catalogue access and remove it at expiry. These are two separate permissions; no provider action runs during setup.</p>
    <ErrorNotice error={error ?? mappings.error ?? actors.error ?? catalog.error ?? connections.error} />
    {!review ? <form className="inline-form" onSubmit={prepare}>
      <label>Service identity<select aria-label="Service identity" name="actor" required><option value="">Choose who may act…</option>{machines.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Colleague and reviewed account<select aria-label="Colleague and reviewed account" name="mapping" required><option value="">Choose a reviewed colleague…</option>{eligible.map(m => <option key={m.id} value={m.id}>{m.localName}{m.localEmail ? ` · ${m.localEmail}` : ""} · {m.connectionName}</option>)}</select></label>
      <label>Catalogue service<select aria-label="Catalogue service" name="catalog" required><option value="">Choose a service…</option>{services.map(c => <option key={c.id} value={c.id}>{c.name} · {c.kind === "software" ? "Software licence" : "Application access"}</option>)}</select></label>
      <label>Independent verifier<select aria-label="Independent verifier" name="verifier" required><option value="">Choose a checked verifier…</option>{verifiers.map(c => <option key={text(c.id)} value={text(c.id)}>{text(c.name)}</option>)}</select></label>
      <div className="field-grid"><label>Authority begins<input name="start" type="datetime-local" required /></label><label>Requested access expiry<input name="expiry" type="datetime-local" required /></label><label>Authority ends, after removal<input name="end" type="datetime-local" required /></label><label>Maximum uses per permission<input name="uses" type="number" min="1" max="100000" step="1" defaultValue="1" required /></label></div>
      {(!eligible.length || !machines.length || !services.length || !verifiers.length) && <Notice>Complete the current identity relationship, service identity, catalogue and checked verifier first. <a href="#/connections">Review connections and identities</a>. Names never create authority.</Notice>}
      <button className="action primary" disabled={!eligible.length || !machines.length || !services.length || !verifiers.length}>Review these permissions</button>
    </form> : <div className="inline-form">
      <h3>Review before issuing</h3>
      <Facts entries={[["Who may act", review.actor.name], ["For colleague", review.mapping.localName], ["Service", review.catalog.name], ["Directory connection", review.mapping.connectionName], ["Independent verifier", review.verifier.name], ["Permitted actions", review.grants.map(g => humanize(g.action)).join(" and ")], ["Authority begins", date(review.grants[0].validFrom)], ["Requested access expiry", date(review.expiresAt)], ["Authority ends", date(review.grants[0].validUntil)], ["Maximum uses each", review.grants[0].maxUses]]} />
      <p>Both permissions cover only this colleague and this service target. Removal has its own authority and remains valid beyond the requested expiry. This review does not schedule access; the employee request carries its actual expiry.</p>
      <p>Each permission is saved separately. If only one is recorded, setup remains incomplete. Linen checks the stored records after submission and never repeats an uncertain write.</p>
      {review.grants.map(g => <p key={text(g.id)}><strong>{humanize(g.action)}:</strong> {status[text(g.id)] ?? (started.current ? "Check the stored record; submission outcome is not yet confirmed" : "Not submitted")}</p>)}
      <Evidence value={{ mapping: review.mapping, grants: review.grants }} title="Exact reviewed bindings and request identities" />
      <div className="button-row"><button type="button" className="action primary" disabled={started.current || pending} onClick={issue}>{pending ? "Recording and checking…" : "Issue these two permissions"}</button>
      {!started.current && <button type="button" className="text-button" onClick={() => setReview(null)}>Change scope</button>}
      {started.current && !pending && <button type="button" className="text-button" onClick={() => reconcile(review).catch(setError)}>Check recorded permissions</button>}
      {review.grants.every(g => status[text(g.id)] === "Recorded · exact reviewed scope") && <button type="button" className="text-button" onClick={() => { sessionStorage.removeItem(journalKey); started.current = false; attempts.current.clear(); setReview(null); setStatus({}); }}>Review another permission</button>}</div>
    </div>}
    <AdvancedGrantForm onSaved={onSaved} />
  </section>;
}
