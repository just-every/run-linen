import { CustomReports, BiExports } from './reports';
import { NotificationSettings } from './notification-settings';
import {DepartmentManagement} from './department-management';
import {DepartmentRoles} from './department-roles';
import {ApprovalMailSettings} from './approval-mail-settings';
import { OperationsKpis } from './operations-kpis';
import { EffortReport, type EffortReportData } from "./effort-report";
import { SlaReport } from "./work-sla";
import { LaborRatesForm, WorkSavedReport, type WorkSavedData } from "./work-saved";
import type { ReviewedMapping, CatalogChoice } from "./setup-permissions";
import { settingsSections } from "./shell-rail";
import { useState, type FormEvent } from "react";
import { date, text, humanize, type RecordValue } from "./api";
import { useRemote, useSession } from "./state";
import { ActionForm } from "./forms";
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
import { GrantForm } from "./grant-form";
import { Icon } from "./icons";
import { collection } from "./intelligence";
import { roleLabels, roleList } from "./labels";
const settingsTitle = (section: string) => settingsSections.find(([key]) => key === section)?.[1] ?? "Effects & takeover";
export function OperationsSpace({ section }: { section: string }) {
  const endpoint =
      section === "operations"
        ? "/operations"
        : section === "grants"
          ? "/grants"
          : section === "members"
            ? "/members"
            : section === "notifications"
              ? "/service-notifications"
              : "/plans",
    list = useRemote<RecordValue[] | { items: RecordValue[] }>(endpoint),
    { session } = useSession(),
    rows = collection(list.data);
  const owner = session.principal.roles.includes("owner");
  const mappings = useRemote<ReviewedMapping[]>(section === "grants" && owner ? "/subject-mappings" : null);
  const members = useRemote<RecordValue[]>(section === "grants" && owner ? "/members" : null);
  const catalog = useRemote<{ items: CatalogChoice[] }>(section === "grants" ? "/catalog" : null);
  return (
    <>
      <Hero eyebrow="Accountable operation" title={settingsTitle(section)}>
        <p className="lead">
          {section === "grants"
            ? "Authority, with clear edges. "
            : section === "members"
              ? "The right people. The right scope. "
              : section === "notifications"
                ? "An update is only useful if it arrives. "
                : "Know what happened. Keep what remains. "}
          Recorded intent, external effects and independently verified outcomes
          are different states. Keep each visible.
        </p>
      </Hero>
      {section === "operations" && (
        <Notice>
          Cancellation or takeover fences future work. It does not claim a
          remote effect stopped. Unknown effects must be reconciled before any
          repeat or compensation.
        </Notice>
      )}
      {section==="notifications"&&owner&&<ApprovalMailSettings/>}
      {section==="notifications"&&<NotificationSettings/>}
      {section==='members'&&owner&&<DepartmentManagement/>}
      {section==='members'&&owner&&<DepartmentRoles/>}
      <div className={section === "members" ? "split" : "stack"}>
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNotice error={list.error} retry={list.refresh} />
      ) : rows.length ? (
        <div className="record-stack">
          {section === "members" && <h2 className="record-stack-title">Workspace members</h2>}
          {rows.map((r) => (
          <section className="connection-record" key={text(r.id)}>
            <div className="section-heading">
              {section === "members" && <span className="event-icon"><Icon name="user" /></span>}
              <h2>
                {text(
                  r.name ??
                    r.resource ??
                    r.action ??
                    r.kind ??
                    "Recorded activity",
                )}
              </h2>
              <Badge
                value={
                  r.state ??
                  (r.active === undefined
                    ? "recorded"
                    : r.active
                      ? "active"
                      : "revoked")
                }
              />
            </div>
            <Facts
              entries={
                section === "members"
                  ? [
                      ["Email", r.email],
                      ["Roles", roleList(r.roles_json)],
                    ]
                  : section === "grants"
                    ? [
                        ["Service identity", members.data?.find(m => m.id === r.principal_id)?.name ?? "Recorded service identity"],
                        ["Colleague", mappings.data?.find(m => m.id === r.mapping_id)?.localName ?? "Recorded beneficiary"],
                        ["Service", catalog.data?.items.find(c => c.target === r.target)?.name ?? "Exact reviewed target"],
                        ["Valid from", date(r.valid_from)],
                        ["Valid until", date(r.valid_until)],
                        ["Version", r.version],
                      ]
                    : [
                        ["Activity", humanize(r.action ?? r.kind ?? "Recorded operation")],
                        ["Revision", r.revision],
                        ["Due", date(r.due_at ?? r.next_at)],
                        ["Remaining uncertainty", r.last_error ?? r.error],
                      ]
              }
            />
            {section === "operations" && (
              <>
                <ActionForm
                  title="Reconcile the actual remote effect"
                  path={`/operations/${text(r.id)}/reconcile`}
                  fields={[]}
                  submit="Check remote state"
                  onSaved={list.refresh}
                />
                <ActionForm
                  title="Verify usable work independently"
                  path={`/operations/${text(r.id)}/verify`}
                  fields={[]}
                  defaults={{ verifierVersion: 1 }}
                  submit="Run independent verifier"
                  onSaved={list.refresh}
                />
                {["takeover", "cancel"].map((command) => (
                  <ActionForm
                    key={command}
                    title={
                      command === "takeover"
                        ? "Take over this operation"
                        : "Cancel unstarted work"
                    }
                    path={`/operations/${text(r.id)}/${command}`}
                    defaults={{ expectedRevision: r.revision }}
                    fields={[
                      {
                        name: "reason",
                        label: "Reason and accountable next step",
                        type: "textarea",
                        required: true,
                      },
                    ]}
                    onSaved={list.refresh}
                  />
                ))}
              </>
            )}
            {section === "notifications" && (
              <ActionForm
                title="Reconcile delivery failure"
                path={`/service-notifications/${text(r.id)}/reconcile`}
                fields={[]}
                submit="Check actual delivery"
                onSaved={list.refresh}
              />
            )}{" "}
            {section === "plans" && (
              <ActionForm
                title="Dispatch under current authority"
                path={`/plans/${text(r.id)}/dispatch`}
                defaults={{ expectedRevision: r.revision }}
                fields={[]}
                submit="Dispatch plan"
                onSaved={list.refresh}
              />
            )}{" "}
            {section === "grants" &&
              session.principal.roles.includes("owner") && (
                <ActionForm
                  title="Revoke this grant version"
                  path={`/grants/${text(r.id)}/revoke`}
                  defaults={{ version: r.version }}
                  fields={[]}
                  submit="Revoke authority"
                  explanation="Revocation stops future authorized admission; it is not proof that a provider effect has stopped."
                  onSaved={list.refresh}
                />
              )}
            {section !== "members" && <Evidence value={r} />}
          </section>
        ))}</div>
      ) : (
        <Empty title={`No ${section} recorded.`}>
          {section === "grants" ? "Reviewed permissions will appear here. Use the review below to choose who may act and for which service." : section === "operations" ? "Service activity will appear here when work begins." : section === "notifications" ? "Updates and their delivery status will appear here." : section === "members" ? "Workspace members will appear here." : "Plans will appear here when work is prepared."}
        </Empty>
      )}
      {section === "members" && session.principal.roles.includes("owner") && (
        <ActionForm
          title="Add a workspace member"
          open
          path="/members"
          explanation="For a person, create a reviewed person record linked to this member account. HR can review the manager in People & lifecycle."
          fields={[
            { name: "isPerson", label: "This member is also a person", type: "checkbox", value: true },
            { name: "name", label: "Name", required: true },
            {
              name: "email",
              label: "Work email",
              type: "email",
              required: true,
            },
            {
              name: "password",
              label: "Initial password",
              type: "password",
              required: true,
              hint: "At least 12 characters. Share privately; the person should change it.",
            },
            {
              name: "roles",
              label: "Granted roles",
              type: "checkboxes",
              required: true,
              options: Object.entries(roleLabels).map(([value, label]) => ({ value, label })),
            },
          ]}
          onSaved={list.refresh}
        />
      )}
      </div>{" "}
      {section === "grants" && session.principal.roles.includes("owner") && <GrantForm onSaved={list.refresh} />}
      {section === "plans" && (
        <ActionForm
          title="Record an executable plan"
          path="/plans"
          defaults={{ idempotencyKey: crypto.randomUUID() }}
          fields={[
            { name: "workId", label: "Work record ID", required: true },
            {
              name: "revision",
              label: "Current work revision",
              type: "number",
              required: true,
            },
            {
              name: "steps",
              label: "Exactly scoped execution steps",
              type: "json",
              required: true,
              hint: "Each step references current grant and independent verifier versions. A plan is intent, not completion.",
            },
          ]}
          onSaved={list.refresh}
        />
      )}
    </>
  );
}
export function ReportSpace() {
  const [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [baselineFrom, setBaselineFrom] = useState(""),
    [baselineTo, setBaselineTo] = useState(""),
    [cohort, setCohort] = useState(""),
    [path, setPath] = useState<string | null>(null),
    [savedPath, setSavedPath] = useState<string | null>(null),
    { session } = useSession(),
    report = useRemote<RecordValue>(path),
    saved = useRemote<WorkSavedData>(savedPath),
    rates = useRemote<{ rates: Record<string, number> }>("/reports/labor-rates");
  const iso = (value: string) => encodeURIComponent(new Date(value).toISOString());
  function run(e: FormEvent) {
    e.preventDefault();
    setPath(
      `/reports/work?from=${iso(from)}&to=${iso(to)}&timezone=${encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone)}`,
    );
    // REPORT-004: an owner-chosen baseline window (before automation) beside this period.
    setSavedPath(baselineFrom && baselineTo
      ? `/reports/work-saved?baselineFrom=${iso(baselineFrom)}&baselineTo=${iso(baselineTo)}&currentFrom=${iso(from)}&currentTo=${iso(to)}${cohort.split(",").map((t) => t.trim()).filter(Boolean).map((t) => `&requestType=${encodeURIComponent(t)}`).join("")}`
      : null);
  }
  function ratesSaved() {
    rates.refresh();
    report.refresh();
    saved.refresh();
  }
  return (
    <>
      <Hero eyebrow="Service review" title="Reports">
        <p className="lead">
          Measure the work, not the noise. Keep the cohort, period, timezone, unresolved work and verification
          coverage alongside every count.
        </p>
      </Hero>
      <CustomReports />
      {session.principal.roles.includes("owner") && <BiExports />}
      <OperationsKpis />
      <form className="inline-form" onSubmit={run}>
        <div className="field-grid">
          <label>
            From
            <input
              type="datetime-local"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            Until
            <input
              type="datetime-local"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label>
            Baseline from
            <input
              type="datetime-local"
              value={baselineFrom}
              onChange={(e) => setBaselineFrom(e.target.value)}
            />
          </label>
          <label>
            Baseline until
            <input
              type="datetime-local"
              value={baselineTo}
              onChange={(e) => setBaselineTo(e.target.value)}
            />
          </label>
        </div>
        <label>
          Cohort request types (optional, comma-separated)
          <input value={cohort} placeholder="All request types" onChange={(e) => setCohort(e.target.value)} />
        </label>
        <p>Add a baseline window before an automation to compare human work and cost per verified outcome with this period.</p>
        <button className="action primary">Read this period</button>
      </form>
      {session.principal.roles.includes("owner") && rates.data && (
        <LaborRatesForm rates={rates.data.rates} onSaved={ratesSaved} />
      )}
      {report.loading ? (
        <Loading />
      ) : report.error ? (
        <ErrorNotice error={report.error} retry={report.refresh} />
      ) : (
        report.data && (
          <>
            <Notice>{text(report.data.definition)}</Notice>
            <Facts
              entries={[
                ["Cohort count", report.data.denominator],
                ["Timezone", report.data.timezone],
                ["Verified outcome count", report.data.verifiedOutcomeCount],
                ["Verification coverage", report.data.verificationCoverage],
              ]}
            />
            {saved.error ? <ErrorNotice error={saved.error} retry={saved.refresh} /> : saved.data && <WorkSavedReport value={saved.data} />}
            {report.data.effort && <EffortReport value={report.data.effort as unknown as EffortReportData} />}
            {report.data.sla && <SlaReport value={report.data.sla as unknown as Parameters<typeof SlaReport>[0]["value"]} />}
            {report.data.resolutions && <ResolutionReport value={report.data.resolutions as unknown as ResolutionCounts} />}
            <Evidence
              value={report.data.rows}
              title="Underlying records and elapsed ages"
            />
          </>
        )
      )}
    </>
  );
}

interface ResolutionCounts { definition: string; denominator: number; counts: { code: string | null; count: number }[] }
/** REPORT-001 with DESK-010: closed tickets counted by the resolution code recorded at close. */
function ResolutionReport({ value }: { value: ResolutionCounts }) {
  return <section aria-label="Resolutions by code">
    <h3>Resolutions by code</h3>
    <p>{value.definition} Closed tickets: {value.denominator}.</p>
    <div style={{ overflowX: "auto" }}><table>
      <thead><tr><th scope="col">Resolution code</th><th scope="col">Tickets</th></tr></thead>
      <tbody>{value.counts.map((c) => <tr key={c.code ?? ""}><th scope="row">{c.code ?? "No code recorded"}</th><td>{c.count}</td></tr>)}</tbody>
    </table></div>
  </section>;
}
