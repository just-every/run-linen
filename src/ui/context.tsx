import { BillingSettings } from './settings';
import { SearchSpace } from './search';
import { AdoptionSpace } from "./adoption";
import { Hero, Empty } from "./primitives";
import { Connections } from "./connections";
import { SettingsTabs, settingsSections } from "./shell-rail";
import { LifecycleSpace, AssetsSpace } from "./lifecycle";
import { ServiceSpace } from "./service-space";
import { IntelligenceSpace } from "./intelligence";
import { KnowledgeSpace } from "./knowledge";
import { OperationsSpace, ReportSpace } from "./operations";
import { ProjectsSpace } from "./projects";
import { WalkUpSpace } from "./walkup";
export function ContextSpace({
  section,
  selectedId,
  query,
  parameters,
}: {
  section: string;
  selectedId?: string;
  query: string;
  parameters: string;
}) {
  const serviceSections = [
      "services",
      "incidents",
      "changes",
      "releases",
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
  const settings = settingsSections.some(([key]) => key === section);
  return (
    <>
      {settings && <SettingsTabs section={section} />}
      {section === "connections" ? (
        <Connections />
      ) : (
        <div className="layout layout-full">
          <main>
            {section === "billing" ? (<BillingSettings />) : section === "lifecycle" ? (
              <LifecycleSpace selectedId={selectedId} />
            ) : section === "assets" ? (
              <AssetsSpace selectedId={selectedId} />
            ) : section === "search" ? (
              <SearchSpace query={query} parameters={parameters}/>
            ) : section === "knowledge" ? (
              <KnowledgeSpace key={query} query={query} />
            ) : section === "imports" ? (
              <AdoptionSpace selectedId={selectedId} />
            ) : section === "reports" ? (
              <ReportSpace />
            ) : section === "walkup" ? (
              <WalkUpSpace />
            ) : section === "projects" ? (
              <ProjectsSpace selectedId={selectedId} />
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
        </div>
      )}
    </>
  );
}
