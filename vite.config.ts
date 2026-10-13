import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { archiveOutputGuard } from '@runeditrun/rer/archive-output'
import { excludeLocalVariables } from './vite/exclude-local-variables'
const local=(name:string)=>process.env[name]?{[name]:process.env[name]}:{}
export default defineConfig(({command,isPreview})=>({
 preview:{host:'127.0.0.1'},
 server:{fs:{allow:['src','public','node_modules'],deny:['**/.rer/**','**/.seed/**','**/exports/**','**/*.rer']}},
 plugins:[cloudflare({inspectorPort:false,viteEnvironment:{name:'ssr'},persistState:{path:'.wrangler/state'},config:command==='serve'&&!isPreview?{main:'./src/server.dev.ts',vars:{...local('RER_DEV_ORIGIN'),...local('RER_DEV_KEY'),...local('RER_DEV_IDENTITY')}}:{assets:{binding:'ASSETS',run_worker_first:true}}}),tanstackStart(),react(),excludeLocalVariables(),archiveOutputGuard()],
}))
