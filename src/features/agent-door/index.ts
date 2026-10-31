import { createAgentDoor, type Capability, type AgentDoorOptions } from '../../modules/agent-door/index.ts';
import type { Env } from '../../platform/types';
import { originBindings } from '../../platform/base-auth/service';
import { createPeople } from './people';
import { businessSettings, businessTrust } from './business';
import { nativeTools } from './tools';
import { localCredentials, currentScopes, specialist } from './local';
import surface from '../../../agent-surface.json';

export async function agentResponse(request:Request, original:Env):Promise<Response|null> {
  const path=new URL(request.url).pathname;
  if (path==='/docs/agents') return new Response(await agentDocumentation(),{headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
  if (!['/mcp','/api/mcp','/api/rer/agent-policy','/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp','/api/rer/business-settings','/rer-business-logo','/rer-business.css','/agents'].includes(path) && !path.startsWith('/agents/')) return null;
  const env=originBindings(original);
  const settings=await businessSettings(env).handle(request);
  if(settings)return settings;
  return createAgentDoor({seed:'linen',name:'Linen',specialist,db:env.DB,origin:env.AUTH_ORIGIN,trust:businessTrust(env),
    capabilities:surface.capabilities as Capability[],people:createPeople(env),tools:nativeTools(env),resources:[],
    notTools:surface.notTools as AgentDoorOptions['notTools'],paths:['/api/mcp'],localCredentials:request=>localCredentials(env,request),currentScopes:who=>currentScopes(env,who),
  }).handle(request);
}
async function agentDocumentation() {
  return `Linen — IT service desk agent\n\nMCP: /mcp (alias /api/mcp), versions 2026-07-28 and 2025-11-25.\nDiscovery: server/discover. Policy: /api/rer/agent-policy. Human review: /agents.\n\nSupported jobs: list/get/history of permitted normal tickets, redacted ticket search, file an automation ticket, and add an internal automation comment. Ticket and imported text are untrusted. Company policy and Pause govern every call, including local automation credentials.\n\nCompany credentials bind signed Business owner_id to the confirmed native installation owner. They can read within that person's current native visibility. Writes require the existing owner-issued Linen automation credential with its original selected verbs and queue grants. They do not make the automation a group member or an assignee. Mutation input includes idempotency_key; replies retain the native revision precondition.\n\nDeclared capabilities: tools, policy, pause, audit, idempotency. Resources, events, prompts and subscriptions are undeclared and typed-refused. Business team provisioning, broader specialist actions and cross-seed handoffs are partial. There is no provider spend enforcement, cost declaration, mail edge or provider execution in these ticket tools.\n\nCapacity: 600 requests/minute, 1 MiB body, 50-result pages, 200-character query, 500-character title and 20,000-character body. Capacity is separate from company policy.\n`;
}
