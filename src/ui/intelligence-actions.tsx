import { useState } from "react";
import { ActionForm, type Field } from "./forms";
import { useRemote, useSession } from "./state";
import { Evidence, Notice, ErrorNotice } from "./primitives";
import { text, type RecordValue } from "./api";
export function IntelligenceActions({
  section,
  record,
  onSaved,
}: {
  section: string;
  record?: Record<string, any>;
  onSaved: () => void;
}) {
  const { session } = useSession(),
    grants = useRemote<RecordValue[]>(
      section === "engineering" ? "/engineering/grants" : null,
    ),
    [credential, setCredential] = useState("");
  if (!session.principal.roles.some((r) => ["owner", "operator"].includes(r)))
    return null;
  const json = (name: string, label: string): Field => ({
      name,
      label,
      type: "json",
      required: true,
    }),
    str = (name: string, label: string): Field => ({
      name,
      label,
      required: true,
    });
  if (section === "engineering")
    return (
      <>
        <h2>Bounded engineering authority</h2>
        <p>
          Source access, exact base revision, permitted files and independent
          checks are established before the local companion can work.
        </p>
        <ErrorNotice error={grants.error} />
        {grants.data?.map((g) => (
          <section key={text(g.id)}>
            <Evidence value={g} title={`Engineering grant ${g.id}`} />
            <ActionForm
              title="Revoke engineering authority"
              path={`/engineering/grants/${g.id}/revoke`}
              fields={[]}
              onSaved={grants.refresh}
            />
          </section>
        ))}
        {session.principal.roles.includes("owner") && (
          <ActionForm
            title="Grant a bounded repository task"
            path="/engineering/grants"
            fields={[
              json("config", "Repository, source pin, paths and commands"),
              {
                name: "expiresAt",
                label: "Authority expires",
                type: "datetime-local",
                required: true,
              },
            ]}
            onSaved={(r) => {
              setCredential(text(r.token, ""));
              grants.refresh();
            }}
          />
        )}
        {credential && (
          <Notice>
            <p>Copy this companion credential now; it is returned only once.</p>
            <code>{credential}</code>
            <button className="text-button" onClick={() => setCredential("")}>
              Dismiss credential
            </button>
          </Notice>
        )}
        <ActionForm
          title={
            record
              ? "Assign this engineering need"
              : "Queue a scoped engineering task"
          }
          path="/engineering/jobs"
          defaults={
            record
              ? { jobId: record.id, commitmentId: record.commitment_id }
              : {}
          }
          fields={[
            ...(!record ? [str("commitmentId", "Commitment identity")] : []),
            {
              name: "grantId",
              label: "Current engineering grant",
              type: "select",
              required: true,
              options: grants.data
                ?.filter((g) => !g.revoked_at)
                .map((g) => ({ value: text(g.id), label: text(g.id) })),
            },
            json("spec", "Task description and optional proposed edits"),
          ]}
          onSaved={onSaved}
        />
        <ActionForm
          title="Check a protocol against explicit assumptions"
          path="/intelligence/protocol/check"
          fields={[
            json("assumptions", "Assumptions"),
            json("events", "Protocol events"),
            {
              name: "mutation",
              label: "Counterexample mutation",
              type: "json",
            },
          ]}
          onSaved={onSaved}
        />
      </>
    );
  if (section === "capabilities")
    return record ? (
      <ActionForm
        title="Apply this verified repair to a matching commitment"
        path={`/capabilities/${record.id}/apply`}
        fields={[
          str("commitmentId", "Target commitment"),
          json("plan", "Current scoped execution plan"),
          json("versions", "Exact current versions"),
        ]}
        explanation="Applicability, counterexamples, current authority and independent evidence are checked again. A near match returns to research."
        onSaved={onSaved}
      />
    ) : (
      <ActionForm
        title="Publish a verified repair"
        path="/capabilities"
        fields={[
          str("researchId", "Verified research identity"),
          json("versions", "Exact verified versions"),
          json("conditions", "Detector conditions"),
          json("counterexamples", "Known counterexamples"),
          json("steps", "Independently verified action steps"),
          {
            name: "diagnosticQuestions",
            label: "Diagnostic questions",
            type: "list",
            required: true,
          },
        ]}
        onSaved={onSaved}
      />
    );
  if (section === "simplifications" && !record)
    return (
      <ActionForm
        title="Propose a measurable simplification"
        path="/simplifications"
        fields={[
          str("commitmentId", "Service commitment"),
          str("changeId", "Controlled change"),
          {
            name: "redesign",
            label: "Simpler service design",
            type: "textarea",
            required: true,
          },
          {
            name: "continuedRepair",
            label: "Continuing repair alternative",
            type: "textarea",
            required: true,
          },
          {
            name: "baselineFrom",
            label: "Measure baseline from",
            type: "datetime-local",
            required: true,
          },
        ]}
        explanation="The baseline is collected from actual recorded service observations and costs. No avoided-cost claim is invented."
        onSaved={onSaved}
      />
    );
  return null;
}
