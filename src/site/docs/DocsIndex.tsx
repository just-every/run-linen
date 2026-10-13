import { Icon } from '../../ui/icons'
import { docsPath } from '../shell/links'
import { DocsFrame, DocsTitle } from './DocsFrame'
import { DocsSidebar } from './DocsNav'
import { docsLead, docsSections } from './pages'

/** The docs home at /docs: the sidebar, the title, a short lead and each section's pages as cards in reading order. */
export function DocsIndex() {
  return (
    <DocsFrame index>
      <DocsSidebar />
      <main id="main" className="docs-main">
        <DocsTitle eyebrow="Linen" title="Linen docs" />
        <p className="docs-lead">{docsLead}</p>
        {docsSections.map((section, index) => (
          <section className="docs-index-section" aria-labelledby={`docs-section-${index}`} key={section.title}>
            <h2 className="docs-index-section-title" id={`docs-section-${index}`}>{section.title}</h2>
            <ul className="docs-index-grid">
              {section.pages.map(page => (
                <li key={page.slug}>
                  <a className="docs-index-card" href={docsPath(page.slug)}>
                    <h3>{page.title}<Icon name="arrow" size={20} /></h3>
                    <p>{page.summary}</p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
    </DocsFrame>
  )
}
