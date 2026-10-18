import type { ReactNode } from 'react'
import { SiteFooter } from '../shell/SiteFooter'
import { SiteHeader } from '../shell/SiteHeader'
import '../styles/site.css'
import '../styles/docs.css'

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

/** A page title in the homepage's heavy serif, under its section in tracked caps. */
export function DocsTitle({ eyebrow, title, id }: { eyebrow: string; title: string; id?: string }) {
  return (
    <header className="docs-page-head">
      <p className="docs-eyebrow">{eyebrow}</p>
      <h1 id={id}>{title}</h1>
    </header>
  )
}
