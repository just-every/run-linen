import { Hono } from 'hono'
import type { AppEnv } from '../../src/platform/types'
import { ApiError } from '../../src/platform/http'
import { encryptSecret } from '../../src/platform/crypto'
import { registerConnectionRoutes } from '../../src/features/connections'
import { connection } from '../../src/features/execution/connectors'
import { handleNotificationWebhook } from '../../src/features/execution/notifications'

const app = new Hono<AppEnv>()
app.use('*', async (c, next) => {
 c.set('principal', { userId: 'owner', workspaceId: 'a', roles: ['owner'] })
 await next()
})
app.onError((e,c) => c.json({ code: e instanceof ApiError ? e.code : 'internal' }, e instanceof ApiError ? e.status as 400 : 500))
registerConnectionRoutes(app)
app.post('/fixture', async c => {
 const b = await c.req.json()
 await c.env.DB.prepare('INSERT INTO connections VALUES(?,?,?,?,?,?,?,1,?,?)').bind(b.id,'a','sendgrid','Mail',JSON.stringify(b.config),await encryptSecret(c.env.ENCRYPTION_KEY,JSON.stringify({apiKey:'SENSITIVE-KEY'})),'unverified','2026-01-01','2026-01-01').run()
 return c.json({ok:true})
})
app.get('/execution/:id', async c => {
 await connection({env:c.env,principal:c.get('principal')},c.req.param('id'),'sendgrid')
 return c.json({usable:true})
})
app.post('/events/:id', async c => c.json(await handleNotificationWebhook(c.env,c.req.param('id'),c.req.raw)))
export default app
