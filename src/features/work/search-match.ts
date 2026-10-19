/** Canonical Unicode letter/number tokens, separated by one space. */
export function normalizeSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function sameSuffix(left: string[], right: string[], leftStart: number, rightStart: number): boolean {
  while (leftStart < left.length && rightStart < right.length) {
    if (left[leftStart++] !== right[rightStart++]) return false;
  }
  return leftStart === left.length && rightStart === right.length;
}

// A single edit needs only the first mismatch and the remaining suffix. There
// is no edit-distance matrix; Unicode code points count as characters here.
function withinOneEdit(query: string[], candidate: string[]): boolean {
  if (Math.abs(query.length - candidate.length) > 1) return false;
  let first = 0;
  while (first < query.length && first < candidate.length && query[first] === candidate[first]) first++;
  if (first === Math.min(query.length, candidate.length)) return true;

  if (query.length < candidate.length) return sameSuffix(query, candidate, first, first + 1);
  if (query.length > candidate.length) return sameSuffix(query, candidate, first + 1, first);
  if (sameSuffix(query, candidate, first + 1, first + 1)) return true;
  return first + 1 < query.length
    && query[first] === candidate[first + 1]
    && query[first + 1] === candidate[first]
    && sameSuffix(query, candidate, first + 2, first + 2);
}

/**
 * 3: normalized phrase substring within one field; 2: all exact query tokens;
 * 1: all tokens match, allowing one edit per query token of at least four code
 * points; 0: no match (including empty/punctuation-only queries).
 *
 * Tokens may match across fields and repeated query tokens need no additional
 * occurrences. Callers validate query limits and supply only readable fields.
 */
export function searchScore(query: string, fields: string[]): number {
  const normalizedQuery = normalizeSearch(query);
  if (!normalizedQuery) return 0;
  const normalizedFields = fields.map(normalizeSearch);
  if (normalizedFields.some(field => field.includes(normalizedQuery))) return 3;

  const queryTokens = [...new Set(normalizedQuery.split(' '))];
  const candidates = new Set(normalizedFields.flatMap(field => field ? field.split(' ') : []));
  const unmatched = queryTokens.filter(token => !candidates.has(token));
  if (!unmatched.length) return 2;

  const typoTokens = unmatched.map(token => Array.from(token));
  if (typoTokens.some(token => token.length < 4)) return 0;

  // Only keep candidate code points for lengths that can match a query token.
  const lengths = new Set(typoTokens.flatMap(token => [token.length - 1, token.length, token.length + 1]));
  const byLength = new Map<number, string[][]>();
  for (const candidate of candidates) {
    const characters = Array.from(candidate);
    if (!lengths.has(characters.length)) continue;
    const bucket = byLength.get(characters.length);
    if (bucket) bucket.push(characters);
    else byLength.set(characters.length, [characters]);
  }
  return typoTokens.every(token => [token.length - 1, token.length, token.length + 1].some(length =>
    byLength.get(length)?.some(candidate => withinOneEdit(token, candidate)))) ? 1 : 0;
}
