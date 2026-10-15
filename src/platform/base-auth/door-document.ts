// Linen's no-JavaScript doors (/setup, /signin): the app's sign-in split (a frayed flax swatch beside
// the form card). Their look is public/design/door.css over the --rer-* tokens in /rer-theme.css.
import { identity } from '../../identity'

export function doorDocument(title: string, heading: string, card: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${identity.product}</title>`
    + `<link rel="icon" href="${identity.mark}"><link rel="stylesheet" href="${identity.theme}"><link rel="stylesheet" href="/design/door.css"></head>`
    + `<body><div class="door"><a class="door-brand" href="/"><img src="${identity.mark}" alt="" width="30" height="30"><span data-rer-name>${identity.product}</span></a>`
    + `<div class="door-split"><section class="door-cloth"><p>A little less work. A little more possibility.</p><p class="door-title">Good work starts <span class="stitch">here.</span></p><p>One place to ask, follow what matters, and get back to your day.</p></section>`
    + `<main class="door-card"><h1>${heading}</h1>${card}</main></div></div></body></html>`
}
