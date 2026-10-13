import { useSession } from "./state";
import { AdoptionSpace } from "./adoption";
import { Hero, Empty } from "./primitives";
import { Icon } from "./icons";
import { LifecycleSpace, AssetsSpace } from "./lifecycle";
import { ServiceSpace } from "./service-space";
import { IntelligenceSpace } from "./intelligence";
import { KnowledgeSpace } from "./knowledge";
import { OperationsSpace, ReportSpace } from "./operations";
export function ContextSpace({
  section,
  selectedId,
}: {
  section: string;
  selectedId?: string;
}) {
  const { session } = useSession(),
    operator = session.principal.roles.some((r) =>
      ["owner", "operator", "hr", "auditor"].includes(r),
    );
  const serviceSections = [
      "services",
      "incidents",
      "changes",
      "suppliers",
      "problems",
      "software-assets",
    ],
    intelligenceSections = [
      "commitments",
      "research",
      "engineering",
      "capabilities",
      "simplifications",
    ],
    operationSections = [
      "operations",
      "grants",
      "members",
      "plans",
      "notifications",
    ];
  // People & permissions uses the whole frame: members beside the add form, as the settings pick draws it.
  const fullWidth = section === "members";
  return (
    <div className={fullWidth ? "layout layout-full" : "layout"}>
      <main>
        {!selectedId && (
          <a className="back-link" href="#/work">
            <Icon name="back" size={18} />
            Your work
          </a>
        )}
        {section === "lifecycle" ? (
          <LifecycleSpace selectedId={selectedId} />
        ) : section === "assets" ? (
          <AssetsSpace />
        ) : section === "knowledge" ? (
          <KnowledgeSpace />
        ) : section === "imports" ? (
          <AdoptionSpace selectedId={selectedId} />
        ) : section === "reports" ? (
          <ReportSpace />
        ) : serviceSections.includes(section) ? (
          <ServiceSpace section={section} selectedId={selectedId} />
        ) : intelligenceSections.includes(section) ? (
          <IntelligenceSpace section={section} selectedId={selectedId} />
        ) : operationSections.includes(section) ? (
          <OperationsSpace section={section} />
        ) : (
          <>
            <Hero eyebrow="Page unavailable" title="This view is not here." />
            <Empty title="Return to your work.">
              This address has no supported view. Your conversations remain
              available.
            </Empty>
          </>
        )}
      </main>
      {!fullWidth && <aside className="context-rail">
          <section className="rail-section contextual-links">
            <span className="eyebrow">In context</span>
            <h2>The work around the work.</h2>
            <p>
              Open the detail you need. Your conversation remains the place to
              ask, correct and follow the outcome.
            </p>
            <a href="#/services">Service ownership</a>
            <a href="#/incidents">Shared interruptions</a>
            <a href="#/commitments">Continuing commitments</a>
            {operator && (
              <>
                <a href="#/research">Research & evidence</a>
                <a href="#/engineering">Engineering & adoption</a>
                <a href="#/capabilities">Verified reusable repairs</a>
                <a href="#/simplifications">Service simplification</a>
              </>
            )}
          </section>
          {operator && (
            <details className="evidence">
              <summary>Operating context</summary>
              <div className="rail-section">
                <a href="#/plans">Execution plans</a>
                <a href="#/operations">Effects & takeover</a>
                <a href="#/grants">Standing authority</a>
                <a href="#/suppliers">Suppliers & handoffs</a>
                <a href="#/problems">Causes & prevention</a>
                <a href="#/software-assets">Software economics</a>
                <a href="#/notifications">Delivery & notification failures</a>
                <a href="#/reports">Defined service reports</a>
              </div>
            </details>
          )}
      </aside>}
    </div>
  );
}
