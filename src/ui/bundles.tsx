import { useState } from "react";
import { ApiFailure, errorText, request, text, type RecordValue } from "./api";
import { ActionForm } from "./forms";
import { useRemote, useSession } from "./state";
import { Badge, ErrorNotice, Facts, Notice } from "./primitives";
import type { FulfilmentDecision } from "./fulfilment-decisions";

interface BundleItem { catalogId: string; name: string; kind: string; requiresManager: boolean }
interface Bundle { id: string; name: string; revision: number; items: BundleItem[] }
interface BundleChild { catalogId: string; name: string; kind: string; delivery: string; approval: string }
interface BundleState { workId: string; decisions: number; state: string; children: BundleChild[] }

/** CATALOG-004: request an owner-built bundle as one ticket; the owner builds bundles from catalog items. */
export function Bundles({ onRequested }: { onRequested: () => void }) {
  const { session } = useSession();
  const owner = session.principal.roles.includes("owner");
  const bundles = useRemote<{ items: Bundle[] }>("/catalog-bundles");
  const catalog = useRemote<{ items: RecordValue[] }>(owner ? "/catalog" : null);
  if (!owner && !bundles.data?.items.length) return null;
  return (
    <section className="new-request" aria-label="Bundles">
      <h2>Bundles</h2>
      <ErrorNotice error={bundles.error ?? catalog.error} />
      {bundles.data?.items.map((b) => (
        <ActionForm key={b.id} title={`Request ${b.name}`} path={`/catalog-bundles/${b.id}/request`} submit="Request bundle"
          defaults={{ expectedRevision: b.revision, deduplicationKey: "" }}
          fields={[{ name: "purpose", label: "What it is for", type: "textarea", required: true }]}
          explanation={`One request for ${b.items.map((i) => i.name).join(", ")}. One manager decision covers every item that needs approval; each item is delivered and verified on its own.`}
          onSaved={(result) => { onRequested(); window.location.hash = `#/work/${text(result.workId)}`; }} />
      ))}
      {owner && catalog.data && (
        <ActionForm title="Build a bundle" path="/catalog-bundles" onSaved={bundles.refresh}
          fields={[
            { name: "name", label: "Bundle name", required: true },
            { name: "catalogIds", label: "Catalog items in this bundle", type: "checkboxes", required: true,
              options: catalog.data.items.map((c) => ({ value: text(c.id), label: `${text(c.name)} · ${text(c.kind)}` })) },
          ]}
          explanation="Items are pinned at their current version. If an item changes later, rebuild the bundle before anyone can request it again." />
      )}
    </section>
  );
}

/** Per-item delivery on a bundle ticket; nothing renders for a request that is not a bundle. */
export function BundleProgress({ workId }: { workId: string }) {
  const status = useRemote<BundleState>(`/work/${workId}/bundle`);
  if (status.error instanceof ApiFailure && status.error.status === 404) return null;
  if (!status.data) return <ErrorNotice error={status.error} retry={status.refresh} />;
  const s = status.data, verified = s.children.filter((c) => c.delivery === "verified").length;
  const delivery = (state: string) => ({ verified: "Verified", pending: "Waiting to be delivered", blocked: "Held: authority, stock or handoff is rechecked on the next run", executing: "Being delivered", unknown: "Outcome unknown; being reconciled", failed: "Failed" } as Record<string, string>)[state] ?? state;
  return (
    <section aria-label="Bundle progress">
      <h3>Bundle progress</h3>
      <Notice tone={s.state === "complete" ? "info" : "warning"}>
        {s.state === "complete" ? "Complete: every item is verified." : `In progress: ${verified} of ${s.children.length} items verified. The bundle completes only when every item is verified.`}
      </Notice>
      <Facts entries={[["Manager decisions", String(s.decisions)], ...s.children.map((c) => [`${c.name} (${c.kind})`, `${delivery(c.delivery)}${c.approval === "needed" ? " · manager approval needed" : c.approval === "recorded" ? " · manager approved" : ""}`] as [string, unknown])]} />
    </section>
  );
}

/** One decision for every bundle item that needs this manager's approval. */
export function BundleDecision({ items, onDone }: { items: FulfilmentDecision[]; onDone: (message: string) => void }) {
  const { session } = useSession();
  const [pending, setPending] = useState(false), [error, setError] = useState<unknown>(null);
  const first = items[0];
  async function approve() {
    setPending(true); setError(null);
    try {
      await request(`/work/${encodeURIComponent(first.workId)}/bundle/approve`, { method: "POST", csrf: session.csrfToken,
        body: { idempotencyKey: `bundle-approval:${first.workId}:${items.map((i) => `${i.catalogId}:${i.expectedCatalogRevision}:${i.expectedPersonRevision}`).join(",")}`,
          approvals: items.map((i) => ({ catalogId: i.catalogId, expectedWorkRevision: i.expectedWorkRevision, expectedFulfilmentRevision: i.expectedFulfilmentRevision,
            expectedCatalogRevision: i.expectedCatalogRevision, expectedPersonId: i.expectedPersonId, expectedPersonRevision: i.expectedPersonRevision,
            expectedBindingId: i.expectedBindingId, expectedHolderId: i.holderId })) } });
      onDone("Bundle approval recorded for every item that needed it. Each item still needs its own provider permission and verification.");
    } catch (e) { setError(e); onDone(`Bundle approval was not recorded. ${errorText(e)}`); }
    finally { setPending(false); }
  }
  return (
    <article className="decision">
      <div className="section-heading"><h3>{text(first.title)}</h3><Badge value={first.state} /></div>
      <Facts entries={[["Bundle", first.bundleName], ["Requested by", first.requesterName], ["For", first.beneficiaryName], ["Purpose", first.purpose],
        ["Items needing your approval", items.map((i) => i.catalogName).join(", ")]]} />
      <Notice><strong>What approval allows</strong><p>One decision approves every listed item together, never some of them. It does not grant provider permission or confirm delivery.</p></Notice>
      <ErrorNotice error={error} />
      <button className="action primary" type="button" disabled={pending} onClick={() => void approve()}>{pending ? "Recording approval…" : "Approve the whole bundle"}</button>
    </article>
  );
}
