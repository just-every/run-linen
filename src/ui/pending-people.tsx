import { ActionForm, type Field } from "./forms";
import { useRemote } from "./state";
import { Badge, ErrorNotice, Facts, Loading, Notice } from "./primitives";

export interface PendingPerson {
  id: string; name: string; email: string; start_date: string; team: string;
  state: "pending" | "bound" | "withdrawn"; revision: number; member_id: string | null;
}
export interface HeldService { catalog_id: string; name: string; kind: string; state: string; reason: string | null; }

function personFields(person?: PendingPerson): Field[] {
  return [
    { name: "name", label: "Name", required: true, value: person?.name },
    { name: "email", label: "Work email", type: "email", required: true, value: person?.email },
    { name: "startDate", label: "Start date", type: "date", required: true, value: person?.start_date },
    { name: "team", label: "Team", required: true, value: person?.team },
    { name: "reviewed", label: "I have checked this person’s details.", type: "checkbox", required: true },
  ];
}

export function PendingPeople() {
  const people = useRemote<{ items: PendingPerson[] }>("/pending-people", 10000);
  return (
    <section className="pending-people" aria-label="People waiting for an account">
      <h2>People waiting for an account</h2>
      <p>Prepare a new hire’s services before they can sign in. Services wait until the person signs in with the work email you reviewed.</p>
      <ActionForm title="Add a person without an account" path="/pending-people"
        fields={personFields()} submit="Add person" onSaved={people.refresh}
        explanation="Check the name, work email, start date and team. Adding a person does not create an account or give them access." />
      {people.loading && <Loading label="Reading people…" />}
      <ErrorNotice error={people.error} retry={people.refresh} />
      <ErrorNotice error={people.backgroundError} />
      {people.data?.items.map(person => (
        <section className="connection-record" key={person.id} aria-label={person.name}>
          <div className="section-heading"><h3>{person.name}</h3><Badge value={person.state === "pending" ? "Waiting for account" : person.state === "bound" ? "Account linked" : "Withdrawn"} /></div>
          <Facts entries={[["Work email", person.email], ["Start date", person.start_date], ["Team", person.team]]} />
          {person.state === "pending" ? <>
            <a className="action secondary small" href={`#/work?pending=${encodeURIComponent(person.id)}`}>Request services for {person.name}</a>
            <ActionForm key={`edit:${person.id}:${person.revision}`} title="Edit this person"
              path={`/pending-people/${person.id}/edit`} defaults={{ expectedRevision: person.revision }}
              fields={personFields(person)} submit="Save person" onSaved={people.refresh}
              explanation="Check the details again before saving. Services will wait for sign-in with this email." />
            <ActionForm key={`withdraw:${person.id}:${person.revision}`} title="Withdraw this person"
              path={`/pending-people/${person.id}/withdraw`} defaults={{ expectedRevision: person.revision }}
              fields={[{ name: "reason", label: "Why is this person no longer starting?", type: "textarea", required: true }]}
              submit="Withdraw person and cancel requests" onSaved={people.refresh}
              explanation="This cancels their waiting requests and services. This is available only before an account is linked." />
          </> : <Notice>{person.state === "bound" ? "Their account is linked. Open their requests to see each service’s current state." : "This person was withdrawn. Their waiting requests and services were cancelled."}</Notice>}
        </section>
      ))}
    </section>
  );
}

export function HeldServices({ person, services }: { person?: PendingPerson | null; services?: HeldService[] }) {
  if (!person) return null;
  const waiting = person.state === "pending";
  return <section className="pending-services" aria-label="Services for this person">
    <h2>{waiting ? "Services waiting for an account" : person.state === "withdrawn" ? "Waiting services cancelled" : "Account linked"}</h2>
    <Notice>{waiting ? `${person.name} has no account yet. These services are held until they sign in with ${person.email}.` : person.state === "withdrawn" ? `${person.name} was withdrawn. This request and its waiting services are cancelled.` : `${person.name} signed in with their reviewed email. Each service below shows whether it has entered the usual approval, availability and fulfilment steps.`}</Notice>
    {services?.map(service => <div className="connection-record" key={service.catalog_id}>
      <div className="section-heading"><h3>{service.name}</h3><Badge value={service.state} /></div>
      {service.reason && <p>{service.reason}</p>}
    </div>)}
    {waiting && <a href="#/lifecycle">Edit or withdraw this person in People →</a>}
  </section>;
}
