import { entity } from '../../modules/mail/src/inbound/multipart.mjs';
import { parseMime } from '../../modules/mail/src/inbound/mime.mjs';
import { addresses, address, messageIds } from '../../modules/mail/src/inbound/headers.mjs';

export interface MailAttachment { name: string; contentType: string; bytes: Uint8Array }
export interface MailAuthentication { dmarc: 'pass' | 'fail' | 'none'; aligned: boolean }
/** One message as an authenticated receiving adapter or a mailbox poll supplies it. */
export interface MailMessage {
  connectionId: string; sourceMessageId: string; sender: string; subject: string; text: string;
  messageId?: string | null; inReplyTo?: string | null; references?: string[]; cc?: string[];
  headers?: Record<string, string>; attachments?: MailAttachment[]; authentication?: MailAuthentication;
}

const limits = { maxRawBytes: 30 * 1024 * 1024, maxBodyBytes: 512 * 1024, maxAttachments: 10, maxAttachmentBytes: 20 * 1024 * 1024, maxTotalAttachmentBytes: 25 * 1024 * 1024 };
const automatic = ['auto-submitted', 'precedence', 'x-autoreply', 'x-autorespond', 'list-id', 'list-unsubscribe', 'return-path'];
const autoSubject = /^\s*(?:automatic reply|auto(?:matic)?[- ]?reply|autoreply|out of (?:the )?office|undeliverable|delivery status notification|mail delivery (?:failed|subsystem)|returned mail)\b/i;

/** Why an automatic message must never open or extend a ticket; null for a human message. */
export function automaticReason(sender: string, subject: string, headers: Record<string, string> = {}): string | null {
  const auto = headers['auto-submitted']?.trim().toLowerCase();
  if (auto && auto !== 'no') return 'auto-submitted';
  if (/^(?:bulk|junk|list|auto_reply)$/i.test(headers['precedence']?.trim() ?? '')) return 'precedence';
  if (headers['x-autoreply'] !== undefined || headers['x-autorespond'] !== undefined) return 'auto-response-header';
  if (headers['list-id'] !== undefined || headers['list-unsubscribe'] !== undefined) return 'mailing-list';
  if (headers['return-path']?.replace(/\s/g, '') === '<>' || /^(?:mailer-daemon|postmaster)@/i.test(sender)) return 'bounce';
  if (autoSubject.test(subject)) return 'auto-subject';
  return null;
}

/** Reads the topmost Authentication-Results the receiving provider added; anything else is unauthenticated. */
export function authenticationOf(rawHeaders: string, from: string): MailAuthentication {
  const top = /^authentication-results:[ \t]*([^\r\n]*(?:\r?\n[ \t][^\r\n]*)*)/im.exec(rawHeaders)?.[1].replace(/\r?\n[ \t]+/g, ' ') ?? '';
  const dmarc = /(?:^|[\s;])dmarc=(\w+)/i.exec(top)?.[1].toLowerCase();
  const headerFrom = /header\.from=([^\s;]+)/i.exec(top)?.[1].toLowerCase();
  const domain = from.split('@')[1]?.toLowerCase();
  return { dmarc: dmarc === 'pass' ? 'pass' : dmarc === 'fail' ? 'fail' : 'none', aligned: dmarc === 'pass' && !!domain && headerFrom === domain };
}

/** Removes the quoted reply history and signature separator so a thread keeps only what the sender just wrote. */
export function newestText(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), kept: string[] = [];
  for (const line of lines) {
    if (/^(?:on .{5,200} wrote:|-{2,}\s*original message\s*-{2,}|from:\s.+|-- ?)$/i.test(line.trim()) && kept.some(Boolean)) break;
    kept.push(line);
  }
  while (kept.length && /^\s*>/.test(kept.at(-1)!) || kept.length && !kept.at(-1)!.trim()) kept.pop();
  return kept.join('\n').trim();
}
const plain = (html: string) => html.replace(/<(?:script|style)[\s\S]*?<\/(?:script|style)>/gi, '').replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** RFC 822 bytes from a mailbox or forwarding rule into the message Linen ingests. Throws on unreadable mail. */
export function parseRawMail(connectionId: string, sourceMessageId: string, raw: Uint8Array, mailbox: string): MailMessage {
  const headers = entity(raw).headers as Map<string, string>;
  const parsed = parseMime(raw, limits, { from: headers.get('from'), to: headers.get('to') ?? mailbox });
  let cc: string[] = [];
  try { cc = headers.get('cc') ? addresses(headers.get('cc')) : []; } catch { cc = []; }
  const block = new TextDecoder('latin1').decode(raw.subarray(0, Math.min(raw.length, 65536))).split(/\r?\n\r?\n/)[0];
  const subset: Record<string, string> = {};
  for (const name of automatic) if (headers.has(name)) subset[name] = headers.get(name)!;
  // The Return-Path of a bounce is the empty path, which the header parser keeps verbatim.
  const text = newestText(parsed.text ?? plain(parsed.html ?? '')) || '(no text)';
  return {
    connectionId, sourceMessageId, sender: parsed.from, subject: parsed.subject ?? '', text,
    messageId: parsed.messageId, inReplyTo: parsed.inReplyTo ? messageIds(parsed.inReplyTo).at(-1) ?? null : null,
    references: parsed.references ?? [], cc, headers: subset, authentication: authenticationOf(block, parsed.from),
    attachments: parsed.attachments.map((a: any) => ({ name: a.filename || 'attachment', contentType: a.contentType, bytes: a.content })),
  };
}
export { address };
