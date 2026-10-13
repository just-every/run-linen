import branding from './branding.json'
import { checkIdentity, type EditionIdentity } from './base/identity'
import { hero } from './site/landing/copy'

// What the installed Lobby (/) and the run site say about Linen. The theme declares the face, so no
// fonts stylesheet is named; the tagline is the approved landing's subhead.
export const identity: EditionIdentity = checkIdentity({
  product: branding.name,
  deployment: branding.name,
  purpose: '{deployment} makes room for good work.',
  tagline: hero.sub,
  signInPath: '/signin',
  runSite: 'https://run-linen.com',
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/linen.svg',
  band: '/brand/band.webp',
})
