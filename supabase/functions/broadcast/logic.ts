// Pure parts of the broadcast Edge Function, kept free of Deno APIs so Vitest can test them.
// B-7: the only payload ever sent is {"t": <one of these ids>}.
export const SAFETY_IDS = ['storm_warning', 'flood_watch', 'heat_alert', 'family_sos'] as const
export type SafetyId = (typeof SAFETY_IDS)[number]

/** The body must be exactly {t} with t one of the fixed safety ids. Anything else is null. */
export function parseBody(body: unknown): SafetyId | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null
  const keys = Object.keys(body)
  const t = (body as { t?: unknown }).t
  if (keys.length !== 1 || keys[0] !== 't' || typeof t !== 'string') return null
  return (SAFETY_IDS as readonly string[]).includes(t) ? (t as SafetyId) : null
}

/** Endpoints the push service says are gone (404 or 410): delete these subscriptions. */
export function goneEndpoints(results: { endpoint: string; status: number | null }[]): string[] {
  return results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint)
}
