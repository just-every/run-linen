import type {Context} from 'hono';
import type {AppEnv} from '../../../platform/types';
import type {AdoptionContext} from '../core';
import {importContext as fileImportContext,requestContext as fileRequestContext} from '../freshservice-import/context';
import {ApiError} from '../../../platform/http';
import {servicenowTargets} from './targets';
import {MAPPING_VERSION} from './mapping';
async function scope(context:Awaited<ReturnType<typeof fileImportContext>>,ctx:AdoptionContext) {
 const revision=(await ctx.env.DB.prepare('SELECT revision FROM servicenow_import_privacy WHERE workspace_id=?').bind(context.destination).first<{revision:number}>())?.revision??0;
 const predicate=context.authorization.predicate;
 return {...context,mappingVersion:MAPPING_VERSION,storage:{database:context.storage.database,targets:servicenowTargets},authorization:{...context.authorization,predicate(action:Parameters<typeof predicate>[0],destination:string){const prior=predicate(action,destination);return {sql:`(${prior.sql}) AND (?='erase' OR COALESCE((SELECT revision FROM servicenow_import_privacy WHERE workspace_id=?),0)=?)`,params:[...prior.params??[],action,destination,revision]};}}};
}
export async function importContext(ctx:AdoptionContext,namespace:string){return scope(await fileImportContext(ctx,namespace),ctx);}
export async function requestContext(c:Context<AppEnv>,namespace:string){return scope(await fileRequestContext(c,namespace),{env:c.env,principal:c.get('principal')});}
export async function jobContext(c:Context<AppEnv>,id:string){const row=await c.env.DB.prepare("SELECT namespace FROM ik_jobs WHERE id=? AND destination=? AND principal_id=? AND namespace LIKE 'servicenow:%'").bind(id,c.get('principal').workspaceId,c.get('principal').userId).first<{namespace:string}>();if(!row)throw new ApiError(404,'not_found','Import job not found');return requestContext(c,row.namespace);}
