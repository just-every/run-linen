import { Notice } from "./primitives";
import { useRemote, useSession } from "./state";
import { ActionForm } from "./forms";
import { text } from "./api";
import type { DomainRecord } from "./decisions";
export function ServiceActions({
  section,
  record,
  refresh,
}: {
  section: string;
  record: DomainRecord;
  refresh: () => void;
}) {
  const { session } = useSession(),
    d = record.data,
    base = `/${section}/${record.id}`,
    defaults = { revision: record.revision },
    operator = session.principal.roles.some((r) =>
      ["owner", "operator"].includes(r),
    );
  if (!operator) return null;
  return (
    <>
      {section === "incidents" && (
        <>
          <ActionForm
            title="Share an audience-scoped update"
            path={`${base}/updates`}
            defaults={defaults}
            fields={[
              {
                name: "message",
                label: "Useful update",
                type: "textarea",
                required: true,
              },
              {
                name: "recipientIds",
                label: "Actual recipient IDs",
                type: "list",
                required: true,
              },
            ]}
            explanation="Delivery is recorded separately; saving an update does not mean every recipient received it."
            onSaved={refresh}
          />
          <ActionForm
            title="Assign a scoped diagnostic"
            path={`${base}/diagnostics`}
            defaults={defaults}
            fields={[
              { name: "assignee", label: "Operator ID", required: true },
              {
                name: "scope",
                label: "Permitted read-only scope",
                type: "textarea",
                required: true,
              },
              {
                name: "hypothesis",
                label: "Explanation to test",
                type: "textarea",
                required: true,
              },
              {
                name: "budget",
                label: "Bounded diagnostic budget",
                type: "number",
                required: true,
              },
            ]}
            onSaved={refresh}
          />
          <ActionForm
            title="Correct an incident link"
            path={`${base}/link`}
            defaults={{ ...defaults, correction: true }}
            fields={[
              {
                name: "employeeIncidentId",
                label: "Individual work ID",
                required: true,
              },
            ]}
            onSaved={refresh}
          />
          <ActionForm
            title="Use the on-call escalation"
            path={`${base}/oncall`}
            fields={[]}
            explanation="Only a configured rotation and authorized notification channel can deliver this escalation."
            onSaved={refresh}
          />
        </>
      )}
      {section === "changes" && (
        <>
          {![d.implementation, d.compensation].every(i => Number.isInteger(i?.connectionRevision) && i.connectionRevision > 0 && Number.isInteger(i?.verifierConnectionRevision) && i.verifierConnectionRevision > 0) && <Notice>This legacy change has no complete connection version review. Execution remains held. Amend the implementation and compensation with reviewed current versions before seeking a fresh decision.</Notice>}
          <ActionForm
            title="Record current change authority"
            path={`${base}/authorize`}
            defaults={defaults}
            fields={[
              {
                name: "reason",
                label: "Decision and scope",
                type: "textarea",
                required: true,
              },
              {
                name: "grantReferences",
                label: "Exact grant versions",
                type: "json",
                required: true,
                hint: 'Array of {"id":"…","version":1}. Existing grants are rechecked at each effect.',
              },
            ]}
            onSaved={refresh}
          />
          <ActionForm
            title="Run a controlled change phase"
            path={`${base}/dispatch`}
            defaults={{ ...defaults, idempotencyKey: crypto.randomUUID() }}
            fields={[
              {
                name: "phase",
                label: "Phase",
                type: "select",
                required: true,
                options: [
                  { value: "canary", label: "Canary" },
                  { value: "rollout", label: "Rollout after verified canary" },
                  { value: "compensate", label: "Compensate existing effects" },
                ],
              },
            ]}
            onSaved={refresh}
          />
          <ActionForm
            title="Verify an actual invocation"
            path={`${base}/verify`}
            defaults={defaults}
            fields={[
              {
                name: "invocationId",
                label: "Invocation",
                type: "select",
                required: true,
                options: (d.invocations ?? []).map((i: any) => ({
                  value: i.id,
                  label: `${i.phase} · ${i.state}`,
                })),
              },
            ]}
            onSaved={refresh}
          />
          <ActionForm
            title="Advanced: amend the implementation"
            path={base}
            method="PATCH"
            defaults={defaults}
            fields={[
              {
                name: "implementation",
                label: "Changed exact implementation",
                type: "json",
                required: true,
              },
              {
                name: "risk",
                label: "Updated risk",
                type: "textarea",
                value: d.risk,
                required: true,
              },
              {
                name: "impact",
                label: "Updated impact",
                type: "textarea",
                value: d.impact,
                required: true,
              },
            ]}
            explanation="This invalidates prior decisions for the changed implementation. Active effects must first be reconciled."
            onSaved={refresh}
          />
        </>
      )}
      {section === "suppliers" && (
        <>
          <ActionForm
            title="Record a supplier commitment"
            path={`${base}/commitments`}
            defaults={defaults}
            fields={[
              {
                name: "outcome",
                label: "Actual promised outcome",
                type: "textarea",
                required: true,
              },
              {
                name: "dueAt",
                label: "Due at",
                type: "datetime-local",
                required: true,
              },
              {
                name: "ownerId",
                label: "Accountable owner ID",
                required: true,
              },
              {
                name: "source",
                label: "Source of the commitment",
                required: true,
              },
            ]}
            onSaved={refresh}
          />
          <ActionForm
            title="Offer a supplier handoff"
            path={`${base}/handoffs`}
            defaults={defaults}
            fields={[
              { name: "to", label: "Receiving owner ID", required: true },
              {
                name: "summary",
                label: "Handoff context",
                type: "textarea",
                required: true,
              },
              {
                name: "outstanding",
                label: "Remaining obligations",
                type: "list",
                required: true,
              },
              { name: "source", label: "Source", required: true },
              {
                name: "cost",
                label: "Observed cost",
                type: "number",
                required: true,
              },
            ]}
            onSaved={refresh}
          />
        </>
      )}
      {section === "problems" && (
        <ActionForm
          title="Record a reviewed workaround"
          path={`${base}/workarounds`}
          defaults={defaults}
          fields={[
            {
              name: "text",
              label: "Workaround and limits",
              type: "textarea",
              required: true,
            },
            { name: "source", label: "Evidence source", required: true },
            {
              name: "expiresAt",
              label: "Review expiry",
              type: "datetime-local",
              required: true,
            },
          ]}
          onSaved={refresh}
        />
      )}
    </>
  );
}
export function NewDecision({ record }: { record: DomainRecord }) {
  const members = useRemote<Record<string, unknown>[]>("/members");
  return (
    <ActionForm
      title="Bring a material choice to its owner"
      path="/decisions"
      defaults={{ contextId: record.id }}
      fields={[
        { name: "title", label: "Decision in plain words", required: true },
        {
          name: "holderId",
          label: "Actual decision holder",
          type: "select",
          required: true,
          options: members.data?.map((m) => ({
            value: text(m.id),
            label: text(m.name),
          })),
        },
        {
          name: "holderRoles",
          label: "Required holder roles",
          type: "list",
          required: true,
        },
        {
          name: "options",
          label: "Material options and consequences",
          type: "json",
          required: true,
          hint: "At least two objects with id, label and consequences. Use the actual alternatives.",
        },
        {
          name: "recommendation",
          label: "Recommended option ID",
          required: true,
        },
        {
          name: "quote",
          label: "Actual quote",
          type: "textarea",
          required: true,
        },
        { name: "quoteSource", label: "Quote source", required: true },
        {
          name: "terms",
          label: "Period and contract terms",
          type: "textarea",
          required: true,
        },
        {
          name: "cohorts",
          label: "Affected people or cohorts",
          type: "list",
          required: true,
        },
        {
          name: "impact",
          label: "Service and business impact",
          type: "textarea",
          required: true,
        },
        {
          name: "reversibility",
          label: "What can be reversed?",
          type: "textarea",
          required: true,
        },
        {
          name: "deadline",
          label: "Decision deadline",
          type: "datetime-local",
          required: true,
        },
        {
          name: "uncertainty",
          label: "Unknowns and evidence gaps",
          type: "textarea",
          required: true,
        },
      ]}
      explanation="The choice does not create an execution grant. Each actual authority holder remains separate."
      onSaved={(result) => {
        location.hash = `/decisions/${result.id}`;
      }}
    />
  );
}
