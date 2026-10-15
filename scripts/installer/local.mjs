import { localInstaller } from '@runeditrun/rer/local-installer'
import { developmentTarget,previewTarget } from '@runeditrun/rer/operator-installer'
import { installOperator } from '@runeditrun/rer/operator-install'
import { commandAdapter as createCommandAdapter } from '@runeditrun/rer/adapter'
import { refuse } from '@runeditrun/rer/errors'
import { selectLocalState } from '@runeditrun/rer/local/state'
import { privateDirectory } from '@runeditrun/rer/private-files'
import { localOwner,localPrerequisites } from './native-state.mjs'
import { portability } from './portability.mjs'
const lifecycle=localInstaller({
 node:'22.20.0',features:{hosting:false,artwork:false,github:false,localTrialWithoutEmail:true},
 localOwner,
 async prepare({root}){await selectLocalState(root);await privateDirectory(root,['.wrangler','state'])},
 guard:async({root})=>{await selectLocalState(root)},
 secrets:{keepExisting:true,originKey:'AUTH_ORIGIN',values:({origin})=>({AUTH_LOCAL:'true',AUTH_ORIGIN:origin,MAIL_PROVIDER:'development',MAIL_FROM:'auth@localhost.test'})},
 build:['pnpm',['run','build:app']],migrate:({demo})=>['pnpm',['exec','wrangler','d1','migrations','apply','linen','--local','--persist-to',demo?.state??'.wrangler/state','--config',demo?'wrangler.jsonc':'dist/server/wrangler.json']],
 start:previewTarget,owner:{existingOwnerViaSignIn:true,displayName:input=>input.displayName||'Owner',returnTo:'/setup'},signIn:{emailKey:'OWNER_EMAIL',returnTo:'/setup'},
})
export const adapter={...lifecycle,localPrerequisites}
export const install=(root,input,store,onApp,signal)=>installOperator(root,input,store,onApp,signal,lifecycle.hooks)
export const commandAdapter=createCommandAdapter(adapter,{
 dev:developmentTarget,preview:previewTarget,verify:['pnpm',['run','verify:app']],deploy:Object.assign(async()=>{throw refuse('Deployment is blocked: rer 0.2.0 owner-account deployment derives new resource names. Linen must retain Worker linen, D1 linen and R2 linen-attachments. Base deploy-kit needs an existing-resource identity contract before deployment.')},{declaration:'deploy.json'}),portability,
 setup:{manifestFile:'rer-setup.json'},site:{entry:'src/site/pages.tsx',output:'dist/site',declaration:'deploy-site.json',config:'vite.site.config.ts'},browserModule:'scripts/installer/ui/seed.mjs',publicPages:['/','/app','/signin','/setup'],
 devIdentity:{entry:'src/server.dev.ts',output:['dist'],emailLinkTest:'tests/platform/base-auth-runtime.mjs'},
 localOnlyKeys:['RER_DEV_KEY','RER_DEV_ORIGIN','RER_DEV_IDENTITY','RER_DEMO','RER_DEMO_EXPIRES','RER_STATE_DIR'],product:'Linen',input:{names:{email:'OWNER_EMAIL',name:'displayName'}},
})
