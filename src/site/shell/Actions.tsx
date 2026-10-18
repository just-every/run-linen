import { demo, docsPath } from './links'

const Arrow = () => <svg className="arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 10h12M11 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>

/** Run Linen (to /run) and the text links under it. The closing drops "Try the demo". */
export function Actions({ demoLink = true }: { demoLink?: boolean }) {
  return (
    <div className={demoLink ? 'actions' : 'actions actions-row'}>
      <a className="run-button" href="/run">Run Linen<Arrow /></a>
      <p className="text-links">
        {demoLink ? <a href={demo}>Try the demo</a> : null}
        <a href={docsPath()}>Read the docs</a>
      </p>
    </div>
  )
}
