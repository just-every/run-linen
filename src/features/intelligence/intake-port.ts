import type { IntelligenceContext } from './types';
import { assert } from './access';
import { workIntakePort as workService } from '../work/intelligence-port';
export interface IntakeEvent {
    id: string;
    work_id: string;
    sender: string;
    state: string;
    source_message_id: string;
}
export interface WorkIntakePort {
    list(ctx: IntelligenceContext, workId?: string): Promise<IntakeEvent[]>;
    claim(ctx: IntelligenceContext, eventId: string): Promise<IntakeEvent | null>;
    finish(ctx: IntelligenceContext, eventId: string, result: {
        state: string;
        result?: unknown;
        error?: string;
    }): Promise<unknown>;
    catalog(ctx: IntelligenceContext): Promise<Array<{
        id: string;
        name: string;
        kind: string;
        target: string;
        owner_id: string;
    }>>;
}
let port: WorkIntakePort | undefined = workService;
export function setWorkIntakePort(value: WorkIntakePort) {
    port = value;
}
export function workIntakePort() {
    assert(port, 'work_intake_service_unavailable', 503);
    return port;
}
