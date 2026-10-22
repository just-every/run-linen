import { Buffer } from 'node:buffer';
import { canonicalJson, sha256, type Json, type SourceBundle } from '../../../modules/import-kit/src/d1/index';
import { parseJson } from '../../../modules/import-kit/src/readers/json';
import { ApiError } from '../../../platform/http';
import type { ParsedExport, Ticket } from '../freshservice-import/format';

export interface ZendeskInput {
  account: string;
  files: { name: string; format: 'tickets-json'; base64: string }[];
}
type ObjectValue = { [key: string]: Json };
const requireInput: (ok: unknown, message: string) => asserts ok = (ok, message) => {
  if (!ok) throw new ApiError(422, 'zendesk_input', message);
};
function object(value: unknown): asserts value is ObjectValue {
  requireInput(value !== null && typeof value === 'object' && !Array.isArray(value), 'A JSON object is required');
}
function identifier(value: unknown): string {
  requireInput((typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    || (typeof value === 'string' && /^[1-9]\d*$/.test(value) && value.length <= 100), 'Positive exact Zendesk identity required; unsafe JSON numbers must be exported as strings');
  return String(value);
}
function plain(value: unknown, field: string): string {
  requireInput(typeof value === 'string', `${field} must be supplied as text; HTML-only bodies are unsupported`);
  return value;
}
function timestamp(value: unknown): string {
  requireInput(typeof value === 'string', 'Explicit ISO 8601 timestamp with UTC or offset required');
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireInput(parts && Number.isFinite(Date.parse(value)), 'Explicit ISO 8601 timestamp with UTC or offset required');
  const [, year, month, day, hour, minute, second] = parts.map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  requireInput(year >= 1000 && month >= 1 && month <= 12 && day >= 1 && day <= days
    && hour <= 23 && minute <= 59 && second <= 59, 'Invalid calendar timestamp');
  return new Date(value).toISOString();
}

/** Full JSON export is NDJSON {ticket:{...}}; Zendesk also documents this wrapped-array conversion.
 * https://support.zendesk.com/hc/en-us/articles/4408886165402
 * https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/
 */
function documents(text: string, artifact: string): { value: Json; row: number }[] {
  const result: { value: Json; row: number }[] = [];
  let index = 0, row = 1;
  while (index < text.length) {
    const separator = index;
    while (/\s/.test(text[index] ?? '') && index < text.length) { if (text[index++] === '\n') row++; }
    if (index === text.length) break;
    requireInput(!result.length || text.slice(separator, index).includes('\n'), 'NDJSON ticket records must be separated by a newline');
    requireInput(text[index] === '{', 'Supply Zendesk ticket objects, not an API array, XML or ZIP archive');
    const start = index, startRow = row;
    let depth = 0, quoted = false, escaped = false;
    do {
      const character = text[index++];
      if (character === '\n') row++;
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') quoted = false;
      } else if (character === '"') quoted = true;
      else if (character === '{' || character === '[') depth++;
      else if (character === '}' || character === ']') depth--;
    } while (index < text.length && depth > 0);
    requireInput(depth === 0 && !quoted, 'Incomplete Zendesk JSON export');
    result.push({ value: parseJson(text.slice(start, index), { artifact, row: startRow }), row: startRow });
    requireInput(result.length <= 100, 'Supply at most 100 tickets per reviewed import');
  }
  requireInput(result.length > 0, 'The Zendesk export is empty');
  return result;
}

export function parseZendesk(input: ZendeskInput, destination: string): ParsedExport {
  object(input);
  requireInput(Object.keys(input).every(key => ['account', 'files'].includes(key)), 'Only account and saved files are accepted; identity mappings are unsupported');
  requireInput(typeof input.account === 'string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(input.account), 'A stable non-secret Zendesk account slug is required');
  requireInput(Array.isArray(input.files) && input.files.length > 0 && input.files.length <= 30, 'Supply 1–30 saved Zendesk ticket files');
  const namespace = `zendesk:${destination}:${input.account}`;
  const source: SourceBundle = { records: [], artifacts: [], diagnostics: [] };
  const tickets = new Map<string, Ticket>(), names = new Set<string>(), commentIds = new Set<string>();
  let total = 0;
  for (const file of input.files) {
    object(file);
    requireInput(Object.keys(file).every(key => ['name', 'format', 'base64'].includes(key)) && file.format === 'tickets-json', 'Only tickets-json saved exports are supported');
    requireInput(typeof file.name === 'string' && /^[\w .-]{1,120}$/.test(file.name) && !['.', '..'].includes(file.name)
      && !names.has(file.name.toLowerCase()), 'Unique simple export filenames required');
    names.add(file.name.toLowerCase());
    requireInput(typeof file.base64 === 'string' && file.base64.length <= 4 * Math.ceil(1024 * 1024 / 3), 'Supply at most 1 MiB total source bytes as canonical base64');
    const bytes = Buffer.from(file.base64, 'base64');
    total += bytes.length;
    requireInput(bytes.length > 0 && total <= 1024 * 1024 && bytes.toString('base64') === file.base64, 'Supply nonempty canonical base64 exports totaling at most 1 MiB');
    let text: string;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, ''); }
    catch { throw new ApiError(422, 'zendesk_input', 'Zendesk exports must be UTF-8 text'); }
    const artifact = { name: file.name, sha256: sha256(bytes), size: bytes.length, original: { status: 'available' as const, base64: file.base64 } };
    source.artifacts.push(artifact);
    const roots = documents(text, file.name), first = roots[0].value;
    object(first);
    let envelopes = roots;
    if (Object.hasOwn(first, 'tickets')) {
      requireInput(roots.length === 1 && Object.keys(first).length === 1 && Array.isArray(first.tickets), 'The wrapped export must contain only a tickets array');
      envelopes = first.tickets.map(value => ({ value, row: 1 }));
    }
    for (const { value, row } of envelopes) {
      object(value);
      requireInput(Object.keys(value).length === 1 && Object.hasOwn(value, 'ticket'), 'Each export record must contain exactly one ticket object');
      const raw = value.ticket;
      object(raw);
      const id = identifier(raw.id), requester = `user:${identifier(raw.requester_id)}`;
      requireInput(!tickets.has(id), 'Duplicate Zendesk ticket identity; reconcile overlapping exports');
      requireInput(tickets.size < 100, 'Supply 1–100 tickets per reviewed import');
      requireInput(typeof raw.status === 'string' && ['new', 'open', 'pending', 'hold', 'solved', 'closed'].includes(raw.status), 'Unsupported or missing Zendesk ticket status');
      requireInput(raw.type === null || (typeof raw.type === 'string' && ['question', 'incident', 'problem', 'task'].includes(raw.type)), 'Unsupported or missing Zendesk ticket type');
      requireInput(Array.isArray(raw.comments) && raw.comments.length <= 100, 'Supply an explicit comments array of at most 100 comments; exports with omitted history are unsupported');
      const conversations = raw.comments.map(comment => {
        object(comment);
        const commentId = identifier(comment.id), author = identifier(comment.author_id);
        requireInput(!commentIds.has(commentId), 'Duplicate Zendesk comment identity, including comments on different tickets');
        commentIds.add(commentId);
        requireInput(typeof comment.public === 'boolean', 'Every comment needs an explicit public boolean');
        requireInput(comment.type === undefined || comment.type === 'Comment', 'Voice and other non-text comment types are unsupported');
        requireInput(comment.ticket_id === undefined || identifier(comment.ticket_id) === id, 'Orphan or mismatched comment ticket identity');
        requireInput(!['private', 'user_id', 'body_text'].some(key => Object.hasOwn(comment, key)), 'Ambiguous non-Zendesk comment fields are unsupported');
        return { ...comment, id: commentId, private: !comment.public, user_id: author,
          body_text: plain(comment.body, 'Comment body'), created_at: timestamp(comment.created_at) };
      });
      const ticket: Ticket = { id, title: plain(raw.subject, 'Ticket subject'), description: plain(raw.description, 'Ticket description'),
        status: raw.status, kind: raw.type === null ? '' : String(raw.type), requester,
        created: timestamp(raw.created_at), updated: timestamp(raw.updated_at), raw, conversations };
      const payload = { ticket: raw, conversations: raw.comments, requester, sourceArtifacts: [artifact.sha256],
        sourceIdentities: [...new Set([requester, ...conversations.map(comment => `user:${comment.user_id}`)])], identityMappings: {} };
      tickets.set(id, ticket);
      source.records.push({ namespace, kind: 'ticket', sourceId: id, payload, payloadHash: sha256(canonicalJson(payload)),
        artifactHash: artifact.sha256, location: { artifact: file.name, row } });
    }
  }
  requireInput(tickets.size > 0, 'Supply at least one Zendesk ticket');
  return { source, tickets, identities: {} };
}
