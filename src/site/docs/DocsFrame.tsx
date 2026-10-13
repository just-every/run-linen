import type { ReactNode } from 'react'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import '../../styles/tokens.css'
import '../../styles/base.css'
import '../landing/landing.css'
import './docs.css'

/** Every docs page: the site's bar and footer around a sidebar, the page and (on articles) its contents list. */
export function DocsFrame({ children, index = false }: { children: ReactNode; index?: boolean }) {
  return (
    <div className="site docs">
      <SiteHeader current="docs" />
      <div className={index ? 'docs-shell docs-shell-index' : 'docs-shell'}>{children}</div>
      <SiteFooter />
    </div>
  )
}

/** A page title whose last two words carry the running stitch, as on the homepage. */
export function DocsTitle({ eyebrow, title, id }: { eyebrow: string; title: string; id?: string }) {
  const words = title.split(' ')
  const head = words.slice(0, -2).join(' '), tail = words.slice(-2).join(' ')
  return (
    <header className="docs-page-head">
      <p className="docs-eyebrow">{eyebrow}</p>
      <h1 id={id}>{head ? `${head} ` : ''}<span className="stitch">{tail}</span></h1>
    </header>
  )
}
