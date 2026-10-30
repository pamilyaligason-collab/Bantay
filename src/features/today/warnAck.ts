import type { Alert } from '../safety/alerts'

/** N-10: a closed warning is hidden on Today only. kv `warn.ack` = { [alertId]: stamp }. It stays on Safety > Warnings, and a newer issue or a higher level has another stamp, so it shows again. */
export const ACK_KEY = 'warn.ack'
export type AckMap = Record<string, string>
type Ackable = Pick<Alert, 'id' | 'issuedAt' | 'level' | 'kind'>

export const ackStamp = (a: Pick<Alert, 'issuedAt' | 'level' | 'kind'>): string => `${a.issuedAt}|${a.level ?? ''}|${a.kind}`
export const isAcked = (m: AckMap | null | undefined, a: Ackable): boolean => !!m && Object.hasOwn(m, a.id) && m[a.id] === ackStamp(a)

/** Records the close and drops stamps of alerts that are no longer live (ML-06: the map never grows past the live alerts). */
export function ackWarning(m: AckMap | null | undefined, a: Ackable, live: Pick<Alert, 'id'>[]): AckMap {
  const ids = new Set([...live.map((x) => x.id), a.id])
  const next: AckMap = {}
  for (const [k, v] of Object.entries(m ?? {})) if (ids.has(k) && typeof v === 'string') next[k] = v
  next[a.id] = ackStamp(a)
  return next
}
