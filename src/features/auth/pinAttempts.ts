import { db } from '../../db'

// Tries and lock are counted on the phone. The server replies identically to every failure (anti-enumeration), so it cannot say how many are left.
// The server still enforces the real lock; this only tells the person what to expect.
export const LIMIT = 5, LOCK_MS = 15 * 60_000
export interface Fails { n: number; lastAt: number }
export const afterFailure = (f: Fails | undefined, now: number): Fails =>
  ({ n: f && now - f.lastAt < LOCK_MS ? f.n + 1 : 1, lastAt: now })
export function pinState(f: Fails | undefined, now: number): { kind: 'tries'; left: number } | { kind: 'locked'; until: number } {
  if (!f) return { kind: 'tries', left: LIMIT }
  const until = f.lastAt + LOCK_MS
  if (f.n >= LIMIT) return now < until ? { kind: 'locked', until } : { kind: 'tries', left: LIMIT }
  return { kind: 'tries', left: LIMIT - f.n }
}

const key = (handle: string) => `pin.fail.${handle}`
export const loadFails = async (handle: string): Promise<Fails | undefined> => {
  try { return (await db.kv.get(key(handle)))?.value as Fails | undefined } catch { return undefined }
}
export const saveFails = async (handle: string, f: Fails | undefined) => {
  try { if (f) await db.kv.put({ key: key(handle), value: f }); else await db.kv.delete(key(handle)) } catch { /* private mode: the server lock still holds */ }
}
