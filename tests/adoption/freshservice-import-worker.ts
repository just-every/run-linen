import { createApplication } from '../../src/application';
import type { Env } from '../../src/platform/types';
const app=createApplication();
const bodyReads=new Map<string,{read:Promise<void>;resolve:()=>void}>();
function bodyRead(id:string) {
  let signal=bodyReads.get(id);
  if(!signal){let resolve!:()=>void;const read=new Promise<void>(done=>{resolve=done;});signal={read,resolve};bodyReads.set(id,signal);}
  return signal;
}
export default {fetch(request:Request,env:Env,execution:ExecutionContext) {
  // Observe the real route reading its body after authentication. This only
  // synchronizes the streaming HTTP test; it never supplies an auth result.
  const waitId=new URL(request.url).pathname.match(/^\/__test\/body-read\/([^/]+)$/)?.[1];
  if(waitId)return bodyRead(waitId).read.then(()=>{bodyReads.delete(waitId);return new Response(null,{status:204});});
  const readId=request.headers.get('X-Test-Body-Read');
  if(readId){const body=request.body,signal=bodyRead(readId);Object.defineProperty(request,'body',{get(){signal.resolve();return body;}});}
  // A SQL read-only probe over the real D1 binding, never a fake application response.
  const db=env.DB,readOnly=request.headers.get('X-Test-Read-Only')==='1';
  env={...env,DB:{prepare(sql:string){if(readOnly&&!/^\s*SELECT\b/i.test(sql))throw new Error('DRY_RUN_ATTEMPTED_MUTATION');return db.prepare(sql);},async batch(statements:D1PreparedStatement[]){try{return await db.batch(statements);}catch(error){console.error('Fixture D1 batch failed',String(error));throw error;}}} as D1Database};
  return app.fetch(request,env,execution);
}};
