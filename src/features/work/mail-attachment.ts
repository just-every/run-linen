// Adapted from Lily ticket-mail/intake/attachment-store.ts. See PROVENANCE.md.
export function safeFileName(value: string) {
  const name = value
    .replace(/[\u0000-\u001f\\/]/g, "_")
    .trim()
    .slice(0, 1024);
  return name || "attachment";
}
export function safeContentType(value: string) {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/.test(
    normalized,
  )
    ? normalized
    : "application/octet-stream";
}
export async function sha256Hex(value: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function requireSafeDownload(
  value: string,
  expiresAt: string,
  at: Date,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Attachment download URL is invalid.");
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
    throw new Error(
      "Attachment download URL is not an absolute credential-free HTTPS URL.",
    );
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= at.getTime())
    throw new Error(
      "Attachment download URL has no finite unexpired provider expiry.",
    );
}
export async function downloadBody(url: string, fetcher: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetcher(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(
        `Attachment download returned status ${response.status}.`,
      );
    return response.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}
