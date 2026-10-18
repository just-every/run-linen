import { count, freshservice } from '../october'
import { Lines, SectionHead } from '../parts'

const Tick = () => <svg className="tick tick-green" viewBox="0 0 16 16" role="img" aria-label="matched"><path d="M2.5 8.5l3.5 3.5 7.5-8" /></svg>

/** MOVING IN: the Freshservice import with its counts, the one start line, and what Linen works through rather than replaces. */
export function MovingIn() {
  return (
    <section className="section moving" aria-labelledby="moving-title">
      <div className="wrap moving-grid">
        <div className="moving-left">
          <SectionHead id="moving-title" eyebrow="Moving in" title={<Lines parts={['Switch desks,', 'keep every ticket.']} />}
            lede="Tickets, private notes, assets, catalog and knowledge come across. Run both until you switch." />
          <p className="also">Also from Jira Service Management, ServiceNow and CSV.</p>
          <div className="terminal" role="group" aria-label="Start Linen on your computer">
            <span className="lights" aria-hidden="true"><i /><i /><i /></span>
            <pre><code><span className="prompt" aria-hidden="true">$ </span>npx -y @runeditrun/rer dev <span className="nowrap">just-every/run-linen</span></code></pre>
          </div>
        </div>
        <article className="card import-card" aria-labelledby="import-title">
          <h3 className="card-title" id="import-title">Freshservice → Linen</h3>
          <p className="progress"><span className="bar" aria-hidden="true"><i /></span><span>100%</span></p>
          <ul className="count-rows">
            {freshservice.map(([label, value]) => <li key={label}><span>{label}</span><span className="num">{count(value)}</span><Tick /></li>)}
          </ul>
          <p className="strip">Delta pass · 37 changes since the last pass</p>
          <p className="strip">Cutover · 112 open tickets moved</p>
        </article>
      </div>
      <div className="wrap">
        <p className="card limits">Linen works through your Okta or Entra, Jamf, Intune or Kandji, and Rippling, Gusto or BambooHR. It doesn't replace them.</p>
      </div>
    </section>
  )
}
