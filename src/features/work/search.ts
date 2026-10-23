import type { Hono } from 'hono';
import type { AppEnv } from '../../platform/types';
import { ApiError, id, now } from '../../platform/http';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { normalizeSearch, searchScore } from './search-match';
import { searchDocuments, searchTypes, type SearchType } from './search-sources';

export async function globalSearch(ctx:WorkContext, query:string, type:string, offsetText:string) {
  await currentWorkPrincipal(ctx);
  if(!ctx.principal.departmentRoles?.length)permit(ctx,['owner','operator','hr']);
  if (query.length>200 || (type && !searchTypes.includes(type as SearchType)) || !/^(0|[1-9]\d*)$/.test(offsetText) || !Number.isSafeInteger(Number(offsetText)))
    throw new ApiError(422,'search_input','Use a query of at most 200 characters, a supported type and a nonnegative offset');
  const counts=Object.fromEntries(searchTypes.map(t=>[t,0])) as Record<SearchType,number>;
  const offset=Number(offsetText),pageSize=50;
  const documents=normalizeSearch(query)?await searchDocuments(ctx):[];
  const matches=documents.map(doc=>({...doc,score:searchScore(query,doc.fields)})).filter(doc=>doc.score>0 && (!type||doc.type===type));
  matches.sort((a,b)=>b.score-a.score||a.type.localeCompare(b.type)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
  for (const result of matches) counts[result.type]++;
  // A role change during a read cannot return an earlier, broader projection.
  const roles=JSON.stringify([[...ctx.principal.roles].sort(),[...(ctx.principal.departmentIds??[])].sort(),ctx.principal.departmentRoles]);
  await currentWorkPrincipal(ctx);
  if (roles!==JSON.stringify([[...ctx.principal.roles].sort(),[...(ctx.principal.departmentIds??[])].sort(),ctx.principal.departmentRoles])) throw new ApiError(409,'search_scope_changed','Your permissions changed; search again');
  await ctx.env.DB.prepare('INSERT INTO audit_events VALUES(?,?,?,?,?,?,?)')
    .bind(id(),ctx.principal.workspaceId,ctx.principal.userId,'search.privileged_read','global-search','{}',now()).run();
  return {query,type,offset,pageSize,total:matches.length,counts,
    items:matches.slice(offset,offset+pageSize).map(({fields,score,...item})=>item)};
}
export function registerSearchRoutes(app:Hono<AppEnv>) {
  app.get('/search',async c=>{
    c.header('Cache-Control','private, no-store');
    return c.json(await globalSearch({env:c.env,principal:c.get('principal')},c.req.query('q')||'',c.req.query('type')||'',c.req.query('offset')||'0'));
  });
}
