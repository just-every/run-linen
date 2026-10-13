/** Preserve the response stream and headers, while keeping session-aware
 * documents private and preventing proxies from rewriting hydration content. */
export function documentResponse(response: Response): Response {
  if (!response.headers.get('content-type')?.includes('text/html')) return response
  const headers = new Headers(response.headers)
  const directives = (headers.get('Cache-Control') ?? '').split(',').map(value => value.trim()).filter(Boolean)
  const retained = directives.filter(value => !/^(?:public|s-maxage)(?:\s*=|$)/i.test(value))
  for (const directive of ['private', 'no-store', 'no-transform']) {
    if (!retained.some(value => value.toLowerCase() === directive)) retained.push(directive)
  }
  headers.set('Cache-Control', retained.join(', '))
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
