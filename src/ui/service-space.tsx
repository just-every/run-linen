import { LinkedTickets } from "./work-relationships";
import { ChangeTemplates } from './change-templates';
import { ChangeCalendar } from './change-calendar';
import { ProblemProposals } from './problem-proposals';
import { DependencyDetails } from "./dependency-details";
import { ProblemDetails } from "./problem-actions";
import { NewChange } from "./setup-change";
import { usePeopleLabels } from "./people-labels";
import { date, text, humanize } from "./api";
import { visibilityLabel } from "./labels";
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
import { Icon } from "./icons";
import type { DomainRecord } from "./decisions";
import { ServiceActions, NewDecision } from "./service-actions";
import { RelatedRequests, hasRelatedRequests } from "./related-requests";
import { useQueue } from "./queue";
const labels: Record<string, [string, string]> = {
  services: ["Service ownership", "Keep the work behind the service in view."],
  incidents: ["Incidents", "Shared interruptions: recovery, person by person."],
  changes: ["Changes", "Changes and releases, made with care."],
  suppliers: ["Suppliers & commitments", "Keep the handoff accountable."],
  problems: ["Causes & prevention", "Learn what keeps coming back."],
  "software-assets": ["Software", "Software and entitlements: useful access, accountable cost."],
};
export function ServiceSpace({
  section,
  selectedId,
}: {
  section: string;
  selectedId?: string;
}) {
  const personName = usePeopleLabels(),
    queue = useQueue();
  const list = useRemote<{ items: DomainRecord[] }>(`/${section}`),
    detail = useRemote<DomainRecord>(
      selectedId ? `/${section}/${selectedId}` : null,
    ),
    incidents = useRemote<{ items: DomainRecord[] }>(section === "problems" ? "/incidents" : null),
    services = useRemote<{ items: DomainRecord[] }>("/services"),
    { session } = useSession(),
    label = labels[section] ?? labels.services;
  const record = detail.data,
    d = record?.data,
    canEdit = session.principal.roles.some((r) =>
      ["owner", "operator"].includes(r),
    );
  const serviceOptions = services.data?.items.map((r) => ({
    value: r.id,
    label: text(r.data.name),
  }));
  const fields: Record<string, Field[]> = {
    services: [
      { name: "ciType", label: "Configuration item type", type: "select", value: "business_service", required: true, options: [{value:"hardware",label:"Hardware"},{value:"software",label:"Software"},{value:"saas_app",label:"SaaS app"},{value:"business_service",label:"Business service"},{value:"cloud_resource",label:"Cloud resource"}] },
      { name: "environment", label: "Environment", type: "select", value: "production", required: true, options: [{value:"production",label:"Production"},{value:"test",label:"Test"},{value:"development",label:"Development"}], hint: "Change risk scoring (CHANGE-002) counts production items as higher risk." },
      { name: "provenance", label: "How these facts were obtained", type: "select", value: "asserted", required: true, options: [{value:"asserted",label:"Asserted"},{value:"observed",label:"Observed"},{value:"inferred",label:"Inferred"}] },
      { name: "name", label: "Service name", required: true },
      {
        name: "description",
        label: "What people use it for",
        type: "textarea",
        required: true,
      },
      {
        name: "businessImpact",
        label: "What happens when it is unavailable?",
        type: "textarea",
        required: true,
      },
      { name: "source", label: "Source of these facts", required: true },
      {
        name: "observedAt",
        label: "When was the source observed?",
        type: "datetime-local",
        required: true,
      },
      {
        name: "freshnessMs",
        label: "Freshness window in milliseconds",
        type: "number",
        required: true,
      },
    ],
    incidents: [
      { name: "title", label: "What is happening?", required: true },
      {
        name: "serviceId",
        label: "Affected service",
        type: "select",
        options: serviceOptions,
        required: true,
      },
      {
        name: "impact",
        label: "Impact on people’s work",
        type: "textarea",
        required: true,
      },
      {
        name: "cohorts",
        label: "Affected groups",
        type: "list",
        required: true,
        hint: "One actual cohort per line. Unknown coverage is retained.",
      },
    ],
    suppliers: [
      { name: "name", label: "Supplier name", required: true },
      {
        name: "services",
        label: "Supported service IDs",
        type: "list",
        required: true,
      },
      { name: "contract", label: "Actual contract reference", required: true },
      { name: "currency", label: "Currency", required: true },
      { name: "cost", label: "Quoted cost", type: "number", required: true },
      { name: "costPeriod", label: "Cost period", required: true },
      {
        name: "renewalAt",
        label: "Renewal date",
        type: "datetime-local",
        required: true,
      },
    ],
    problems: [
      { name: "title", label: "Recurring problem", required: true },
      {
        name: "serviceId",
        label: "Affected service",
        type: "select",
        options: serviceOptions,
        required: true,
      },
      {
        name: "symptoms",
        label: "Observed symptoms",
        type: "textarea",
        required: true,
      },
      { name: "incidentIds", label: "Related incidents", type: "checkboxes", required: true,
        options: incidents.data?.items.map(r => ({value:r.id,label:text(r.data.title)})),
        hint: "Select the incidents that belong to the affected service." },
    ],
    "software-assets": [
      { name: "name", label: "Software or entitlement", required: true },
      {
        name: "serviceId",
        label: "Service",
        type: "select",
        options: serviceOptions,
        required: true,
      },
      { name: "assetType", label: "Asset type", required: true },
      { name: "externalId", label: "Provider identity", required: true },
      { name: "source", label: "Authoritative source", required: true },
      { name: "currency", label: "Currency", required: true },
      {
        name: "acquisitionCost",
        label: "Acquisition cost",
        type: "number",
        required: true,
      },
      {
        name: "observedAt",
        label: "Last observed",
        type: "datetime-local",
        required: true,
      },
    ],
  };
  return (
    <>
      {selectedId && (
        <a className="back-link" href={`#/${section}`}>
          <Icon name="back" size={18} />
          {label[0]}
        </a>
      )}
      <Hero eyebrow={d ? label[0] : undefined} title={d ? text(d.title ?? d.name) : label[0]}>
        <p className="lead">
          {d
            ? text(
                d.impact ?? d.description ?? d.symptoms,
                "Details and observations are recorded below.",
              )
            : label[1] + " Facts, authority and independent outcomes stay connected. Missing evidence remains unknown."}
        </p>
        {d && (
          <Badge value={d.state ?? d.status ?? d.lifecycle ?? "recorded"} />
        )}
      </Hero>
      {section === "changes" && !selectedId && <><ChangeCalendar/><ChangeTemplates/></>}
      {selectedId ? (
        detail.loading ? (
          <Loading />
        ) : detail.error ? (
          <ErrorNotice error={detail.error} retry={detail.refresh} />
        ) : (
          record &&
          d && (
            <>
              <div className="resource-details">
                <Facts
                  entries={[
                    ["Accountable owner", personName(record.ownerId)],
                    ["Visibility", visibilityLabel(record.visibility)],
                    ["Recorded", date(record.createdAt)],
                    ["Last changed", date(record.updatedAt)],
                    ...(d.serviceId
                      ? [
                          [
                            "Service",
                            services.data?.items.find(
                              (s) => s.id === d.serviceId,
                            )?.data.name ?? d.serviceId,
                          ] as [string, unknown],
                        ]
                      : []),
                  ]}
                />
              </div>
              {["services", "incidents", "changes"].includes(section) && <DependencyDetails section={section} record={record} canEdit={canEdit} />}
              {["problems", "changes"].includes(section) && <LinkedTickets kind={section === "problems" ? "problem" : "change"} targetId={record.id} />}
              {section === "incidents" && (
                <>
                  <h2>What is known about recovery</h2>
                  <Notice>
                    Parent recovery does not establish every employee’s
                    recovery. The individual conversation stays open when work
                    is still broken.
                  </Notice>
                  <div className="record-list">
                    {(d.cohorts ?? []).map((cohort: string) => {
                      const evidence = (d.recoveries ?? []).filter(
                        (r: any) =>
                          r.cohort === cohort &&
                          Date.parse(r.expiresAt) > Date.now(),
                      );
                      return (
                        <div className="record-row" key={cohort}>
                          <span>
                            <strong>{personName(cohort)}</strong>
                            <small>
                              {evidence.length
                                ? `Observed ${date(evidence.at(-1)?.observedAt)}`
                                : "No fresh independently admitted recovery evidence"}
                            </small>
                          </span>
                          <Badge
                            value={evidence.length ? "verified" : "unknown"}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <details className="evidence">
                    <summary>Operator research & scoped diagnostics</summary>
                    {d.diagnostics?.length ? (
                      d.diagnostics.map((x: any) => (
                        <section key={x.id}>
                          <h3>{x.hypothesis}</h3>
                          <Facts
                            entries={[
                              ["Scope", x.scope],
                              ["Assignee", x.assignee],
                              ["Status", x.status],
                            ]}
                          />
                        </section>
                      ))
                    ) : (
                      <p>No diagnostic work is recorded yet.</p>
                    )}
                    <a href="#/research">Open unfamiliar-cause research →</a>
                  </details>
                </>
              )}
              {section === "changes" && (
                <>
                  <Facts
                    entries={[
                      ["Change type", d.changeType || (d.emergency ? "emergency" : "normal")],
                      ["Approval path", d.approvalPath === "catalog" ? "Standard catalog · CAB skipped" : d.emergency ? "ECAB · explicit emergency decision required" : d.approvalPath === "change-manager" ? "Change manager · one independent approval (low risk)" : "CAB · recorded change decision"],
                      ...(d.riskScore ? [["Risk score", `${d.riskScore.score} · ${d.riskScore.band}`] as [string, unknown], ["Score factors", d.riskScore.factors.map((f: { points: number; detail: string }) => `+${f.points} ${f.detail}`).join("; ") || "None"] as [string, unknown]] : []),
                      ["Risk", d.risk],
                      ["Window starts", date(d.window?.start)],
                      ["Window ends", date(d.window?.end)],
                      ["Affected cohorts", d.cohorts?.join(", ")],
                      ["Canary cohorts", d.canaryCohorts?.join(", ")],
                    ]}
                  />
                  {['implementationPlan','testPlan','backoutPlan'].filter(name=>d[name]).map((name,i)=><section key={name}><h3>{({implementationPlan:'Implementation plan',testPlan:'Test plan',backoutPlan:'Backout plan'} as Record<string,string>)[name]}</h3><p>{text(d[name])}</p></section>)}
                  <Notice>
                    Source edits invalidate affected decisions. A submission,
                    canary or rollback is not complete until its independent
                    evidence is admitted.
                  </Notice>
                </>
              )}
              {section === "suppliers" && (
                <Facts
                  entries={[
                    ["Contract", d.contract],
                    [
                      "Quoted cost",
                      `${text(d.cost)} ${text(d.currency)} / ${text(d.costPeriod)}`,
                    ],
                    ["Renewal", date(d.renewalAt)],
                  ]}
                />
              )}
              {section === "problems" && <ProblemDetails record={record} incidents={incidents.data?.items} />}
              <ServiceActions
                section={section}
                record={record}
                refresh={detail.refresh}
              />
              {canEdit &&
                [
                  "services",
                  "suppliers",
                  "changes",
                  "software-assets",
                ].includes(section) && <NewDecision record={record} />}
              <Evidence
                value={d}
                title="Sources, observations and complete record"
              />
            </>
          )
        )
      ) : list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNotice error={list.error} retry={list.refresh} />
      ) : (
        <>
          {section === "problems" && canEdit && <ProblemProposals onAccepted={list.refresh} />}
          <RelatedRequests section={section} />
          {list.data?.items.length ? (
            <div className="record-list">
              {list.data.items.map((r) => (
                <a
                  className="record-row"
                  href={`#/${section}/${r.id}`}
                  key={r.id}
                >
                  <span className="event-icon">
                    <Icon name={section === "incidents" ? "alert" : "file"} />
                  </span>
                  <span>
                    <strong>{text(r.data.title ?? r.data.name)}</strong>
                    <small>{date(r.updatedAt)}</small>
                  </span>
                  <Badge
                    value={
                      r.data.status ??
                      r.data.state ??
                      r.data.lifecycle ??
                      "recorded"
                    }
                  />
                  <Icon name="arrow" />
                </a>
              ))}
            </div>
          ) : (
            hasRelatedRequests(section, queue.data?.items) ? (
              <p className="related-note">
                No shared {section === "incidents" ? "incident" : "software"} record is kept yet. The requests above stay
                individual conversations; record shared context below when it is known.
              </p>
            ) : (
              <Empty title="No records yet.">
                Nothing is inferred from the absence of data. Add the actual
                service context when it is available.
              </Empty>
            )
          )}
          {canEdit && section === "changes" && <NewChange onSaved={result => { list.refresh(); location.hash = `/changes/${result.id}`; }} />}
          {canEdit && fields[section] && (
            <ActionForm
              title={`Add ${section === "software-assets" ? "software context" : section.replace(/s$/, "")}`}
              path={`/${section}`}
              fields={[...fields[section], {name:"visibility",label:"Who may see this?",type:"select",value:"operators",options:[{value:"operators",label:"Service operators"},{value:"workspace",label:"Everyone in this workspace"},{value:"restricted",label:"Owner and named participants"}],required:true}]}
              defaults={{
                participants: [],
                visibility: "operators",
                dependencies: [],
              }}
              onSaved={(result) => {
                list.refresh();
                location.hash = `/${section}/${result.id}`;
              }}
            />
          )}
        </>
      )}
    </>
  );
}
