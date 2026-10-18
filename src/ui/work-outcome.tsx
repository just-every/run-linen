import { useState } from "react";
import { usePeopleLabels } from "./people-labels";
import { date, text, type RecordValue } from "./api";
import { kindLabel } from "./labels";
import { useRemote, useSession } from "./state";
import { Badge, ErrorNotice, Facts, Loading, Notice } from "./primitives";
import { ActionForm } from "./forms";
import { namedOther } from "./request-facts";
import type { WorkRecord } from "./work";

export function WorkOutcome({ work, onChanged }: { work: WorkRecord; onChanged?: () => void }) {
  const personName = usePeopleLabels(),
    workId = work.id,
    // A service is recorded only for the account the request is for, and only while the request is open.
    named = namedOther(work, personName),
    closed = ["closed", "cancelled"].includes(work.state);
  const [saved, setSaved] = useState<RecordValue | null>(null);
  const obligations = useRemote<{ items: RecordValue[] }>(
      `/work/${workId}/obligations`,
      10000,
    ),
    catalog = useRemote<{ items: RecordValue[] }>("/catalog"),
    { session } = useSession(),
    operator = session.principal.roles.some((r) =>
      ["owner", "operator", "hr"].includes(r),
    );
  return (
    <section className="work-outcome">
      {obligations.loading ? (
        <Loading label="Reading the remaining responsibilities…" />
      ) : obligations.error ? (
        <ErrorNotice error={obligations.error} retry={obligations.refresh} />
      ) : (
        Boolean(obligations.data?.items.length) && (
          <>
            <h2>What’s ready, and what remains</h2>
            {obligations.data!.items.map((item) => (
              <details className="obligation" key={text(item.id)}>
                <summary>
                  <span>
                    {kindLabel(item.kind)}
                    <small>{date(item.due_at)}</small>
                  </span>
                  <Badge value={item.state} />
                </summary>
                <Facts
                  entries={[
                    ["Next owner", personName(item.owner_id)],
                    ["Target", catalog.data?.items.find((c) => c.target === item.target)?.name ?? item.target],
                    ["Remaining issue", item.last_error],
                    ...(operator ? [["Effect identity", item.operation_id] as [string, unknown]] : []),
                  ]}
                />
              </details>
            ))}
          </>
        )
      )}
      {saved && <Notice tone="warning"><strong>{saved.state === 'blocked' ? 'At submission, your catalog request was blocked.' : 'At submission, your catalog request was pending.'}</strong><p>No fulfillment was confirmed by that response. Current progress and next owners are shown above.</p></Notice>}
      <ErrorNotice error={obligations.backgroundError} />
      <ErrorNotice error={catalog.error} retry={catalog.refresh} />
      {Boolean(catalog.data?.items.length) && !closed && named && (
        <Notice>
          <strong>A known service can’t be chosen here.</strong>
          <p>This request names {named}, but it is recorded for {personName(work.beneficiary_id)}. Linen records a service only for the account a request is for, so no service was recorded. Start a request for {named}’s own account, or {named} can ask from it; a person without an account can’t have a service recorded yet.</p>
        </Notice>
      )}
      {Boolean(catalog.data?.items.length) && !closed && !named && (
        <ActionForm
          title="Or choose a known service"
          path={`/work/${workId}/fulfilment`}
          defaults={{ beneficiaryId: work.beneficiary_id }}
          fields={[
            {
              name: "catalogId",
              label: "Service",
              type: "select",
              required: true,
              options: catalog.data!.items.map((c) => ({
                value: text(c.id),
                label: text(c.name),
              })),
            },
            {
              name: "purpose",
              label: "What do you need it for?",
              type: "textarea",
              required: true,
            },
            {
              name: "expiresAt",
              label: "Needed until",
              type: "datetime-local",
              hint: "Leave empty only when access does not have an expiry.",
            },
          ]}
          explanation="You can also ask in the conversation. This optional selection preserves the same request."
          onSaved={(result) => { setSaved(result); obligations.refresh(); onChanged?.(); }}
        />
      )}
    </section>
  );
}
