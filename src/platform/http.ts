import type { Context } from 'hono'
import type { AppEnv, Role } from './types'
export const id = () => crypto.randomUUID()
export const now = () => new Date().toISOString()
export class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message) } }
export async function jsonBody(c: Context<AppEnv>): Promise<Record<string, unknown>> {
 if (Number(c.req.header('content-length') || 0)>1048576) throw new ApiError(413,'too_large','Request too large')
 let body: unknown; try { body=await c.req.json() } catch { throw new ApiError(400,'invalid_json','Valid JSON required') }
 if (!body || typeof body!=='object' || Array.isArray(body)) throw new ApiError(400,'invalid_json','Object required')
 return body as Record<string,unknown>
}
export function requiredString(value: unknown,name:string,max=1000):string { if(typeof value!=='string'||!value.trim()||value.length>max)throw new ApiError(400,'invalid_field',`${name} is required (maximum ${max} characters)`);return value.trim() }
export function requireRole(c:Context<AppEnv>,...roles:Role[]) { const p=c.get('principal');if(!p||!p.roles.some(r=>roles.includes(r)))throw new ApiError(403,'forbidden','Role does not permit this action');return p }
export async function audit(c:Context<AppEnv>,action:string,target:string,detail:unknown={}) {const p=c.get('principal');await c.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)').bind(id(),p.workspaceId,p.userId,action,target,JSON.stringify(detail),now()).run()}
export function checkOrigin(c:Context<AppEnv>) {const origin=c.env.RER_DEV_ORIGIN||c.env.AUTH_ORIGIN||c.env.APP_ORIGIN||new URL(c.req.url).origin;if(c.req.header('Origin')!==origin)throw new ApiError(403,'origin_denied','Same-origin request required')}

export function auditStatement(c:Context<AppEnv>,action:string,target:string,detail:unknown={},conditional=false) {const p=c.get('principal');return c.env.DB.prepare(`INSERT INTO audit_events SELECT ?,?,?,?,?,?,? ${conditional ? 'WHERE changes()>0' : ''}`).bind(id(),p.workspaceId,p.userId,action,target,JSON.stringify(detail),now())}
