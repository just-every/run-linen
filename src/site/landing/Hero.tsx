import { Actions } from '../shell/Actions'
import { laptop, maya, priya } from './october'
import { Dot, Painting, Words, type Tone } from './parts'

const cards: { id: string; tone: Tone; lines: [string, string]; phone?: boolean }[] = [
  { id: 'okta', tone: 'marigold', lines: ['Okta, Google Workspace, Slack,', 'GitHub · granted · sign-in verified'], phone: true },
  { id: 'austin', tone: 'marigold', lines: [`${maya.city} · ${maya.name} ·`, `MacBook delivered ${laptop.delivered} · enrolled ✓`] },
  { id: 'laptop', tone: 'slate', lines: [`Laptop · SN ${laptop.serial} ·`, `${maya.name} · ${maya.city}`], phone: true },
  { id: 'dayone', tone: 'marigold', lines: [`Day one · ${maya.name} ·`, '14 of 14 ready'], phone: true },
  { id: 'portland', tone: 'slate', lines: [`${priya.city} · ${priya.name} ·`, `locked out → reset · signed back in ${priya.backAt} ✓`] },
]

/** The papercut porch (desk hero, header and painted copy removed), the promise over its sky and Maya's records on the porch. */
export function Hero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-copy">
        <h1 id="hero-title">Everyone set up. Everything working.</h1>
        <p className="hero-sub">Linen answers IT requests, grants access, sets up new hires, offboards leavers, tracks every laptop, and checks that everyone can work.</p>
        <p className="hero-alt">100% free, open source alternative to <strong>ServiceNow</strong>, <strong>Freshservice</strong> and <strong>Jira Service Management</strong></p>
        <Actions />
      </div>
      <Painting className="hero-art" name="hero" widths={[768, 1152, 1536]} sizes="100vw" width={1536} height={971} eager
        phone={{ name: 'hero-phone', widths: [640, 960], media: '(max-width: 760px)', width: 960, height: 1036 }} />
      <ul className="hero-cards" aria-label="Maya Chen's first week">
        {cards.map(card => (
          <li key={card.id} className={`hero-card hero-card-${card.id}${card.phone ? ' on-phone' : ''}`}>
            <Dot tone={card.tone} />
            <span className="hero-card-text"><span>{card.lines[0]}</span> <span><Words text={card.lines[1]} /></span></span>
          </li>
        ))}
      </ul>
    </section>
  )
}
