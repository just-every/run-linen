import { ines } from '../october'
import { Check, Dot, Minus, Plus, SectionHead, To } from '../parts'

const added = ['Salesforce · Sales User', 'Gong', 'Outreach', 'ZoomInfo']
const removed = ['Zendesk', 'Intercom']
const kept = ['Okta', 'Google Workspace', 'Slack', 'Zoom', 'Notion', 'Loom']

/** MOVE: Ines Duarte from Support to Sales; the access diff Linen applies and reads back. */
export function Move() {
  return (
    <section className="section move" aria-labelledby="move-title">
      <div className="wrap move-grid">
        <div className="move-left">
          <SectionHead id="move-title" eyebrow={`Move · Mon Oct 26 · ${ines.city}`} title="New team, new apps."
            lede={`${ines.name} moves from Support to Sales. Linen adds what Sales uses, removes what Support used and keeps the rest.`} />
          <article className="card role-card" aria-labelledby="role-title">
            <h3 className="card-title" id="role-title"><Dot tone="marigold" />Rippling · role change</h3>
            <ul className="rule-rows">
              <li>{ines.name} · {ines.title}</li>
              <li>Support <To /> Sales</li>
              <li>Manager: {ines.manager}</li>
              <li>Effective Mon Oct 26</li>
            </ul>
          </article>
        </div>
        <article className="card access-card" aria-labelledby="access-title">
          <header className="access-head"><h3 className="card-title" id="access-title">{ines.name} · access change</h3><time>9:00 AM ET</time></header>
          <div className="access-cols">
            <div className="access-col added"><h4 className="col-label">Added · {added.length}</h4>
              <ul>{added.map(app => <li key={app}><Plus /><span>{app}</span><span className="soft-check"><Check label="read back" /></span></li>)}</ul></div>
            <div className="access-col removed"><h4 className="col-label">Removed · {removed.length}</h4>
              <ul>{removed.map(app => <li key={app}><Minus /><span>{app}</span><span className="soft-check"><Check label="read back" /></span></li>)}</ul></div>
            <div className="access-col kept"><h4 className="col-label">Kept · {kept.length}</h4>
              <ul>{kept.map(app => <li key={app}><span>{app}</span></li>)}</ul></div>
          </div>
          <p className="access-foot">All {added.length + removed.length} changes read back · approvals now go to {ines.manager}</p>
        </article>
      </div>
    </section>
  )
}
