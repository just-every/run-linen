import { Lockup } from './Lockup'
import { contractPath, docsPath, licence, repository } from './links'

/** The lockup, the one line, then Docs, Contract, Source and the license (desk page 12). */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <Lockup size={40} />
        <p>Open source IT service desk</p>
        <nav aria-label="Footer">
          <a href={docsPath()}>Docs</a>
          <a href={contractPath}>Contract</a>
          <a href={repository}>Source</a>
          <a href={licence}>MIT licensed</a>
        </nav>
      </div>
    </footer>
  )
}
