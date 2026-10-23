import { ApiError } from '../../platform/http';
import { ringCentralToken } from '../connections/ringcentral';
import { request, safeJson } from '../connections/core';
import { permit, type WorkContext } from './core';
import { currentWorkPrincipal } from './identity';
import { receiveCall } from './phone';

/** Inbound calls on each active RingCentral connection since the last two days, once per call id. Transcripts are not part of the call log. */
export async function pollPhoneLines(ctx: WorkContext) {
  await currentWorkPrincipal(ctx);
  permit(ctx, ['owner']);
  const rows = (await ctx.env.DB.prepare("SELECT * FROM connections WHERE workspace_id=? AND status='active' AND provider='ringcentral'").bind(ctx.principal.workspaceId).all<any>()).results;
  const items = [];
  for (const row of rows) {
    try {
      const { origin, token } = await ringCentralToken(ctx, row);
      const since = new Date(Date.now() - 2 * 86_400_000).toISOString();
      const log = await safeJson(await request(`${origin}/restapi/v1.0/account/~/extension/~/call-log?direction=Inbound&view=Detailed&withRecording=true&perPage=100&dateFrom=${encodeURIComponent(since)}`, { headers: { Authorization: `Bearer ${token}` } }));
      if (!Array.isArray(log.records)) throw new ApiError(502, 'provider_schema_invalid', 'Call log is invalid');
      let seen = 0;
      for (const call of log.records) {
        if (typeof call?.id !== 'string' || typeof call.from?.phoneNumber !== 'string') continue;
        const result = await receiveCall(ctx, { connectionId: row.id, callId: call.id, from: call.from.phoneNumber, startedAt: call.startTime, durationSeconds: call.duration, recordingUrl: call.recording?.contentUri });
        if (result.state === 'ticketed' && !('replayed' in result)) seen++;
      }
      items.push({ id: row.id, state: 'ok', seen });
    } catch (error) { items.push({ id: row.id, state: 'failed', error: error instanceof ApiError ? error.code : 'phone_poll_failed' }); }
  }
  return { items };
}
