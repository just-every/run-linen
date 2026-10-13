import {Hono} from 'hono'
import {registerConnectionRoutes} from '../../src/features/connections/index'
import {platformApp} from '../../src/platform/routes'
import {registerWorkRoutes} from '../../src/features/work/index'
import {registerIntelligenceRoutes,processDueIntelligence} from '../../src/features/intelligence/index'
import {ApiError} from '../../src/platform/http'
import type {AppEnv} from '../../src/platform/types'
const app=new Hono<AppEnv>()
app.onError((e,c)=>c.json({error:e instanceof ApiError?e.code:e.message},(e instanceof ApiError?e.status:500) as 400))
const api=platformApp();registerWorkRoutes(api);registerConnectionRoutes(api);registerIntelligenceRoutes(api);app.route('/api/v1',api)
app.get('/health',c=>c.json({ok:true}))
// Native scheduler trigger in isolated test entry; no fetch/model/provider interception.
app.post('/scheduled',async c=>c.json(await processDueIntelligence(c.env)))
export default app
