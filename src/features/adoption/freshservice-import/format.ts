import { Buffer } from 'node:buffer';
import { canonicalJson, sha256, type SourceBundle, type Json } from '../../../modules/import-kit/src/d1/index';
import { parseJson } from '../../../modules/import-kit/src/readers/json';
import { ApiError } from '../../../platform/http';

export const requireInput: (ok: unknown, message: string) => asserts ok = (ok, message) => { if (!ok) throw new ApiError(422, 'freshservice_input', message); };
export interface SavedFile { name: string; format: 'tickets-csv' | 'ticket-json' | 'conversations-json'; base64: string; ticketId?: string }
export interface ImportInput { account: string; files: SavedFile[]; identities?: Record<string, string> }
export interface Ticket { id: string; title: string; description: string; status: string; kind: string; requester: string; created: string; updated: string; raw: Json; conversations: any[] }
export interface ParsedExport { source: SourceBundle; tickets: Map<string, Ticket>; identities: Record<string, string> }
export const stableId = (...parts: string[]) => 'fs_' + sha256(canonicalJson(parts)).slice(0, 40);

/** RFC 4180 quoting, including embedded newlines. Ambiguous/malformed files fail closed. */
function csv(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } } else cell += c; continue; }
    if (c === '"') { requireInput(!cell && !closed, 'Invalid CSV quote'); quoted = true; }
    else if (c === ',') { row.push(cell); cell = ''; closed = false; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; closed = false; }
    else { requireInput(!closed, 'Unexpected text after CSV quote'); cell += c; }
  }
  requireInput(!quoted, 'Unclosed CSV quote'); if (row.length || cell || closed) { row.push(cell); rows.push(row); }
  const headers = rows.shift(); requireInput(headers?.length && new Set(headers).size === headers.length, 'Unique CSV headers required');
  for (const h of ['Ticket Id', 'Subject', 'Description', 'Status', 'Requester Email', 'Created Time', 'Last Updated Time']) requireInput(headers.includes(h), `Missing CSV field: ${h}`);
  return rows.map(values => { requireInput(values.length === headers.length, 'CSV field count mismatch'); return Object.fromEntries(headers.map((h, i) => [h, values[i]])); });
}
function timestamp(value: unknown): string {
  requireInput(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)), 'Explicit ISO 8601 timestamp with timezone required; review/convert ambiguous source dates before import');
  return new Date(value).toISOString();
}
function identifier(value: unknown): string {
  requireInput((typeof value === 'string' && /^[1-9]\d*$/.test(value)) || (typeof value === 'number' && Number.isSafeInteger(value) && value > 0), 'Positive exact ticket/conversation ID required'); return String(value);
}
function plain(value: unknown, field: string): string { requireInput(typeof value === 'string', `${field} must be supplied as plain text`); return value; }

export function parseExport(input: ImportInput, destination: string): ParsedExport {
  requireInput(input && /^[a-z0-9][a-z0-9-]{0,79}$/.test(input.account), 'account must be a stable non-secret Freshservice account slug');
  requireInput(Array.isArray(input.files) && input.files.length > 0 && input.files.length <= 30, 'Supply 1–30 saved files');
  const identities = input.identities ?? {}; requireInput(identities && !Array.isArray(identities) && typeof identities === 'object', 'identities must be an explicit source-key to member-ID map');
  for (const [key, value] of Object.entries(identities)) requireInput(key.length > 0 && key.length <= 320 && typeof value === 'string' && value.length <= 100, 'Invalid identity mapping');
  const namespace = `freshservice:${destination}:${input.account}`;
  const source: SourceBundle = { records: [], artifacts: [], diagnostics: [] }, tickets = new Map<string, Ticket>(), conversations: { ticketId: string; rows: any[]; artifact: string }[] = [];
  const names = new Set<string>(); let total = 0;
  const add = (ticket: Ticket, artifact: any, row: number) => {
    requireInput(!tickets.has(ticket.id), 'Duplicate ticket identity; select one ticket representation'); tickets.set(ticket.id, ticket);
    source.records.push({ namespace, kind: 'ticket', sourceId: ticket.id, payload: ticket.raw, payloadHash: '', artifactHash: artifact.sha256, location: { artifact: artifact.name, row } });
  };
  for (const file of input.files) {
    requireInput(file && typeof file.name === 'string' && /^[\w .-]{1,120}$/.test(file.name) && !names.has(file.name), 'Unique simple artifact filename required'); names.add(file.name);
    requireInput(typeof file.base64 === 'string', 'Exact artifact bytes are required'); const bytes = Buffer.from(file.base64, 'base64');
    requireInput(bytes.toString('base64') === file.base64, 'Canonical base64 required'); total += bytes.length; requireInput(total <= 1024 * 1024, 'This first file importer accepts at most 1 MiB total source bytes');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
    const artifact = { name: file.name, sha256: sha256(bytes), size: bytes.length, original: { status: 'available' as const, base64: file.base64 } }; source.artifacts.push(artifact);
    if (file.format === 'tickets-csv') {
      csv(text).forEach((raw, i) => add({ id: identifier(raw['Ticket Id']), title: plain(raw.Subject, 'Subject'), description: plain(raw.Description, 'Description'), status: raw.Status, kind: raw.Type || '', requester: raw['Requester Email'].trim().toLowerCase(), created: timestamp(raw['Created Time']), updated: timestamp(raw['Last Updated Time']), raw, conversations: [] }, artifact, i + 2));
    } else if (file.format === 'ticket-json') {
      const root = parseJson(text, { artifact: file.name }) as any, raw = root.ticket; requireInput(raw && typeof raw === 'object' && !Array.isArray(raw), 'Saved view-ticket response requires ticket object');
      requireInput(Object.keys(root).length === 1, 'Unexpected ticket response envelope fields');
      add({ id: identifier(raw.id), title: plain(raw.subject, 'subject'), description: plain(raw.description_text, 'description_text'), status: String(raw.status), kind: raw.type, requester: `user:${identifier(raw.requester_id)}`, created: timestamp(raw.created_at), updated: timestamp(raw.updated_at), raw, conversations: [] }, artifact, 1);
    } else if (file.format === 'conversations-json') {
      const root = parseJson(text, { artifact: file.name }) as any; requireInput(root && Array.isArray(root.conversations) && Object.keys(root).length === 1, 'Saved conversation response requires conversations array');
      conversations.push({ ticketId: identifier(file.ticketId), rows: root.conversations, artifact: file.name });
    } else requireInput(false, 'Unsupported format; XML, XLS and attachment downloads are not implemented');
  }
  requireInput(tickets.size > 0 && tickets.size <= 100, 'Supply 1–100 tickets per reviewed job');
  for (const page of conversations) {
    const ticket = tickets.get(page.ticketId); requireInput(ticket, 'Orphan conversation page');
    for (const raw of page.rows) {
      requireInput(identifier(raw.ticket_id) === ticket.id && typeof raw.private === 'boolean', 'Conversation ticket relation and explicit private flag required');
      identifier(raw.id); identifier(raw.user_id); plain(raw.body_text, 'body_text'); timestamp(raw.created_at); timestamp(raw.updated_at);
      requireInput(!ticket.conversations.some(c => String(c.id) === String(raw.id)), 'Duplicate conversation ID; reconcile overlapping pages'); ticket.conversations.push(raw);
    }
  }
  for (const record of source.records) {
    const ticket = tickets.get(record.sourceId)!; requireInput(ticket.conversations.length <= 100, 'At most 100 supplied conversations per ticket in this bounded importer');
    record.payload = { ticket: ticket.raw, conversations: ticket.conversations, requester: ticket.requester, sourceArtifacts: [...new Set([record.artifactHash,...conversations.filter(page=>page.ticketId===ticket.id).map(page=>source.artifacts.find(a=>a.name===page.artifact)!.sha256)])], sourceIdentities: [ticket.requester,...ticket.conversations.map(c=>`user:${c.user_id}`)], identityMappings: Object.fromEntries([ticket.requester,...ticket.conversations.map(c=>`user:${c.user_id}`)].filter(key=>identities[key]).map(key=>[key,identities[key]])) };
    record.payloadHash = sha256(canonicalJson(record.payload));
  }
  return { source, tickets, identities };
}
