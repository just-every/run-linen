import { docsPath } from '../shell/links'
import { docsSections } from './pages'

/** The sections and their pages, the current one marked. `idPrefix` keeps the sidebar's and the phone menu's ids apart. */
function DocsNavList({ current, idPrefix }: { current?: string; idPrefix: string }) {
  return (
    <>
      {docsSections.map((section, index) => (
        <div className="docs-nav-group" key={section.title}>
          <p className="docs-nav-section" id={`${idPrefix}-${index}`}>{section.title}</p>
          <ul aria-labelledby={`${idPrefix}-${index}`}>
            {section.pages.map(page => (
              <li key={page.slug}>
                <a href={docsPath(page.slug)} aria-current={page.slug === current ? 'page' : undefined}>{page.title}</a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

/** The section navigation beside the page on wide screens. Without a current page it is the docs home's own sidebar. */
export function DocsSidebar({ current }: { current?: string }) {
  return (
    <nav className="docs-sidebar" aria-label="Docs">
      <a className="docs-sidebar-home" href={docsPath()} aria-current={current ? undefined : 'page'}>All docs</a>
      <DocsNavList current={current} idPrefix="docs-sidebar" />
    </nav>
  )
}

/** The same navigation on phones: one pill that opens the whole list, without script. */
export function DocsMenu({ current, label }: { current: string; label: string }) {
  return (
    <nav className="docs-menu" aria-label="Docs">
      <details>
        <summary><span className="docs-menu-current"><span className="visually-hidden">Docs menu: </span>{label}</span></summary>
        <div className="docs-menu-list"><DocsNavList current={current} idPrefix="docs-menu" /></div>
      </details>
    </nav>
  )
}
