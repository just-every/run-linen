import { Lockup } from './Lockup'
import { docsPath, repository } from './links'

/** The white bar on every run-site page: the lockup at left, Docs and Source at right (desk page 01). */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="site-bar">
      <div className="site-bar-inner">
        <Lockup />
        <nav aria-label="Site">
          <a href={docsPath()} aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
          <a href={repository}>Source</a>
        </nav>
      </div>
    </header>
  )
}
