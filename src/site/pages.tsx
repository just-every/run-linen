import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { contractPageHtml } from '../base/contract-page'
import { runPageHtml, siteNotFoundHtml, type SiteBuild, type SiteContext } from '../base/run-site'
import { identity } from '../identity'
import { DocsArticle } from './docs/DocsArticle'
import { DocsIndex } from './docs/DocsIndex'
import { docsHead, docsPages } from './docs/pages'
import { page } from './landing/copy'
import { Landing } from './landing/Landing'
import { run } from './run'

/** The run site (run-linen.com), built by `rer build --site`: the homepage, the Run page, the docs, /contract from CONTRACT.md and a 404. */
export function sitePages({ styles, contract }: SiteContext): SiteBuild {
  const document = (title: string, description: string | undefined, body: ReactElement) => '<!doctype html>' + renderToStaticMarkup(
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{title}</title>
        {description ? <meta name="description" content={description} /> : null}
        <link rel="icon" href={identity.mark} />
        <link rel="stylesheet" href={identity.theme} />
        {styles.map(href => <link key={href} rel="stylesheet" href={href} />)}
      </head>
      <body>{body}</body>
    </html>,
  )
  const head = (slug?: string) => {
    const rows = (docsHead(slug) as { meta?: Record<string, string>[] }).meta ?? []
    return [rows.find(row => row.title)?.title ?? 'Docs · Linen', rows.find(row => row.name === 'description')?.content] as const
  }
  return {
    pages: [
      { path: '/', html: document(page.title, page.description, <Landing />) },
      { path: '/run', html: runPageHtml(identity, run, contract) },
      ...(contract ? [{ path: '/contract', html: contractPageHtml(identity, run, contract) }] : []),
      { path: '/docs', html: document(...head(), <DocsIndex />) },
      ...docsPages.map(entry => ({ path: `/docs/${entry.slug}`, html: document(...head(entry.slug), <DocsArticle slug={entry.slug} />) })),
      { path: '/404', html: siteNotFoundHtml(identity, run, contract) },
    ],
    assets: ['rer-theme.css', 'fonts', 'brand', 'design'],
  }
}
