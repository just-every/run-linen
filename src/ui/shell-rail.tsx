import { useEffect, useRef, useState } from "react";
import { recordedEvent, request } from "./api";
import { Icon } from "./icons";
import { useSession } from "./state";
import { isOpen, useQueue } from "./queue";
import type { DomainRecord } from "./decisions";
import type { FulfilmentDecision } from "./fulfilment-decisions";

/** Sections the Settings item stands for; Settings opens on Connections & setup. */
export const settingsSections = [
  ["connections", "Connections & setup"],
  ["sandboxes", "Configuration sandboxes"],
  ["billing", "Pricing & budgets"],
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
    [waiting, setWaiting] = useState<number>(),
    [recorded, setRecorded] = useState(0);
  const open = queue.data?.items.filter(isOpen).length;
  // What waits on this person in Decisions: the business choices, and the catalog approvals they hold. Read again
  // on each screen change, queue refresh and accepted write, so a recorded choice, approval or request moves the count.
  useEffect(() => {
    const bump = () => setRecorded((n) => n + 1);
    window.addEventListener(recordedEvent, bump);
    return () => window.removeEventListener(recordedEvent, bump);
  }, []);
  useEffect(() => {
    const controller = new AbortController(), signal = controller.signal;
    Promise.all([
      request<{ items: DomainRecord[] }>("/decisions", { signal }),
      request<{ items: FulfilmentDecision[] }>("/fulfilment-decisions", { signal }),
      request<{items:unknown[]}>("/approval-stages",{signal}),
    ]).then(
      ([choices, approvals, stages]) => setWaiting(choices.items.filter((d) => d.data.state === "needs-decision").length + approvals.items.length + stages.items.length),
      () => signal.aborted || setWaiting(undefined),
    );
    return () => controller.abort();
  }, [section, queue.data, recorded]);
  const items: [string, string, string, number | undefined, boolean][] = [
    ["work", "Requests", "inbox", open, true],
    ["decisions", "Decisions", "approve", waiting, true],
    ["lifecycle", "People", "user", undefined, operator],
    ["assets", "Devices", "laptop", undefined, operator],
    ["walkup", "Walk-up desk", "user", undefined, operator],
    ["software-assets", "Software", "cube", undefined, operator],
    ["incidents", "Incidents", "alert", undefined, true],
    ["changes", "Changes", "swap", undefined, operator],
    ["knowledge", "Knowledge", "book", undefined, true],
    ["reports", "Reports", "chart", undefined, operator],
    ["connections", "Settings", "gear", undefined, operator],
  ];
  const current = settingsSections.some(([key]) => key === section) ? "connections" : section,
    rail = useRef<HTMLElement>(null);
  // The rail scrolls on its own when the open More list is taller than the screen: keep the current item in view.
  useEffect(() => {
    const nav = rail.current, active = nav?.querySelector<HTMLElement>('a[aria-current="page"]');
    if (!nav || !active || nav.scrollHeight <= nav.clientHeight) return;
    const top = active.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop, bottom = top + active.offsetHeight;
    if (bottom > nav.scrollTop + nav.clientHeight) nav.scrollTop = bottom - nav.clientHeight + 16;
    else if (top < nav.scrollTop) nav.scrollTop = top - 16;
  }, [section]);
  const more: [string, string, boolean][] = [
    ["services", "Service ownership", true],
    ["commitments", "Continuing commitments", true],
    ["suppliers", "Suppliers & handoffs", operator],
    ["problems", "Causes & prevention", operator],
    ["projects", "IT projects", operator],
    ["research", "Research & evidence", operator],
    ["engineering", "Engineering & adoption", operator],
    ["capabilities", "Verified reusable repairs", operator],
    ["simplifications", "Service simplification", operator],
  ];
  return (
    <nav className="rail" aria-label="Main navigation" ref={rail}>
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
      {/* The pick's lower-left papercut, in flow under the last item: it fills only the rail's free corner. */}
      <div className="rail-foliage" aria-hidden="true">
        <div className="rail-foliage-art" />
      </div>
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
