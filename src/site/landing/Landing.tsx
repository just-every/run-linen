import { Icon } from '../../ui/icons'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import { docsPath } from '../shell/links'
import { beside, closing, decisions, desk, free, handover, hero } from './copy'
import { BesideDrawing, DecisionDrawing, HandoverDrawing, HeroDrawing, LicenceDrawing } from './Drawings'
import '../../styles/tokens.css'
import '../../styles/base.css'
import './landing.css'

// A one-letter word ("A") stays on the line of the word after it.
const join = (lead: string) => (/(^|\s)\S$/.test(lead) ? '\u00a0' : ' ')
const Title = ({ parts, as: Tag = 'h2', id }: { parts: readonly [string, string]; as?: 'h1' | 'h2'; id?: string }) => (
  <Tag id={id}>{parts[0]}{join(parts[0])}<span className="stitch">{parts[1]}</span></Tag>
)

/** The hero h1 keeps each sentence whole, so a narrow screen breaks after "Ask once." */
function HeroTitle({ parts }: { parts: readonly [string, string] }) {
  const [, first, rest] = parts[0].match(/^(.*[.!?])\s+(.*)$/) ?? []
  if (!first) return <Title parts={parts} as="h1" id="hero-title" />
  return <h1 id="hero-title"><span className="hero-line">{first}</span> <span className="hero-line">{rest} <span className="stitch">{parts[1]}</span></span></h1>
}

function Actions({ demo = false }: { demo?: boolean }) {
  return (
    <div className="site-actions">
      <a className="action primary site-run" href="/run">{hero.primary}<Icon name="arrow" size={20} /></a>
      {demo && <a className="action primary site-run" href="https://demo.run-linen.com/">Try the demo</a>}
      <a className="site-docs-link" href={docsPath()}>{hero.secondary}</a>
    </div>
  )
}

/** The run site's homepage (SPEC §1): hero on the cloth, five sections, the closing band, the footer. */
export function Landing() {
  return (
    <div className="site">
      <SiteHeader />
      <main>
        <section className="hero-cloth" aria-labelledby="hero-title">
          <div className="hero-copy">
            <HeroTitle parts={hero.title} />
            <p className="hero-sub">{hero.sub}</p>
            <p className="hero-alt">{hero.alternatives}</p>
            <Actions demo />
            <p className="hero-note">{hero.note}</p>
          </div>
          <HeroDrawing />
          <img className="sprig" src="/design/sprig.webp" alt="" width="642" height="268" />
        </section>

        <section className="feature" aria-labelledby="free-title">
          <div className="feature-copy"><Title parts={free.title} id="free-title" /><p>{free.line}</p></div>
          <LicenceDrawing />
        </section>
        <section className="feature" aria-labelledby="handover-title">
          <div className="feature-copy"><Title parts={handover.title} id="handover-title" /><p>{handover.line}</p></div>
          <HandoverDrawing />
        </section>
        <section className="feature" aria-labelledby="decisions-title">
          <div className="feature-copy"><Title parts={decisions.title} id="decisions-title" /><p>{decisions.line}</p></div>
          <DecisionDrawing />
        </section>

        <section className="desk" aria-labelledby="desk-title">
          <Title parts={desk.title} id="desk-title" />
          <ul className="desk-grid">
            {desk.tiles.map(tile => (
              <li key={tile.label} className="desk-tile">
                <span className="desk-well"><Icon name={tile.icon} size={26} /></span>
                <span><strong>{tile.label}</strong><span>{tile.line}</span></span>
              </li>
            ))}
          </ul>
        </section>

        <section className="feature feature-beside" aria-labelledby="beside-title">
          <div className="feature-copy"><Title parts={beside.title} id="beside-title" /><p>{beside.line}</p></div>
          <BesideDrawing />
        </section>

        <section className="closing" aria-labelledby="closing-title">
          <h2 id="closing-title">{closing.title}</h2>
          <p>{closing.line}</p>
          <Actions />
          <img className="sprig" src="/design/sprig.webp" alt="" width="642" height="268" />
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
