import { checkInLabel } from '../family/roster'

export const ATTENTION_FROM_HOUR = 12 // before noon "no check-in yet" is normal, not something to flag

export interface FamilyGlance { ok: number; total: number; attention: string | null }

/** The family line: how many of the OTHER people (not me) checked in today, and the one thing that needs a look.
 *  Attention is who has not checked in, but only from noon. Nobody else in the family: null (no line). */
export function familyGlance(others: { id: string; name: string }[], last: Record<string, string>, now: Date): FamilyGlance | null {
  if (!others.length) return null
  const missing = others.filter((p) => !checkInLabel(last[p.id], now).ok)
  const ok = others.length - missing.length
  let attention: string | null = null
  if (missing.length && now.getHours() >= ATTENTION_FROM_HOUR) {
    attention = missing.length === 1 ? `${missing[0]!.name} has not checked in yet` : `${missing[0]!.name} and ${missing.length - 1} more have not checked in yet`
  }
  return { ok, total: others.length, attention }
}
