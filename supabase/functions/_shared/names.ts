import { limiterKey } from './pin.ts'

export const NAMES_LIMIT = 20 // requests per client address per 15 minute window

export interface NameRow { displayName: string; handle: string }
export interface NamesPort {
  pepper: string
  tryKey(key: string, limit: number): Promise<number>
  /** Active members who sign in with a PIN (handle set, not disabled). Nothing else is read. */
  listPinMembers(): Promise<NameRow[]>
}
export type NameEntry = { first_name: string; initial: string; handle: string }
export type NamesReply = { status: 200; body: NameEntry[] } | { status: 429; body: { ok: false } }

/** First name plus the first letter of the last word ("Lola Rosa Reyes" -> Lola, R). Ids, photos, roles and emails never leave the server. */
export function toEntry(r: NameRow): NameEntry | null {
  const w = r.displayName.trim().split(/\s+/).filter(Boolean)
  if (!w.length || !r.handle) return null
  return { first_name: w[0]!.slice(0, 30), initial: w.length > 1 ? Array.from(w[w.length - 1]!)[0]!.toUpperCase() : '', handle: r.handle }
}

/** Anon-callable name list for a fresh phone (D-41). Per-address limit through the same pin_try counter as sign-in; the key is scoped apart from login's. */
export async function listNames(ip: string, port: NamesPort): Promise<NamesReply> {
  if ((await port.tryKey(await limiterKey(port.pepper, 'ip', `names:${ip}`), NAMES_LIMIT)) > NAMES_LIMIT) return { status: 429, body: { ok: false } }
  const rows = (await port.listPinMembers()).map(toEntry).filter((e): e is NameEntry => e !== null)
  rows.sort((a, b) => a.first_name.localeCompare(b.first_name) || a.initial.localeCompare(b.initial))
  return { status: 200, body: rows }
}
