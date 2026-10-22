import { date, text, humanize, type RecordValue } from "./api";
import { useRemote, useSession } from "./state";
import { ActionForm, type Field } from "./forms";
import { Badge, Facts, Notice } from "./primitives";

const kinds = [{ value: "join", label: "Joining the team" }, { value: "move", label: "Moving role or location" }, { value: "leave", label: "Leaving the team" }];
const fields: Field[] = [
  { name: "name", label: "Template name", required: true },
  { name: "kind", label: "Applies to", type: "select", required: true, options: kinds },
  { name: "match", label: "Reviewed values it applies to", type: "json", required: true,
    hint: 'Value ids per dimension: department, location, title (role) and employmentType, for example {"department":["…"],"location":["…"]}. A value must match in every dimension named; {} applies to everyone.' },
  { name: "tasks", label: "Dated tasks", type: "json", required: true,
    hint: 'A list such as [{"key":"laptop","title":"Order the laptop","assignee":{"type":"group","groupId":"…"},"anchor":"start","offsetDays":-5,"remindDays":2}]. Assignee: a team ({"type":"group","groupId":"…"}), "manager" or "owner". offsetDays are business days from the start or end (negative is before); remindDays are business days before the due date.' },
];
const taskLine = (t: RecordValue) => `${text(t.title)} (${text((t.assignee as RecordValue).type)}, ${Math.abs(Number(t.offsetDays))} business day${Math.abs(Number(t.offsetDays)) === 1 ? "" : "s"} ${Number(t.offsetDays) < 0 ? "before" : "after"} ${text(t.anchor)}${t.remindDays === null || t.remindDays === undefined ? "" : `, reminded ${text(t.remindDays)} before`})`;

/** LIFE-002: owner-managed dated task templates; HR reads them. A recorded change keeps the tasks it was admitted with. */
export function LifecycleTemplates() {
  const templates = useRemote<{ items: RecordValue[] }>("/lifecycle-templates"), { session } = useSession();
  const owner = session.principal.roles.includes("owner");
  return (
    <section aria-label="Task templates">
      <h2>Task templates</h2>
      <p>A join, move or leave gets the tasks of every active template whose department, location, role and employment type match. Tasks are done by a team, the person’s manager or the accountable owner, and each owner is reminded in their own requests.</p>
      {templates.data?.items.map((t) => (
        <section className="connection-record" key={text(t.id)}>
          <div className="section-heading"><h3>{text(t.name)}</h3><Badge value={t.active ? "active" : "inactive"} /></div>
          <Facts entries={[
            ["Applies to", `${humanize(t.kind)} · ${Object.entries(t.match as RecordValue).map(([d, v]) => `${humanize(d)}: ${(v as string[]).length} value(s)`).join(" · ") || "Everyone"}`],
            ["Tasks", (t.tasks as RecordValue[]).map(taskLine).join("; ")],
            ["Revision", t.revision],
          ]} />
          {owner && <ActionForm title={`Edit ${text(t.name)}`} path={`/lifecycle-templates/${text(t.id)}`} defaults={{ revision: t.revision }} onSaved={templates.refresh}
            fields={[
              { ...fields[0], value: text(t.name) }, { ...fields[1], value: text(t.kind) }, { ...fields[2], value: JSON.stringify(t.match) }, { ...fields[3], value: JSON.stringify(t.tasks) },
              { name: "active", label: "Active", type: "checkbox", value: Boolean(t.active) },
            ]} />}
        </section>
      ))}
      {owner && <ActionForm title="Add a task template" path="/lifecycle-templates" fields={fields} onSaved={templates.refresh}
        explanation="Changes are versioned and audited. Reminders reach people in the portal; Slack, Teams and email reminders are not connected." />}
    </section>
  );
}

/** A task as its team or person sees it in a lifecycle record, with the actions they may take. */
export function LifecycleTaskCard({ task, onChanged }: { task: RecordValue; onChanged: () => void }) {
  return (
    <>
      <Facts entries={[["Team", task.group_name ?? "The named person"], ["Due", date(task.due_at)], ["Reminder", task.remind_at ? date(task.remind_at) : "None"], ["Reminded", task.reminded_at ? date(task.reminded_at) : "Not yet"]]} />
      <Notice>A done task is the team’s recorded completion, not independent verification. It grants no access.</Notice>
      {Boolean(task.can_complete) && <ActionForm title="Mark this task done" path={`/lifecycle-tasks/${text(task.id)}/complete`} defaults={{ revision: task.revision }} fields={[]} submit="Mark done" onSaved={onChanged} />}
      {Boolean(task.can_waive) && <ActionForm title="Waive this task" path={`/lifecycle-tasks/${text(task.id)}/waive`} defaults={{ revision: task.revision }} fields={[{ name: "reason", label: "Why is it waived?", required: true }]} submit="Waive" onSaved={onChanged} />}
    </>
  );
}

/** LIFE-002: the reminder request carries the task only its recipient may mark done. */
export function LifecycleTaskReminder({ context, onChanged }: { context: RecordValue; onChanged: () => void }) {
  const mine = useRemote<{ items: RecordValue[] }>("/lifecycle-tasks");
  const task = mine.data?.items.find((t) => t.id === context.taskId);
  return (
    <section className="detail-section" aria-label="Lifecycle task">
      <h3>{text(context.title)} for {text(context.person)}</h3>
      <Facts entries={[["Change", humanize(context.change)], ["Due", date(context.dueAt)]]} />
      {task ? <ActionForm title="Mark this task done" path={`/lifecycle-tasks/${text(task.id)}/complete`} defaults={{ revision: task.revision }} fields={[]} submit="Mark done" onSaved={() => { mine.refresh(); onChanged(); }} />
        : mine.data ? <Notice>This task is done, waived, cancelled or not yours to do.</Notice> : null}
    </section>
  );
}
