import { ApiError, requiredString } from '../../platform/http';
import type { ServiceRecord } from './store';

export const monitoringSources = ['generic', 'uptime', 'datadog', 'pagerduty', 'spool'] as const;
/** Provider identifiers are bound by the owner, never selected by an incoming service id. */
export function monitoringBinding(b: Record<string, any>) {
    const source = b.source ?? 'generic';
    if (!monitoringSources.includes(source)) throw new ApiError(400, 'monitor_source', 'Unknown monitoring source');
    if (!['P1', 'P2', 'P3', 'P4', 'unspecified'].includes(b.priority ?? 'unspecified')) throw new ApiError(400, 'monitor_priority', 'Choose a declared monitoring priority');
    return { source, priority: b.priority ?? 'unspecified', externalMonitorId: source === 'generic' ? null : requiredString(b.externalMonitorId, 'externalMonitorId') };
}
export function monitoringEvent(monitor: ServiceRecord, body: any) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'monitor_event', 'Monitoring event must be an object');
    const source = monitor.data.source ?? 'generic';
    if (source === 'uptime') {
        if (body.schemaVersion !== 2 || body.monitorId !== monitor.data.externalMonitorId)
            throw new ApiError(422, 'monitor_target', 'Event must match the bound Uptime monitor');
        const status = ({ trigger: 'failed', recovery: 'healthy', slow: 'degraded' } as Record<string, string>)[body.kind];
        if (!status || !Number.isSafeInteger(body.observedAt) || body.observedAt < 0 || body.observedAt > 8640000000000000) throw new ApiError(422, 'monitor_event', 'Supported measured Uptime event required');
        return { id: body.id, serviceId: monitor.data.serviceId, status, observedAt: new Date(body.observedAt).toISOString(), alertKey: body.incidentKey || monitor.id, source, priority: monitor.data.priority || 'unspecified' };
    }
    if (source === 'pagerduty') {
        const event = body.event;
        if (event?.data?.service?.id !== monitor.data.externalMonitorId)
            throw new ApiError(422, 'monitor_target', 'Event must match the bound PagerDuty service');
        const status = ({ 'incident.triggered': 'failed', 'incident.acknowledged': 'failed', 'incident.resolved': 'healthy' } as Record<string, string>)[event.event_type];
        if (!status) throw new ApiError(422, 'monitor_event', 'Supported PagerDuty incident event required');
        return { id: event.id, status, alertKey: requiredString(event.data.id, 'event.data.id'), observedAt: event.occurred_at, serviceId: monitor.data.serviceId, source, priority: monitor.data.priority || 'unspecified' };
    }
    // Datadog and Spool use an explicitly configured signed relay envelope.
    // Native provider adapters require separate proof; a provider label is not that proof.
    if (source !== 'generic' && (body.source !== source || body.monitorId !== monitor.data.externalMonitorId))
        throw new ApiError(422, 'monitor_target', 'Event must match the configured source and monitor');
    return { ...body, source, serviceId: source === 'generic' ? body.serviceId : monitor.data.serviceId };
}
export function monitoringSignature(source: string, headers: Record<string, string>) {
    if (source === 'pagerduty') return { timestamp: '', signature: headers['x-pagerduty-signature'] || '' };
    if (source === 'uptime') {
        const encoded = headers['x-lamp-signature'] || '';
        if (!/^[A-Za-z0-9_-]{43}$/.test(encoded)) return { timestamp: '', signature: '' };
        const bytes = Uint8Array.from(atob(encoded.replaceAll('-', '+').replaceAll('_', '/') + '='), c => c.charCodeAt(0));
        return { timestamp: headers['x-lamp-timestamp'] || '', signature: [...bytes].map(b => b.toString(16).padStart(2, '0')).join('') };
    }
    return { timestamp: headers['x-linen-timestamp'] || '', signature: headers['x-linen-signature'] || '' };
}

/** PagerDuty v3 signs the unchanged body; event ids fence replay after authentication. */
export async function verifyPagerDuty(secret: string, body: string, signatures: string) {
    if (signatures.length > 1024) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    for (const candidate of signatures.split(',')) {
        const hex = /^v1=([0-9a-f]{64})$/i.exec(candidate.trim())?.[1];
        if (hex && await crypto.subtle.verify('HMAC', key, Uint8Array.from(hex.match(/../g)!.map(b => parseInt(b, 16))), new TextEncoder().encode(body))) return true;
    }
    return false;
}
