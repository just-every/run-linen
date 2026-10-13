import { Icon } from '../../ui/icons'
import { footer } from '../landing/copy'
import { docsPath, repository } from './links'

/** Leaf and wordmark, the one line, then Docs, Source and the licence. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <a className="site-brand" href="/">
        <Icon name="leaf" size={26} />
        <span>Linen</span>
      </a>
      <p>{footer.line}</p>
      <nav aria-label="Footer">
        <a href={docsPath()}>Docs</a>
        <a href={repository}>Source</a>
        <a href={`${repository}/blob/main/LICENSE`}>{footer.licence}</a>
      </nav>
    </footer>
  )
}
