import { Icon } from "./icons";
import { useRemote, useSession } from "./state";
import { isOpen, useQueue } from "./queue";
import type { DomainRecord } from "./decisions";

/** Sections the Settings item stands for; Settings opens on Connections & setup. */
export const settingsSections = [
  ["connections", "Connections & setup"],
  ["members", "People & permissions"],
  ["grants", "Standing authority"],
  ["operations", "Effects & takeover"],
  ["plans", "Execution plans"],
  ["notifications", "Delivery & notifications"],
  ["imports", "Existing desk & backups"],
] as const;

const operatorRoles = ["owner", "operator", "hr", "auditor"];

/** The slim labelled rail of the app pick: every screen Linen has, by the name its rail uses. */
export function RailNav({ section }: { section: string }) {
  const { session } = useSession(),
    operator = session.principal.roles.some((r) => operatorRoles.includes(r)),
    queue = useQueue(),
    decisions = useRemote<{ items: DomainRecord[] }>("/decisions", 60000);
  const open = queue.data?.items.filter(isOpen).length,
    choices = decisions.data?.items.filter((d) => d.data.state === "needs-decision").length;
  const items: [string, string, string, number | undefined, boolean][] = [
    ["work", "Requests", "inbox", open, true],
    ["decisions", "Decisions", "approve", choices, true],
    ["lifecycle", "People", "user", undefined, operator],
    ["assets", "Devices", "laptop", undefined, operator],
    ["software-assets", "Software", "cube", undefined, operator],
    ["incidents", "Incidents", "alert", undefined, true],
    ["changes", "Changes", "swap", undefined, operator],
    ["knowledge", "Knowledge", "book", undefined, true],
    ["reports", "Reports", "chart", undefined, operator],
    ["connections", "Settings", "gear", undefined, operator],
  ];
  const current = settingsSections.some(([key]) => key === section) ? "connections" : section;
  const more: [string, string, boolean][] = [
    ["services", "Service ownership", true],
    ["commitments", "Continuing commitments", true],
    ["suppliers", "Suppliers & handoffs", operator],
    ["problems", "Causes & prevention", operator],
    ["research", "Research & evidence", operator],
    ["engineering", "Engineering & adoption", operator],
    ["capabilities", "Verified reusable repairs", operator],
    ["simplifications", "Service simplification", operator],
  ];
  return (
    <nav className="rail" aria-label="Main navigation">
      <ul>
        {items.filter(([, , , , shown]) => shown).map(([key, label, icon, count], index) => (
          <li key={key}>
            <a href={`#/${key}`} className={current === key ? "active" : ""} aria-current={current === key ? "page" : undefined}>
              <Icon name={icon} size={20} />
              <span>{label}</span>
              {Boolean(count) && <span className={`rail-count ${index === 0 ? "strong" : ""}`}>{count}</span>}
            </a>
          </li>
        ))}
      </ul>
      <details className="rail-more" open={more.some(([key]) => key === section) || undefined}>
        <summary>More</summary>
        <ul>
          {more.filter(([, , shown]) => shown).map(([key, label]) => (
            <li key={key}>
              <a href={`#/${key}`} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined}>{label}</a>
            </li>
          ))}
        </ul>
      </details>
    </nav>
  );
}

/** Settings pages share one sub-navigation under their heading. */
export function SettingsTabs({ section }: { section: string }) {
  return (
    <nav className="tabs" aria-label="Settings">
      {settingsSections.map(([key, label]) => (
          <a key={key} href={`#/${key}`} className={section === key ? "active" : ""} aria-current={section === key ? "page" : undefined}>
            {label}
        </a>
      ))}
    </nav>
  );
}
