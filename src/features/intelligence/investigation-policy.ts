import { now } from '../../platform/http';
import { getWork } from '../work/core';
import { getService } from '../services/store';
import { listCommitments, getCommitment } from './commitments';
import { current, assert } from './access';
import type { IntelligenceContext } from './types';

/** An owner-authored service commitment, not a model-selected actor, delegates research. */
export async function investigationPolicy(ctx: IntelligenceContext, workId: string, serviceId: string, commitmentId?: string) {
  ctx = await current(ctx);
  const work = await getWork(ctx,workId), service = await getService(ctx.env.DB,ctx.principal,serviceId,'service');
  assert(work.requester_id === ctx.principal.userId && work.sensitivity === 'normal' && !['closed','cancelled'].includes(work.state),'intake_route_scope',403);
  const candidates = commitmentId ? [await getCommitment(ctx,commitmentId)] : await listCommitments(ctx);
  const permitted = candidates.filter(c => c.data.serviceId === service.id && c.ownerId === service.ownerId && c.sensitivity !== 'hr'
    && [work.requester_id,work.beneficiary_id].every(p => c.ownerId === p || c.participants.includes(p))
    && c.data.effectiveAt <= now() && (!c.data.expiresAt || c.data.expiresAt > now()) && c.data.modelConnectionId);
  if (permitted.length !== 1) return null;
  const commitment = permitted[0];
  const actor = await current({...ctx,principal:{...ctx.principal,userId:commitment.ownerId,roles:[]}},['owner','operator']);
  await getWork(actor,workId);
  await getCommitment(actor,commitment.id);
  return {commitment,actor,service,work};
}
