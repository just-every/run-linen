import { Icon } from '../../ui/icons'
import { beside, decisions, free, handover, hero } from './copy'

// The homepage's drawings of the real product (SPEC §1.2–1.7): white cards with real text, a
// madder running stitch between them, flax cloth underneath. Labels copy the app's own components.

/** A decorative running stitch: a dashed madder thread drawn across its box, never scaled thicker. */
export function Thread({ d, className, viewBox = '0 0 1000 120' }: { d: string; className: string; viewBox?: string }) {
  return (
    <svg className={`thread ${className}`} viewBox={viewBox} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={d} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function Verified({ label }: { label: string }) {
  return <span className="badge tone-ok"><Icon name="check" size={16} />{label}</span>
}

/** Hero: the composer, the verified request and the scheduled removal, joined by one thread. */
export function HeroDrawing() {
  return (
    <div className="hero-drawing" role="img" aria-label={hero.drawingLabel}>
      <Thread className="hero-thread" d="M0 70 C 40 40, 60 110, 120 100 S 260 50, 330 40 S 470 70, 560 60 S 700 90, 760 70 S 900 40, 1000 75" />
      <div className="draw-card draw-composer">
        <p className="draw-label">{hero.composer.label}</p>
        <p className="draw-input">{hero.composer.message}</p>
        <span className="draw-send">{hero.composer.send}</span>
      </div>
      <div className="draw-card draw-request">
        <div className="draw-row">
          <p className="draw-title">{hero.request.title}</p>
          <Verified label={hero.request.badge} />
        </div>
        <span className="draw-bar" />
        <span className="draw-bar short" />
      </div>
      <div className="draw-card draw-removal">
        <p className="draw-title">{hero.removal.title}</p>
        <p className="draw-line">{hero.removal.line}</p>
      </div>
    </div>
  )
}

/** Section 2: the licence card on a corner of cloth. */
export function LicenceDrawing() {
  return (
    <div className="swatch" role="img" aria-label={`${free.card[0]}, ${free.card[1]}`}>
      <Thread className="swatch-thread" d="M0 30 C 80 20, 120 90, 200 80 S 330 60, 420 60 M 640 50 C 720 40, 760 90, 840 95 S 950 110, 1000 120" />
      <div className="draw-card draw-licence">
        <p className="draw-licence-title">{free.card[0]}</p>
        <p className="draw-licence-line"><span className="stitch">{free.card[1]}</span></p>
      </div>
    </div>
  )
}

/** Section 3: the record with its access and its device kept apart. */
export function HandoverDrawing() {
  const [access, device] = handover.rows
  return (
    <div className="swatch" role="img" aria-label={`${access.title}, ${access.badge}. ${device.title}, ${device.chip}.`}>
      <Thread className="swatch-thread" d="M0 110 C 60 100, 90 60, 160 60 M 860 60 C 900 55, 950 20, 1000 10" />
      <div className="draw-card draw-record">
        <div className="draw-row">
          <p className="draw-title">{access.title}</p>
          <Verified label={access.badge!} />
        </div>
        <span className="draw-bar" />
        <div className="draw-row draw-row-rule">
          <p className="draw-title">{device.title}</p>
          <span className="chip">{device.chip}</span>
        </div>
        <span className="draw-bar" />
      </div>
    </div>
  )
}

/** Section 4: a choice that needs you, with its three facts. */
export function DecisionDrawing() {
  return (
    <div className="swatch" role="img" aria-label={`${decisions.card}: ${decisions.facts.join(', ')}.`}>
      <Thread className="swatch-thread" d="M0 20 C 50 20, 80 70, 150 70 M 860 80 C 920 85, 950 100, 1000 110" />
      <div className="draw-card draw-decision">
        <p className="draw-title">{decisions.card}</p>
        {decisions.facts.map(fact => (
          <div className="draw-fact" key={fact}>
            <span>{fact}</span>
            <span className="draw-bar" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Section 6: the existing desk joined to Linen by one thread. */
export function BesideDrawing() {
  return (
    <div className="beside" role="img" aria-label={`${beside.desk}, joined to Linen. ${beside.caption}`}>
      <div className="draw-card draw-desk">
        <p className="draw-title">{beside.desk}</p>
        <p className="draw-caption">{beside.caption}</p>
      </div>
      <Thread className="beside-thread" viewBox="0 0 100 40" d="M0 20 C 25 6, 40 34, 60 24 S 85 16, 100 22" />
      <div className="draw-card draw-linen">
        <Icon name="leaf" size={44} />
        <span>Linen</span>
      </div>
    </div>
  )
}
