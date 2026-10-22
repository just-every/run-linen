import { date, text, humanize, type RecordValue } from "./api";
import { useRemote, useSession } from "./state";
import { ActionForm } from "./forms";
import { Badge, ErrorNotice, Facts, Notice } from "./primitives";

import type { Template } from '../features/work/lifecycle-templates';
import { LifecycleTemplateEditor, templateDimensions, type TemplateTeam, type TemplateValue } from './lifecycle-template-editor';

/** LIFE-002: owner-managed dated task templates; HR reads them. A recorded change keeps the tasks it was admitted with. */
export function LifecycleTemplates() {
  const templates = useRemote<{ items: Template[] }>("/lifecycle-templates"), { session } = useSession();
  const owner = session.principal.roles.includes("owner");
  const values = useRemote<{ items: TemplateValue[] }>('/catalog-values'), groups = useRemote<{ items: TemplateTeam[] }>('/work-groups');
  const taskLine = (task: Template['tasks'][number]) => {
    const assignee = task.assignee;
    const responsible = assignee.type === 'group' ? groups.data?.items.find(group => group.id === assignee.groupId)?.name ?? 'Unavailable team'
      : assignee.type === 'manager' ? 'The person’s manager' : 'The accountable owner';
    return `${task.title} (${responsible}, ${Math.abs(task.offsetDays)} business days ${task.offsetDays < 0 ? 'before' : 'after'} ${task.anchor}${task.remindDays === null ? '' : `, reminded ${task.remindDays} business days before`})`;
  };
  return (
    <section aria-label="Task templates">
      <h2>Task templates</h2>
      <p>A join, move or leave gets the tasks of every active template whose department, location, role and employment type match. Tasks are done by a team, the person’s manager or the accountable owner, and each owner is reminded in their own requests.</p>
      <ErrorNotice error={templates.error} retry={templates.refresh} />
      <ErrorNotice error={values.error} retry={values.refresh} />
      <ErrorNotice error={groups.error} retry={groups.refresh} />
      {templates.data?.items.map((t) => (
        <section className="connection-record" key={text(t.id)}>
          <div className="section-heading"><h3>{text(t.name)}</h3><Badge value={t.active ? "active" : "inactive"} /></div>
          <Facts entries={[
            ["Applies to", `${humanize(t.kind)} · ${templateDimensions.filter(([dimension]) => t.match[dimension]?.length).map(([dimension, label]) => `${label}: ${t.match[dimension]!.map(id => values.data?.items.find(value => value.id === id)?.label ?? 'Unavailable reviewed value').join(', ')}`).join(' · ') || 'Everyone'}`],
            ["Tasks", t.tasks.map(taskLine).join("; ")],
            ["Revision", t.revision],
          ]} />
          {owner && values.data && groups.data && <LifecycleTemplateEditor key={`${t.id}:${t.revision}`} template={t} values={values.data.items} groups={groups.data.items} onSaved={templates.refresh} />}
        </section>
      ))}
      {owner && values.data && groups.data && <LifecycleTemplateEditor values={values.data.items} groups={groups.data.items} onSaved={templates.refresh} />}
    </section>
  );
}

/** A task as its team or person sees it in a lifecycle record, with the actions they may take. */
export function LifecycleTaskCard({ task, onChanged }: { task: RecordValue; onChanged: () => void }) {
  return (
    <>
      <Facts entries={[["Team", task.group_name ?? "The named person"], ["Due", date(task.due_at)], ["Reminder", task.remind_at ? date(task.remind_at) : "None"], ["Reminded", task.reminded_at ? date(task.reminded_at) : "Not yet"], ["What remains", task.last_error]]} />
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
      <ErrorNotice error={mine.error} retry={mine.refresh} />
      {task && <>
        <h3>{text(task.title)} for {text(task.person)}</h3>
        <Facts entries={[["Change", humanize(task.change)], ["Effective", date(task.effectiveAt)], ["Due", date(task.dueAt)]]} />
      </>}
      {task ? <ActionForm title="Mark this task done" path={`/lifecycle-tasks/${text(task.id)}/complete`} defaults={{ revision: task.revision }} fields={[]} submit="Mark done" onSaved={() => { mine.refresh(); onChanged(); }} />
        : mine.data ? <Notice>This task is done, waived, cancelled or not yours to do.</Notice> : null}
    </section>
  );
}
