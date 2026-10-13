import start from '@tanstack/react-start/server-entry'
import { baseAuthResponse } from './platform/base-auth/http'
import { originBindings } from './platform/base-auth/service'
import { staticAssetResponse } from './base/static-assets'
import { dispatch } from './base/dispatch'
import { createApplication } from './application'
import { processScheduledWork } from './scheduler'
import type { Env } from './platform/types'
import { documentResponse } from './platform/document-response'
const api = createApplication()
export default {
 async fetch(request,env,execution){env=originBindings(env);const asset=await staticAssetResponse(request,env);if(asset)return documentResponse(asset);const base=await baseAuthResponse(request,env);if(base)return documentResponse(base);return documentResponse(await dispatch(request,()=>api.fetch(request,env,execution),()=>start.fetch(request)))},
 async scheduled(_controller,env){await processScheduledWork(env)},
} satisfies ExportedHandler<Env>
