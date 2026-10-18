import { usePeopleLabels } from "./people-labels";
import { date, text, type RecordValue } from "./api";
import { useRemote, useSession } from "./state";
import { ActionForm, type Field } from "./forms";
import {
  Badge,
  Empty,
  ErrorNotice,
  Evidence,
  Facts,
  Hero,
  Loading,
  Notice,
} from "./primitives";
import { IntelligenceActions } from "./intelligence-actions";
import { Icon } from "./icons";
export type IntelRecord = Record<string, any>;
export function collection<T>(value: T[] | { items: T[] } | null): T[] {
  return value === null ? [] : Array.isArray(value) ? value : value.items;
}
const destinations: Record<string, string> = {
  commitments: "/commitments",
  research: "/research",
  engineering: "/engineering/jobs",
  capabilities: "/capabilities",
  simplifications: "/simplifications",
};
const titles: Record<string, string> = {
  commitments: "Continuing commitments",
  research: "Research & evidence",
  engineering: "Engineering & adoption",
  capabilities: "Verified reusable repairs",
  simplifications: "Service simplification",
};
const taglines: Record<string, string> = {
  commitments: "Keep the promise, beyond the request.",
  research: "Follow the evidence, even somewhere new.",
  engineering: "Make the missing capability real.",
  capabilities: "Reuse what the evidence supports.",
  simplifications: "Make tomorrow’s work simpler.",
};
export function IntelligenceSpace({
  section,
  selectedId,
}: {
  section: string;
  selectedId?: string;
}) {
  const personName = usePeopleLabels();
  const path = destinations[section],
    list = useRemote<IntelRecord[] | { items: IntelRecord[] }>(path),
    detail = useRemote<IntelRecord>(
      selectedId && ["commitments", "research"].includes(section)
        ? `${path}/${selectedId}`
        : null,
    ),
    coverage = useRemote<IntelRecord>(
      section === "commitments" && selectedId
        ? `/commitments/${selectedId}/coverage`
        : null,
    ),
    connections = useRemote<RecordValue[]>("/connections"),
    commitments = useRemote<IntelRecord[] | { items: IntelRecord[] }>(
      section !== "commitments" ? "/commitments" : null,
    ),
    { session } = useSession();
  const all: IntelRecord[] = collection<IntelRecord>(list.data).map(
      (r): IntelRecord => ({
        ...r,
        data:
          r.data ??
          (r.data_json
            ? JSON.parse(r.data_json)
            : r.spec_json
              ? JSON.parse(r.spec_json)
              : undefined),
      }),
    ),
    record = detail.data ?? all.find((r) => r.id === selectedId),
    d = record ? { ...record, ...record.data } : undefined,
    operator = session.principal.roles.some((r) =>
      ["owner", "operator", "hr"].includes(r),
    );
  function refresh() {
    list.refresh();
    detail.refresh();
    coverage.refresh();
  }
  const modelOptions = connections.data
    ?.filter((c) => c.provider === "openai")
    .map((c) => ({ value: text(c.id), label: text(c.name) }));
  const fields: Record<string, Field[]> = {
    commitments: [
      {
        name: "outcome",
        label: "What should people always be able to do?",
        type: "textarea",
        required: true,
      },
      {
        name: "cohort",
        label: "Actual beneficiary identities",
        type: "list",
        required: true,
      },
      {
        name: "observations",
        label: "Independent observation definitions",
        type: "json",
        required: true,
        hint: "Each entry binds id, description and a scoped execution step with a separate workflow verifier.",
      },
      {
        name: "freshnessSeconds",
        label: "Evidence freshness in seconds",
        type: "number",
        required: true,
      },
      {
        name: "intervalSeconds",
        label: "Observation interval in seconds",
        type: "number",
        required: true,
      },
      {
        name: "effectiveAt",
        label: "Effective from",
        type: "datetime-local",
        required: true,
      },
      { name: "expiresAt", label: "Effective until", type: "datetime-local" },
      { name: "dependencies", label: "Dependent commitment IDs", type: "list" },
      {
        name: "modelConnectionId",
        label: "Reasoning connection",
        type: "select",
        options: modelOptions,
      },
    ],
    research: [
      {
        name: "commitmentId",
        label: "Service commitment",
        type: "select",
        required: true,
        options: collection(commitments.data).map((c) => ({
          value: c.id,
          label: c.data.outcome,
        })),
      },
      {
        name: "connectionId",
        label: "Reasoning connection",
        type: "select",
        required: true,
        options: modelOptions,
      },
      {
        name: "question",
        label: "What does the current explanation fail to explain?",
        type: "textarea",
        required: true,
      },
    ],
  };
  return (
    <>
      {selectedId && (
        <a className="back-link" href={`#/${section}`}>
          <Icon name="back" size={18} />
          {section}
        </a>
      )}
      <Hero
        eyebrow={selectedId && d ? titles[section] : undefined}
        title={
          selectedId && d
            ? text(
                d.outcome ?? d.question ?? d.description ?? d.redesign,
                titles[section],
              )
            : titles[section]
        }
      >
        <p className="lead">
          {!(selectedId && d) && `${taglines[section]} `}
          {section === "commitments"
            ? "A useful outcome, real observations and an accountable owner. Missing or stale coverage never becomes a quiet success."
            : "Rival explanations, scoped authority and independent verification remain visible through every attempt."}
        </p>
        {record?.state && <Badge value={record.state} />}
      </Hero>
      {(selectedId && detail.loading) || (!selectedId && list.loading) ? (
        <Loading />
      ) : detail.error || list.error ? (
        <ErrorNotice error={detail.error ?? list.error} retry={refresh} />
      ) : selectedId && record ? (
        <>
          <Facts
            entries={[
              [
                "Owner",
                personName(
                  record.ownerId ?? record.owner_id ?? record.actor_id,
                ),
              ],
              ["Revision", record.revision ?? d?.commitmentRevision],
              ["Last changed", date(record.updatedAt ?? record.updated_at)],
              ["State", record.state ?? "recorded"],
            ]}
          />
          {section === "commitments" && (
            <>
              <section>
                <h2>What the observations actually cover</h2>
                <ErrorNotice error={coverage.error} retry={coverage.refresh} />
                {coverage.loading ? (
                  <Loading label="Reading coverage…" />
                ) : (
                  coverage.data?.coverage?.map((item: any) => (
                    <div
                      className="record-row"
                      key={`${item.specId}:${item.cohort}`}
                    >
                      <span>
                        <strong>{personName(item.cohort)}</strong>
                        <small>
                          {item.specId} ·{" "}
                          {item.observedAt
                            ? date(item.observedAt)
                            : "No observation yet"}
                        </small>
                      </span>
                      <Badge value={item.state} />
                    </div>
                  ))
                )}
                {coverage.data?.uncoveredCohorts?.length > 0 && (
                  <Notice tone="warning">
                    Unobserved people:{" "}
                    {coverage.data?.uncoveredCohorts.join(", ")}
                  </Notice>
                )}
              </section>
              {operator && (
                <>
                  <ActionForm
                    title="Observe this commitment now"
                    path={`${path}/${selectedId}/observe`}
                    fields={[]}
                    submit="Run scoped observations"
                    explanation="This contacts the configured independent verifier. Failure stays uncertain; it does not mark the commitment healthy."
                    onSaved={refresh}
                  />
                  <ActionForm
                    title="Update the commitment"
                    path={`${path}/${selectedId}`}
                    method="PATCH"
                    defaults={{ revision: record.revision }}
                    fields={[
                      {
                        name: "outcome",
                        label: "Intended outcome",
                        type: "textarea",
                        required: true,
                        value: d.outcome,
                      },
                      {
                        name: "freshnessSeconds",
                        label: "Evidence freshness in seconds",
                        type: "number",
                        value: d.freshnessSeconds,
                      },
                      {
                        name: "intervalSeconds",
                        label: "Observation interval",
                        type: "number",
                        value: d.intervalSeconds,
                      },
                    ]}
                    onSaved={refresh}
                  />
                  <ActionForm
                    title="Investigate an unfamiliar failure"
                    path="/research"
                    defaults={{ commitmentId: record.id }}
                    fields={[
                      {
                        name: "connectionId",
                        label: "Reasoning connection",
                        type: "select",
                        required: true,
                        options: modelOptions,
                      },
                      {
                        name: "question",
                        label: "Unexplained failure",
                        type: "textarea",
                        required: true,
                      },
                    ]}
                    onSaved={(result) => {
                      location.hash = `/research/${result.id}`;
                    }}
                  />
                </>
              )}
            </>
          )}
          {section === "research" && (
            <>
              <h2>Explanations and discriminating evidence</h2>
              {d.rounds?.length ? (
                d.rounds.map((round: any) => (
                  <section className="connection-record" key={round.number}>
                    <h3>Research round {round.number}</h3>
                    {round.decision?.hypotheses?.map((hypothesis: any) => (
                      <section className="hypothesis" key={hypothesis.id}>
                        <div className="section-heading">
                          <h3>{hypothesis.explanation}</h3>
                          <Badge value={hypothesis.status} />
                        </div>
                        <p>
                          <strong>Prediction:</strong> {hypothesis.prediction}
                        </p>
                      </section>
                    ))}
                    <Evidence value={round.probes} title="Probe observations" />
                    <Evidence
                      value={round.decision?.rejectedExplanations}
                      title="Rejected explanations"
                    />
                    <p>{round.decision?.conclusion}</p>
                  </section>
                ))
              ) : (
                <Empty title="The investigation has not run yet.">
                  A bounded reasoning round uses the configured model and
                  permitted observations. It never invents probe results.
                </Empty>
              )}
              {operator && (
                <>
                  <ActionForm
                    title="Continue the research"
                    path={`${path}/${selectedId}/advance`}
                    fields={[]}
                    submit="Run one bounded round"
                    onSaved={refresh}
                  />
                  <ActionForm
                    title="Independently verify the repair"
                    path={`${path}/${selectedId}/verify`}
                    fields={[
                      {
                        name: "operationId",
                        label: "Actual repair operation ID",
                        required: true,
                      },
                    ]}
                    onSaved={refresh}
                  />
                </>
              )}
            </>
          )}
          {section === "simplifications" && (
            <>
              <ActionForm
                title="Run the controlled redesign"
                path={`${path}/${selectedId}/execute`}
                defaults={{ idempotencyKey: crypto.randomUUID() }}
                fields={[
                  {
                    name: "phase",
                    label: "Change phase",
                    type: "select",
                    required: true,
                    options: ["canary", "rollout", "compensate"].map(
                      (value) => ({ value, label: value }),
                    ),
                  },
                ]}
                onSaved={refresh}
              />
              <ActionForm
                title="Measure the resulting service"
                path={`${path}/${selectedId}/measure`}
                fields={[
                  { name: "invocationId", label: "Verified invocation ID" },
                ]}
                onSaved={refresh}
              />
            </>
          )}
          <IntelligenceActions
            section={section}
            record={record}
            onSaved={refresh}
          />
          <Evidence
            value={d}
            title="Full evidence, versions and remaining uncertainty"
          />
        </>
      ) : (
        <>
          {all.length ? (
            <div className="record-list">
              {all.map((r) => (
                <a
                  className="record-row"
                  key={r.id}
                  href={`#/${section}/${r.id}`}
                >
                  <span className="event-icon">
                    <Icon name="file" />
                  </span>
                  <span>
                    <strong>
                      {text(
                        r.data?.outcome ??
                          r.question ??
                          r.data?.redesign ??
                          r.spec?.description ??
                          r.id,
                      )}
                    </strong>
                    <small>
                      {date(r.updatedAt ?? r.updated_at ?? r.created_at)}
                    </small>
                  </span>
                  <Badge value={r.state ?? "recorded"} />
                  <Icon name="arrow" />
                </a>
              ))}
            </div>
          ) : (
            <Empty title={`No ${section} recorded yet.`}>
              Actual configuration and observations establish what Linen can do
              here. Nothing is generated to fill this space.
            </Empty>
          )}
          {operator && !fields[section] && (
            <IntelligenceActions section={section} onSaved={refresh} />
          )}{" "}
          {operator && fields[section] && (
            <ActionForm
              title={
                section === "commitments"
                  ? "Establish a service commitment"
                  : "Start an investigation"
              }
              path={path}
              fields={fields[section]}
              defaults={{
                dependencies: [],
                participants: [],
                sensitivity: "internal",
              }}
              onSaved={(result) => {
                refresh();
                location.hash = `/${section}/${result.id}`;
              }}
            />
          )}
        </>
      )}
    </>
  );
}
