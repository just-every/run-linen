import { DocsFrame, DocsTitle } from './DocsFrame'
import { DocsMenu, DocsSidebar } from './DocsNav'
import { DocsPager } from './DocsPager'
import { DocsToc, DocsTocCompact } from './DocsToc'
import { docsNeighbours, getDocsPage } from './pages'

/** One docs page: the section sidebar, the article rendered from Markdown at build time, "On this page", then the pager. */
export function DocsArticle({ slug }: { slug: string }) {
  const page = getDocsPage(slug)
  if (!page) throw new Error(`docs/site.json has no page "${slug}"`)
  const { previous, next } = docsNeighbours(slug)
  return (
    <DocsFrame>
      <DocsSidebar current={slug} />
      <main id="main" className="docs-main">
        <DocsMenu current={slug} label={page.title} />
        <article className="docs-article" aria-labelledby="docs-title">
          <DocsTitle eyebrow={page.section} title={page.title} id="docs-title" />
          <p className="docs-summary">{page.summary}</p>
          <DocsTocCompact toc={page.toc} />
          <div className="docs-prose" dangerouslySetInnerHTML={{ __html: page.html }} />
        </article>
        <DocsPager previous={previous} next={next} />
      </main>
      <DocsToc toc={page.toc} />
    </DocsFrame>
  )
}
