import { Lines, Tick, type Tone } from '../parts'

const log: { time: string; tone: Tone; text: string; tick?: boolean }[] = [
  { time: '7:06 PM', tone: 'navy', text: 'Policy applied · read back', tick: true },
  { time: '7:14 PM', tone: 'red', text: 'Uptime: Okta sign-in check failing · 403' },
  { time: '7:14 PM', tone: 'red', text: 'Incident INC-2291 opened · linked to CHG-0418 · Oncall paged Hana Whitlock' },
  { time: '7:17 PM', tone: 'amber', text: 'Backout started under its own grant' },
  { time: '7:21 PM', tone: 'green', text: 'Policy reverted · read back', tick: true },
  { time: '7:24 PM', tone: 'green', text: 'Okta sign-in check passing' },
  { time: '7:52 PM', tone: 'green', text: '11 people failed sign-in in the window · 11 of 11 signed back in', tick: true },
]

/** CHANGE: the navy band. CHG-0418 fails an Uptime check, Oncall pages, the backout runs and everyone signs back in. */
export function Change() {
  return (
    <section className="section change" aria-labelledby="change-title">
      <div className="wrap">
        <header className="section-head centered">
          <p className="eyebrow">Change · Thu Oct 22 · 7:00 PM MT</p>
          <h2 id="change-title"><Lines parts={['A bad change,', 'backed out in 7 minutes.']} /></h2>
          <p className="lede">Linen ties the failing check to the change, rolls it back and gets everyone signed in again.</p>
        </header>
        <div className="change-grid">
          <article className="card change-card" aria-labelledby="chg-title">
            <p className="chg-id">CHG-0418</p>
            <h3 className="card-title" id="chg-title">Okta: phishing-resistant MFA for admins</h3>
            <ul className="rule-rows">
              <li><strong>Risk</strong> · high · touches SSO</li>
              <li><strong>CAB</strong> · approved Tue Oct 20 · 3 of 4 votes</li>
              <li><strong>Window</strong> · Thu Oct 22 · 7:00–8:00 PM</li>
              <li><strong>Backout plan</strong> · ready</li>
            </ul>
            <p className="pill pill-failed">Failed · backed out</p>
          </article>
          <article className="card timeline-card" aria-labelledby="timeline-title">
            <h3 className="card-title" id="timeline-title">CHG-0418 · timeline</h3>
            <ol className="log">
              {log.map((row, i) => (
                <li key={i} className={`log-row tint-${row.tone}`}>
                  <time>{row.time}</time>
                  <span className={`dot dot-${row.tone}`} aria-hidden="true" />
                  <span className="log-text">{row.text}{row.tick ? <> <Tick /></> : null}</span>
                </li>
              ))}
            </ol>
            <p className="review"><strong>Review Fri Oct 23</strong> · cites the Uptime failure and recovery</p>
          </article>
        </div>
      </div>
    </section>
  )
}
