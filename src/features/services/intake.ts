import type { WorkContext } from '../work/core';
import { classifyEmployeeIncident } from '../work/intake-classification';
import { list } from './store';
import { linkIncident } from './incidents';

/** Requester-scoped correlation; cannot create an incident or change its audience. */
export async function intakeServices(ctx: WorkContext) {
  return (await list(ctx.env.DB, ctx.principal, 'service')).map(s => ({ id: s.id, name: s.data.name, description: s.data.description }));
}
export async function routeEmployeeIncident(ctx: WorkContext, workId: string, serviceId: string) {
  const service = await classifyEmployeeIncident(ctx,workId,serviceId);
  const candidates = (await list(ctx.env.DB,ctx.principal,'incident')).filter(r => r.data.serviceId === service.id && !['restored','closed'].includes(r.data.status));
  // Multiple live incidents need evidence to disambiguate; never guess a shared incident.
  const incident = candidates.length === 1 ? candidates[0] : null;
  if (incident && !(incident.data.links || []).some((l:any) => l.employeeIncidentId === workId))
    await linkIncident(ctx.env.DB,ctx.principal,incident.id,incident.revision,workId);
  return {serviceId:service.id,serviceRevision:service.revision,ownerId:service.ownerId,incidentId:incident?.id || null};
}
