import { text, humanize, type RecordValue } from "./api";
import { useRemote, useSession } from "./state";
import { ActionForm, type Field } from "./forms";
import { Badge, Facts } from "./primitives";

const fields: Field[] = [
  { name: "name", label: "Policy name", required: true },
  { name: "match", label: "Reviewed values it applies to", type: "json", required: true,
    hint: 'Value ids per dimension, for example {"department":["…"],"employmentType":["…"]}. A value must match in every dimension named; {} applies to everyone.' },
  { name: "grants", label: "Baseline entitlements", type: "json", required: true,
    hint: 'A list such as [{"kind":"group","target":"provider group id"}]. Kinds: group, app, license.' },
];

/** LIFE-003: owner-managed birthright baselines; HR reads them to review a join or move. */
export function AccessPolicies() {
  const policies = useRemote<{ items: RecordValue[] }>("/access-policies"), { session } = useSession();
  const owner = session.principal.roles.includes("owner");
  return (
    <section aria-label="Access baselines">
      <h2>Access baselines</h2>
      <p>A join grants the baseline for the person’s reviewed department, title, location and employment type. A move compares the baseline before and after.</p>
      {policies.data?.items.map((p) => (
        <section className="connection-record" key={text(p.id)}>
          <div className="section-heading"><h3>{text(p.name)}</h3><Badge value={p.active ? "active" : "inactive"} /></div>
          <Facts entries={[
            ["Applies to", Object.entries(p.match as RecordValue).map(([d, v]) => `${humanize(d)}: ${(v as string[]).length} value(s)`).join(" · ") || "Everyone"],
            ["Grants", (p.grants as RecordValue[]).map((g) => `${text(g.kind)} ${text(g.target)}`).join(", ")],
            ["Revision", p.revision],
          ]} />
          {owner && <ActionForm title={`Edit ${text(p.name)}`} path={`/access-policies/${text(p.id)}`} defaults={{ revision: p.revision }} onSaved={policies.refresh}
            fields={[
              { ...fields[0], value: text(p.name) }, { ...fields[1], value: JSON.stringify(p.match) }, { ...fields[2], value: JSON.stringify(p.grants) },
              { name: "active", label: "Active", type: "checkbox", value: Boolean(p.active) },
            ]} />}
        </section>
      ))}
      {owner && <ActionForm title="Add an access baseline" path="/access-policies" fields={fields} onSaved={policies.refresh}
        explanation="Changes are versioned and audited. A recorded join or move keeps the baseline it was reviewed against." />}
    </section>
  );
}
