import type { Context } from 'hono'
import type { AppEnv } from './types'
import { hashToken } from './crypto'
import { ApiError } from './http'
export async function limitLogin(c:Context<AppEnv>,email:string){const time=Date.now(),key=await hashToken(email);const row=await c.env.DB.prepare(`INSERT INTO login_limits(identity_hash,attempts,window_start) VALUES(?,1,?) ON CONFLICT(identity_hash) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts`).bind(key,time,time-900000,time-900000).first<{attempts:number}>();if(row&&row.attempts>20)throw new ApiError(429,'login_limited','Too many attempts. Try again in 15 minutes.')}
