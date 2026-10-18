import { dayOne, maya } from '../october'
import { Check, Dot, SectionHead } from '../parts'

const Column = ({ title, rows }: { title: string; rows: readonly (readonly [string, string])[] }) => (
  <div className="dayone-col">
    <h4 className="col-label">{title} · {rows.length}</h4>
    <ul>
      {rows.map(([name, proof]) => (
        <li key={name}><span className="dayone-item"><span className="dayone-name">{name}</span> <span className="dayone-proof"><span className="sep">· </span>{proof}</span></span><Check /></li>
      ))}
    </ul>
  </div>
)

/** DAY ONE: one checklist, each of the 14 items proven by something Linen saw happen. */
export function DayOne() {
  const total = dayOne.access.length + dayOne.device.length + dayOne.people.length
  return (
    <section className="section dayone" aria-labelledby="dayone-title">
      <div className="wrap">
        <SectionHead className="centered" id="dayone-title" eyebrow={`Day one · ${maya.starts} · Austin, TX`} title="Day one, checked."
          lede="An item counts only when Linen sees it work: a sign-in, a message, a compliant laptop." />
        <div className="dayone-stack">
          <article className="card dayone-card" aria-labelledby="dayone-card-title">
            <header className="dayone-head">
              <span className="avatar">{maya.initials}</span>
              <h3 className="dayone-person" id="dayone-card-title">{maya.name} · {maya.title}</h3>
              <span className="pill pill-green"><Dot tone="green" />{total} of {total} ready · {dayOne.readyAt}</span>
            </header>
            <div className="dayone-cols">
              <Column title="Access" rows={dayOne.access} />
              <Column title="Device" rows={dayOne.device} />
              <Column title="People" rows={dayOne.people} />
            </div>
          </article>
          <p className="card commitment"><Dot tone="marigold" />Commitment: every new hire signs in to every baseline app on day one · October: 6 of 6 hires</p>
        </div>
      </div>
    </section>
  )
}
