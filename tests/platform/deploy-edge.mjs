// Cloudflare network fixture, loaded only by the deploy command flow test.
import assert from 'node:assert/strict'
const account = 'a'.repeat(32), id = '11111111-1111-4111-8111-111111111111'
globalThis.fetch = async (input, options = {}) => {
 const url = new URL(input)
 assert.equal(url.origin, 'https://api.cloudflare.com')
 assert.equal(options.method ?? 'GET', 'GET', 'Legacy detection must not mutate provider state')
 const path = url.pathname.replace(`/client/v4/accounts/${account}`, '')
 let result
 if (path === '/workers/scripts/linen/settings') result = { bindings: [
  { type: 'd1', name: 'DB', id },
  { type: 'r2_bucket', name: 'ATTACHMENTS', bucket_name: 'linen-attachments' },
 ] }
 else if (path === `/d1/database/${id}`) result = { uuid: id, name: 'linen' }
 else assert.fail(`Unexpected provider request: ${path}`)
 return Response.json({ success: true, errors: [], result })
}
