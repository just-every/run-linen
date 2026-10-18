import { getWork, recordRequestedFor } from '../work/core';
import type { IntelligenceContext } from './types';

/** "Priya" and "Priya Shah" name the same person. A match only ever lets a service go to the recorded account; a name never grants one. */
export const sameName = (named: string, full: string) => {
  const a = named.trim().toLowerCase().split(/\s+/), b = full.trim().toLowerCase().split(/\s+/);
  return a.length <= b.length && a.every((word, index) => word === b[index]);
};

/** The account a request is recorded for, by name, for the assessment to tell it apart from the person the words name. */
export async function recordedForName(ctx: IntelligenceContext, beneficiaryId: string) {
  return (await ctx.env.DB.prepare('SELECT name FROM users WHERE id=?').bind(beneficiaryId).first<{ name: string }>())?.name || '';
}

/** When the request's words (or its recorded context) name someone other than the account it is recorded for, Linen
    records no service for that account. It records the named person as the request's own fact and says why. */
export async function holdForNamedPerson(ctx: IntelligenceContext, workId: string, requestedFor: unknown) {
  const work = await getWork(ctx, workId);
  let context: Record<string, unknown> = {};
  try { context = JSON.parse(work.context_json || '{}') || {}; } catch { /* An unreadable context names no one. */ }
  const recorded = typeof context.requestedFor === 'string' ? context.requestedFor.trim() : '';
  const named = (typeof requestedFor === 'string' ? requestedFor.trim() : '') || recorded;
  if (!named) return null;
  const account = await recordedForName(ctx, work.beneficiary_id);
  if (sameName(named, account)) return null;
  if (!recorded) await recordRequestedFor(ctx, work.id, named);
  return {
    state: 'held_for_person', named,
    // The full reason is said once; a later message on the same request only confirms that nothing was recorded.
    message: recorded ? `Still no service recorded: this request is for ${named}, and Linen records a service only for the account a request is for.` : `This request names ${named}, but it is recorded for ${account}. Linen records a service only for the account a request is for, so no service was recorded. Start a request for ${named}’s own account, or ${named} can ask from it; a person without an account can’t have a service recorded yet.`,
  };
}
