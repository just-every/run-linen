import { count, report, reportTotal } from '../october'
import { Dot, SectionHead, To, type Tone } from '../parts'

const licenses: { name: string; tone: Tone; detail: string }[] = [
  { name: 'Zoom', tone: 'green', detail: '212 of 220 used · 6 reclaimed' },
  { name: 'Figma', tone: 'amber', detail: '40 of 40 used · 1 reclaimed' },
  { name: 'Acrobat Pro', tone: 'green', detail: '30 installs, 25 licenses → 5 removed' },
  { name: 'Slack', tone: 'green', detail: 'renews Jan 29, 2027 · 90-day notice sent Oct 31' },
]

const Minutes = ({ before, after }: { before: number; after: number }) => <>{count(before)} <To /> {count(after)}</>

/** OCTOBER REPORT: requests, verified outcomes and people's minutes by request type, beside the licenses. */
export function Report() {
  return (
    <section className="section report" aria-labelledby="report-title">
      <div className="wrap">
        <SectionHead id="report-title" eyebrow="October report · Mon Nov 2" title="Work saved, counted in minutes."
          lede="Linen reports the time people spent on each kind of request, before and after, beside anything still open." />
        <div className="report-grid">
          <article className="card report-card" aria-labelledby="report-card-title">
            <h3 className="card-title" id="report-card-title">October 2026 · by request type</h3>
            <table className="report-table">
              <thead><tr><th scope="col">Request type</th><th scope="col">Requests</th><th scope="col">Verified</th><th scope="col">People's minutes, Sep <To /> Oct</th></tr></thead>
              <tbody>
                {report.rows.map(row => (
                  <tr key={row.type}><th scope="row">{row.type}</th><td>{row.requests}</td><td>{row.verified}</td><td><Minutes before={row.before} after={row.after} /></td></tr>
                ))}
              </tbody>
              <tfoot><tr><th scope="row">Total</th><td>{reportTotal.requests}</td><td>{reportTotal.verified}</td><td><Minutes before={reportTotal.before} after={reportTotal.after} /></td></tr></tfoot>
            </table>
            {/* Below 760 px the table becomes one block per request type (desk 390 plan). */}
            <ul className="report-blocks">
              {[...report.rows, { type: 'Total', ...reportTotal }].map(row => (
                <li key={row.type} className={row.type === 'Total' ? 'is-total' : undefined}>
                  <p className="block-name">{row.type}</p>
                  <p><Dot tone="green" />Requests {row.requests} · Verified {row.verified}</p>
                  <p className="block-minutes">Minutes, Sep <To /> Oct: <Minutes before={row.before} after={row.after} /></p>
                </li>
              ))}
            </ul>
            <p className="report-note"><Dot tone="marigold" />1 open: return kit in transit, due Fri Nov 6 · 1 reopened and fixed Tue Oct 27</p>
          </article>
          <article className="card licenses-card" aria-labelledby="licenses-title">
            <h3 className="card-title" id="licenses-title">Licenses</h3>
            <ul>
              {licenses.map(license => (
                <li key={license.name}><Dot tone={license.tone} /><div><p className="license-name">{license.name}</p><p className="license-detail">{license.detail.split(' → ').flatMap((part, i) => i ? [<To key={i} />, ` ${part}`] : [`${part} `])}</p></div></li>
              ))}
            </ul>
          </article>
        </div>
      </div>
    </section>
  )
}
