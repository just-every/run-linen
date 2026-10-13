import { Icon } from '../../ui/icons'
import { docsPath, repository } from './links'

/** Leaf mark and wordmark at left, Docs and Source at right, a hairline under the bar. Nothing else. */
export function SiteHeader({ current }: { current?: 'docs' }) {
  return (
    <header className="site-bar">
      <a className="site-brand" href="/">
        <Icon name="leaf" size={30} />
        <span>Linen</span>
      </a>
      <nav aria-label="Site">
        <a href={docsPath()} aria-current={current === 'docs' ? 'page' : undefined}>Docs</a>
        <a href={repository}>Source</a>
      </nav>
    </header>
  )
}
