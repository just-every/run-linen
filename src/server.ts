import { withDemo, demoEffect } from './modules/demo/index.mjs'
import { setModelEffect } from './features/intelligence/model-effect'
import { seedDemo, demoOwner, demoOwnerClaim, demoBindings } from './demo'
import start from '@tanstack/react-start/server-entry'
import { baseAuthResponse } from './platform/base-auth/http'
import { originBindings } from './platform/base-auth/service'
import { staticAssetResponse } from './base/static-assets'
import { dispatch } from './base/dispatch'
import { createApplication } from './application'
import { processScheduledWork } from './scheduler'
import type { Env } from './platform/types'
import { documentResponse } from './platform/document-response'
import { fontDocumentResponse } from './base/font-response'
const api = createApplication()
setModelEffect(demoEffect)
export default withDemo({
 async fetch(request,env,execution){env=originBindings(await demoBindings(env));const claim=await demoOwnerClaim(request,env);if(claim)return claim;const asset=await staticAssetResponse(request,env);if(asset)return documentResponse(asset);const base=await baseAuthResponse(request,env);if(base)return documentResponse((await fontDocumentResponse(base))!);return documentResponse(await dispatch(request,()=>api.fetch(request,env,execution),()=>start.fetch(request)))},
 async scheduled(_controller,env){await processScheduledWork(await demoBindings(env))},
} satisfies ExportedHandler<Env>, { seed: seedDemo, owner: demoOwner })
