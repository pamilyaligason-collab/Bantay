import { checkInLabel } from '../family/roster'

export const ATTENTION_FROM_HOUR = 12 // before noon "no check-in yet" is normal, not something to flag

export interface FamilyGlance { ok: number; total: number; note: string; attention: boolean }

const who = (m: { name: string }[]) => (m.length === 1 ? m[0]!.name : `${m[0]!.name} and ${m.length - 1} more`)

/** The family line: how many of the OTHER people (not me) checked in today, and one plain note. A missing check-in is flagged as needing attention
 *  only from noon; before that it is a neutral "not checked in yet". Everyone in: "Everyone has checked in". Nobody else in the family: null (no line). */
export function familyGlance(others: { id: string; name: string }[], last: Record<string, string>, now: Date): FamilyGlance | null {
  if (!others.length) return null
  const missing = others.filter((p) => !checkInLabel(last[p.id], now).ok)
  const ok = others.length - missing.length
  if (!missing.length) return { ok, total: others.length, note: 'Everyone has checked in', attention: false }
  return { ok, total: others.length, note: `${who(missing)} ${missing.length === 1 ? 'has' : 'have'} not checked in yet`, attention: now.getHours() >= ATTENTION_FROM_HOUR }
}
