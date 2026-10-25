import { fontHead, fontLinks } from './font-head'

// Native auth documents bypass the route renderer. Replace the theme's former
// import before its link, keeping the cascade against the auth module's hashed
// styles. Unthemed documents (the native dev hand-off) need no theme dependency.
export async function fontDocumentResponse(response: Response | null): Promise<Response | null> {
  if (!response?.headers.get('content-type')?.startsWith('text/html')) return response
  const html = await response.text()
  const look = fontLinks.find(link => link.rel === 'stylesheet')!.href
  const themed = html.includes('href="/rer-theme.css"')
  const document = themed && !html.includes(look)
    ? html.replace(/<link\b[^>]*rel="stylesheet"[^>]*>/i, link => `${fontHead}${link}`)
    : html
  const headers = new Headers(response.headers)
  const policy = headers.get('content-security-policy')
  if (policy) {
    const directives = policy.split(';').map(value => value.trim()).filter(Boolean)
    for (const name of ['style-src', 'font-src']) {
      const index = directives.findIndex(value => value.split(/\s+/)[0] === name)
      if (index < 0) directives.push(`${name} 'self'`)
      else if (!directives[index].split(/\s+/).includes("'self'")) directives[index] += " 'self'"
    }
    headers.set('content-security-policy', directives.join('; '))
  }
  // These are bounded native auth documents, not streaming route renders.
  headers.delete('content-length')
  return new Response(document, {
    status: response.status, statusText: response.statusText, headers,
  })
}
