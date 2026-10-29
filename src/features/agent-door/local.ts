import type { Env } from '../../platform/types';
import type { Principal, ToolContext } from '../../modules/agent-door/index.ts';
import { ToolRefusal } from '../../modules/agent-door/index.ts';
import { authenticateMcpRequest, credentialPredicate, type Credential } from '../mcp/authority';
import { toolScopes } from '../mcp/credentials';

export const specialist = 'IT service desk agent';
export async function localCredentials(env: Env, request: Request) {
  if (!request.headers.get('authorization')?.startsWith('Bearer linen_mcp_')) return null;
  const c = await authenticateMcpRequest(env, request);
  return { sponsor: { id: c.created_by }, agent: { id: c.id, name: c.name, specialist },
    clientId: c.id, scopes: JSON.parse(c.scopes_json) as string[] };
}
/** Business client ids never select a local grant, even when an id is guessed. */
export async function nativeClient(env: Env, who: Pick<Principal, 'consent' | 'clientId' | 'person' | 'agent'>): Promise<Credential | null> {
  if (who.consent || !who.clientId || who.agent.id !== who.clientId) return null;
  return env.DB.prepare(`SELECT * FROM mcp_credentials c WHERE c.id=? AND c.created_by=? AND ${credentialPredicate('c')}`)
    .bind(who.clientId, who.person.id).first<Credential>();
}
export async function requireClient(env: Env, ctx: ToolContext) {
  const c = await nativeClient(env, ctx);
  if (!c) throw new ToolRefusal('native_client_required', 'Use a current owner-issued Linen automation credential with the native ticket grant.');
  return c;
}
export async function currentScopes(env: Env, who: Principal) {
  if (who.consent) return [...who.scopes];
  const c = await nativeClient(env, who);
  if (!c) return [];
  const selected = JSON.parse(c.tools_json) as (keyof typeof toolScopes)[];
  return (JSON.parse(c.scopes_json) as string[]).filter(scope => selected.some(tool => toolScopes[tool] === scope));
}
