import { wes } from '../october'
import { Check, Dot, SectionHead, Words } from '../parts'

/** A deterministic barcode for the return-kit label, drawn from the serial number's characters. */
function Barcode({ value }: { value: string }) {
  const bars: { x: number; w: number }[] = []
  let x = 0
  for (const char of `*${value}*`) {
    const code = char.charCodeAt(0)
    for (let i = 0; i < 5; i++) {
      const w = ((code >> i) & 1) + 1 + (i === 2 ? 1 : 0)
      if (i % 2 === 0) bars.push({ x, w })
      x += w + 1
    }
    x += 2
  }
  return (
    <svg className="barcode" viewBox={`0 0 ${x} 40`} preserveAspectRatio="none" role="img" aria-label={`Barcode ${value}`}>
      {bars.map((bar, i) => <rect key={i} x={bar.x} width={bar.w} height="40" />)}
    </svg>
  )
}

/** LEAVE: Wes Calloway off nine apps by 5:03 PM with proof per app, and his laptop back through a return kit. */
export function Leave() {
  return (
    <section className="section leave" aria-labelledby="leave-title">
      <div className="wrap">
        <SectionHead id="leave-title" eyebrow="Leave · Fri Oct 23 → Wed Oct 28 · Denver, CO" title="Off everything by 5:03 PM."
          lede={`At the end of ${wes.name}'s last day, Linen revokes every app, hands his files to his manager and gets the laptop back.`} />
        <div className="leave-grid">
          <article className="card leaver-card" aria-labelledby="leaver-title">
            <header className="leaver-head">
              <div><h3 className="card-title" id="leaver-title">{wes.name} · leaver</h3><p className="card-sub">Fri Oct 23 · started 5:00 PM MT</p></div>
              <span className="pill pill-navy">Revoked in {wes.apps.length} apps</span>
            </header>
            <ul className="revocations">
              {wes.apps.map(([app, detail, time]) => (
                <li key={app}>
                  <span className="rev-state">
                    {app === 'GitHub' ? <><Dot tone="red" label="failed first" /><svg className="to" viewBox="0 0 16 10" aria-hidden="true"><path d="M1 5h13M10 1.5L14 5l-4 3.5" /></svg><Check label="removed" /></>
                      : app === 'Calendly' ? <Dot tone="amber" label="found by search" /> : <Check label="revoked" />}
                  </span>
                  <span className="rev-app">{app}</span>
                  <span className="rev-detail"><Words text={detail} /></span>
                  <time className="rev-time">{time}</time>
                </li>
              ))}
            </ul>
            <p className="still-open"><Check label="" />Still open: 0</p>
          </article>
          <article className="card return-card" aria-labelledby="return-title">
            <p className="col-label">Return kit</p>
            <h3 className="card-title" id="return-title">{wes.laptop} · SN {wes.serial}</h3>
            <Barcode value={wes.serial} />
            <ul className="check-rows">
              <li><Check />Locked in Jamf · 5:01 PM</li>
              <li><Check />Label emailed · Fri Oct 23</li>
              <li><Check />Received · Wed Oct 28</li>
              <li><Check />Wiped · read back 3:40 PM</li>
            </ul>
            <p className="custody-closed"><Check label="" />Custody closed</p>
          </article>
        </div>
      </div>
    </section>
  )
}
