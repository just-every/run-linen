import { getWork, type WorkContext } from './core';
import { getFulfilmentReadiness } from './fulfilment-readiness';

export interface RequestProgress {
  needsAction: boolean; title?: string; dueAt?: string; state: string; happened: string; next: string; ownerId: string | null; ownerLabel: string;
}
/** A deliberately small public projection. Never return model output, error traces or private context. */
export async function requestProgress(ctx: WorkContext, workId: string): Promise<RequestProgress[]> {
  const work = await getWork(ctx, workId), db = ctx.env.DB, w = ctx.principal.workspaceId;
  async function ownerLabel(ownerId: string | null, fallback: string) {
    if (!ownerId) return fallback;
    const row = await db.prepare('SELECT u.name FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.workspace_id=? AND m.user_id=? AND m.active=1')
      .bind(w, ownerId).first<{name:string}>();
    return row?.name || 'Service team (recorded owner unavailable)';
  }
  const items: RequestProgress[] = [];
  const intake = await db.prepare("SELECT state,result_json,lease_until FROM work_intake_events WHERE workspace_id=? AND work_id=? AND connection_id='' ORDER BY created_at DESC,rowid DESC LIMIT 1")
    .bind(w, workId).first<any>();
  if (intake) {
    let state = intake.state;
    if (state === 'interpreting' && intake.lease_until && intake.lease_until <= new Date().toISOString()) state = 'failed';
    const result = JSON.parse(intake.result_json || '{}');
    if (state === 'interpreted' && (result.model?.value?.kind === 'necessary_question' || result.outcomeState === 'necessary_question')) state = 'necessary_question';
    const copy: Record<string, [string,string,string|null,string]> = {
      pending: ['Your message is saved and is waiting to be assessed.', 'Linen will assess it in this conversation. No fulfilment is confirmed.', null, 'Linen'],
      interpreting: ['Linen is assessing your saved message.', 'The result will stay here. No fulfilment is confirmed.', null, 'Linen'],
      necessary_question: ['A required detail is missing.', 'Answer the question in this conversation so Linen can continue.', work.requester_id, 'Requester'],
      needs_configuration: ['Your message is saved, but automatic assessment is unavailable.', 'A workspace owner must review the model connection in Connections & setup. You do not need to resend.', null, 'Workspace owner'],
      budget_held: ['Your message is saved. Automatic assessment is held by its budget.', 'A workspace owner must review the budget before assessment can continue. You do not need to resend.', null, 'Workspace owner'],
      failed: ['Linen could not finish assessing your saved message.', work.assignee_id ? 'The service team must inspect the failed or uncertain attempt before retrying. No completion is confirmed.' : 'A service operator must take ownership and inspect the failed or uncertain attempt before retrying. No completion is confirmed.', work.assignee_id, 'Service team — assignment needed'],
    };
    if (copy[state]) {
      const [happened,next,ownerId,fallback] = copy[state];
      items.push({needsAction: !['pending','interpreting'].includes(state),state,happened,next,ownerId,ownerLabel:await ownerLabel(ownerId,fallback)});
    }
  }
  const duties = (await db.prepare('SELECT kind,state,owner_id,target,due_at FROM work_obligations WHERE workspace_id=? AND work_id=? ORDER BY due_at,id').bind(w,workId).all<any>()).results;
  for (const duty of duties) {
    let ownerId = duty.owner_id, state = duty.state;
    let happened = state === 'verified' ? 'Independent evidence verifies this responsibility.' : state === 'blocked' ? 'This responsibility is blocked.' : state === 'failed' ? 'This responsibility failed.' : state === 'cancelled' ? 'This responsibility is cancelled; existing effects remain recorded.' : 'This responsibility remains open.';
    let next = state === 'verified' ? 'No acknowledgement is needed. Other responsibilities remain separate.' : state === 'cancelled' ? 'The service team must retain and reconcile any existing or uncertain effects.' : duty.kind === 'access.revoke' && duty.due_at > new Date().toISOString() ? 'Removal is scheduled for the recorded expiry and must be verified separately.' : duty.kind.startsWith('device.') ? 'The named owner must arrange the physical handoff and record custody evidence.' : 'The named owner must review current authority and any uncertain effects in Operations & recovery before continuing.';
    if (['access.grant','device.deliver'].includes(duty.kind) && !['verified','cancelled','failed'].includes(state)) {
      const catalog = await db.prepare('SELECT id FROM work_catalog WHERE workspace_id=? AND target=? ORDER BY id LIMIT 2').bind(w,duty.target).all<{id:string}>();
      if (catalog.results.length === 1) {
        const gate = await getFulfilmentReadiness(ctx,workId,catalog.results[0].id);
        if (!gate.ready) {
          ownerId = gate.ownerId;
          state = 'blocked';
          const reasons: Record<string,string> = {
            'Current scoped manager approval is required': 'This request is waiting for its current manager’s decision.',
            'Current catalogue capacity and an owned reservation are required': 'Stock or licence capacity is not reserved for this request.',
            'Current active beneficiary identity required': 'The beneficiary’s current identity needs review.',
            'Current exact fulfilment beneficiary required': 'The selected service is recorded for a different person than this request.',
            'Requested access expiry has passed': 'The requested access period has ended.',
            'Catalogue item is unavailable; fulfilment owner must review': 'The selected catalogue service is unavailable.',
            'Restored fulfilment is held for source-effect reconciliation': 'This restored request is held while its existing effects are reconciled.',
            'Expiry correction is being reconciled; retain the existing effect': 'The expiry correction is being reconciled with the existing effect.',
            'Work is closed or cancelled': 'The request is closed or cancelled. This responsibility remains recorded.',
          };
          happened = reasons[gate.reason || ''] || 'This responsibility is waiting for a current prerequisite.';
          next = gate.reason === 'Current scoped manager approval is required' ? 'The named decision holder must review this request in Needs your decision. Provider authority is checked separately.' : gate.reason === 'Current exact fulfilment beneficiary required' ? 'The fulfilment owner must confirm who the service is for before this request can continue.' : 'The fulfilment owner must resolve the catalogue, identity or capacity prerequisite before this request can continue.';
        }
      }
    }
    const titles: Record<string,string> = {'access.grant':'Requested access','access.revoke':'Access removal','device.deliver':'Device delivery','device.return':'Device return'};
    if (duty.kind === 'access.grant' && !['verified','cancelled'].includes(duty.state)) {
      const pending = await db.prepare(`SELECT p.state,p.error_code FROM intelligence_pending_fulfilments p
        JOIN work_catalog c ON c.workspace_id=p.workspace_id AND c.id=p.catalog_id
        WHERE p.workspace_id=? AND p.work_id=? AND c.target=? ORDER BY p.updated_at DESC LIMIT 1`)
        .bind(w,workId,duty.target).first<{state:string;error_code:string|null}>();
      if (pending?.state === 'blocked') {
        ownerId = duty.owner_id;
        state = 'blocked';
        happened = 'Linen could not continue the recorded fulfilment.';
        next = pending.error_code?.includes('changed')
          ? 'The fulfilment owner must review the changed request before continuing. The old attempt will not establish completion.'
          : 'The fulfilment owner must inspect the blocked attempt and reconcile any uncertain effects before continuing. No completion is confirmed.';
      } else if (pending?.error_code === 'standing_authority_required') {
        ownerId = duty.owner_id;
        state = 'blocked';
        happened = 'Automatic fulfilment lacks current scoped authority or a reviewed identity and verifier binding.';
        next = 'The fulfilment owner must review the supported setup. Your request is retained; you do not need to resend.';
      }
    }
    const needsAction = !['verified','cancelled'].includes(state) && !(duty.kind === 'access.revoke' && duty.due_at > new Date().toISOString() && state === 'pending');
    items.push({needsAction,title:titles[duty.kind] || 'Service responsibility',dueAt:duty.due_at,state,happened,next,ownerId,ownerLabel:await ownerLabel(ownerId,'Service team — assignment needed')});
  }
  return items;
}
