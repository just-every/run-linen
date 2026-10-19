import { getWork, type WorkContext } from './core';
import { dto, getService, type RecordRow } from '../services/store';
import { problemWorkarounds } from '../services/problem-knowledge';

const words = (s: string) => ' ' + s.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim() + ' ';
/** Reviewer-declared phrases must all occur in the report; no model infers a diagnosis. */
export async function suggestWorkarounds(ctx: WorkContext, workId: string) {
  const work = await getWork(ctx, workId);
  if (['cancelled', 'closed'].includes(work.state)) return [];
  const context = JSON.parse(work.context_json);
  if (typeof context.serviceId !== 'string') return [];
  // Validate the service itself before exposing any guidance selected by its identity.
  await getService(ctx.env.DB, ctx.principal, context.serviceId, 'service');
  const messages = await ctx.env.DB.prepare("SELECT body FROM work_messages WHERE workspace_id=? AND work_id=? AND author_id=? AND visibility='public' AND source_key NOT LIKE 'interpretation:%' ORDER BY created_at DESC LIMIT 20")
    .bind(ctx.principal.workspaceId, work.id, work.requester_id).all<{body:string}>();
  const report = words([work.title, ...messages.results.map(m => m.body)].join(' '));
  const cohorts = [context.cohort, ...(Array.isArray(context.cohorts) ? context.cohorts : [])].filter(v => typeof v === 'string');
  const rows = await ctx.env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='problem' AND visibility<>'restricted' AND json_extract(data_json,'$.serviceId')=? AND json_extract(data_json,'$.causeState')='known-error'")
    .bind(ctx.principal.workspaceId, context.serviceId).all<RecordRow>();
  const suggestions = [];
  for (const row of rows.results) {
    for (const link of await problemWorkarounds(ctx.env, ctx.principal, dto(row))) {
      if (!link.usable || !link.symptomTerms?.length || !link.symptomTerms.every((term: string) => words(term).trim() && report.includes(words(term)))) continue;
      if (link.cohorts.length && !link.cohorts.some((c: string) => cohorts.includes(c))) continue;
      suggestions.push({ ...link.article, matchedTerms: link.symptomTerms });
    }
  }
  return suggestions;
}
