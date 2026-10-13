import pkg from '../../../package.json'

// The run site's outward links: Source is package.json's repository, the docs live at /docs.
export const repository: string = pkg.repository
export const docsPath = (slug?: string) => (slug ? `/docs/${slug}` : '/docs')
