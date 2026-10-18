import { useState, type FormEvent } from "react";
import { useMutation } from "./state";
import { request, humanize, text, date, type RecordValue } from "./api";
import { Fields, readFields, type Field } from "./forms";
import { ErrorNotice, Notice, Evidence, Facts } from "./primitives";

export function AdvancedGrantForm({ onSaved }: { onSaved: () => void }) {
  const action = useMutation();
  const [review, setReview] = useState<RecordValue | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saved, setSaved] = useState<RecordValue | null>(null);
  const [error, setError] = useState<unknown>(null);
  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setReview({ ...readFields(event.currentTarget, exactFields), actionVersion: 1, id: crypto.randomUUID() });
      setError(null);
    } catch { setError(new Error("Check the exact conditions and dates. Nothing was issued.")); }
  }
  async function issue() {
    if (!review || attempted) return;
    setAttempted(true);
    await action.mutate<RecordValue>("/grants", review);
    try {
      const rows = await request<RecordValue[]>("/grants");
      const stored = rows.find(r => r.id === review.id && r.version === 1);
      if (stored) { setSaved(stored); onSaved(); }
    } catch (e) { setError(e); }
  }
  return (
    <section className="connection-record">
      <details className="action-disclosure">
        <summary>Advanced: issue an exact standing grant</summary>
        <p>For unusual actions with independently established exact identifiers. Use the guided review for catalog access and software. Self-approval is denied by the server.</p>
        {!review ? <form className="inline-form" onSubmit={prepare}>
          <Fields fields={exactFields} />
          <ErrorNotice error={error} />
          <button className="action secondary">Review exact permission</button>
        </form> : <div className="inline-form">
          <h3>Review before issuing</h3>
          <p>This permits one exact action. It does not grant any other action or expiry removal. Inspect the exact identifiers below before using this advanced path.</p>
          <Facts entries={[
            ["Permitted action", humanize(review.action)],
            ["Exact executing principal", review.principalId],
            ["Exact beneficiary", review.beneficiaryId],
            ["Exact target", review.target],
            ["Exact connection", review.connectionId],
            ["Reviewed local beneficiary", review.localBeneficiaryId],
            ["Independent verifier", review.verifierConnectionId],
            ["Authority begins", date(review.validFrom)],
            ["Authority ends", date(review.validUntil)],
            ["Maximum uses", review.maxUses],
          ]} />
          <Evidence value={review} title="Exact permission payload" />
          <ErrorNotice error={action.error ?? error} />
          {saved ? <Notice>One grant was recorded, version {text(saved.version)}. No provider action was performed.</Notice> : attempted && !action.pending ? <Notice>The issuance response did not confirm a grant. Check the recorded grants using the request identity in the evidence before any new issuance. This form will not retry an uncertain write.</Notice> : null}
          <div className="button-row">
            <button type="button" className="action primary" disabled={attempted} onClick={issue}>{action.pending ? "Issuing…" : "Issue this exact permission"}</button>
            {!attempted && <button type="button" className="text-button" onClick={() => setReview(null)}>Change scope</button>}
          </div>
        </div>}
      </details>
    </section>
  );
}

const exactFields: Field[] = [
            {
              name: "principalId",
              label: "Executing principal ID",
              required: true,
            },
            {
              name: "beneficiaryId",
              label: "Exact beneficiary ID",
              required: true,
            },
            {
              name: "localBeneficiaryId",
              label: "Reviewed local beneficiary identity",
              hint: "Required when binding a local colleague to a provider subject.",
            },
            {
              name: "verifierConnectionId",
              label: "Independent workflow verifier connection",
            },
            {
              name: "conditions",
              label: "Exact additional conditions",
              type: "json",
              hint: "Optional workId or payloadHash; current verifier revision is bound by the server.",
            },
            { name: "connectionId", label: "Connection ID", required: true },
            { name: "target", label: "Exact target", required: true },
            {
              name: "action",
              label: "Permitted action",
              type: "select",
              required: true,
              options: [
                "group.add",
                "group.remove",
                "license.add",
                "license.remove",
                "effect.observe",
                "identity.create",
                "identity.disable",
                "sessions.revoke",
                "deployment.canary",
                "deployment.rollout",
                "deployment.compensate",
              ].map((value) => ({ value, label: humanize(value) })),
            },
            {
              name: "validFrom",
              label: "Authority begins",
              type: "datetime-local",
              required: true,
            },
            {
              name: "validUntil",
              label: "Authority ends",
              type: "datetime-local",
              required: true,
            },
            {
              name: "maxUses",
              label: "Maximum uses",
              type: "number",
              required: true,
            },
          ];
