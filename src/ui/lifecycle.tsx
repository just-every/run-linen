import { useState } from "react";
import { usePeopleLabels } from "./people-labels";
import { date, text, humanize, type RecordValue } from "./api";
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
import { PendingPeople } from "./pending-people";
export function LifecycleSpace({ selectedId }: { selectedId?: string }) {
  const [reviewPersonId, setReviewPersonId] = useState('');
  const personName = usePeopleLabels();
  const list = useRemote<{ items: RecordValue[] }>("/lifecycle"),
    people = useRemote<{ items: RecordValue[] }>("/people"),
    members = useRemote<RecordValue[]>("/members"),
    detail = useRemote<{ lifecycle: RecordValue; obligations: RecordValue[] }>(
      selectedId ? `/lifecycle/${selectedId}` : null,
    ),
    { session } = useSession();
  const reviewedPerson = people.data?.items.find(p => p.id === reviewPersonId);
  const fields: Field[] = [
    {
      name: "personId",
      label: "Person",
      type: "select",
      required: true,
      options: people.data?.items.map((p) => ({
        value: text(p.id),
        label: text(p.name),
      })),
    },
    {
      name: "kind",
      label: "What is changing?",
      type: "select",
      required: true,
      options: [
        { value: "join", label: "Joining the team" },
        { value: "move", label: "Moving role or location" },
        { value: "leave", label: "Leaving the team" },
      ],
    },
    {
      name: "effectiveAt",
      label: "Effective date and time",
      type: "datetime-local",
      required: true,
      hint: "Stored as an exact instant, using this browser’s local timezone.",
    },
    {
      name: "timezone",
      label: "Employment timezone",
      value: Intl.DateTimeFormat().resolvedOptions().timeZone,
      required: true,
    },
    {
      name: "source",
      label: "Authoritative HR source",
      required: true,
      hint: "Use the actual system or record that establishes this employment change.",
    },
    {
      name: "sourceRevision",
      label: "HR source revision",
      type: "number",
      required: true,
    },
    {
      name: "ownerId",
      label: "Accountable owner",
      type: "select",
      required: true,
      options: members.data?.map((p) => ({
        value: text(p.id),
        label: text(p.name),
      })),
    },
    {
      name: "retained",
      label: "Access that remains valid",
      type: "list",
      hint: "One entitlement identifier per line.",
    },
    { name: "added", label: "Access to add", type: "list" },
    { name: "removed", label: "Access to remove", type: "list" },
    {
      name: "deviceIds",
      label: "Devices needing delivery or return",
      type: "list",
      hint: "Existing device identifiers, one per line.",
    },
    { name: "identityTarget", label: "Immutable provider account or UPN", hint: "Required to bind identity duties to the selected provider account." },
    { name: "expiresAt", label: "Contractor access expires", type: "datetime-local" },
    { name: "urgent", label: "Urgent departure", type: "checkbox" },
  ];
  return (
    <>
      <Hero eyebrow={selectedId ? "People" : "Joining, moving and leaving"} title={selectedId ? "Every obligation stays in view." : "People"}>
        <p className="lead">
          {!selectedId && "A good start. A careful handover. "}Joining, moving and leaving have different responsibilities. Access
          and physical custody remain separate.
        </p>
      </Hero>
      <ErrorNotice error={people.error} />
      {selectedId ? (
        detail.loading ? (
          <Loading />
        ) : detail.error ? (
          <ErrorNotice error={detail.error} retry={detail.refresh} />
        ) : detail.data?.lifecycle ? (
          <>
            <Facts
              entries={[
                ["Change", humanize(detail.data.lifecycle.kind)],
                ["Effective", date(detail.data.lifecycle.effective_at)],
                ["Timezone", detail.data.lifecycle.timezone],
                ["Source", detail.data.lifecycle.source],
              ]}
            />
            <a href={`#/work/${text(detail.data.lifecycle.work_id)}`}>
              Open the same conversation →
            </a>
            <p><a href={`/api/v1/lifecycle/${encodeURIComponent(selectedId)}/evidence`} download>
              Download lifecycle evidence (JSON)
            </a></p>
            <h2>Outstanding and completed responsibilities</h2>
            {detail.data.obligations.map((o) => (
              <section className="connection-record" key={text(o.id)}>
                <div className="section-heading">
                  <h3>{humanize(o.kind)}</h3>
                  <Badge value={o.state} />
                </div>
                <Facts
                  entries={[
                    ["Accountable owner", personName(o.owner_id)],
                    ["Due", date(o.due_at)],
                    ["Target", o.target],
                    ["What remains", o.last_error],
                  ]}
                />
                {String(o.kind).startsWith("device.") && (
                  <ActionForm
                    title="Record the physical handoff"
                    path={`/obligations/${text(o.id)}/physical`}
                    defaults={{ revision: o.revision }}
                    fields={[
                      {
                        name: "custodyEventId",
                        label: "Recorded receipt or return identity",
                        required: true,
                        hint: "Use the actual custody event created when the device was received or returned.",
                      },
                    ]}
                    explanation="Record only the handoff that actually happened. An imported assignment is not a receipt or return."
                    onSaved={detail.refresh}
                  />
                )}
                {o.kind === "sessions.revoke" && o.state === "verified" && <Notice>Existing sessions were invalidated. Cancellation cannot restore those sessions; a later sign-in needs its own valid access.</Notice>}
                {!String(o.kind).startsWith("device.") && !o.operation_id && session.principal.roles.includes("owner") && <ActionForm
                  title="Bind the reviewed security action" path={`/obligations/${text(o.id)}/execution`}
                  fields={[{name:"step",label:"Exact action, provider account and current grant",type:"json",required:true}]}
                  transform={values => values.step as RecordValue}
                  explanation="Use the independently issued grant for this exact duty. Current authority is checked again before any effect."
                  onSaved={detail.refresh} />}
                <Evidence value={o} />
              </section>
            ))}
            <ActionForm
              title="Change the effective date"
              path={`/lifecycle/${selectedId}/amend`}
              defaults={{ revision: detail.data.lifecycle.revision }}
              fields={[
                {
                  name: "effectiveAt",
                  label: "New effective date and time",
                  type: "datetime-local",
                  required: true,
                },
              ]}
              explanation="Existing effects are reconciled before replacement. Changing a date does not erase work already performed."
              onSaved={detail.refresh}
            />
            <ActionForm
              title="Cancel this lifecycle change"
              path={`/lifecycle/${selectedId}/amend`}
              defaults={{
                revision: detail.data.lifecycle.revision,
                cancel: true,
              }}
              fields={[]}
              submit="Record cancellation"
              explanation="Unstarted work can be cancelled. Existing or unknown effects remain accountable."
              onSaved={detail.refresh}
            />
          </>
        ) : (
          <Empty title="This lifecycle record is not available.">
            Return to the list or check your access.
          </Empty>
        )
      ) : (
        <>
          <PendingPeople />
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <ErrorNotice error={list.error} retry={list.refresh} />
          ) : list.data?.items.length ? (
            <div className="record-list">
              {list.data.items.map((r) => (
                <a
                  className="record-row"
                  href={`#/lifecycle/${text(r.id)}`}
                  key={text(r.id)}
                >
                  <span className="event-icon">
                    <Icon name="user" />
                  </span>
                  <span>
                    <strong>
                      {humanize(r.kind)} ·{" "}
                      {text(
                        people.data?.items.find((p) => p.id === r.person_id)
                          ?.name,
                        r.person_id as string,
                      )}
                    </strong>
                    <small>
                      {date(r.effective_at)} · {text(r.timezone)}
                    </small>
                  </span>
                  <Icon name="arrow" />
                </a>
              ))}
            </div>
          ) : (
            <Empty title="No lifecycle changes yet.">
              Authoritative HR facts start these journeys. A suggestive message
              never establishes a hire or departure.
            </Empty>
          )}
          <ActionForm
            title="Record an authoritative HR change"
            path="/lifecycle"
            fields={fields}
            defaults={{ retained: [], added: [], removed: [], deviceIds: [] }}
            onSaved={(result) => {
              list.refresh();
              location.hash = `/lifecycle/${result.lifecycleId}`;
            }}
            explanation="Use actual HR source facts. Each selected access or custody duty is retained independently; nothing here claims provider completion."
          />
          <label>Person to review<select value={reviewPersonId} onChange={e => setReviewPersonId(e.target.value)}>
            <option value="">Choose a person</option>
            {people.data?.items.map(p => <option key={text(p.id)} value={text(p.id)}>{text(p.name)} · {text(p.id)} · revision {text(p.revision)} · {p.member_id ? `member ${text(p.member_id)}` : 'Unbound: review required'}</option>)}
          </select></label>
          {reviewedPerson && <ActionForm
            key={`${reviewPersonId}:${reviewedPerson.revision}`}
            title="Review a person’s member binding"
            path={`/people/${reviewPersonId}/binding`}
            defaults={{expectedRevision: reviewedPerson.revision}}
            transform={values => ({...values, memberId:values.memberId || null, managerId:values.managerId || null})}
            fields={[
              { name: 'memberId', label: 'Member account (empty unbinds)', type: 'select', value:text(reviewedPerson.member_id), options:members.data?.filter(m => m.active).map(m => ({value:text(m.id),label:text(m.name)+' · '+text(m.email)})) },
              { name: 'managerId', label: 'Manager member (empty clears)', type: 'select', value:text(reviewedPerson.manager_id), options:members.data?.filter(m => m.active).map(m => ({value:text(m.id),label:text(m.name)+' · '+text(m.email)})) },
            ]}
            onSaved={people.refresh}
            explanation="Review the current account and manager for this person. A reviewed account link enables manager routing; source identity and names never grant authority."
          />}
          <ActionForm
            title="Register a person from an authoritative source"
            path="/people"
            fields={[
              { name: "name", label: "Person’s name", required: true },
              { name: "source", label: "Source system", required: true },
              {
                name: "sourceId",
                label: "Stable source identity",
                required: true,
              },
              {
                name: "effectiveAt",
                label: "Fact effective time",
                type: "datetime-local",
                required: true,
              },
              {
                name: "observedAt",
                label: "Source observed time",
                type: "datetime-local",
                required: true,
              },
              { name: "managerId", label: "Manager member ID" },
            ]}
            onSaved={people.refresh}
          />
        </>
      )}
    </>
  );
}
export function AssetsSpace() {
  const [custody, setCustody] = useState<string | null>(null);
  const list = useRemote<{ items: RecordValue[] }>("/assets"),
    people = useRemote<{ items: RecordValue[] }>("/people");
  return (
    <>
      <Hero eyebrow="Devices & custody" title="Devices">
        <p className="lead">
          Know where things stand. A device record is not a handoff. Keep source identity, actual receipt
          and remaining responsibility distinct.
        </p>
      </Hero>
      {custody && (
        <Notice>
          Custody event recorded: <code>{custody}</code>. Use this actual
          receipt or return identity for the matching lifecycle duty.
        </Notice>
      )}
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorNotice error={list.error} retry={list.refresh} />
      ) : list.data?.items.length ? (
        list.data.items.map((asset) => (
          <section className="connection-record" key={text(asset.id)}>
            <div className="section-heading">
              <h2>{text(asset.serial)}</h2>
              <Badge value={asset.state} />
            </div>
            <Facts
              entries={[
                [
                  "Person",
                  people.data?.items.find((p) => p.id === asset.person_id)
                    ?.name ?? asset.person_id,
                ],
                ["Location", asset.location],
                ["Source", asset.source],
                ["Last observed", date(asset.observed_at)],
              ]}
            />
            <ActionForm
              title="Record a custody change"
              path={`/assets/${text(asset.id)}/commands`}
              defaults={{ revision: asset.revision }}
              fields={[
                {
                  name: "command",
                  label: "What happened?",
                  type: "select",
                  required: true,
                  options: [
                    "reserve",
                    "assign",
                    "receive",
                    "return",
                    "repair",
                    "dispose",
                    "missing",
                  ].map((value) => ({ value, label: humanize(value) })),
                },
                {
                  name: "personId",
                  label: "Person",
                  type: "select",
                  options: people.data?.items.map((p) => ({
                    value: text(p.id),
                    label: text(p.name),
                  })),
                },
                { name: "location", label: "Location" },
                {
                  name: "evidence",
                  label: "Actual evidence and source",
                  type: "textarea",
                  required: true,
                },
              ]}
              onSaved={(result) => {
                setCustody(text(result.custodyEventId));
                list.refresh();
              }}
            />
            <Evidence value={asset} />
          </section>
        ))
      ) : (
        <Empty title="No devices recorded.">
          Add a real device source; do not infer custody from an imported
          assignment.
        </Empty>
      )}
      <ActionForm
        title="Record a device"
        path="/assets"
        fields={[
          { name: "serial", label: "Unique serial number", required: true },
          {
            name: "source",
            label: "Authoritative device source",
            required: true,
          },
          { name: "location", label: "Current location" },
        ]}
        onSaved={list.refresh}
      />
    </>
  );
}
