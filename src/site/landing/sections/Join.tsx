import { baseline, maya } from '../october'
import { Check, Lines, SectionHead } from '../parts'

const dates = ['Fri Oct 2', 'Mon Oct 5', 'Tue Oct 13', 'Thu Oct 15', 'Fri Oct 16', maya.starts]
type Task = { lane: string; date: number; text: string; note?: string }
// In date order; `date` is the column in `dates`.
const tasks: Task[] = [
  { lane: 'HR', date: 0, text: 'Offer signed' },
  { lane: 'Device', date: 1, text: 'MacBook allocated' },
  { lane: 'Device', date: 2, text: 'Shipped' },
  { lane: 'Manager', date: 3, text: `Buddy assigned · ${maya.buddy}`, note: 'reminded in Slack' },
  { lane: 'Device', date: 4, text: 'Delivered' },
  { lane: 'IT', date: 4, text: `${baseline.length} baseline apps granted` },
  { lane: 'HR', date: 5, text: 'Welcome call booked · 9:30 AM' },
]
const lanes = ['HR', 'Device', 'Manager', 'IT']

const Person = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></svg>
const Building = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h10v17M15 9h4v12M3 21h18M8 7h1M11 7h1M8 10.5h1M11 10.5h1M8 14h1M11 14h1M10 21v-3" /></svg>
const Calendar = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 14h2" /></svg>

/** JOIN: the Rippling new-hire record, and Maya's plan dated back from her first day in four lanes. */
export function Join() {
  return (
    <section className="section join" aria-labelledby="join-title">
      <div className="wrap join-top">
        <SectionHead id="join-title" eyebrow="Join · Fri Oct 2 → Mon Oct 19" title={<Lines parts={['Hired in Rippling.', 'Planned in Linen.']} />}
          lede={`Rippling adds ${maya.name}. Linen dates every task for IT, HR and her manager back from her first day.`} />
        <article className="card hire-card" aria-label="Rippling new hire">
          <h3 className="card-title"><span className="brand-dot" aria-hidden="true" />Rippling · new hire</h3>
          <ul className="icon-rows">
            <li><span className="row-icon"><Person /></span>{maya.name} · {maya.title}</li>
            <li><span className="row-icon"><Building /></span>{maya.team} · {maya.city} · {maya.employment}</li>
            <li><span className="row-icon"><Calendar /></span>Starts {maya.starts} · manager {maya.manager}</li>
          </ul>
        </article>
      </div>
      <div className="wrap join-plan">
        <article className="card plan-card" aria-labelledby="plan-title">
          <header className="plan-head">
            <h3 className="card-title" id="plan-title">{maya.name} · onboarding plan</h3>
            <span className="pill pill-marigold">Day one · {maya.starts}</span>
          </header>
          {/* Wide screens: the dated axis over four lanes. */}
          <div className="plan-grid">
            <div className="plan-axis">
              {dates.map((date, i) => <span key={date} className={i === dates.length - 1 ? 'is-day-one' : undefined}><i />{date}</span>)}
            </div>
            {lanes.map(lane => (
              <div className="plan-lane" key={lane}>
                <span className="lane-label">{lane}</span>
                {tasks.filter(task => task.lane === lane).map(task => (
                  <span key={task.text} className={`task${task.date === 0 ? ' task-first' : task.date === dates.length - 1 ? ' task-last' : ''}`} style={{ gridColumn: task.date + 2 }}>
                    <span className="task-pill"><Check />{task.text}</span>
                    {task.note ? <span className="task-note">{task.note}</span> : null}
                  </span>
                ))}
              </div>
            ))}
          </div>
          {/* Below 900 px: the same plan as one dated list (desk 390 plan). */}
          <ol className="plan-list">
            {tasks.map(task => (
              <li key={task.text} className={task.date === dates.length - 1 ? 'is-day-one' : undefined}>
                <span className="plan-date">{dates[task.date]}</span>
                <Check />
                <span className="lane-tag">{task.lane}</span>
                <span className="plan-task">{task.text}{task.note ? <span className="task-note">{task.note}</span> : null}</span>
              </li>
            ))}
          </ol>
        </article>
        <article className="card baseline-card" aria-labelledby="baseline-title">
          <h3 className="card-title" id="baseline-title">Baseline · {maya.team} · Austin · {maya.employment}</h3>
          <ul className="chips">{baseline.map(app => <li key={app}>{app}</li>)}</ul>
        </article>
      </div>
    </section>
  )
}
