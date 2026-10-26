import { db } from '../../db'
import { supabase } from '../auth/client'
import { getMember } from '../auth/session'

export const CONSENT_VERSION = '2026-10'
const PENDING = 'consent.pending'

/** Writes people.consent_at / consent_version / consent_by for the signed-in person (the one-line notice on `start-done`, never a question).
 *  Offline or refused: the intent is kept in kv and retried by flushConsent() on the next app start, so the notice is never silently dropped. */
export async function recordConsent(): Promise<boolean> {
  await db.kv.put({ key: PENDING, value: true }).catch(() => undefined)
  return flushConsent()
}

/** Sends a kept consent. No-op when nothing is pending or auth is not configured. Never throws. */
export async function flushConsent(): Promise<boolean> {
  try {
    if (!supabase || (await db.kv.get(PENDING))?.value !== true) return false
    const m = await getMember()
    if (!m?.personId) return false
    const { error } = await supabase.from('people').update({ consent_at: new Date().toISOString(), consent_version: CONSENT_VERSION, consent_by: m.userId }).eq('id', m.personId)
    if (error) return false
    await db.kv.delete(PENDING)
    return true
  } catch { return false }
}
