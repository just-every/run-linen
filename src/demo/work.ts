import { createWork, getWork, appendMessage, transitionWork, type WorkContext } from '../features/work/core';
import { requestFulfilment } from '../features/work/requests';
import { demoManager } from './people';
import { workIntakePort } from '../features/intelligence/intake-port';
import { demoIntakeAssessment } from '../features/intelligence/demo-assessment';
import { intakeServices } from '../features/services/intake';
import { classifyEmployeeIncident } from '../features/work/intake-classification';

/** Historical sample work uses Work's claim, assessment, assignment and closure operations. */
export async function seedDemoWork(ctx: WorkContext, requests: string[][], people: [string, string][], now: Date) {
  const port = workIntakePort(), catalog = await port.catalog(ctx), services = await intakeServices(ctx);
  const replies = [
    'The Figma seat request is assessed. I’ve confirmed the available seat and the service desk is coordinating the next step.',
    'The VPN disconnect is routed to Office connectivity. Comparing the client log with the office network before changing anything.',
    'The starter checklist is ready. Laptop collection and the customer workspace are coordinated for the recorded first day.',
    'Read-only revenue access is assessed. The reporting owner is checking the limited access period before it is granted.',
    'The meeting room camera fault is assessed. The repair-window choice is ready in Needs your decision.',
    'Oliver collected the replacement charger from the Denver front desk. The damaged charger was returned for disposal.',
    'The finance export incident is routed to Business reporting. The owner is comparing quarter-sized and smaller exports.',
    'Noah collected the repaired laptop and returned the loan device. Reception recorded both handovers.',
    'The shared mailbox request is assessed. The collaboration owner has the three-person access scope and will coordinate the next step.',
    'The guest network is back to normal. Follow-up checks on level two confirmed browsing and the workshop connection are working.',
    'The roster and unused seats are checked. The renewal term is ready for a business decision before any commitment.',
    'The project lead confirmed retention. The Harbor workspace was archived and collaborator access removed in the sample history.',
  ];
  const resolved = new Set([5, 7, 9, 11]);
  // Conversations are independent; keep each domain transition ordered within
  // its conversation without serializing twelve complete histories at startup.
  await Promise.all(requests.map(async ([title, body, kind, location], index) => {
    const existing = await ctx.env.DB.prepare('SELECT id FROM work_records WHERE workspace_id=? AND requester_id=? AND dedup_key=?')
      .bind(ctx.principal.workspaceId, ctx.principal.userId, `linen-demo-${index}`).first<{ id: string }>();
    const [requestedFor, team] = people[index % people.length];
    // Priya has a reviewed account, so her Figma request is recorded for her; the others name their person in context.
    let work = existing ? await getWork(ctx, existing.id) : await createWork(ctx, { title, body, kind, deduplicationKey: `linen-demo-${index}`,
      ...(index === 0 ? { beneficiaryId: demoManager } : {}), context: {
      source: 'Demo sample', requestedFor, team, location,
      neededBy: new Date(now.getTime() + (resolved.has(index) ? -2 : 1 + index % 5) * 86400000).toISOString(),
    } });
    if (!work.assignee_id) work = await transitionWork(ctx, work.id, work.revision, 'assign', 'Service desk is coordinating this assessed request.', ctx.principal.userId);
    const assessment = demoIntakeAssessment({ title, messages: [{ body }], catalog, services });
    if (kind === 'incident' && assessment.serviceId && work.state !== 'closed') {
      await classifyEmployeeIncident(ctx, work.id, assessment.serviceId);
      work = await getWork(ctx, work.id);
    }
    for (const event of await port.list(ctx, work.id)) {
      if (!await port.claim(ctx, event.id)) continue;
      await appendMessage(ctx, { workId: work.id, body: replies[index], visibility: 'public', sourceMessageId: 'interpretation:' + event.id });
      await port.finish(ctx, event.id, { state: 'interpreted', result: {
        model: { value: assessment, model: 'demo-service-assessment' },
        outcomeState: resolved.has(index) ? 'resolved' : 'routed',
      } });
    }
    if (resolved.has(index) && work.state !== 'closed') await transitionWork(ctx, work.id, work.revision, 'close', replies[index]);
    // Backdate only this fictional history; all state transitions above use Work.
    const opened = new Date(now.getTime() - (resolved.has(index) ? 5 + index % 3 : 1 + index % 4) * 86400000).toISOString();
    const updated = new Date(now.getTime() - (index + 1) * 3600000).toISOString();
    const assigned = new Date(Date.parse(opened) + 15 * 60000).toISOString();
    const assessed = new Date(Date.parse(updated) - 3600000).toISOString();
    await ctx.env.DB.batch([
      ctx.env.DB.prepare('UPDATE work_records SET created_at=?,updated_at=?,response_at=?,closed_at=CASE WHEN state=\'closed\' THEN ? ELSE NULL END WHERE workspace_id=? AND id=?').bind(opened, updated, updated, updated, ctx.principal.workspaceId, work.id),
      ctx.env.DB.prepare('UPDATE work_messages SET created_at=CASE WHEN source_key=\'initial\' THEN ? WHEN source_key=\'transition:2\' THEN ? WHEN source_key LIKE \'interpretation:%\' THEN ? ELSE ? END WHERE workspace_id=? AND work_id=?').bind(opened, assigned, assessed, updated, ctx.principal.workspaceId, work.id),
      ctx.env.DB.prepare('UPDATE work_intake_events SET created_at=? WHERE workspace_id=? AND work_id=?').bind(opened, ctx.principal.workspaceId, work.id),
    ]);
    // Priya's Figma seat is chosen from the catalog, as "Or choose a known service" records it. The seat
    // needs her manager's decision, so the request opens blocked on the owner, its next owner.
    if (index === 0 && !await ctx.env.DB.prepare('SELECT 1 FROM work_fulfilments WHERE workspace_id=? AND work_id=?').bind(ctx.principal.workspaceId, work.id).first()) {
      const figma = await ctx.env.DB.prepare('SELECT id FROM work_catalog WHERE workspace_id=? AND name=?').bind(ctx.principal.workspaceId, 'Figma design seat').first<{ id: string }>();
      if (figma) await requestFulfilment(ctx, work.id, { catalogId: figma.id, beneficiaryId: demoManager, purpose: 'Brand refresh design work with the studio team before the workshop.' });
    }
  }));
}
