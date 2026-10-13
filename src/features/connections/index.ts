import type {Hono} from 'hono'
import type {AppEnv} from '../../platform/types'
import {jsonBody} from '../../platform/http'
import {testConnection,disconnectConnection,setDefaultModel,connectionStatus} from './validation'
import {discoverConnection,discoveryReview} from './discovery'
import {applyDiscovery} from './review'
export {testConnection,disconnectConnection,setDefaultModel,connectionStatus,discoverConnection,discoveryReview,applyDiscovery}
export type {ConnectionContext} from './core'
export type {DiscoveryItem,DiscoverySnapshot} from './discovery'
export type {ReviewChoice} from './review'
export function registerConnectionRoutes(app:Hono<AppEnv>){
 app.get('/connection-status',async c=>c.json(await connectionStatus({env:c.env,principal:c.get('principal')})))
 app.post('/connections/:id/test',async c=>{const b=await jsonBody(c);return c.json(await testConnection({env:c.env,principal:c.get('principal')},c.req.param('id'),b.revision as number))})
 app.post('/connections/:id/disconnect',async c=>{const b=await jsonBody(c);return c.json(await disconnectConnection({env:c.env,principal:c.get('principal')},c.req.param('id'),b.revision as number))})
 app.post('/connections/:id/discover',async c=>c.json(await discoverConnection({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c) as any)))
 app.get('/connection-discovery',async c=>c.json(await discoveryReview({env:c.env,principal:c.get('principal')})))
 app.post('/connection-discovery/:id/apply',async c=>c.json(await applyDiscovery({env:c.env,principal:c.get('principal')},c.req.param('id'),await jsonBody(c) as any)))
 app.post('/connection-default-model',async c=>c.json(await setDefaultModel({env:c.env,principal:c.get('principal')},await jsonBody(c) as any)))
}
