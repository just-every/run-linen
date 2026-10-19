/** A person's erasure removes identity and free text, not the owner's business policy.
 * Rebuild only typed policy fields so unrelated free text stays scrubbed. */
export function erasedCalendarPolicy(original:Record<string,any>,redacted:Record<string,any>) {
  return {...redacted,kind:original.kind,
    window:{start:original.window.start,end:original.window.end},
    services:original.services,active:original.active};
}
