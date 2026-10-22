/** Test-only network-edge barrier. All SQL still executes against the real D1
 * binding; this lets the public erasure route commit before a held import write. */
const barriers = new Map<string,{arrived:boolean;released:boolean}>();
function barrier(key:string) {
 let value=barriers.get(key);
 if(!value){value={arrived:false,released:false};barriers.set(key,value);}
 return value;
}
export async function archiveRaceFetch(request:Request,env:any,execution:any,app:any) {
 const path=new URL(request.url).pathname,match=path.match(/^\/api\/v1\/fixtures\/archive-race\/([\w-]+)\/(arrived|release)$/);
 if(match){const value=barrier(match[1]);if(match[2]==='release')value.released=true;return Response.json({arrived:value.arrived});}
 const key=request.headers.get('X-Test-Archive-Commit');
 if(!key)return app.fetch(request,env,execution);
 const held=barrier(key),sql=new WeakMap<object,{query:string;bindings:any[]}>();let paused=false;
 const before=async(statements:object[])=>{if(!paused&&statements.some(s=>sql.get(s)?.bindings[4]==='work_records'&&/INSERT OR IGNORE INTO adoption_history VALUES/.test(sql.get(s)?.query||''))){paused=true;held.arrived=true;while(!held.released)await new Promise(resolve=>setTimeout(resolve,5));}};
 function statement(value:any,query:string,bindings:any[]=[]):any {
  const wrapped=new Proxy(value,{get(target,property){
   if(property==='bind')return (...args:any[])=>statement(target.bind(...args),query,args);
   if(property==='run')return async(...args:any[])=>{await before([wrapped]);return target.run(...args);};
   const member=Reflect.get(target,property,target);return typeof member==='function'?member.bind(target):member;
  }});sql.set(wrapped,{query,bindings});return wrapped;
 }
 const db=new Proxy(env.DB,{get(target,property){
  if(property==='prepare')return (query:string)=>statement(target.prepare(query),query);
  if(property==='batch')return async(statements:any[])=>{await before(statements);return target.batch(statements);};
  const value=Reflect.get(target,property,target);return typeof value==='function'?value.bind(target):value;
 }});
 return app.fetch(request,{...env,DB:db},execution);
}
