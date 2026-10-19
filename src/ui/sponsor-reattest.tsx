import { text, type RecordValue } from "./api";
import { ActionForm } from "./forms";
import { Facts, Notice } from "./primitives";
import { useRemote, useSession } from "./state";

/** LIFE-006: the reminder request carries the decision only its recipient may take. */
export function SponsorReattest({ context, onChanged }: { context: RecordValue; onChanged: () => void }) {
  const { session } = useSession(),
    owner = session.principal.roles.includes("owner"),
    members = useRemote<RecordValue[]>(context.sponsorLeft && owner ? "/members" : null);
  return (
    <section className="detail-section" aria-label="Sponsor re-attestation">
      <h3>Keep {text(context.person)}'s access?</h3>
      {Boolean(context.sponsorLeft) && <Notice>The sponsor is no longer an active member. Reassign a sponsor or re-attest yourself.</Notice>}
      <Facts entries={[["Access ends", text(context.expiresAt)]]} />
      <ActionForm
        title="Re-attest with a later end date"
        path={`/lifecycle/${text(context.lifecycleId)}/reattest`}
        fields={[{ name: "expiresAt", label: "New end date", type: "datetime-local", required: true }]}
        submit="Re-attest"
        explanation="Without re-attestation, access is removed and verified at the end instant."
        onSaved={onChanged}
      />
      {Boolean(context.sponsorLeft) && owner && (
        <ActionForm
          title="Reassign the sponsor"
          path={`/lifecycle/${text(context.lifecycleId)}/sponsor`}
          fields={[{ name: "sponsorId", label: "New sponsor", type: "select", required: true, options: members.data?.filter((m) => m.active).map((m) => ({ value: text(m.id), label: text(m.name) })) }]}
          submit="Reassign"
          explanation="The new sponsor is reminded before the end date and decides from then on."
          onSaved={onChanged}
        />
      )}
    </section>
  );
}
