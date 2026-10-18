import branding from './branding.json'
import { checkIdentity, type EditionIdentity } from './base/identity'

// What the installed Lobby (/) and the run site say about Linen. The theme imports the fonts sheet, so no fonts
// stylesheet is named; the tagline is the approved homepage's subhead (design desk, 17 Oct 2026).
export const identity: EditionIdentity = checkIdentity({
  product: branding.name,
  deployment: branding.name,
  purpose: '{deployment} answers IT requests, grants access, sets up new hires, offboards leavers and tracks every laptop.',
  tagline: 'Linen answers IT requests, grants access, sets up new hires, offboards leavers, tracks every laptop, and checks that everyone can work.',
  signInPath: '/signin',
  runSite: 'https://run-linen.com',
  installedHome: 'lobby',
  theme: '/rer-theme.css',
  mark: '/brand/mark.svg',
  band: '/brand/band.webp',
})
