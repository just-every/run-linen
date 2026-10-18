import pkg from '../../../package.json'

// The run site's outward links: Source is package.json's repository, the docs live at /docs, the hosted demo at
// demo.run-linen.com (DEMO.md; live, answering 200 on 18 Oct 2026).
export const repository: string = pkg.repository
export const docsPath = (slug?: string) => (slug ? `/docs/${slug}` : '/docs')
export const demo = 'https://demo.run-linen.com/'
export const licence = `${repository}/blob/main/LICENSE`
