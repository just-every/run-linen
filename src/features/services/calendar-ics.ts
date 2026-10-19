export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  updatedAt: string;
  description?: string;
  status?: 'CANCELLED' | 'CONFIRMED' | 'TENTATIVE';
  sequence?: number;
}

const encoder = new TextEncoder();

function checkedText(value: string): string {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    throw new TypeError('Calendar text must contain valid text characters');
  }
  for (const character of value) {
    const point = character.codePointAt(0)!;
    if (point >= 0xd800 && point <= 0xdfff) {
      throw new TypeError('Calendar text must contain valid Unicode');
    }
  }
  return value;
}

function escapedText(value: string): string {
  return checkedText(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n')
    .replace(/,/g, '\\,').replace(/;/g, '\\;');
}

function identityPart(value: string): string {
  if (!checkedText(value)) throw new TypeError('Calendar identities must not be empty');
  return Array.from(encoder.encode(value), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Accept extended ISO instants with seconds and an explicit Z or numeric offset. */
function instant(value: string, field: string): { seconds: number; formatted: string } {
  const match = typeof value === 'string'
    ? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.exec(value)
    : null;
  if (!match) throw new RangeError(`Invalid calendar ${field} instant`);
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offset] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]
    || Number(hourText) > 23 || Number(minuteText) > 59 || Number(secondText) > 59
    || (offset.toUpperCase() !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))) {
    throw new RangeError(`Invalid calendar ${field} instant`);
  }
  // RFC 5545 DATE-TIME has second precision; do not let Date.parse normalize bad dates.
  const milliseconds = Date.parse(value);
  const date = new Date(milliseconds);
  if (!Number.isFinite(milliseconds) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) {
    throw new RangeError(`Invalid calendar ${field} instant`);
  }
  return { seconds: milliseconds / 1000, formatted: date.toISOString().slice(0, 19).replace(/[-:]/g, '') + 'Z' };
}

/** Fold physical lines by UTF-8 octets, counting the continuation space. */
function fold(line: string): string {
  const lines: string[] = [];
  let current = '', octets = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (octets + size > 75) {
      lines.push(current);
      current = ' ';
      octets = 1;
    }
    current += character;
    octets += size;
  }
  lines.push(current);
  return lines.join('\r\n');
}

/** Pure serialization; callers supply only events they are authorized to disclose.
 * Starts truncate and ends round up to UTC seconds, enclosing the precise recorded window.
 * Invalid dates, text and identities throw rather than yielding a partial calendar.
 */
export function calendarIcs(workspaceId: string, events: CalendarEvent[]): string {
  const workspace = identityPart(workspaceId);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Linen//Change Calendar//EN', 'CALSCALE:GREGORIAN'];
  for (const event of events) {
    const start = instant(event.start, 'start');
    const end = instant(event.end, 'end');
    const enclosingEnd=new Date(Math.ceil(end.seconds)*1000).toISOString().slice(0,19).replace(/[-:]/g,'')+'Z';
    const stamp = instant(event.updatedAt, 'updatedAt');
    if (end.seconds <= start.seconds) throw new RangeError('Calendar end must follow start');
    lines.push('BEGIN:VEVENT', `UID:${workspace}.${identityPart(event.id)}@linen`,
      `DTSTAMP:${stamp.formatted}`, `DTSTART:${start.formatted}`, `DTEND:${enclosingEnd}`,
      `SUMMARY:${escapedText(event.title)}`);
    if(event.status!==undefined) {if(!['CANCELLED','CONFIRMED','TENTATIVE'].includes(event.status))throw new TypeError('Invalid calendar status');lines.push(`STATUS:${event.status}`);}
    if(event.sequence!==undefined) {if(!Number.isSafeInteger(event.sequence)||event.sequence<0)throw new TypeError('Invalid calendar sequence');lines.push(`SEQUENCE:${event.sequence}`);}
    if (event.description !== undefined) lines.push(`DESCRIPTION:${escapedText(event.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
