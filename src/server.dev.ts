import worker from './server'
import { withNativeDevIdentity } from './platform/base-auth/dev'
import { fontDocumentResponse } from './base/font-response'
import type { Env } from './platform/types'

const dev = withNativeDevIdentity(worker)
// The native dev layer answers these documents outside the production entry.
export default {
  ...dev,
  async fetch(request, env, execution) {
    const response = await dev.fetch!(request, env, execution)
    if (!['/signin', '/__dev/key'].includes(new URL(request.url).pathname)) return response
    return (await fontDocumentResponse(response))!
  },
} satisfies ExportedHandler<Env>
