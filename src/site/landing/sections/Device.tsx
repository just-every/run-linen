import { laptop, maya, stock, usd } from '../october'
import { Check, Lines, Painting, SectionHead, To, type Tone } from '../parts'

const custody: { date: string; text: string; tone: Tone; alert?: boolean }[] = [
  { date: 'Mon Oct 5', text: `Allocated from ${stock.room}`, tone: 'navy' },
  { date: 'Tue Oct 6', text: 'Assigned in Apple Business Manager → Jamf', tone: 'navy' },
  { date: 'Tue Oct 13', text: `Shipped by Firstbase · ${laptop.tracking}`, tone: 'navy' },
  { date: 'Wed Oct 14', text: 'Carrier exception: apartment number missing', tone: 'red', alert: true },
  { date: 'Wed Oct 14', text: 'Maya replied "Apt 4B" · address fixed 11:20 AM', tone: 'amber' },
  { date: laptop.delivered, text: `Delivered ${laptop.deliveredAt}`, tone: 'green' },
  { date: laptop.delivered, text: `Enrolled in Jamf ${laptop.enrolledAt} · FileVault on · compliant`, tone: 'green' },
]

const Event = ({ text }: { text: string }) => {
  const [before, after] = text.split(' → ')
  return after ? <>{before} <To /> {after}</> : <>{text}</>
}

/** DEVICE: the custody of Maya's laptop from the Denver shelf to her door, the stalled box fixed, and the reorder it set off. */
export function Device() {
  return (
    <section className="section device" aria-labelledby="device-title">
      <div className="wrap device-grid">
        <div className="device-copy">
          <SectionHead id="device-title" eyebrow="Device · Mon Oct 5 → Fri Oct 16" title={<Lines parts={['Her laptop,', 'at her door.']} />}
            lede="Linen takes it from stock, sets up zero-touch enrollment before it ships, tracks the box and fixes what stalls it." />
          <div className="stock-row">
            <article className="card stock-card" aria-labelledby="stock-title">
              <h3 className="card-title" id="stock-title">{stock.room} · {laptop.model}</h3>
              <ul className="rule-rows">
                <li>On the shelf: {stock.before} <To /> {stock.after}</li>
                <li>At reorder point · request sent to Purse</li>
                <li>{stock.units} × {usd(stock.unitPrice)} = {usd(stock.units * stock.unitPrice)}</li>
              </ul>
            </article>
            <Painting className="box-art" name="box" widths={[240, 480]} sizes="(max-width: 760px) 150px, 240px" width={480} height={359} />
          </div>
        </div>
        <article className="card custody-card" aria-labelledby="custody-title">
          <h3 className="custody-title" id="custody-title">{laptop.model} · SN {laptop.serial}</h3>
          <p className="custody-sub">Asset {laptop.asset} · {maya.name} · {maya.city}</p>
          <ol className="custody-rail">
            {custody.map((step, i) => (
              <li key={i} className={step.alert ? 'is-alert' : undefined}>
                <span className={`rail-dot dot-${step.tone}`} aria-hidden="true" />
                <span className="custody-date">{step.date}</span>
                <span className="custody-event"><Event text={step.text} /></span>
              </li>
            ))}
          </ol>
          <p className="ready-box"><Check label="ready" />Ready for day one</p>
        </article>
      </div>
    </section>
  )
}
