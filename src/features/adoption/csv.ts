type RequireInput = (ok: unknown, message: string) => asserts ok;

/** RFC 4180 quoting, including embedded newlines. Ambiguous/malformed files fail closed. */
export function readCsv(text: string, required: readonly string[], requireInput: RequireInput): Record<string, string>[] {
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
  for (const h of required) requireInput(headers.includes(h), `Missing CSV field: ${h}`);
  return rows.map(values => { requireInput(values.length === headers.length, 'CSV field count mismatch'); return Object.fromEntries(headers.map((h, i) => [h, values[i]])); });
}
