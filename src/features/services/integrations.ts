import { monitoringEvent, verifyPagerDuty } from './monitoring-source';
import { notificationEvent, queueNotification } from './notification-history';
import { serviceEvent, serviceSnapshot } from './history';
import { deliverNoticeMail } from './employee-notice-mail';
import { queueNoticeCadence } from './employee-notices';
import { detectProblemProposals } from './problem-detection';
import { observeIncidentRecovery } from "./recovery";
import { assertAdoptionEffectAllowed } from '../adoption/authority';
import type { Env, Principal } from '../../platform/types';
import { ApiError, id, now, requiredString } from '../../platform/http';
import { decryptSecret, hashToken } from '../../platform/crypto';
import { create, getService, mutate, readable, dto, type RecordRow } from './store';
import { advanceDecision } from './decisions';
import { newIncident } from './incidents';
async function connection(env: Env, p: Principal, key: string, provider: string) {
    const row = await env.DB.prepare('SELECT * FROM connections WHERE workspace_id=? AND id=? AND provider=?').bind(p.workspaceId,key,provider).first<any>();
    if(row&&row.status!=='active'&&!(provider==='monitoring-webhook'&&row.status==='inbound-unobserved'))throw new ApiError(503,'connection_not_active','Connection requires current validation');
    if (!row?.secret_ciphertext)
        throw new ApiError(503, 'needs_configuration', `Configured ${provider} connection required`);
    return { id:row.id,revision:row.revision,status:row.status,config: JSON.parse(row.config_json), secret: JSON.parse(await decryptSecret(env.ENCRYPTION_KEY, row.secret_ciphertext)) };
}
export async function verifySignature(secret: string, timestamp: string, body: string, signature: string, at = Date.now()) {
    if (!/^\d+$/.test(timestamp) || Math.abs(at - Number(timestamp) * 1000) > 300000 || !/^[0-9a-f]{64}$/i.test(signature))
        return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, Uint8Array.from(signature.match(/../g)!.map(x => parseInt(x, 16))), new TextEncoder().encode(`${timestamp}.${body}`));
}
export async function ingestMonitoring(env: Env, p: Principal, monitorId: string, raw: string, timestamp: string, signature: string) {
    if (raw.length > 1048576)
        throw new ApiError(413, 'too_large', 'Monitoring event too large');
    if (!p.roles.some(r => ['integration', 'owner'].includes(r)))
        throw new ApiError(403, 'integration', 'Integration principal required');
    const monitor = await getService(env.DB, p, monitorId, 'monitor');
    const conn = await connection(env, p, monitor.data.connectionId, 'monitoring-webhook');
    if (!(monitor.data.source === 'pagerduty' ? await verifyPagerDuty(conn.secret.signingSecret, raw, signature) : await verifySignature(conn.secret.signingSecret, timestamp, raw, signature)))
        throw new ApiError(401, 'signature', 'Invalid or expired monitoring signature');
    let b: any;
    try {
        b = JSON.parse(raw);
    }
    catch {
        throw new ApiError(400, 'json', 'Invalid monitoring event');
    }
    ;
    b = monitoringEvent(monitor, b);
    const externalId = requiredString(b.id, 'id');
    const digest = await hashToken(raw);
    const existing = await env.DB.prepare('SELECT digest FROM svc_receipts WHERE workspace_id=? AND source_id=? AND external_id=?').bind(p.workspaceId, monitorId, externalId).first<{
        digest: string;
    }>();
    if (existing) {
        if (existing.digest !== digest)
            throw new ApiError(409, 'replay_conflict', 'Event ID reused with different content');
        return { duplicate: true };
    }
    if (!['healthy', 'degraded', 'failed', 'unknown'].includes(b.status) || typeof b.observedAt !== 'string' || !Number.isFinite(Date.parse(b.observedAt)) || Date.parse(b.observedAt) > Date.now() + 1000 || b.serviceId !== monitor.data.serviceId)
        throw new ApiError(400, 'telemetry', 'Status, target and observation time required');
    const stale = Date.now() - Date.parse(b.observedAt) > monitor.data.freshnessMs;
    const alertKey = typeof b.alertKey === 'string' && b.alertKey ? b.alertKey : monitor.id;
    const outOfOrder = (monitor.data.observations || []).some((o: any) => (o.alertKey || monitor.id) === alertKey && Date.parse(o.observedAt) >= Date.parse(b.observedAt));
    const newer = !monitor.data.observedAt || Date.parse(b.observedAt) > Date.parse(monitor.data.observedAt);
    const data = { ...monitor.data, ...(newer ? { status: stale ? 'unknown' : b.status, observedAt: b.observedAt, lastEventId: externalId } : {}), lastReceivedAt: now(), observations: [...(monitor.data.observations || []).slice(-99), { id: externalId, status: b.status, observedAt: b.observedAt, receivedAt: now(), stale, outOfOrder, alertKey, source: b.source, priority: b.priority === 'P1' ? 'P1' : 'unspecified' }] };
    const t = now();
    const result = await env.DB.batch([
 env.DB.prepare("UPDATE svc_records SET data_json=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM connections WHERE workspace_id=? AND id=? AND revision=? AND status IN ('active','inbound-unobserved')) AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=? AND m.user_id=? AND m.active=1 AND role.value IN ('owner','integration'))").bind(JSON.stringify(data),t,p.workspaceId,monitorId,monitor.revision,p.workspaceId,conn.id,conn.revision,p.workspaceId,p.userId),
 serviceEvent(env.DB,p,monitor,serviceSnapshot(monitor),serviceSnapshot({...monitor,data}),'monitor-observed',t),
 env.DB.prepare('INSERT INTO svc_receipts SELECT ?,?,?,?,? WHERE changes()=1').bind(p.workspaceId,monitorId,externalId,digest,t),
 env.DB.prepare("UPDATE connections SET status='active' WHERE workspace_id=? AND id=? AND revision=? AND EXISTS(SELECT 1 FROM svc_receipts WHERE workspace_id=? AND source_id=? AND external_id=? AND received_at=?)").bind(p.workspaceId,conn.id,conn.revision,p.workspaceId,monitorId,externalId,t),
 env.DB.prepare("INSERT INTO connection_validations(workspace_id,connection_id,connection_revision,validated_at,state,evidence_json) SELECT ?,?,?,?,'active',? WHERE EXISTS(SELECT 1 FROM svc_receipts WHERE workspace_id=? AND source_id=? AND external_id=? AND received_at=?) AND EXISTS(SELECT 1 FROM connections WHERE workspace_id=? AND id=? AND revision=? AND status='active') ON CONFLICT(workspace_id,connection_id) DO UPDATE SET connection_revision=excluded.connection_revision,validated_at=excluded.validated_at,state=excluded.state,evidence_json=excluded.evidence_json").bind(p.workspaceId,conn.id,conn.revision,t,JSON.stringify({kind:'authenticated-monitoring-event',monitorId,eventId:externalId,digest,observedAt:b.observedAt,receivedAt:t,proves:'Signed source identity and current connection revision; not usable-work recovery'}),p.workspaceId,monitorId,externalId,t,p.workspaceId,conn.id,conn.revision)
 ]);
    if (!result[0].meta.changes)
        throw new ApiError(409, 'revision_conflict', 'Monitoring observation raced; reconcile stored event');
    return { duplicate: false, status: data.status, outOfOrder, stale };
}
export async function routeOnCall(env: Env, p: Principal, incidentId: string) {
    const r = await getService(env.DB, p, incidentId, 'incident');
    const rotations = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='oncall'").bind(p.workspaceId).all<RecordRow>();
    const selected = rotations.results.map(dto).filter(x => x.data.serviceId === r.data.serviceId && Date.parse(x.data.startsAt) <= Date.now() && Date.parse(x.data.endsAt) > Date.now());
    const recipients = [...new Set(selected.flatMap(x => x.data.recipientIds as string[]))];
    if (!recipients.length)
        return mutate(env.DB, p, r, r.revision, { ...r.data, routing: 'needs_configuration', routingException: 'No active on-call ownership' }, 'oncall-missing');
    const t = r.createdAt;
    await env.DB.batch(recipients.flatMap(user=>queueNotification(env.DB,p,r,user,'oncall-page',{message:r.data.title,serviceId:r.data.serviceId},t)));
    return mutate(env.DB, p, r, r.revision, { ...r.data, routing: 'pending_delivery', onCallRecipients: recipients }, 'oncall-routed');
}
function endpoint(config: any) {
    const u = new URL(config.url);
    if (u.protocol !== 'https:' || u.username || u.password || !Array.isArray(config.allowedHosts) || !config.allowedHosts.includes(u.hostname) || /^([\d.]+|localhost|.*\.local)$/.test(u.hostname))
        throw new ApiError(403, 'endpoint', 'Notification host not allowed');
    return u;
}
export async function deliverNotifications(env: Env, p: Principal) {
    const out = await env.DB.prepare("SELECT * FROM svc_outbox WHERE workspace_id=? AND state='pending' AND kind!='employee-notice' AND next_at<=? ORDER BY next_at LIMIT 50").bind(p.workspaceId, now()).all<any>();
    const results = [];
    for (const job of out.results) {
        const member = await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId, job.recipient_id).first<{
            roles_json: string;
        }>();
        const raw = await env.DB.prepare('SELECT * FROM svc_records WHERE workspace_id=? AND id=?').bind(p.workspaceId, job.record_id).first<RecordRow>();
        const recipient: Principal = { userId: job.recipient_id, workspaceId: p.workspaceId, roles: member ? JSON.parse(member.roles_json) : [] };
        if (!member || !raw || !readable(recipient, dto(raw))) {
            const writes=[env.DB.prepare("UPDATE svc_outbox SET state='access_revoked',error='Recipient access unavailable' WHERE id=? AND workspace_id=? AND state='pending'").bind(job.id,p.workspaceId)];
            if(raw)writes.push(notificationEvent(env.DB,p,dto(raw),job,'pending','access_revoked'));
            await env.DB.batch(writes);
            continue;
        }
        if(!readable(p,dto(raw)))continue;const sender=await env.DB.prepare('SELECT roles_json FROM memberships WHERE workspace_id=? AND user_id=? AND active=1').bind(p.workspaceId,p.userId).first<{roles_json:string}>();if(!sender||!JSON.parse(sender.roles_json).some((role:string)=>['owner','operator'].includes(role)))throw new ApiError(403,'sender_revoked','Current service sender authority required');
        const settings = await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first<{
            settings_json: string;
        }>();
        const connectionId = settings ? JSON.parse(settings.settings_json).notificationConnectionId : null;
        let conn;
        try {
            conn = await connection(env, p, connectionId, 'notification-webhook');
        }
        catch {
            await env.DB.prepare("UPDATE svc_outbox SET error='Notification connection missing' WHERE id=? AND workspace_id=?").bind(job.id, p.workspaceId).run();
            results.push({ id: job.id, state: 'needs_configuration' });
            continue;
        }
        const currentSettings = await env.DB.prepare('SELECT settings_json FROM workspace_settings WHERE workspace_id=?').bind(p.workspaceId).first<{
            settings_json: string;
        }>();
        if (currentSettings && JSON.parse(currentSettings.settings_json).executionHeld === true) {
            results.push({ id: job.id, state: 'held' });
            continue;
        }
        await assertAdoptionEffectAllowed({ env, principal: p }, { resource: job.record_id, action: 'notification.send' });
        const claimed = await env.DB.batch([env.DB.prepare("UPDATE svc_outbox SET state='sending',attempts=attempts+1,connection_id=? WHERE id=? AND workspace_id=? AND state='pending'").bind(connectionId,job.id,p.workspaceId),
          notificationEvent(env.DB,p,dto(raw),job,'pending','sending')]);
        if (!claimed[0].meta.changes)
            continue;
        let state = 'unknown', error: string | null = null, ref: string | null = null;
        try {
            const response = await fetch(endpoint(conn.config), { method: 'POST', headers: { Authorization: `Bearer ${conn.secret.token}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.id }, body: JSON.stringify({ id: job.id, recipient: job.recipient_id, kind: job.kind, ...JSON.parse(job.payload_json) }), redirect: 'manual', signal: AbortSignal.timeout(15000) });
            if (response.ok) {
                const receipt: any = await response.json();
                if (receipt.id === job.id && typeof receipt.deliveryId === 'string') {
                    state = 'submitted';
                    ref = receipt.deliveryId;
                }
                else
                    error = 'Invalid provider receipt';
            }
            else {
                // A redirect can follow an applied write. Never follow or resend it.
                state = (response.status >= 300 && response.status < 400) || response.status >= 500 ? 'unknown' : 'failed';
                error = `Provider HTTP ${response.status}`;
            }
        }
        catch {
            error = 'Transport outcome unknown; reconciliation required';
        }
        await env.DB.batch([env.DB.prepare("UPDATE svc_outbox SET state=?,error=?,provider_ref=? WHERE id=? AND workspace_id=? AND state='sending'").bind(state,error,ref,job.id,p.workspaceId),
          notificationEvent(env.DB,p,dto(raw),job,'sending',state)]);
        results.push({ id: job.id, state });
    }
    return results;
}
/** Receipts are replayed in admitted order, including failure followed by recovery between ticks. */
async function applyMonitorObservations(env: Env, p: Principal, monitor: ReturnType<typeof dto>) {
    const rows = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='incident' AND json_extract(data_json,'$.monitorId')=? ORDER BY created_at,rowid")
        .bind(p.workspaceId, monitor.id).all<RecordRow>();
    const incidents = rows.results.map(dto);
    const observations = monitor.data.observations || [];
    const cursor = observations.findIndex((o: any) => o.id === monitor.data.projectionCursor);
    for (const observation of observations.slice(cursor + 1)) {
        if (observation.stale || observation.outOfOrder || observation.status === 'unknown') continue;
        if (incidents.some(r => (r.data.monitorEvents || []).some((e: any) => e.id === observation.id))) continue;
        const alertKey = observation.alertKey || monitor.id;
        let incident = incidents.filter(i => (i.data.monitorAlertKey || monitor.id) === alertKey).at(-1);
        if (observation.status === 'healthy') {
            if (!incident || incident.data.monitorRecovery || Date.parse(observation.observedAt) < Date.parse(incident.data.monitorStartedAt)) continue;
        } else if (!incident || incident.data.monitorRecovery) {
            // The unique episode key fences competing scheduler workers.
            try {
                incident = await newIncident(env.DB, p, { title: `${monitor.data.name}: ${observation.status}`, serviceId: monitor.data.serviceId,
                    impact: 'Observed service interruption; affected coverage requires confirmation', cohorts: monitor.data.cohorts || ['unassessed'],
                    visibility: 'operators', priority: observation.priority, monitorEventKey: monitor.id + ':' + observation.id,
                    monitorId: monitor.id, monitorAlertKey: alertKey, monitorStartedAt: observation.observedAt, monitorEpisodeKey: monitor.id + ':' + observation.id, context: monitor.data.context });
            } catch (error) {
                const existing = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind='incident' AND json_extract(data_json,'$.monitorEpisodeKey')=?")
                    .bind(p.workspaceId, monitor.id + ':' + observation.id).first<RecordRow>();
                if (!existing) throw error;
                incident = dto(existing);
            }
            incidents.push(incident);
        }
        if (!incident) continue;
        const evidence = { id: observation.id, status: observation.status, observedAt: observation.observedAt, source: observation.source || 'generic' };
        incident = await mutate(env.DB, p, incident, incident.revision, { ...incident.data,
            monitorEvents: [...(incident.data.monitorEvents || []), evidence],
            ...(observation.status !== 'healthy' ? { monitorEventKey: monitor.id + ':' + observation.id } : {}),
            ...(observation.status === 'healthy' ? { monitorRecovery: evidence } : {}) }, 'monitor-incident-observed');
        incidents[incidents.findIndex(i => i.id === incident!.id)] = incident;
        if ((!incident.data.routing || incident.data.routing === 'needs_configuration') && observation.status !== 'healthy') {
            incident = await routeOnCall(env, p, incident.id);
            incidents[incidents.findIndex(i => i.id === incident!.id)] = incident;
        }
    }
    if (observations.length && monitor.data.projectionCursor !== observations.at(-1).id) {
        const current = await getService(env.DB, p, monitor.id, 'monitor');
        await mutate(env.DB, p, current, current.revision, { ...current.data, projectionCursor: observations.at(-1).id }, 'monitor-projected');
    }
}
export async function processDueServices(env: Env, p: Principal) {
    const failures: {
        id: string;
        error: string;
    }[] = [];
    const rows = await env.DB.prepare("SELECT * FROM svc_records WHERE workspace_id=? AND kind IN ('monitor','incident','supplier','decision')").bind(p.workspaceId).all<RecordRow>();
    for (const raw of rows.results) {
        let r = dto(raw);
        if (!readable(p, r))
            continue;
        try {
            if (r.kind === 'decision' && r.data.state === 'chosen' && r.data.fulfilment?.state !== 'verified') {
                await advanceDecision(env, p, r);
                continue;
            }
            if (r.data.adoption?.historical)
                continue;
            if (r.kind === 'monitor') {
                const stale = !r.data.observedAt || Date.now() - Date.parse(r.data.observedAt) > r.data.freshnessMs;
                if (stale && r.data.status !== 'unknown')
                    await mutate(env.DB, p, r, r.revision, { ...r.data, status: 'unknown', projectionCursor: r.data.observations?.at(-1)?.id || null, exception: 'Monitoring observations expired' }, 'monitor-stale');
                if (!stale) await applyMonitorObservations(env, p, r);
            }
            if (r.kind === 'incident') {
                try { r = await observeIncidentRecovery(env, p, r); }
                catch (error) { failures.push({ id: r.id, error: error instanceof ApiError ? error.code : 'recovery_observation_failed' }); }
            }
            const due: {
                kind: string;
                owner: string;
                at: string;
                message: string;
            }[] = [];
            if (r.kind === 'incident')
                for (const update of r.data.updates || [])
                    for (const recipient of update.audience)
                        await env.DB.batch(queueNotification(env.DB,p,r,recipient,'incident-update:'+update.id,{message:update.message},update.at));
            if (r.kind === 'incident' && !['restored', 'closed'].includes(r.data.status) && Date.parse(r.data.nextUpdateAt) <= Date.now())
                due.push({ kind: 'update-due', owner: r.ownerId, at: r.data.nextUpdateAt, message: 'Incident update is due' });
            if (r.kind === 'decision' && ['needs-decision', 'deferred'].includes(r.data.state) && Date.parse(r.data.nextDueAt) <= Date.now())
                due.push({ kind: 'decision-due', owner: r.data.holderId, at: r.data.nextDueAt, message: 'Business decision follow-up is due' });
            if (r.kind === 'supplier')
                for (const commitment of r.data.commitments || [])
                    if (commitment.state !== 'verified' && Date.parse(commitment.dueAt) <= Date.now())
                        due.push({ kind: 'supplier-breach:' + commitment.id, owner: commitment.ownerId, at: commitment.dueAt, message: 'Supplier commitment is overdue' });
            for (const d of due)
                await env.DB.batch(queueNotification(env.DB,p,r,d.owner,d.kind,{message:d.message,recordId:r.id},d.at));
        }
        catch (error) {
            failures.push({ id: r.id, error: error instanceof ApiError ? error.code : 'due_obligation_failed' });
        }
    }
    try { await queueNoticeCadence(env, p); } catch (error) { failures.push({ id: 'employee-notices', error: error instanceof ApiError ? error.code : 'notice_cadence_failed' }); }
    return { noticeMail: await deliverNoticeMail(env, p), notifications: await deliverNotifications(env, p), failures, problemProposals: await detectProblemProposals(env, p) };
}
export async function reconcileNotification(env: Env, p: Principal, notificationId: string) { const job = await env.DB.prepare('SELECT * FROM svc_outbox WHERE workspace_id=? AND id=?').bind(p.workspaceId, notificationId).first<any>(); if (!job)
    throw new ApiError(404, 'not_found', 'Notification not found'); const record=await getService(env.DB,p,job.record_id); if (job.kind === 'employee-notice') throw new ApiError(409, 'mail_receipt', 'SendGrid acceptance is not a delivered receipt; generic webhook reconciliation cannot establish it'); if (!['sending', 'submitted', 'unknown'].includes(job.state))
    return { id: job.id, state: job.state }; const conn = await connection(env, p, job.connection_id, 'notification-webhook'), url = endpoint(conn.config), nonce = id(); url.searchParams.set('id', job.id); url.searchParams.set('nonce', nonce); const start = Date.now(); const response = await fetch(url, { headers: { Authorization: `Bearer ${conn.secret.token}`, 'Cache-Control': 'no-cache' }, redirect: 'manual', signal: AbortSignal.timeout(15000) }); if (!response.ok)
    throw new ApiError(503, 'reconciliation_unavailable', 'Delivery observation unavailable'); const receipt: any = await response.json(); if (receipt.id !== job.id || receipt.nonce !== nonce || !['delivered', 'failed', 'submitted', 'unknown'].includes(receipt.state) || Date.parse(receipt.observedAt) < start || Date.parse(receipt.observedAt) > Date.now() + 1000)
    throw new ApiError(422, 'receipt_invalid', 'Fresh correlated delivery observation required'); await env.DB.batch([env.DB.prepare('UPDATE svc_outbox SET state=?,error=? WHERE workspace_id=? AND id=? AND state=? AND state<>?').bind(receipt.state,receipt.state==='failed'?'Provider reported failed delivery':null,p.workspaceId,job.id,job.state,receipt.state),notificationEvent(env.DB,p,record,job,job.state,receipt.state,receipt.observedAt)]); return { id: job.id, state: receipt.state, observedAt: receipt.observedAt }; }
