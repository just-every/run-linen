import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'

import { introGuardScript, introCss } from '../base/hydration/intro-guard'
import { HydrationUnit } from '../base/hydration/unit'

export const Route = createRootRoute({
  // The theme stylesheet declares Linen's one face (Source Serif 4); every document links it from its head.
  head: () => ({ meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }], links: [{ rel: 'stylesheet', href: '/rer-theme.css' }, { rel: 'icon', href: '/brand/linen.svg' }], title: 'Linen' }),
  notFoundComponent: () => <HydrationUnit><h1>Not found</h1></HydrationUnit>,
  component: () => <html lang="en"><head><script dangerouslySetInnerHTML={{ __html: introGuardScript }} /><style>{introCss}</style><HeadContent /></head><body><Outlet /><Scripts /></body></html>,
})
