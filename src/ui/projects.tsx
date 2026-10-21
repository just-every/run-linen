import { useEffect, useState } from 'react';
import { humanize, text, type RecordValue } from "./api";
import { ActionForm } from "./forms";
import { useMutation, useRemote, useSession } from "./state";
import { Badge, Empty, ErrorNotice, Hero, Loading } from "./primitives";

import { ActivityTimeline } from './work-activity';
import type { ActivityEntry } from '../features/work/activity';

interface Task { id: string; title: string; milestone_id: string | null; owner_name: string | null; due_date: string; status: string; revision: number; dependsOn: string[]; dependency: { state: string; blockedBy: string[] }; overdue: boolean }
interface ProjectView {
  project: { id: string; name: string; description: string; status: string };
  milestones: { id: string; name: string; due_date: string }[];
  tasks: Task[]; board: Record<string, string[]>;
  links: { kind: string; target_id: string; label: string | null; detail: string }[];
  definition: string;
}
const statuses = ["todo", "in_progress", "blocked", "done"];
const linkHref: Record<string, string> = { ticket: "#/work/", change: "#/changes/", asset: "#/assets/", lifecycle: "#/lifecycle/" };

/** PROJECT-001: IT team projects as a board and a timeline, with each agent's combined workload. */
export function ProjectsSpace({ selectedId }: { selectedId?: string }) {
  const { session } = useSession(), team = session.principal.roles.some((r) => ["owner", "operator"].includes(r));
  const list = useRemote<{ items: RecordValue[] }>("/projects"), load = useRemote<{ items: RecordValue[] }>("/workload");
  return <>
    <Hero eyebrow="IT team" title="Projects"><p className="lead">Office moves, refreshes and migrations, with dated tasks, dependencies and the records they touch.</p></Hero>
    <ErrorNotice error={list.error} retry={list.refresh} />
    {selectedId ? <Project id={selectedId} team={team} onChanged={() => { list.refresh(); load.refresh(); }} /> : <>
      {list.loading ? <Loading /> : !list.data?.items.length ? <Empty title="No projects yet.">Create one to plan its milestones and tasks.</Empty> :
        <ul className="record-stack">{list.data.items.map((p) => <li key={text(p.id)}><a href={`#/projects/${encodeURIComponent(text(p.id))}`}>{text(p.name)}</a> · <Badge value={p.status} /> · {text(p.done)}/{text(p.tasks)} tasks done</li>)}</ul>}
      {team && <ActionForm title="Create a project" path="/projects" onSaved={(r) => { list.refresh(); window.location.hash = `#/projects/${encodeURIComponent(text((r.project as RecordValue).id))}`; }}
        fields={[{ name: "name", label: "Project name", required: true }, { name: "description", label: "What it changes", type: "textarea" }]} />}
    </>}
    {load.data && <section aria-label="Workload"><h2>Workload</h2>
      <div style={{ overflowX: "auto" }}><table><caption>Open tickets assigned beside open project tasks owned</caption>
        <thead><tr><th scope="col">Agent</th><th scope="col">Open tickets</th><th scope="col">Project tasks</th><th scope="col">Total</th></tr></thead>
        <tbody>{load.data.items.map((r) => <tr key={text(r.userId)}><th scope="row">{text(r.name)}</th><td>{text(r.openTickets)}</td><td>{text(r.openProjectTasks)}</td><td>{text(r.total)}</td></tr>)}</tbody>
      </table></div></section>}
  </>;
}

function Project({ id, team, onChanged }: { id: string; team: boolean; onChanged: () => void }) {
  const view = useRemote<ProjectView>(`/projects/${encodeURIComponent(id)}`), members = useRemote<RecordValue[]>(team ? "/members" : null), mutation = useMutation();
  const templates = useRemote<{ items: { id: string; name: string; draft: { kind: string; title: string; context: Record<string, string> } }[] }>(team ? '/work-templates' : null);
  const [templateId, setTemplateId] = useState('');
  const taskTemplates = (templates.data?.items ?? []).filter(t => t.draft.kind === 'task');
  const draft = taskTemplates.find(t => t.id === templateId)?.draft;
  const data = view.data;
  if (view.loading) return <Loading />;
  if (view.error || !data) return <ErrorNotice error={view.error} retry={view.refresh} />;
  const byId = new Map(data.tasks.map((t) => [t.id, t])), changed = () => { view.refresh(); onChanged(); };
  const agents = (members.data ?? []).filter((m) => /owner|operator/.test(text(m.roles_json)));
  async function setStatus(task: Task, status: string) {
    if (await mutation.mutate(`/projects/${id}/tasks/${task.id}`, { revision: task.revision, status })) changed();
  }
  return <section aria-label={data.project.name}>
    <h2>{data.project.name} <Badge value={data.project.status} /></h2>
    {data.project.description && <p>{data.project.description}</p>}
    <ErrorNotice error={mutation.error} />
    <h3>Board</h3>
    <div className="field-grid">{statuses.map((s) => <div key={s}><h4>{humanize(s)} ({data.board[s]?.length ?? 0})</h4>
      <ul>{(data.board[s] ?? []).map((taskId) => <li key={taskId}>{byId.get(taskId)?.title}</li>)}</ul></div>)}</div>
    <h3>Timeline</h3>
    <p>{data.definition}</p>
    {[...data.milestones, { id: "", name: "No milestone", due_date: "" }].map((m) => {
      const tasks = data.tasks.filter((t) => (t.milestone_id ?? "") === m.id);
      if (!tasks.length && !m.id) return null;
      return <div key={m.id || "none"} style={{ overflowX: "auto" }}><table><caption>{m.name}{m.due_date && ` · due ${m.due_date}`}</caption>
        <thead><tr><th scope="col">Due</th><th scope="col">Task</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Dependencies</th></tr></thead>
        <tbody>{tasks.map((t) => <tr key={t.id}>
          <td>{t.due_date}{t.overdue && " · overdue"}</td><th scope="row">{t.title}</th><td>{t.owner_name}</td>
          <td>{team ? <select aria-label={`Status of ${t.title}`} value={t.status} disabled={mutation.pending} onChange={(e) => void setStatus(t, e.target.value)}>{statuses.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</select> : <Badge value={t.status} />}</td>
          <td>{t.dependency.state === "clear" ? "None open" : <><Badge value={t.dependency.state === "blocked" ? "blocked" : "pending"} /> {t.dependency.state === "blocked" ? "Blocked by" : "Waiting on"} {t.dependency.blockedBy.map((d) => byId.get(d)?.title).join(", ")}</>}</td>
        </tr>)}</tbody></table></div>;
    })}
    {!!data.tasks.length && <section aria-label="Project task histories"><h3>Task history</h3>
      <ul className="record-stack">{data.tasks.map(task => <li key={task.id}><TaskActivity projectId={id} task={task} /></li>)}</ul>
    </section>}
    <h3>Linked records ({data.links.length})</h3>
    {["asset", "change", "ticket", "lifecycle"].map((kind) => {
      const links = data.links.filter((l) => l.kind === kind);
      return links.length ? <details key={kind} className="evidence" open={kind !== "asset"}><summary>{humanize(kind)}s · {links.length}</summary>
        <ul>{links.map((l) => <li key={l.target_id}><a href={linkHref[kind] + encodeURIComponent(l.target_id)}>{l.label ?? "Record no longer available"}</a>{l.detail && ` · ${l.detail}`}</li>)}</ul></details> : null;
    })}
    {team && <>
      <ActionForm title="Add a milestone" path={`/projects/${id}/milestones`} onSaved={changed}
        fields={[{ name: "name", label: "Milestone", required: true }, { name: "dueDate", label: "Due date", type: "date", required: true }]} />
      {!!taskTemplates.length && <label>Task record template<select aria-label="Task record template" value={templateId} onChange={e => setTemplateId(e.target.value)}><option value="">No template</option>{taskTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      <ErrorNotice error={templates.error} retry={templates.refresh} />
      <ActionForm key={templateId} title="Add a task" path={`/projects/${id}/tasks`} onSaved={changed}
        fields={[{ name: "title", label: "Task", required: true, value: draft?.title },
          { name: "milestoneId", label: "Milestone", type: "select", options: [{ value: "", label: "No milestone" }, ...data.milestones.map((m) => ({ value: m.id, label: m.name }))] },
          { name: "ownerId", label: "Owner", type: "select", required: true, value: draft?.context.ownerId, options: agents.map((m) => ({ value: text(m.id), label: text(m.name) })) },
          { name: "dueDate", label: "Due date", type: "date", required: true, value: draft?.context.dueDate },
          { name: "dependsOn", label: "Depends on", type: "checkboxes", options: data.tasks.map((t) => ({ value: t.id, label: t.title })) }]} />
      <ActionForm title="Link records" path={`/projects/${id}/links`} onSaved={changed}
        transform={(v) => ({ items: (v.targetIds as string[]).map((targetId) => ({ kind: v.kind, targetId, detail: v.detail })) })}
        fields={[{ name: "kind", label: "Record type", type: "select", required: true, options: ["asset", "change", "ticket", "lifecycle"].map((k) => ({ value: k, label: humanize(k) })) },
          { name: "targetIds", label: "Record IDs (one per line)", type: "list", required: true },
          { name: "detail", label: "Note, such as a relocation from and to", type: "text" }]} />
    </>}
  </section>;
}

/** The same scoped timeline as ticket activity, opened only when the reader asks for a task's evidence. */
function TaskActivity({ projectId, task }: { projectId: string; task: Task }) {
  const [open, setOpen] = useState(false);
  const remote = useRemote<{ items: ActivityEntry[] }>(open ? `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(task.id)}/activity` : null);
  useEffect(() => { if (open) remote.refresh(); }, [task.revision]);
  return <details className="evidence" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>History: {task.title}</summary>
    {open && <><ErrorNotice error={remote.error} retry={remote.refresh} />
      {remote.data ? remote.data.items.length ? <ActivityTimeline entries={remote.data.items} label={`Task activity: ${task.title}`} /> :
        <p>No recorded changes. Earlier history is not reconstructed from the current task.</p> : !remote.error && <Loading />}</>}
  </details>;
}
