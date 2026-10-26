export function oktaOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.search || url.hash || url.pathname !== '/' ||
        !/^[a-z0-9][a-z0-9-]*\.(?:okta\.com|oktapreview\.com|okta-emea\.com)$/.test(url.hostname)) return null;
    return url.origin;
  } catch { return null; }
}
