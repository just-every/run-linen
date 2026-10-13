// /signin through Linen's door. Base's sign-in handler still decides everything a person can do here
// (notices, providers, the email link, extra links); Linen only re-frames its card in the auth split.
import { createSignInHandler, type OperatorAuth } from '../../base/modules/operator-auth/index.mjs'
import { doorDocument } from './door-document'

export async function signInDoor(auth: OperatorAuth<string>, request: Request): Promise<Response | null> {
  // HEAD gets the same headers as GET; Base's HEAD answer has no card to re-frame.
  const read = request.method === 'HEAD' ? new Request(request.url, { method: 'GET', headers: request.headers }) : request
  const base = await createSignInHandler(auth, { links: async () => [{ href: '/app?password=1', label: 'Sign in with your existing password' }] })(read)
  if (!base) return null
  const html = await base.text(), start = html.indexOf('</h1>'), end = html.lastIndexOf('</main>')
  if (start < 0 || end < start) throw new Error('Base sign-in page changed shape; update the Linen sign-in door')
  const card = html.slice(start + 5, end).replace('>Email</label>', '>Work email</label>')
  const headers = new Headers(base.headers)
  // Base hashes its own inline sheet; the door uses only same-origin sheets and the mark.
  headers.set('Content-Security-Policy', headers.get('Content-Security-Policy')!.replace(/; style-src [^;]*(; font-src [^;]*)?(; img-src [^;]*)?/, '') + "; style-src 'self'; font-src 'self'; img-src 'self'")
  return new Response(request.method === 'HEAD' ? null : doorDocument('Sign in', 'Welcome back.', card), { status: base.status, headers })
}
