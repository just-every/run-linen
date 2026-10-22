export type Protection = 'normal' | 'hr' | 'restricted';
export interface HistoryActor { kind: 'person' | 'rule' | 'scenario' | 'agent' | 'integration'; id: string; name?: string; initiatedBy?: string }
export interface HistoryRecord { kind: 'ticket' | 'task' | 'change' | 'problem' | 'asset' | 'service'; id: string }
export interface FieldEvidence { label?: string; type?: string; classificationRevision?: number; nonpersonal?: boolean; groupMemberCount?: number; options?: unknown[]; classifiedAt?: string }
export interface HistoryChange { field: string; before: unknown; after: unknown; evidence?: FieldEvidence; beforeEvidence?: FieldEvidence; afterEvidence?: FieldEvidence }
export interface HistoryEnvelope {
  schema: 'linen.history'; version: 1; action: string; record: HistoryRecord; actor: HistoryActor;
  subjects: string[]; protection: Protection; changes: HistoryChange[];
  source?: { system: string; table: string; eventKey: string };
  redacted?: 'erasure'; redactedAt?: string;
}
export interface HistoryMetadata { fields?: Record<string, FieldEvidence>; source?: HistoryEnvelope['source'] }
export const erasedValue = { redacted: 'erasure' } as const;
export const erasedPerson = { redacted: 'erasure', person: true } as const;
export function isErased(value: unknown): boolean { return !!value && typeof value === 'object' && (value as any).redacted === 'erasure'; }
