// Linen's no-JavaScript sign-in door (/signin): one white card on the sky ground with the dusk-street band,
// the serif lockup, the heading and Base's form. Its look is the door section of /fonts/fonts.css, shared with the
// app's own sign-in and Base's Finish setup frame.
import { identity } from '../../identity'

export function doorDocument(title: string, heading: string, card: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · ${identity.product}</title>`
    + `<link rel="icon" href="${identity.mark}"><link rel="stylesheet" href="${identity.fonts}"><link rel="stylesheet" href="${identity.theme}"></head>`
    + `<body class="signin"><main class="signin-card"><a class="signin-brand" href="/"><img src="${identity.mark}" alt="" width="56" height="37"><span data-rer-name>${identity.product}</span></a>`
    + `<h1>${heading}</h1>${card}</main></body></html>`
}
