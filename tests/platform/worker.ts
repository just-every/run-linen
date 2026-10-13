import {Hono} from 'hono'
import {platformApp} from '../../src/platform/routes'
import {authenticated} from '../../src/platform/auth'
import {signAttachment,verifyAttachment} from '../../src/platform/attachments'
import {ApiError} from '../../src/platform/http'
import type {AppEnv} from '../../src/platform/types'
const app=new Hono<AppEnv>()
app.onError((error,c)=>error instanceof ApiError?c.json({error:{code:error.code,message:error.message}},error.status as 400):c.json({error:{code:'internal_error',message:error.message}},500))
app.get('/health',c=>c.json({status:'ok'}))
app.route('/api/v1',platformApp())
// Test-only attachment fixture routes exercise the platform primitives on real R2.
app.use('/test/*',authenticated)
app.post('/test/attachment',async c=>{const key=c.get('principal').workspaceId+'/fixture';await c.env.ATTACHMENTS.put(key,'private bytes');return c.json(await signAttachment(c,key))})
app.get('/test/attachment',async c=>{const key=c.req.query('key')||'';await verifyAttachment(c,key,Number(c.req.query('expires')),c.req.query('signature')||'');const value=await c.env.ATTACHMENTS.get(key);return value?new Response(value.body):c.notFound()})
export default app
