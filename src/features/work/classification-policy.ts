/** Desk taxonomy and the declared impact × urgency policy, shared with the agent controls. */
export const ticketTypes = ['incident', 'service_request', 'question'] as const;
export const levels = ['high', 'medium', 'low'] as const;
export const categories = {
  network: ['vpn', 'wifi', 'internet'],
  access: ['account', 'permissions'],
  hardware: ['laptop', 'printer', 'other'],
  software: ['installation', 'application'],
  general: ['guidance', 'other'],
} as const;
export const priorityMatrix = {
  high: { high: 'P1', medium: 'P2', low: 'P3' },
  medium: { high: 'P2', medium: 'P3', low: 'P4' },
  low: { high: 'P3', medium: 'P4', low: 'P4' },
} as const;
export type Level = typeof levels[number];
export interface TicketClassification {
  type: typeof ticketTypes[number];
  category: keyof typeof categories;
  subcategory: string;
  impact: Level;
  urgency: Level;
  priority: string;
}
export interface ClassificationProposal extends TicketClassification {
  reason: string;
  attemptId: string;
  model: string;
}
export interface ClassificationSnapshot {
  revision: number;
  workRevision: number;
  state: string;
  current: TicketClassification | null;
  proposal: ClassificationProposal | null;
  reason: string | null;
  error: string | null;
  history: { id: string; actor_id: string; actor_name: string; action: string; created_at: string; before: Partial<TicketClassification>; after: Partial<TicketClassification>;reason:string; changes:{field:string;before:unknown;after:unknown}[];redacted?:'erasure';redactedAt?:string }[];
}
