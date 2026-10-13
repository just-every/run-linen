import { check } from './core';
/** Enforce streaming limits even for chunked requests with no Content-Length. */
export async function boundedBody(request: Request, limit: number) { check(Number(request.headers.get('content-length') || 0) <= limit, 'body_too_large', 413); const reader = request.body?.getReader(); if (!reader)
    return new ArrayBuffer(0); const parts: Uint8Array[] = []; let size = 0; for (;;) {
    const { done, value } = await reader.read();
    if (done)
        break;
    size += value.byteLength;
    if (size > limit) {
        await reader.cancel();
        check(false, 'body_too_large', 413);
    }
    parts.push(value);
} const bytes = new Uint8Array(size); let offset = 0; for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
} return bytes.buffer; }
export async function importBody(request: Request): Promise<Record<string, unknown>> { let value: unknown; try {
    value = JSON.parse(new TextDecoder().decode(await boundedBody(request, 32 * 1024 * 1024)));
}
catch (error) {
    if (error instanceof Error && 'code' in error)
        throw error;
    check(false, 'invalid_json', 400);
} check(value && typeof value === 'object' && !Array.isArray(value), 'invalid_json', 400); return value as Record<string, unknown>; }
