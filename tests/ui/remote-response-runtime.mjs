import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const require=createRequire(import.meta.url),wr=createRequire(require.resolve('wrangler/package.json')),{build}=wr('esbuild');
const scratch=await mkdtemp(join(tmpdir(),'linen-remote-response-'));
const slots=[],effects=[],scheduled=[],requests=[],timers=new Map();let cursor=0,nextTimer=0;
const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
globalThis.__linenHooks={
 useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}];},
 useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
 useCallback(fn){cursor++;return fn;},
 useEffect(fn,deps){const i=cursor++;if(!same(effects[i]?.deps,deps)){scheduled.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}});}},
 request(path,options){return new Promise((resolve,reject)=>requests.push({path,options,resolve,reject}));}
};
const oldWindow=globalThis.window,oldDocument=globalThis.document;
globalThis.window={setInterval(fn){const id=++nextTimer;timers.set(id,fn);return id;}};
globalThis.document={visibilityState:'visible'};
const oldClearInterval=globalThis.clearInterval;globalThis.clearInterval=id=>timers.delete(id);
const flush=async()=>{await new Promise(resolve=>setImmediate(resolve));};
try {
 await build({entryPoints:[resolve('src/ui/state.tsx')],outfile:join(scratch,'state.cjs'),bundle:true,format:'cjs',platform:'node',logLevel:'silent',plugins:[{name:'synthetic-hook-and-transport-boundary',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'fixture'}));b.onResolve({filter:/^\.\/api$/},()=>({path:'api',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='api'?'export const request=(...args)=>globalThis.__linenHooks.request(...args)':'export const useState=(...a)=>globalThis.__linenHooks.useState(...a); export const useEffect=(...a)=>globalThis.__linenHooks.useEffect(...a); export const useRef=(...a)=>globalThis.__linenHooks.useRef(...a); export const useCallback=(...a)=>globalThis.__linenHooks.useCallback(...a); export const createContext=()=>({}); export const useContext=()=>null;',loader:'js'}));}}]});
 const {useRemote}=require(join(scratch,'state.cjs'));
 function render(path,poll=0){cursor=0;const state=useRemote(path,poll);while(scheduled.length)scheduled.shift()();return state;}
 render('/old',10);const old=requests.at(-1);
 render('/new',10);const fresh=requests.at(-1);assert.equal(old.options.signal.aborted,true);
 assert.equal(render('/new',10).data,null,'changing routes clears the previous route data');
 fresh.resolve({id:'new'});await flush();assert.deepEqual(render('/new',10).data,{id:'new'});
 old.resolve({id:'stale'});await flush();assert.deepEqual(render('/new',10).data,{id:'new'},'late parsed response from prior route ignored');
 render('/new',10).refresh();render('/new',10);const refresh=requests.at(-1);
 assert.deepEqual(render('/new',10).data,{id:'new'},'refresh retains the current list while loading');
 const poll=timers.values().next().value;const polling=poll();const newer=requests.at(-1);newer.resolve({id:'newer-poll'});await polling;
 refresh.resolve({id:'stale-refresh'});await flush();assert.deepEqual(render('/new',10).data,{id:'newer-poll'},'older initial refresh cannot overwrite newer poll');
 render('/new',10).refresh();render('/new',10);const oldError=requests.at(-1);
 const pollingAgain=timers.values().next().value();requests.at(-1).resolve({id:'healthy'});await pollingAgain;
 oldError.reject(new Error('late old failure'));await flush();assert.equal(render('/new',10).error,null);
 const failurePoll=timers.values().next().value();requests.at(-1).reject(new Error('current poll unavailable'));await failurePoll;
 assert.match(String(render('/new',10).backgroundError),/current poll unavailable/);
 render('/new',10).refresh();render('/new',10);requests.at(-1).resolve({id:'recovered'});await flush();assert.equal(render('/new',10).backgroundError,null);
 console.log('PASS actual useRemote with synthetic hook scheduler/transport: prior route late response ignored, refresh/poll ordering, superseded error ignored, current background failure visible and explicit refresh clears it. No browser or real React lifecycle acceptance claimed.');
} finally {
 for(const effect of effects)effect?.cleanup?.();
 delete globalThis.__linenHooks;globalThis.window=oldWindow;globalThis.document=oldDocument;globalThis.clearInterval=oldClearInterval;
 await rm(scratch,{recursive:true,force:true});
}
