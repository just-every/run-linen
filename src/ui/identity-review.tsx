import type { ReviewedMapping } from "./setup-permissions";
import { useState, type FormEvent } from "react";
import { useRemote, useMutation, useSession } from "./state";
import { text, type RecordValue } from "./api";
import { ErrorNotice, Notice, Evidence } from "./primitives";
import { ActionForm } from "./forms";
export function IdentityReview() {
  const { session } = useSession();
  const owner = session.principal.roles.includes("owner");
  const members = useRemote<RecordValue[]>(owner ? "/members" : null),
    people = useRemote<{ items: RecordValue[] }>(owner ? "/people" : null),
    discovery = useRemote<{ snapshots: any[] }>(owner ? "/connection-discovery" : null),
    mappings = useRemote<ReviewedMapping[]>(owner ? "/subject-mappings" : null),
    action = useMutation(),
    [saved, setSaved] = useState<RecordValue | null>(null);
  const candidates =
    discovery.data?.snapshots
      .filter((s) => s.fresh && s.state === "complete")
      .flatMap((s) =>
        s.items
          .filter((i: any) => i.kind === "users" && !i.ambiguities.length)
          .map((i: any) => ({
            key: i.itemId,
            label: `${i.name} · ${i.details.identity || s.source}`,
            connectionId: s.connectionId,
            providerSubject: i.details.sourceId,
          })),
      ) ?? [];
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget),
      candidate = candidates.find((c) => c.key === form.get("candidate"));
    if (!candidate) return;
    const result = await action.mutate<RecordValue>("/subject-mappings", {
      localUserId: form.get("person"),
      connectionId: candidate.connectionId,
      providerSubject: candidate.providerSubject,
      expectedRevision: mappings.data?.find(m => m.localUserId === form.get("person") && m.connectionId === candidate.connectionId)?.revision ?? 0,
    });
    if (result) { setSaved(result); mappings.refresh(); }
  }
  if (!owner) return null;
  return (
    <details className="action-disclosure">
      <summary>Review people and service authority</summary>
      <p>
        Match a known colleague to a discovered provider identity. Linen
        independently reads the selected provider identity before recording the
        relationship.
      </p>
      <form className="inline-form" onSubmit={send}>
        <label>
          Colleague
          <select name="person" required>
            <option value="">Choose a colleague…</option>
            {members.data?.filter(m => m.active && !String(m.roles_json).includes("integration")).map((m) => (
              <option
                key={text(m.user_id ?? m.id)}
                value={text(m.user_id ?? m.id)}
              >
                {text(m.name ?? m.email)}
              </option>
            ))}
            {people.data?.items.filter(p => p.active && !p.merged_into).map((p) => (
              <option key={text(p.id)} value={text(p.id)}>
                {text(p.name)} · HR source
              </option>
            ))}
          </select>
        </label>
        <label>
          Discovered provider identity
          <select name="candidate" required>
            <option value="">
              Choose the corresponding discovered person…
            </option>
            {candidates.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        {!candidates.length && (
          <Notice>
            Complete current directory discovery first. No identity relationship
            is inferred from a matching name.
          </Notice>
        )}
        <ErrorNotice error={action.error ?? mappings.error ?? members.error ?? discovery.error} />
        <button
          className="action primary"
          disabled={action.pending || mappings.loading || Boolean(mappings.error) || !candidates.length}
        >
          Validate this identity relationship
        </button>
        {saved && (
          <Evidence value={saved} title="Validated relationship and version" />
        )}
      </form>
      {mappings.data?.map(m => <p key={m.id}>{m.localName} · {m.connectionName}: {m.current ? "Current reviewed relationship" : "Needs a fresh identity review"}</p>)}
      <ActionForm
        title="Create Linen’s non-interactive service identity"
        path="/automation-principals"
        fields={[
          {
            name: "name",
            label: "Service identity name",
            value: "Linen service agent",
            required: true,
          },
        ]}
        defaults={{ idempotencyKey: crypto.randomUUID() }}
        onSaved={setSaved}
      />
      <p>
        Creating the service identity does not grant it authority. Review exact
        scope, beneficiaries and expiry in{" "}
        <a href="#/grants">standing grants</a>.
      </p>
    </details>
  );
}
